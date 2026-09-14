import { useEffect, useRef, useState } from 'react';
import { Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import { db } from '../lib/db.server.ts';
import { deployPage, ProductionNotAllowedError, toStore } from '../lib/shopify.server.ts';

/** The single html block is where authored markup lives. */
function htmlOf(doc: Doc): string {
  const node = doc.root.find((n) => n.type === 'html');
  return String(node?.props?.html ?? '');
}

function docWithHtml(html: string): Doc {
  return { version: 1, root: [{ id: 'html', type: 'html', props: { html } }] };
}

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
    html: htmlOf(doc),
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

  const html = String(form.get('html') ?? '');
  const title = String(form.get('title') ?? '');
  const handle = String(form.get('handle') ?? '');
  const doc = docWithHtml(html);

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

/**
 * The editor takes the whole viewport, the way a page builder is expected to:
 * structure on the left, the page itself in the middle at a chosen device
 * width, code and publishing on the right. The arrangement follows what the
 * reference tool taught its users; every pixel of it is drawn here, from
 * scratch, in the D&VFly skin.
 */
export default function PageEditor() {
  const { page, html, stores, deployedStoreIds, liveUrls, stats, findings } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const location = useLocation();
  const busy = navigation.state !== 'idle';

  const shop = new URLSearchParams(location.search).get('shop');
  const [source, setSource] = useState(html);
  const [device, setDevice] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // Polaris buttons submit forms but cannot carry a name/value pair, so the
  // intent is stamped onto the form data here instead of living on the button.
  const act = (intent: 'save' | 'publish') => {
    if (!form.current) return;
    const fd = new FormData(form.current);
    fd.set('intent', intent);
    submit(fd, { method: 'post' });
  };

  // The preview is the compiler's own output, rendered in an iframe — the same
  // bytes that get published. There is no second renderer to drift (I1).
  useEffect(() => {
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/preview/${page.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: source }),
      });
      const { fragment } = (await response.json()) as { fragment: string };
      const doc = frame.current?.contentDocument;
      if (doc) {
        doc.open();
        doc.write(fragment);
        doc.close();
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [source, page.id]);

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const published = liveUrls.length > 0;
  const width = DEVICES[device].width;

  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} style={shell}>
      {/* ---- top bar ------------------------------------------------------ */}
      <header style={topBar}>
        <Link to={`/app${location.search}`} style={backLink} aria-label="Voltar para páginas">
          ←
        </Link>
        <img src="/mark.svg" alt="" width={20} height={20} />
        <input name="title" defaultValue={page.title} style={titleInput} aria-label="Título da página" />
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
            <a href={liveUrls[0]} target="_blank" rel="noreferrer" style={liveLink}>
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

      {/* ---- left: structure --------------------------------------------- */}
      <aside style={leftPanel}>
        <section style={panelSection}>
          <div style={panelLabel}>Estrutura</div>
          <div style={treeRoot}>Página</div>
          <div style={treeNode}>
            <span style={treeIcon}>{'</>'}</span> Bloco HTML
          </div>
        </section>
        <section style={panelSection}>
          <div style={panelLabel}>Endereço</div>
          <s-text-field label="Handle" prefix="/pages/" name="handle" value={page.handle} />
        </section>
        <section style={{ ...panelSection, borderBottom: 'none' }}>
          <div style={panelLabel}>Saída</div>
          <div style={metaLine}>
            HTML {kb(stats.bytes.html)} · CSS {kb(stats.bytes.css)} · JS {kb(stats.bytes.js)}
          </div>
          <div style={metaLine}>
            <strong style={{ color: '#303030' }}>Total {kb(stats.bytes.total)}</strong> —{' '}
            {((stats.bytes.total / (256 * 1024)) * 100).toFixed(1)}% do teto
          </div>
          <div style={metaLine}>
            {stats.htmlOptimization.inlineStylesHoisted} estilos inline → {stats.cssRules} regras
          </div>
        </section>
      </aside>

      {/* ---- center: canvas ----------------------------------------------- */}
      <main style={canvas}>
        <div
          style={{
            ...canvasPage,
            width: width === 0 ? '100%' : width,
            maxWidth: '100%',
          }}
        >
          <iframe ref={frame} title="Preview" style={previewFrame} />
        </div>
      </main>

      {/* ---- right: code + publish ---------------------------------------- */}
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
          <div style={panelLabel}>Código</div>
          <textarea
            name="html"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            style={codeArea}
          />
        </section>

        <section style={{ ...panelSection, borderBottom: 'none' }}>
          <div style={panelLabel}>Publicar em</div>
          {stores.length === 0 ? (
            <div style={metaLine}>
              Nenhuma loja registrada ainda. Abra o app pelo admin da Shopify da loja — ela se
              registra sozinha.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stores.map((store) => (
                <div key={store.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <s-checkbox
                    label={store.label}
                    name="storeIds"
                    value={store.id}
                    checked={
                      deployedStoreIds.includes(store.id) || store.domain === shop || undefined
                    }
                  />
                  {store.isProduction ? <s-badge tone="critical">produção</s-badge> : null}
                </div>
              ))}
              {stores.some((s) => s.isProduction) ? (
                <s-checkbox
                  label="Confirmo publicar em produção"
                  name="allowProduction"
                  value="on"
                />
              ) : null}
            </div>
          )}
          {findings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {findings.map((finding, index) => (
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

// ---- styles ---------------------------------------------------------------
// The editor's chrome is deliberately plain CSS: it is the one screen that is
// not a form-over-data page, and its layout (fixed viewport grid) is not what
// Polaris pages are built for.

const shell: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '52px 1fr',
  gridTemplateColumns: '250px 1fr 360px',
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
  width: 280,
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

const treeRoot: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '4px 0' };
const treeNode: React.CSSProperties = {
  fontSize: 13,
  padding: '5px 8px',
  marginLeft: 10,
  borderRadius: 6,
  background: '#eafaf0',
  border: '1px solid #b6ecd0',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
const treeIcon: React.CSSProperties = { fontSize: 11, color: '#0a6b38', fontFamily: 'monospace' };

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

const canvas: React.CSSProperties = {
  gridArea: 'canvas',
  background: '#f1f1f1',
  overflow: 'auto',
  display: 'flex',
  justifyContent: 'center',
  padding: 20,
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

const codeArea: React.CSSProperties = {
  flex: 1,
  minHeight: 220,
  width: '100%',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  border: '1px solid #e3e3e3',
  borderRadius: 8,
  padding: 10,
  resize: 'none',
  boxSizing: 'border-box',
  background: '#fafafa',
};
