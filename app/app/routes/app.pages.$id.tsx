import { useEffect, useRef, useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
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

export default function PageEditor() {
  const { page, html, stores, deployedStoreIds, stats, findings } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const [source, setSource] = useState(html);
  const frame = useRef<HTMLIFrameElement>(null);

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

  return (
    <Form method="post">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <input name="title" defaultValue={page.title} style={titleInput} />
        <span style={{ color: '#8c8c8c' }}>/pages/</span>
        <input name="handle" defaultValue={page.handle} style={handleInput} />
        <button name="intent" value="save" disabled={busy} style={ghostButton}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {result ? (
        <div style={result.ok ? bannerOk : bannerBad}>
          {result.message}
          {result.urls?.map((url) => (
            <div key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minHeight: 460 }}>
        <div>
          <label style={label}>HTML</label>
          <textarea
            name="html"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            style={codeArea}
          />
        </div>
        <div>
          <label style={label}>Preview — o mesmo output que vai ser publicado</label>
          <iframe ref={frame} title="Preview" style={previewFrame} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
        <section style={{ minWidth: 260 }}>
          <label style={label}>Publicar em</label>
          {stores.length === 0 ? (
            <p style={{ fontSize: 13, color: '#5d6b64' }}>
              Nenhuma loja cadastrada. Vá na aba <strong>Lojas</strong>.
            </p>
          ) : (
            <>
              {stores.map((store) => (
                <label key={store.id} style={storeRow}>
                  <input
                    type="checkbox"
                    name="storeIds"
                    value={store.id}
                    defaultChecked={deployedStoreIds.includes(store.id)}
                  />
                  {store.label}
                  {store.isProduction ? <span style={prodChip}>produção</span> : null}
                </label>
              ))}
              {stores.some((s) => s.isProduction) ? (
                <label style={{ ...storeRow, color: '#b42318' }}>
                  <input type="checkbox" name="allowProduction" />
                  Confirmo publicar em produção
                </label>
              ) : null}
              <button name="intent" value="publish" disabled={busy} style={primaryButton}>
                {busy ? 'Publicando…' : 'Publicar'}
              </button>
            </>
          )}
        </section>

        <section style={{ fontSize: 13, color: '#5d6b64', minWidth: 220 }}>
          <label style={label}>Output</label>
          <div>HTML {kb(stats.bytes.html)} · CSS {kb(stats.bytes.css)} · JS {kb(stats.bytes.js)}</div>
          <div>
            <strong style={{ color: '#17201c' }}>Total {kb(stats.bytes.total)}</strong> —{' '}
            {((stats.bytes.total / (256 * 1024)) * 100).toFixed(1)}% do teto da Shopify
          </div>
          <div>
            {stats.htmlOptimization.inlineStylesHoisted} estilos inline →{' '}
            {stats.cssRules} regras
          </div>
        </section>

        {findings.length > 0 ? (
          <section style={{ fontSize: 13, minWidth: 300, flex: 1 }}>
            <label style={label}>Achados</label>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#5d6b64' }}>
              {findings.map((finding, index) => (
                <li key={index}>{finding.message}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Form>
  );
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#5d6b64',
  marginBottom: 6,
};
const titleInput: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '8px 10px',
  flex: 1,
};
const handleInput: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '8px 10px',
  width: 220,
};
const codeArea: React.CSSProperties = {
  width: '100%',
  height: 460,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12.5,
  lineHeight: 1.5,
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: 12,
  resize: 'vertical',
};
const previewFrame: React.CSSProperties = {
  width: '100%',
  height: 460,
  border: '1px solid #ddd',
  borderRadius: 10,
  background: '#fff',
};
const storeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  padding: '5px 0',
};
const prodChip: React.CSSProperties = {
  background: '#fdecea',
  color: '#b42318',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
};
const primaryButton: React.CSSProperties = {
  background: '#0BE05C',
  color: '#06301b',
  border: 0,
  borderRadius: 8,
  padding: '9px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 10,
};
const ghostButton: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 14,
  cursor: 'pointer',
};
const bannerOk: React.CSSProperties = {
  background: '#eafaf0',
  border: '1px solid #b6ecd0',
  color: '#0a6b38',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 12,
  fontSize: 14,
};
const bannerBad: React.CSSProperties = {
  background: '#fdecea',
  border: '1px solid #f5c2bd',
  color: '#b42318',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 12,
  fontSize: 14,
};
