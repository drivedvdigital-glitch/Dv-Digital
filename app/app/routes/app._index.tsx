import { useRef, useState } from 'react';
import { Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { compile, type Doc } from '../lib/compiler.server.ts';
import { db } from '../lib/db.server.ts';
import { clientFor, updatePage } from '../lib/shopify.server.ts';

export async function loader() {
  const pages = await db.page.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { deployments: { include: { store: true } } },
  });
  return { pages };
}

/** A handle no other page uses; suffixes only when needed. */
async function freeHandle(wanted: string): Promise<string> {
  const clash = await db.page.findFirst({ where: { handle: wanted } });
  return clash ? `${wanted}-${Date.now().toString(36)}` : wanted;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get('intent');

  if (intent === 'create') {
    const page = await db.page.create({
      data: {
        title: 'Nova página',
        handle: `pagina-${Date.now().toString(36)}`,
        doc: JSON.stringify({
          version: 1,
          root: [{ id: 'html', type: 'html', props: { html: '<h1>Nova página</h1>' } }],
        }),
      },
    });
    const search = new URL(request.url).search;
    return redirect(`/app/pages/${page.id}${search}`);
  }

  if (intent === 'duplicate') {
    const source = await db.page.findUniqueOrThrow({ where: { id: String(form.get('id')) } });
    // Duplicating is the real creation gesture here: pages are named per
    // market (250-CO-…, 08-MX-…) and varied from an existing one.
    await db.page.create({
      data: {
        title: `${source.title} (cópia)`,
        handle: `${source.handle}-copia-${Date.now().toString(36)}`,
        doc: source.doc,
      },
    });
    return null;
  }

  if (intent === 'delete') {
    await db.page.delete({ where: { id: String(form.get('id')) } });
    return null;
  }

  // A .json produced by "Exportar" — possibly on another installation. The
  // document is compiled before anything is written: a file that does not
  // compile does not become a page.
  if (intent === 'import') {
    let payload: { dvfly?: number; title?: string; handle?: string; doc?: Doc };
    try {
      payload = JSON.parse(String(form.get('payload')));
    } catch {
      return { ok: false, message: 'Este arquivo não é um JSON válido.' };
    }
    if (payload.dvfly !== 1 || !payload.doc) {
      return { ok: false, message: 'Este arquivo não é uma exportação do D&VFly.' };
    }
    try {
      compile(payload.doc);
    } catch (error) {
      return {
        ok: false,
        message: `O documento do arquivo não compila: ${error instanceof Error ? error.message : error}`,
      };
    }
    const page = await db.page.create({
      data: {
        title: payload.title || 'Página importada',
        handle: await freeHandle(payload.handle || `importada-${Date.now().toString(36)}`),
        doc: JSON.stringify(payload.doc),
      },
    });
    return { ok: true, message: `"${page.title}" importada.` };
  }

  // Publish/unpublish flip the visibility of what is ALREADY on each store —
  // no recompilation, no new content. Editing + publishing new bytes is the
  // editor's job; the list only turns the light on and off.
  if (intent === 'publish' || intent === 'unpublish') {
    const page = await db.page.findUniqueOrThrow({
      where: { id: String(form.get('id')) },
      include: { deployments: { include: { store: true } } },
    });
    if (page.deployments.length === 0) {
      return { ok: false, message: 'Esta página nunca foi publicada — abra e use Publicar.' };
    }
    const wantPublished = intent === 'publish';
    const outcomes: string[] = [];
    let failures = 0;
    for (const deployment of page.deployments) {
      try {
        await updatePage(clientFor(deployment.store), deployment.shopifyGid, {
          isPublished: wantPublished,
        });
        await db.deployment.update({
          where: { id: deployment.id },
          data: { isPublished: wantPublished },
        });
        outcomes.push(deployment.store.label);
      } catch (error) {
        failures++;
        outcomes.push(
          `${deployment.store.label}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return {
      ok: failures === 0,
      message: wantPublished
        ? `Publicada em: ${outcomes.join('; ')}`
        : `Despublicada de: ${outcomes.join('; ')}`,
    };
  }
  return null;
}

export default function PagesList() {
  const { pages } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const search = useLocation().search;
  const submit = useSubmit();
  const busy = useNavigation().state !== 'idle';
  const filePicker = useRef<HTMLInputElement>(null);

  // Deleting asks for a second click on the same row instead of a dialog:
  // `confirm()` can be silently blocked inside the admin's iframe, and a
  // swallowed dialog would make the button simply do nothing.
  const [confirming, setConfirming] = useState<string | null>(null);

  const act = (intent: string, id?: string) => {
    const fd = new FormData();
    fd.set('intent', intent);
    if (id) fd.set('id', id);
    submit(fd, { method: 'post' });
    setConfirming(null);
  };

  // Import reads the chosen .json in the browser and posts its text — the
  // server refuses anything that is not a compilable D&VFly export.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set('intent', 'import');
    fd.set('payload', await file.text());
    submit(fd, { method: 'post' });
    if (filePicker.current) filePicker.current.value = '';
  };

  return (
    <s-page heading="Páginas">
      <s-button slot="primary-action" variant="primary" disabled={busy || undefined} onClick={() => act('create')}>
        Criar página
      </s-button>

      {result ? (
        <s-banner tone={result.ok ? 'success' : 'critical'} heading={result.message} />
      ) : null}

      <s-section padding="none">
        <input
          ref={filePicker}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => importFile(e.target.files?.[0])}
        />
        <s-box padding="small-200">
          <s-button variant="tertiary" disabled={busy || undefined} onClick={() => filePicker.current?.click()}>
            Importar página (.json)
          </s-button>
        </s-box>
        {pages.length === 0 ? (
          <s-box padding="large">
            <s-paragraph tone="subdued">
              Nenhuma página ainda. Clique em <strong>Criar página</strong> para começar.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Título</s-table-header>
              <s-table-header>Handle</s-table-header>
              <s-table-header>Publicada em</s-table-header>
              <s-table-header>Atualizada</s-table-header>
              <s-table-header />
            </s-table-header-row>
            <s-table-body>
              {pages.map((page) => (
                <s-table-row key={page.id}>
                  <s-table-cell>
                    <Link to={`/app/pages/${page.id}${search}`} style={titleLink}>
                      {page.title}
                    </Link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone="subdued">/{page.handle}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {page.deployments.length === 0 ? (
                      <s-badge>rascunho</s-badge>
                    ) : (
                      page.deployments.map((d) => (
                        <s-badge key={d.id} tone={d.isPublished ? 'success' : 'neutral'}>
                          {d.isPublished ? d.store.label : `${d.store.label} (pausada)`}
                        </s-badge>
                      ))
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone="subdued">
                      {new Date(page.updatedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {confirming === page.id ? (
                      <>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          disabled={busy || undefined}
                          onClick={() => act('delete', page.id)}
                        >
                          Confirmar exclusão
                        </s-button>
                        <s-button variant="tertiary" onClick={() => setConfirming(null)}>
                          Cancelar
                        </s-button>
                      </>
                    ) : (
                      <>
                        <a href={`/preview/${page.id}`} target="_blank" rel="noreferrer" style={rowLink}>
                          Pré-visualizar
                        </a>
                        <a href={`/api/pages/${page.id}/export`} style={rowLink} download>
                          Exportar
                        </a>
                        {page.deployments.some((d) => d.isPublished) ? (
                          <s-button
                            variant="tertiary"
                            disabled={busy || undefined}
                            onClick={() => act('unpublish', page.id)}
                          >
                            Despublicar
                          </s-button>
                        ) : page.deployments.length > 0 ? (
                          <s-button
                            variant="tertiary"
                            disabled={busy || undefined}
                            onClick={() => act('publish', page.id)}
                          >
                            Publicar
                          </s-button>
                        ) : null}
                        <s-button
                          variant="tertiary"
                          disabled={busy || undefined}
                          onClick={() => act('duplicate', page.id)}
                        >
                          Duplicar
                        </s-button>
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          disabled={busy || undefined}
                          onClick={() => setConfirming(page.id)}
                        >
                          Excluir
                        </s-button>
                      </>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

// react-router's Link renders a plain <a>; match it to Polaris link styling so
// it does not read as a foreign element in the middle of the table.
const titleLink: React.CSSProperties = {
  color: '#005bd3',
  textDecoration: 'none',
  fontWeight: 450,
};

// Plain anchors (preview opens a tab, export downloads a file) dressed to sit
// beside the tertiary s-buttons without reading as foreign.
const rowLink: React.CSSProperties = {
  color: '#005bd3',
  textDecoration: 'none',
  fontSize: 13,
  padding: '4px 8px',
  whiteSpace: 'nowrap',
};
