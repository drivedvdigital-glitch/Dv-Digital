import { useRef, useState } from 'react';
import { Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { compile, type Doc } from '../lib/compiler.server.ts';
import { db } from '../lib/db.server.ts';
import { switchPage } from '../lib/publish.server.ts';
import { clientFor, removeProductTemplate } from '../lib/shopify.server.ts';
import {
  bannerErr,
  bannerOk,
  buttonGhost,
  buttonPrimary,
  FONT_STACK,
  pillNeutral,
  pillSuccess,
  ThemeToggle,
  UiStyle,
  useUiTheme,
} from '../ui/theme.tsx';

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

  // Deleting here forgets the page; the copies on the stores are taken off the
  // air first so nothing keeps selling from a page the app no longer knows.
  // The content itself stays in Shopify as a draft (invariant I4: it survives
  // the app) — the store owner can still find it under Online Store → Pages.
  if (intent === 'delete') {
    const id = String(form.get('id'));
    const off = await switchPage(id, false, { publishedOnly: true });
    if (!off.ok) {
      const stuck = off.outcomes.filter((o) => o.includes(':'));
      return {
        ok: false,
        message: `A página não foi excluída: não consegui despublicá-la em ${stuck.join('; ')}. Tente de novo.`,
      };
    }
    // A product page also leaves its template and section in each theme;
    // deleting the page is the moment to take them out (invariant I3: we
    // remove exactly what we wrote). Best effort — a theme that refuses does
    // not keep the page alive here.
    const page = await db.page.findUnique({ where: { id }, include: { deployments: { include: { store: true } } } });
    if (page?.pageType === 'product') {
      for (const deployment of page.deployments) {
        await removeProductTemplate(clientFor(deployment.store), id).catch(() => {});
      }
    }
    await db.page.delete({ where: { id } });
    return off.touched > 0
      ? { ok: true, message: `Página excluída e retirada do ar em ${off.touched} loja(s); o conteúdo continua na Shopify.` }
      : null;
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
  // editor's job; the list only turns the light on and off. Bulk is the same
  // switch applied to every selected page.
  if (
    intent === 'publish' ||
    intent === 'unpublish' ||
    intent === 'bulk-publish' ||
    intent === 'bulk-unpublish'
  ) {
    const ids = intent.startsWith('bulk-')
      ? form.getAll('ids').map(String)
      : [String(form.get('id'))];
    const wantPublished = intent === 'publish' || intent === 'bulk-publish';

    const rows = await db.page.findMany({
      where: { id: { in: ids } },
      include: { deployments: { include: { store: true } } },
    });
    // Turning a page ON in a production store is the same act as publishing
    // there, and the editor asks for an explicit confirmation before it. The
    // list has no such gesture, so it refuses — with the way to do it.
    if (wantPublished) {
      const production = rows.flatMap((p) =>
        p.deployments.filter((d) => d.store.isProduction).map((d) => `${p.title} → ${d.store.label}`),
      );
      if (production.length > 0) {
        return {
          ok: false,
          message:
            `Loja de produção na seleção (${production.join('; ')}). Publique pelo editor da página, ` +
            'que pede a confirmação de produção.',
        };
      }
    }

    const outcomes: string[] = [];
    let failures = 0;
    let touched = 0;
    let skipped = 0;
    for (const page of rows) {
      if (page.deployments.length === 0) {
        skipped++;
        continue;
      }
      touched++;
      const result = await switchPage(page.id, wantPublished);
      if (!result.ok) failures++;
      outcomes.push(...result.outcomes.map((o) => (ids.length > 1 ? `${page.title} → ${o}` : o)));
    }
    if (touched === 0) {
      return {
        ok: false,
        message:
          ids.length > 1
            ? 'Nenhuma das páginas selecionadas foi publicada alguma vez — abra cada uma e use Publicar.'
            : 'Esta página nunca foi publicada — abra e use Publicar.',
      };
    }
    const skippedNote =
      skipped > 0 ? ` (${skipped} ignorada(s): nunca foram publicadas — abra e use Publicar)` : '';
    return {
      ok: failures === 0,
      message:
        (wantPublished
          ? `Publicada em: ${outcomes.join('; ')}`
          : `Despublicada de: ${outcomes.join('; ')}`) + skippedNote,
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
  const [uiTheme, toggleUiTheme] = useUiTheme();

  // Deleting asks for a second click on the same row instead of a dialog:
  // `confirm()` can be silently blocked inside the admin's iframe, and a
  // swallowed dialog would make the button simply do nothing.
  const [confirming, setConfirming] = useState<string | null>(null);

  // Row selection feeds the bulk bar (publish/unpublish across many pages).
  const [sel, setSel] = useState<string[]>([]);
  const toggleSel = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = pages.length > 0 && sel.length === pages.length;
  const selPages = pages.filter((p) => sel.includes(p.id));
  // The list can only flip pages that were published at least once (same rule
  // as the per-row action) — with none in the selection, the buttons stay
  // visible, gray, with the reason written beside them.
  const anyDeployed = selPages.some((p) => p.deployments.length > 0);
  const liveCount = pages.filter((p) => p.deployments.some((d) => d.isPublished)).length;

  const actBulk = (intent: 'bulk-publish' | 'bulk-unpublish') => {
    const fd = new FormData();
    fd.set('intent', intent);
    for (const id of sel) fd.append('ids', id);
    submit(fd, { method: 'post' });
    setSel([]);
  };

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
    <div className="dv-ui" data-theme={uiTheme} style={pageShell}>
      <UiStyle />
      <div style={pageWrap}>
        <header style={listHead}>
          <img src="/mark.svg" alt="" width={26} height={26} />
          <h1 style={listTitle}>Páginas</h1>
          {/* Counted from the data on screen, never hardcoded. */}
          <span style={countLine} data-count>
            {pages.length} {pages.length === 1 ? 'página' : 'páginas'} · {liveCount} no ar
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} style={iconButton} />
            <button
              type="button"
              style={buttonGhost}
              disabled={busy}
              onClick={() => filePicker.current?.click()}
            >
              Importar página (.json)
            </button>
            <button type="button" style={buttonPrimary} disabled={busy} onClick={() => act('create')}>
              Criar página
            </button>
          </div>
        </header>

        <input
          ref={filePicker}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => importFile(e.target.files?.[0])}
        />

        {result ? (
          <div style={{ ...(result.ok ? bannerOk : bannerErr), marginBottom: 14 }} data-result>
            {result.message}
          </div>
        ) : null}

        {sel.length > 0 ? (
          <div style={bulkBar} data-bulk>
            <span style={{ fontWeight: 600 }}>
              {sel.length} selecionada{sel.length > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              style={buttonGhost}
              disabled={busy || !anyDeployed}
              onClick={() => actBulk('bulk-publish')}
            >
              Publicar
            </button>
            <button
              type="button"
              style={buttonGhost}
              disabled={busy || !anyDeployed}
              onClick={() => actBulk('bulk-unpublish')}
            >
              Despublicar
            </button>
            {!anyDeployed ? (
              <span style={bulkReason}>
                Nenhuma das selecionadas foi publicada alguma vez — abra a página e use Publicar.
              </span>
            ) : null}
            <button
              type="button"
              style={{ ...rowAction, marginLeft: 'auto' }}
              onClick={() => setSel([])}
            >
              Limpar seleção
            </button>
          </div>
        ) : null}

        <div style={card}>
          {pages.length === 0 ? (
            <div style={emptyState}>
              Nenhuma página ainda. Clique em <strong>Criar página</strong> para começar.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 28 }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      checked={allSelected}
                      onChange={() => setSel(allSelected ? [] : pages.map((p) => p.id))}
                    />
                  </th>
                  <th style={th}>Título</th>
                  <th style={th}>Handle</th>
                  <th style={th}>Publicada em</th>
                  <th style={th}>Atualizada</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${page.title}`}
                        checked={sel.includes(page.id)}
                        onChange={() => toggleSel(page.id)}
                      />
                    </td>
                    <td style={td}>
                      <Link to={`/app/pages/${page.id}${search}`} style={titleLink}>
                        {page.title}
                      </Link>
                    </td>
                    <td style={{ ...td, color: 'var(--dv-ink-2)' }}>/{page.handle}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {page.deployments.length === 0 ? (
                          <span style={pillNeutral}>rascunho</span>
                        ) : (
                          page.deployments.map((d) => (
                            <span key={d.id} style={d.isPublished ? pillSuccess : pillNeutral}>
                              {d.isPublished ? d.store.label : `${d.store.label} (pausada)`}
                            </span>
                          ))
                        )}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--dv-ink-2)', whiteSpace: 'nowrap' }}>
                      {new Date(page.updatedAt).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirming === page.id ? (
                        <>
                          <button
                            type="button"
                            style={{ ...rowAction, color: 'var(--dv-danger)', fontWeight: 600 }}
                            disabled={busy}
                            onClick={() => act('delete', page.id)}
                          >
                            Confirmar exclusão
                          </button>
                          <button type="button" style={rowAction} onClick={() => setConfirming(null)}>
                            Cancelar
                          </button>
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
                            <button
                              type="button"
                              style={rowAction}
                              disabled={busy}
                              onClick={() => act('unpublish', page.id)}
                            >
                              Despublicar
                            </button>
                          ) : page.deployments.length > 0 ? (
                            <button
                              type="button"
                              style={rowAction}
                              disabled={busy}
                              onClick={() => act('publish', page.id)}
                            >
                              Publicar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            style={rowAction}
                            disabled={busy}
                            onClick={() => act('duplicate', page.id)}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            style={{ ...rowAction, color: 'var(--dv-danger)' }}
                            disabled={busy}
                            onClick={() => setConfirming(page.id)}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--dv-sfc-sub)',
  fontFamily: FONT_STACK,
  color: 'var(--dv-ink)',
};

const pageWrap: React.CSSProperties = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '24px 20px 48px',
};

const listHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 18,
};

const listTitle: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 650,
  margin: 0,
};

const countLine: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-ink-3)',
  marginLeft: 4,
  paddingTop: 3,
};

const bulkBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--dv-accent-tint)',
  border: '1px solid var(--dv-accent-edge)',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  marginBottom: 14,
};

const bulkReason: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-ink-2)',
};

const iconButton: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
};

const card: React.CSSProperties = {
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 12,
  overflow: 'hidden',
};

const emptyState: React.CSSProperties = {
  padding: 32,
  fontSize: 13.5,
  color: 'var(--dv-ink-2)',
  textAlign: 'center',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--dv-ink-3)',
  padding: '10px 14px',
  borderBottom: '1px solid var(--dv-edge)',
};

const td: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--dv-edge-soft)',
  verticalAlign: 'middle',
};

const titleLink: React.CSSProperties = {
  color: 'var(--dv-link)',
  textDecoration: 'none',
  fontWeight: 500,
};

// Preview/export are plain anchors (new tab, download); the other actions are
// buttons. Both wear the same clothes so the row reads as one toolbar.
const rowLink: React.CSSProperties = {
  color: 'var(--dv-link)',
  textDecoration: 'none',
  fontSize: 13,
  padding: '4px 8px',
  whiteSpace: 'nowrap',
};

const rowAction: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--dv-link)',
  fontSize: 13,
  padding: '4px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
