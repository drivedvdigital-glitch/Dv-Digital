import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import { db } from '../lib/db.server.ts';
import {
  BLOCK_LABELS,
  CONTAINER_TYPES,
  duplicateNode,
  effectiveStyle,
  findNode,
  insertNode,
  moveNode,
  newBlock,
  pathTo,
  removeNode,
  updateProps,
  updateStyle,
  type DocNode,
  type DocTree,
} from '../lib/doc-ops.ts';
import { deployPage, ProductionNotAllowedError, toStore } from '../lib/shopify.server.ts';

export async function loader({ params }: LoaderFunctionArgs) {
  const page = await db.page.findUniqueOrThrow({
    where: { id: params.id },
    include: { deployments: { include: { store: true } } },
  });
  const stores = await db.store.findMany({ orderBy: { isProduction: 'asc' } });
  const doc = JSON.parse(page.doc) as Doc;
  const compiled = compile(doc);

  return {
    page: { id: page.id, title: page.title, handle: page.handle },
    doc: doc as unknown as DocTree,
    stores,
    deployedStoreIds: page.deployments.map((d) => d.storeId),
    liveUrls: page.deployments
      .filter((d) => d.isPublished)
      .map((d) => `https://${d.store.domain}/pages/${page.handle}`),
    stats: compiled.stats,
    findings: compiled.findings,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const pageId = String(params.id);

  const title = String(form.get('title') ?? '');
  const handle = String(form.get('handle') ?? '');

  let doc: Doc;
  try {
    doc = JSON.parse(String(form.get('doc'))) as Doc;
  } catch {
    return { ok: false, message: 'Documento ilegível — nada foi salvo.' };
  }

  // Saving always records a version. compilerVersion travels with it, so a
  // later compiler change cannot rewrite what was already published (I2).
  await db.page.update({
    where: { id: pageId },
    data: { title, handle, doc: JSON.stringify(doc) },
  });
  const version = await db.version.create({
    data: { pageId, doc: JSON.stringify(doc), compilerVersion: COMPILER_VERSION },
  });

  if (intent === 'save') return { ok: true, message: 'Salvo.' };

  // --- publish -------------------------------------------------------------
  const storeIds = form.getAll('storeIds').map(String);
  if (storeIds.length === 0) {
    return { ok: false, message: 'Escolha ao menos uma loja.' };
  }
  const rows = await db.store.findMany({ where: { id: { in: storeIds } } });
  const compiled = compile(doc);

  try {
    const result = await deployPage(
      rows.map(toStore),
      { title, handle, body: toFragment(compiled) },
      { publish: true, allowProduction: form.get('allowProduction') === 'on' },
    );

    for (const target of result.succeeded) {
      const row = rows.find((r) => r.domain === target.store.domain)!;
      await db.deployment.upsert({
        where: { pageId_storeId: { pageId, storeId: row.id } },
        create: {
          pageId,
          storeId: row.id,
          versionId: version.id,
          shopifyGid: target.page!.id,
          isPublished: true,
          bytes: compiled.stats.bytes.total,
        },
        update: {
          versionId: version.id,
          shopifyGid: target.page!.id,
          isPublished: true,
          bytes: compiled.stats.bytes.total,
        },
      });
    }

    const failed = result.failed;
    return {
      ok: failed.length === 0,
      message:
        failed.length === 0
          ? `Publicado em ${result.succeeded.length} loja(s).`
          : `${result.succeeded.length} ok, ${failed.length} com erro: ${failed
              .map((f) => `${f.store.label} — ${f.error}`)
              .join('; ')}`,
      urls: result.succeeded.map((t) => `https://${t.store.domain}/pages/${t.page!.handle}`),
    };
  } catch (error) {
    if (error instanceof ProductionNotAllowedError) {
      return { ok: false, message: error.message, needsProductionConfirm: true };
    }
    throw error;
  }
}

/** Preview widths. "Cheio" fills the canvas; the rest are device-sized. */
const DEVICES = [
  { label: 'Cheio', width: 0 },
  { label: '1200', width: 1200 },
  { label: '768', width: 768 },
  { label: '390', width: 390 },
];

/** Blocks offered by "Adicionar". Order is roughly how often each is reached for. */
const PALETTE = ['section', 'heading', 'text', 'image', 'button', 'divider', 'html'];

interface PreviewStats {
  bytes: { html: number; css: number; js: number; total: number };
  htmlOptimization: { inlineStylesHoisted: number };
  cssRules: number;
}

/**
 * The editor takes the whole viewport, the way a page builder is expected to:
 * structure on the left, the page itself in the middle at a chosen device
 * width, the selected block's controls on the right. The arrangement follows
 * what the reference tool taught its users; every pixel is drawn here, from
 * scratch, in the D&VFly skin.
 *
 * Selection is symmetric: clicking a node in the tree highlights it on the
 * canvas, clicking an element on the canvas highlights it in the tree, and the
 * inspector always shows whichever is selected.
 */
export default function PageEditor() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const location = useLocation();
  const busy = navigation.state !== 'idle';

  const shop = new URLSearchParams(location.search).get('shop');
  const [doc, setDoc] = useState<DocTree>(data.doc);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState(0);
  const [tab, setTab] = useState<'geral' | 'estilo'>('geral');
  const [breakpoint, setBreakpoint] = useState<'base' | 'md' | 'lg'>('base');
  const [live, setLive] = useState<{ stats: PreviewStats; findings: { message: string }[] }>({
    stats: data.stats,
    findings: data.findings,
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const setRoot = useCallback((root: DocNode[]) => {
    setDoc((prev) => ({ ...prev, root }));
  }, []);

  // Polaris buttons submit forms but cannot carry a name/value pair, so the
  // intent is stamped onto the form data here instead of living on the button.
  const act = (intent: 'save' | 'publish') => {
    if (!form.current) return;
    const fd = new FormData(form.current);
    fd.set('intent', intent);
    submit(fd, { method: 'post' });
  };

  // The preview is the compiler's own output, rendered in an iframe — the same
  // bytes that get published (I1). The editor build adds node id stamps and the
  // selection bridge; published output carries neither.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/preview/${data.page.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      const payload = (await response.json()) as {
        fragment: string;
        stats: PreviewStats;
        findings: { message: string }[];
      };
      setLive({ stats: payload.stats, findings: payload.findings });
      const target = frame.current?.contentDocument;
      if (target) {
        target.open();
        target.write(payload.fragment);
        target.close();
        // Re-apply the selection to the fresh document.
        frame.current?.contentWindow?.postMessage({ type: 'dvf:selected', id: selected }, '*');
      }
    }, 250);
    return () => clearTimeout(timer);
    // `selected` is intentionally not a dependency: changing it must not recompile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, data.page.id]);

  // Canvas → editor: clicks inside the iframe arrive as messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'dvf:select') setSelected(event.data.id ?? null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Editor → canvas: highlight whatever is selected, however it got selected.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'dvf:selected', id: selected }, '*');
  }, [selected]);

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const published = data.liveUrls.length > 0;
  const width = DEVICES[device].width;
  const selectedNode = selected ? findNode(doc.root, selected) : null;
  const crumbs = selected ? pathTo(doc.root, selected) : [];

  const addBlock = (type: string) => {
    const block = newBlock(type);
    setRoot(insertNode(doc.root, selected, block));
    setSelected(block.id);
  };

  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} style={shell}>
      <input type="hidden" name="doc" value={JSON.stringify(doc)} />

      {/* ---- top bar ------------------------------------------------------ */}
      <header style={topBar}>
        <Link to={`/app${location.search}`} style={backLink} aria-label="Voltar para páginas">
          ←
        </Link>
        <img src="/mark.svg" alt="" width={20} height={20} />
        <input name="title" defaultValue={data.page.title} style={titleInput} aria-label="Título da página" />
        <s-badge tone={published ? 'success' : 'neutral'}>
          {published ? 'publicada' : 'rascunho'}
        </s-badge>

        <div style={deviceGroup}>
          {DEVICES.map((d, i) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setDevice(i)}
              style={i === device ? deviceActive : deviceIdle}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {published ? (
            <a href={data.liveUrls[0]} target="_blank" rel="noreferrer" style={liveLink}>
              Ver no ar
            </a>
          ) : null}
          <s-button disabled={busy || undefined} onClick={() => act('save')}>
            {busy ? 'Salvando…' : 'Salvar'}
          </s-button>
          <button type="button" disabled={busy} onClick={() => act('publish')} style={publishButton}>
            {busy ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </header>

      {/* ---- left: structure + add + page -------------------------------- */}
      <aside style={leftPanel}>
        <section style={panelSection}>
          <div style={panelLabel}>Estrutura</div>
          {doc.root.length === 0 ? (
            <div style={metaLine}>Página vazia. Adicione um bloco abaixo.</div>
          ) : (
            <Tree nodes={doc.root} depth={0} selected={selected} onSelect={setSelected} />
          )}
        </section>

        <section style={panelSection}>
          <div style={panelLabel}>Adicionar</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PALETTE.map((type) => (
              <button
                key={type}
                type="button"
                data-palette={type}
                style={paletteButton}
                onClick={() => addBlock(type)}
              >
                {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
          <div style={{ ...metaLine, marginTop: 6 }}>
            Entra dentro do bloco selecionado, ou depois dele.
          </div>
        </section>

        <section style={{ ...panelSection, borderBottom: 'none' }}>
          <div style={panelLabel}>Endereço</div>
          <s-text-field label="Handle" prefix="/pages/" name="handle" value={data.page.handle} />
        </section>
      </aside>

      {/* ---- center: canvas ----------------------------------------------- */}
      <main style={canvas}>
        <div style={crumbBar}>
          {crumbs.length === 0 ? (
            <span style={{ color: '#8a8a8a' }}>Clique num elemento para selecionar</span>
          ) : (
            crumbs.map((node, i) => (
              <span key={node.id}>
                {i > 0 ? <span style={{ color: '#c0c0c0' }}> / </span> : null}
                <button type="button" style={crumbButton} onClick={() => setSelected(node.id)}>
                  {BLOCK_LABELS[node.type] ?? node.type}
                </button>
              </span>
            ))
          )}
        </div>
        <div style={canvasScroll}>
          <div style={{ ...canvasPage, width: width === 0 ? '100%' : width, maxWidth: '100%' }}>
            <iframe ref={frame} title="Preview" style={previewFrame} />
          </div>
        </div>
        <div style={statusBar}>
          Total {kb(live.stats.bytes.total)} · {((live.stats.bytes.total / (256 * 1024)) * 100).toFixed(1)}%
          do teto · {live.stats.htmlOptimization.inlineStylesHoisted} estilos inline →{' '}
          {live.stats.cssRules} regras
        </div>
      </main>

      {/* ---- right: inspector + publish ----------------------------------- */}
      <aside style={rightPanel}>
        {result ? (
          <div style={{ padding: '10px 12px 0' }}>
            <s-banner tone={result.ok ? 'success' : 'critical'} heading={result.message}>
              {result.urls?.length ? (
                <s-paragraph>
                  {result.urls.map((url) => (
                    <s-link key={url} href={url} target="_blank">
                      {url}
                    </s-link>
                  ))}
                </s-paragraph>
              ) : null}
            </s-banner>
          </div>
        ) : null}

        <section style={{ ...panelSection, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedNode ? (
            <>
              <div style={inspectorHead}>
                <div style={panelLabel}>{BLOCK_LABELS[selectedNode.type] ?? selectedNode.type}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={opButton} title="Subir" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, -1))}>↑</button>
                  <button type="button" style={opButton} title="Descer" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, 1))}>↓</button>
                  <button type="button" style={opButton} title="Duplicar" onClick={() => setRoot(duplicateNode(doc.root, selectedNode.id))}>⧉</button>
                  <button
                    type="button"
                    style={{ ...opButton, color: '#b42318' }}
                    title="Excluir"
                    onClick={() => {
                      setRoot(removeNode(doc.root, selectedNode.id));
                      setSelected(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={tabRow}>
                <button
                  type="button"
                  style={tab === 'geral' ? tabOn : tabOff}
                  onClick={() => setTab('geral')}
                >
                  Geral
                </button>
                <button
                  type="button"
                  style={tab === 'estilo' ? tabOn : tabOff}
                  onClick={() => setTab('estilo')}
                >
                  Estilo
                </button>
              </div>
              {tab === 'geral' ? (
                <Inspector
                  node={selectedNode}
                  onChange={(patch) => setRoot(updateProps(doc.root, selectedNode.id, patch))}
                />
              ) : (
                <StylePanel
                  node={selectedNode}
                  breakpoint={breakpoint}
                  onBreakpoint={(bp) => {
                    setBreakpoint(bp);
                    // Show the width the chosen breakpoint actually governs, so
                    // what is being edited is what is being looked at.
                    setDevice(bp === 'base' ? 3 : bp === 'md' ? 2 : 1);
                  }}
                  onChange={(patch) =>
                    setRoot(updateStyle(doc.root, selectedNode.id, breakpoint, patch))
                  }
                />
              )}
            </>
          ) : (
            <>
              <div style={panelLabel}>Nada selecionado</div>
              <div style={metaLine}>
                Clique num elemento do canvas ou na estrutura para editar o conteúdo dele aqui.
              </div>
            </>
          )}
        </section>

        <section style={{ ...panelSection, borderBottom: 'none' }}>
          <div style={panelLabel}>Publicar em</div>
          {data.stores.length === 0 ? (
            <div style={metaLine}>
              Nenhuma loja registrada ainda. Abra o app pelo admin da Shopify da loja — ela se
              registra sozinha.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.stores.map((store) => (
                <div key={store.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <s-checkbox
                    label={store.label}
                    name="storeIds"
                    value={store.id}
                    checked={
                      data.deployedStoreIds.includes(store.id) || store.domain === shop || undefined
                    }
                  />
                  {store.isProduction ? <s-badge tone="critical">produção</s-badge> : null}
                </div>
              ))}
              {data.stores.some((s) => s.isProduction) ? (
                <s-checkbox label="Confirmo publicar em produção" name="allowProduction" value="on" />
              ) : null}
            </div>
          )}
          {live.findings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {live.findings.map((finding, index) => (
                <div key={index} style={findingLine}>
                  {finding.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </aside>
    </form>
  );
}

/** The structure panel: indented, clickable, container-aware. */
function Tree({
  nodes,
  depth,
  selected,
  onSelect,
}: {
  nodes: DocNode[];
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            type="button"
            data-tree-id={node.id}
            data-tree-selected={node.id === selected || undefined}
            onClick={() => onSelect(node.id)}
            style={{
              ...treeRow,
              paddingLeft: 8 + depth * 14,
              ...(node.id === selected ? treeRowSelected : {}),
            }}
          >
            <span style={treeIcon}>{CONTAINER_TYPES.has(node.type) ? '▸' : '·'}</span>
            {BLOCK_LABELS[node.type] ?? node.type}
            {node.type === 'heading' || node.type === 'text' ? (
              <span style={treeHint}> {String(node.props?.text ?? '').slice(0, 18)}</span>
            ) : null}
          </button>
          {node.children ? (
            <Tree nodes={node.children} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ) : null}
        </div>
      ))}
    </>
  );
}

/**
 * Content controls for the selected block. Plain inputs on purpose: these are
 * controlled fields driving React state, and native elements are the one kind
 * whose events React 18 handles without surprises.
 */
function Inspector({
  node,
  onChange,
}: {
  node: DocNode;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const p = node.props ?? {};

  switch (node.type) {
    case 'heading':
      return (
        <>
          <label style={fieldLabel}>
            Texto
            <textarea
              style={fieldArea}
              rows={3}
              value={String(p.text ?? '')}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Nível
            <select
              style={fieldInput}
              value={Number(p.level ?? 2)}
              onChange={(e) => onChange({ level: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  H{level}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    case 'text':
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Texto
          <textarea
            style={{ ...fieldArea, flex: 1 }}
            value={String(p.text ?? '')}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </label>
      );
    case 'button':
      return (
        <>
          <label style={fieldLabel}>
            Rótulo
            <input
              style={fieldInput}
              value={String(p.label ?? '')}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Link (href)
            <input
              style={fieldInput}
              value={String(p.href ?? '')}
              placeholder="/products/meu-produto"
              onChange={(e) => onChange({ href: e.target.value })}
            />
          </label>
        </>
      );
    case 'image':
      return (
        <>
          <label style={fieldLabel}>
            URL da imagem
            <input
              style={fieldInput}
              value={String(p.src ?? '')}
              onChange={(e) => onChange({ src: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Texto alternativo
            <input
              style={fieldInput}
              value={String(p.alt ?? '')}
              onChange={(e) => onChange({ alt: e.target.value })}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Largura
              <input
                style={fieldInput}
                type="number"
                value={Number(p.width ?? 0) || ''}
                onChange={(e) => onChange({ width: Number(e.target.value) || undefined })}
              />
            </label>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Altura
              <input
                style={fieldInput}
                type="number"
                value={Number(p.height ?? 0) || ''}
                onChange={(e) => onChange({ height: Number(e.target.value) || undefined })}
              />
            </label>
          </div>
        </>
      );
    case 'html':
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Código
          <textarea
            style={{ ...fieldArea, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
            spellCheck={false}
            value={String(p.html ?? '')}
            onChange={(e) => onChange({ html: e.target.value })}
          />
        </label>
      );
    case 'section':
    case 'stack':
      return (
        <div style={metaLine}>
          Bloco de estrutura — o conteúdo dele são os filhos na árvore. Selecione um filho para
          editar, ou use <strong>Adicionar</strong> para pôr algo dentro.
        </div>
      );
    case 'divider':
      return <div style={metaLine}>Uma linha separadora. Não tem conteúdo para editar.</div>;
    default:
      // Honest fallback for blocks whose dedicated controls do not exist yet
      // (accordion, repeater, countdown): edit the props as data.
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Propriedades (JSON) — controles dedicados ainda não existem para este bloco
          <textarea
            style={{ ...fieldArea, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
            spellCheck={false}
            defaultValue={JSON.stringify(p, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                // Half-typed JSON is expected while editing; apply when it parses.
              }
            }}
          />
        </label>
      );
  }
}

/** '' → inherited; plain number → px; anything else is its own unit. */
function parseLength(raw: string): number | string | undefined {
  const value = raw.trim();
  if (value === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

const BP_LABELS: Record<string, string> = {
  base: 'Base — vale em toda largura',
  md: '≥ 768px — sobrepõe a base',
  lg: '≥ 1200px — sobrepõe as duas',
};

/**
 * The Estilo tab: the compiler's closed style vocabulary as a form, one
 * breakpoint at a time, mobile-first (U4: one design plus overrides).
 *
 * A field left empty inherits from the breakpoints before it — the inherited
 * value shows as the placeholder — and typing into it creates the override.
 * Clearing the field removes the override again. There is deliberately no
 * field here the compiler cannot emit.
 */
function StylePanel({
  node,
  breakpoint,
  onBreakpoint,
  onChange,
}: {
  node: DocNode;
  breakpoint: 'base' | 'md' | 'lg';
  onBreakpoint: (bp: 'base' | 'md' | 'lg') => void;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const style = (node.style ?? {}) as Record<string, Record<string, unknown>>;
  const own = style[breakpoint] ?? {};
  const inherited = (key: string) => effectiveStyle(style, breakpoint, key);

  const ownOr = (key: string): string => {
    const value = own[key];
    return value === undefined ? '' : String(value);
  };
  const hint = (key: string): string => {
    const value = inherited(key);
    return value === undefined ? '' : String(value);
  };

  const length = (label: string, key: string) => (
    <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
      {label}
      <input
        style={fieldInput}
        value={ownOr(key)}
        placeholder={hint(key) || '—'}
        onChange={(e) => onChange({ [key]: parseLength(e.target.value) })}
      />
    </label>
  );

  const color = (label: string, key: string) => {
    const value = ownOr(key);
    const shown = value || hint(key);
    return (
      <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
        {label}
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: '1px solid #d0d0d0',
              background: shown || '#fff',
              flexShrink: 0,
            }}
          />
          <input
            style={{ ...fieldInput, marginTop: 0 }}
            value={value}
            placeholder={hint(key) || 'ex.: #17201c'}
            onChange={(e) => onChange({ [key]: e.target.value.trim() || undefined })}
          />
        </span>
      </label>
    );
  };

  const box = (label: string, key: 'padding' | 'margin') => {
    const value = (own[key] ?? {}) as Record<string, unknown>;
    const base = (inherited(key) ?? {}) as Record<string, unknown>;
    const side = (name: 'top' | 'right' | 'bottom' | 'left', short: string) => (
      <label key={name} style={{ ...fieldLabel, flex: 1, marginBottom: 0 }}>
        {short}
        <input
          style={fieldInput}
          value={value[name] === undefined ? '' : String(value[name])}
          placeholder={base[name] === undefined ? '—' : String(base[name])}
          onChange={(e) => {
            const next = { ...value };
            const parsed = parseLength(e.target.value);
            if (parsed === undefined) delete next[name];
            else next[name] = parsed;
            onChange({ [key]: Object.keys(next).length > 0 ? next : undefined });
          }}
        />
      </label>
    );
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...fieldLabel, marginBottom: 2 }}>{label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {side('top', '↑')}
          {side('right', '→')}
          {side('bottom', '↓')}
          {side('left', '←')}
        </div>
      </div>
    );
  };

  const choice = (
    label: string,
    key: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
      {label}
      <select
        style={fieldInput}
        value={ownOr(key)}
        onChange={(e) => onChange({ [key]: e.target.value || undefined })}
      >
        <option value="">{hint(key) ? `herdado (${hint(key)})` : 'herdado'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const isContainer = CONTAINER_TYPES.has(node.type);
  const isTexty = ['heading', 'text', 'button', 'html', 'section', 'stack'].includes(node.type);

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={bpRow}>
        {(['base', 'md', 'lg'] as const).map((bp) => (
          <button
            key={bp}
            type="button"
            data-breakpoint={bp}
            style={bp === breakpoint ? bpOn : bpOff}
            onClick={() => onBreakpoint(bp)}
          >
            {bp === 'base' ? 'Base' : bp === 'md' ? '≥768' : '≥1200'}
          </button>
        ))}
      </div>
      <div style={{ ...metaLine, marginBottom: 10 }}>{BP_LABELS[breakpoint]}</div>

      {isContainer ? (
        <>
          <div style={groupLabel}>Layout</div>
          {choice('Direção', 'direction', [
            { value: 'column', label: 'Coluna' },
            { value: 'row', label: 'Linha' },
          ])}
          <div style={{ display: 'flex', gap: 8 }}>
            {length('Espaço entre itens', 'gap')}
            {choice('Alinhar', 'align', [
              { value: 'start', label: 'Início' },
              { value: 'center', label: 'Centro' },
              { value: 'end', label: 'Fim' },
              { value: 'stretch', label: 'Esticar' },
            ])}
          </div>
        </>
      ) : null}

      <div style={groupLabel}>Espaçamento</div>
      {box('Interno (padding)', 'padding')}
      {box('Externo (margin)', 'margin')}

      {isTexty ? (
        <>
          <div style={groupLabel}>Texto</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {length('Tamanho', 'fontSize')}
            {choice('Peso', 'fontWeight', [
              { value: '400', label: 'Normal' },
              { value: '600', label: 'Meio-negrito' },
              { value: '700', label: 'Negrito' },
              { value: '800', label: 'Pesado' },
            ])}
          </div>
          {choice('Alinhamento', 'textAlign', [
            { value: 'left', label: 'Esquerda' },
            { value: 'center', label: 'Centro' },
            { value: 'right', label: 'Direita' },
          ])}
        </>
      ) : null}

      <div style={groupLabel}>Aparência</div>
      {color('Cor do texto', 'color')}
      {color('Fundo', 'background')}
      <div style={{ display: 'flex', gap: 8 }}>
        {length('Cantos', 'radius')}
        {length('Largura máx.', 'maxWidth')}
      </div>

      <div style={groupLabel}>Visibilidade</div>
      <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={own.hidden === true}
          onChange={(e) => onChange({ hidden: e.target.checked ? true : undefined })}
        />
        Esconder neste tamanho de tela
      </label>
    </div>
  );
}

// ---- styles ---------------------------------------------------------------
// The editor's chrome is deliberately plain CSS: it is the one screen that is
// not a form-over-data page, and its layout (fixed viewport grid) is not what
// Polaris pages are built for.

const shell: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '52px 1fr',
  gridTemplateColumns: '260px 1fr 340px',
  gridTemplateAreas: `"top top top" "left canvas right"`,
  background: '#fff',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: '#303030',
  zIndex: 10,
};

const topBar: React.CSSProperties = {
  gridArea: 'top',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 12px',
  borderBottom: '1px solid #e3e3e3',
};

const backLink: React.CSSProperties = {
  fontSize: 18,
  textDecoration: 'none',
  color: '#616161',
  padding: '2px 8px',
  borderRadius: 8,
};

const titleInput: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '6px 8px',
  width: 260,
  background: 'transparent',
};

const deviceGroup: React.CSSProperties = {
  marginLeft: 'auto',
  marginRight: 12,
  display: 'flex',
  background: '#f1f1f1',
  borderRadius: 8,
  padding: 2,
  gap: 2,
};

const deviceBase: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
  background: 'transparent',
  color: '#616161',
};
const deviceIdle = deviceBase;
const deviceActive: React.CSSProperties = {
  ...deviceBase,
  background: '#fff',
  color: '#303030',
  fontWeight: 600,
  boxShadow: '0 1px 2px rgba(0,0,0,.15)',
};

const liveLink: React.CSSProperties = {
  fontSize: 13,
  color: '#005bd3',
  textDecoration: 'none',
  marginRight: 4,
};

const publishButton: React.CSSProperties = {
  background: '#0BE05C',
  color: '#06301b',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const leftPanel: React.CSSProperties = {
  gridArea: 'left',
  borderRight: '1px solid #e3e3e3',
  overflowY: 'auto',
};

const rightPanel: React.CSSProperties = {
  gridArea: 'right',
  borderLeft: '1px solid #e3e3e3',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const panelSection: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #ececec',
};

const panelLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#8a8a8a',
  marginBottom: 8,
};

const inspectorHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const opButton: React.CSSProperties = {
  border: '1px solid #e3e3e3',
  background: '#fff',
  borderRadius: 6,
  width: 26,
  height: 26,
  fontSize: 13,
  cursor: 'pointer',
  color: '#616161',
  lineHeight: 1,
};

const treeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  fontSize: 13,
  padding: '5px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#303030',
};

const treeRowSelected: React.CSSProperties = {
  background: '#eafaf0',
  outline: '1px solid #b6ecd0',
  fontWeight: 600,
};

const treeIcon: React.CSSProperties = { fontSize: 10, color: '#0a6b38', width: 10 };
const treeHint: React.CSSProperties = { color: '#8a8a8a', fontWeight: 400, fontSize: 12 };

const paletteButton: React.CSSProperties = {
  border: '1px solid #e3e3e3',
  background: '#fff',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  cursor: 'pointer',
  color: '#303030',
};

const metaLine: React.CSSProperties = { fontSize: 12.5, color: '#616161', padding: '2px 0' };
const findingLine: React.CSSProperties = {
  fontSize: 12.5,
  color: '#8a6116',
  background: '#fdf6e3',
  border: '1px solid #f0e3b9',
  borderRadius: 6,
  padding: '6px 8px',
  marginTop: 6,
};

const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  background: '#f1f1f1',
  borderRadius: 8,
  padding: 2,
  marginBottom: 10,
};
const tabBase2: React.CSSProperties = {
  flex: 1,
  border: 0,
  borderRadius: 6,
  padding: '6px 0',
  fontSize: 12.5,
  cursor: 'pointer',
  background: 'transparent',
  color: '#616161',
};
const tabOff = tabBase2;
const tabOn: React.CSSProperties = {
  ...tabBase2,
  background: '#fff',
  color: '#303030',
  fontWeight: 600,
  boxShadow: '0 1px 2px rgba(0,0,0,.15)',
};

const bpRow: React.CSSProperties = { display: 'flex', gap: 4, marginBottom: 4 };
const bpBase: React.CSSProperties = {
  border: '1px solid #e3e3e3',
  background: '#fff',
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#616161',
};
const bpOff = bpBase;
const bpOn: React.CSSProperties = {
  ...bpBase,
  background: '#eafaf0',
  borderColor: '#b6ecd0',
  color: '#0a6b38',
  fontWeight: 600,
};

const groupLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#8a8a8a',
  margin: '10px 0 6px',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#616161',
  marginBottom: 10,
};

const fieldInput: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  border: '1px solid #d0d0d0',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 13,
  boxSizing: 'border-box',
  background: '#fff',
};

const fieldArea: React.CSSProperties = {
  ...fieldInput,
  resize: 'vertical',
  minHeight: 64,
  lineHeight: 1.5,
};

const canvas: React.CSSProperties = {
  gridArea: 'canvas',
  background: '#f1f1f1',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  minHeight: 0,
};

const crumbBar: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 12.5,
  borderBottom: '1px solid #e7e7e7',
  background: '#fafafa',
};

const crumbButton: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#005bd3',
  fontSize: 12.5,
  cursor: 'pointer',
  padding: 0,
};

const canvasScroll: React.CSSProperties = {
  overflow: 'auto',
  display: 'flex',
  justifyContent: 'center',
  padding: 20,
  minHeight: 0,
};

const canvasPage: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  boxShadow: '0 1px 4px rgba(0,0,0,.12)',
  overflow: 'hidden',
  height: 'fit-content',
  minHeight: '100%',
  transition: 'width .15s ease',
};

const previewFrame: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 600,
  border: 0,
  display: 'block',
  background: '#fff',
};

const statusBar: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  color: '#616161',
  borderTop: '1px solid #e7e7e7',
  background: '#fafafa',
};
