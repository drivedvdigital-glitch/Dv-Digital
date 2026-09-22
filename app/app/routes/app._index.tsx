import { useRef, useState } from 'react';
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { requireShop } from '../lib/auth.server.ts';
import { compile, type Doc } from '../lib/compiler.server.ts';
import { openWithToken, shopSearch } from '../ui/embedded.ts';
import { Icon } from '../ui/icons.tsx';
import { LocalDateTime } from '../ui/local-time.tsx';
import { db } from '../lib/db.server.ts';
import { passHeaders } from '../lib/headers.ts';
import { deploymentKind, switchPage } from '../lib/publish.server.ts';
import { STORE_LABEL_MAX, storeLabelFrom } from '../lib/shared.ts';
import { clientFor, removeProductTemplate, storeUnusableReason } from '../lib/shopify.server.ts';

export const headers = passHeaders;
import {
  bannerErr,
  bannerOk,
  FONT_STACK,
  pillInfo,
  pillNeutral,
  pillSuccess,
  ThemeToggle,
  UiStyle,
  useUiTheme,
} from '../ui/theme.tsx';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const pages = await db.page.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      deployments: { include: { store: true } },
      // Contados por loja, não no total: uma página de produto ligada a 3
      // produtos na Colômbia e a nenhum na Hungria mostrava "3" nas duas.
      productLinks: { select: { storeId: true } },
    },
  });
  const stores = await db.store.findMany({ orderBy: { createdAt: 'asc' } });
  const aqui = stores.find((s) => s.domain === shop) ?? null;
  // Only what the list shows — never a store's token or credentials.
  return {
    shop,
    storeAtual: aqui ? { id: aqui.id, label: aqui.label, domain: aqui.domain } : null,
    // As lojas com o nome que VOCÊ deu. O nome que a Shopify devolve na
    // instalação é um palpite (e vira o domínio quando a consulta falha, que
    // é como duas lojas acabaram chamadas `49e257-b3` e `01xmv2-7m`).
    stores: stores.map((s) => ({
      id: s.id,
      domain: s.domain,
      label: s.label,
      isProduction: s.isProduction,
      unusable: storeUnusableReason(s),
    })),
    pages: pages.map(({ productLinks, ...page }) => ({
      ...page,
      productCount: aqui ? productLinks.filter((l) => l.storeId === aqui.id).length : productLinks.length,
      productCountAll: productLinks.length,
      // "Desta loja": criada aqui, ou publicada aqui, ou de antes da coluna
      // existir e nunca publicada (nula) — essa aparece em toda lista, para
      // não sumir.
      daqui:
        !aqui ||
        page.ownerStoreId === aqui.id ||
        page.deployments.some((d) => d.storeId === aqui.id) ||
        (page.ownerStoreId === null && page.deployments.length === 0),
      ownerLabel: page.ownerStoreId ? (stores.find((s) => s.id === page.ownerStoreId)?.label ?? null) : null,
      ownerDomain: page.ownerStoreId ? (stores.find((s) => s.id === page.ownerStoreId)?.domain ?? null) : null,
      deployments: page.deployments.map((d) => ({
        id: d.id,
        isPublished: d.isPublished,
        kind: deploymentKind(d.shopifyGid),
        store: { label: d.store.label, domain: d.store.domain, isProduction: d.store.isProduction, unusable: storeUnusableReason(d.store) },
      })),
    })),
  };
}

/** A handle no other page uses; suffixes only when needed. */
async function freeHandle(wanted: string): Promise<string> {
  const clash = await db.page.findFirst({ where: { handle: wanted } });
  return clash ? `${wanted}-${Date.now().toString(36)}` : wanted;
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const intent = form.get('intent');
  // Whatever this screen creates is filed under the store it was opened from.
  // Null when the store is not registered yet (dev without a store): the page
  // then shows in every list rather than in none.
  const ownerStoreId = (await db.store.findUnique({ where: { domain: shop }, select: { id: true } }))?.id ?? null;

  if (intent === 'renomear-lojas') {
    // Um nome por loja, todos de uma vez. Vazio significa "volte a chamar pelo
    // domínio" em vez de virar um rótulo em branco impossível de clicar.
    const stores = await db.store.findMany({ select: { id: true, domain: true, label: true } });
    let mudadas = 0;
    for (const store of stores) {
      const campo = form.get(`nome-${store.id}`);
      if (campo === null) continue;
      const novo = storeLabelFrom(String(campo), store.domain);
      if (store.label === novo) continue;
      await db.store.update({ where: { id: store.id }, data: { label: novo } });
      mudadas += 1;
    }
    if (mudadas === 0) return { ok: true, message: 'Os nomes já estavam assim.' };
    return { ok: true, message: `${mudadas} loja(s) renomeada(s).` };
  }

  if (intent === 'create') {
    const page = await db.page.create({
      data: {
        ownerStoreId,
        title: 'Nova página',
        handle: `pagina-${Date.now().toString(36)}`,
        doc: JSON.stringify({
          version: 1,
          root: [{ id: 'html', type: 'html', props: { html: '<h1>Nova página</h1>' } }],
        }),
      },
    });
    return redirect(`/app/pages/${page.id}${shopSearch(new URL(request.url).search)}`);
  }

  if (intent === 'duplicate') {
    const source = await db.page.findUniqueOrThrow({ where: { id: String(form.get('id')) } });
    // Duplicating is the real creation gesture here: pages are named per
    // market (250-CO-…, 08-MX-…) and varied from an existing one. The copy
    // is the same kind of page, with the same settings; product links are
    // not copied (one product renders one page).
    // The copy is filed where it was MADE, not where the original lives: a
    // Colombian page duplicated from Hungary's admin is the Hungarian variant.
    await db.page.create({
      data: {
        ownerStoreId,
        title: `${source.title} (cópia)`,
        handle: `${source.handle}-copia-${Date.now().toString(36)}`,
        doc: source.doc,
        pageType: source.pageType,
        showChrome: source.showChrome,
        productContentAbove: source.productContentAbove,
        bareLayout: source.bareLayout,
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
    // A product template also leaves its template and section in each theme;
    // deleting the page is the moment to take them out (invariant I3: we
    // remove exactly what we wrote). Decided per deployment — what IS on the
    // store, not what the page's type says today. Best effort — a theme that
    // refuses does not keep the page alive here.
    const page = await db.page.findUnique({ where: { id }, include: { deployments: { include: { store: true } } } });
    for (const deployment of page?.deployments ?? []) {
      if (deploymentKind(deployment.shopifyGid) !== 'product') continue;
      try {
        await removeProductTemplate(clientFor(deployment.store), id);
      } catch {
        // Out of reach (uninstalled) or the theme refused: the page still goes.
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
    let payload: {
      dvfly?: number;
      title?: string;
      handle?: string;
      pageType?: unknown;
      showChrome?: unknown;
      productContentAbove?: unknown;
      bareLayout?: unknown;
      doc?: Doc;
    };
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
        ownerStoreId,
        title: payload.title || 'Página importada',
        handle: await freeHandle(payload.handle || `importada-${Date.now().toString(36)}`),
        doc: JSON.stringify(payload.doc),
        // Settings from a newer export; an older file simply has none.
        pageType: payload.pageType === 'product' ? 'product' : 'regular',
        showChrome: payload.showChrome !== false,
        productContentAbove: payload.productContentAbove === true,
        bareLayout: payload.bareLayout === true,
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
  const { pages: todas, stores, storeAtual } = useLoaderData<typeof loader>();

  // Por padrão a lista é a DESTA loja: criadas aqui, publicadas aqui. "Todas
  // as lojas" existe para o que não é daqui nunca ficar inalcançável — é um
  // clique, com a contagem do que está do outro lado escrita nele.
  const [escopo, setEscopo] = useState<'aqui' | 'todas'>('aqui');
  const pages = escopo === 'todas' || !storeAtual ? todas : todas.filter((p) => p.daqui);
  const deOutras = todas.length - todas.filter((p) => p.daqui).length;
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
  // Read against the current list, so a page deleted meanwhile drops out of
  // the count and out of the next bulk action.
  const [rawSel, setSel] = useState<string[]>([]);
  const sel = rawSel.filter((id) => pages.some((p) => p.id === id));
  const toggleSel = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // The list narrows by page kind (the tabs) and by text; counts come from
  // the data behind each tab, never from a label.
  const [typeTab, setTypeTab] = useState<'all' | 'regular' | 'product'>('all');
  const [query, setQuery] = useState('');
  const counts = {
    all: pages.length,
    regular: pages.filter((p) => p.pageType !== 'product').length,
    product: pages.filter((p) => p.pageType === 'product').length,
  };
  const needle = fold(query.trim());
  const visible = pages.filter(
    (p) =>
      (typeTab === 'all' || (typeTab === 'product') === (p.pageType === 'product')) &&
      (!needle || fold(p.title).includes(needle) || fold(p.handle).includes(needle)),
  );
  const allSelected = visible.length > 0 && visible.every((p) => sel.includes(p.id));
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
          <div>
            <h1 style={listTitle}>Páginas</h1>
            {/* Counted from the data on screen, never hardcoded. */}
            <div style={countLine} data-count>
              {pages.length} {pages.length === 1 ? 'página' : 'páginas'}
              {storeAtual ? (escopo === 'aqui' ? ` de ${storeAtual.label}` : ' em todas as lojas') : ''} · {liveCount} no ar
            </div>
          </div>
          {storeAtual ? (
            <div style={scopeRow} role="tablist" aria-label="Quais lojas">
              <button
                type="button"
                role="tab"
                className="dv-tab"
                data-scope="aqui"
                data-on={escopo === 'aqui' ? true : undefined}
                aria-selected={escopo === 'aqui'}
                title={`Criadas ou publicadas em ${storeAtual.domain}`}
                onClick={() => setEscopo('aqui')}
              >
                Esta loja
                <span style={tabCount}>{todas.filter((p) => p.daqui).length}</span>
              </button>
              <button
                type="button"
                role="tab"
                className="dv-tab"
                data-scope="todas"
                data-on={escopo === 'todas' ? true : undefined}
                aria-selected={escopo === 'todas'}
                title={deOutras > 0 ? `Mais ${deOutras} de outras lojas` : 'Nenhuma página de outra loja'}
                onClick={() => setEscopo('todas')}
              >
                Todas as lojas
                <span style={tabCount}>{todas.length}</span>
              </button>
            </div>
          ) : null}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-btn dv-secondary dv-icon-btn" />
            <button
              type="button"
              className="dv-btn dv-secondary"
              disabled={busy}
              title="Recria uma página a partir de um arquivo exportado pelo D&VFly"
              onClick={() => filePicker.current?.click()}
            >
              Importar página (.json)
            </button>
            <button type="button" className="dv-btn dv-primary" disabled={busy} onClick={() => act('create')}>
              <Icon name="plus" />
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

        <div style={card}>
          <div style={cardToolbar}>
            {sel.length > 0 ? (
              <div style={bulkBar} data-bulk>
                <span style={{ fontWeight: 600 }}>
                  {sel.length} selecionada{sel.length > 1 ? 's' : ''}
                </span>
                <button type="button" className="dv-btn dv-secondary" disabled={busy || !anyDeployed} onClick={() => actBulk('bulk-publish')}>
                  Publicar
                </button>
                <button type="button" className="dv-btn dv-secondary" disabled={busy || !anyDeployed} onClick={() => actBulk('bulk-unpublish')}>
                  Despublicar
                </button>
                {!anyDeployed ? (
                  <span style={bulkReason}>
                    Nenhuma das selecionadas foi publicada alguma vez — abra a página e use Publicar.
                  </span>
                ) : null}
                <button type="button" className="dv-btn dv-plain" style={{ marginLeft: 'auto' }} onClick={() => setSel([])}>
                  Limpar seleção
                </button>
              </div>
            ) : (
              <>
                <div style={tabsRow} role="tablist">
                  {TYPE_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      className="dv-tab"
                      data-type-tab={t.key}
                      data-on={typeTab === t.key ? true : undefined}
                      aria-selected={typeTab === t.key}
                      onClick={() => setTypeTab(t.key)}
                    >
                      {t.label}
                      <span style={tabCount}>{counts[t.key]}</span>
                    </button>
                  ))}
                </div>
                <div style={searchWrap}>
                  <Icon name="search" style={searchIcon} />
                  <input
                    className="dv-input"
                    style={searchInput}
                    placeholder="Buscar por título ou URL"
                    aria-label="Buscar página"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          {pages.length === 0 ? (
            <div style={emptyState}>
              <span style={emptyIcon}>
                <Icon name="page" size={20} />
              </span>
              {deOutras > 0 && escopo === 'aqui' ? (
                // Vazio AQUI, mas não vazio: diz onde as páginas estão e abre.
                <>
                  <div style={{ fontWeight: 600, color: 'var(--dv-ink)' }}>Nenhuma página de {storeAtual?.label} ainda</div>
                  <div>
                    Há {deOutras} de outras lojas —{' '}
                    <button type="button" className="dv-btn dv-plain" style={{ padding: '0 2px' }} onClick={() => setEscopo('todas')} data-ver-todas>
                      ver todas as lojas
                    </button>
                    . Ou clique em <strong>Criar página</strong>.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, color: 'var(--dv-ink)' }}>Nenhuma página ainda</div>
                  <div>
                    Clique em <strong>Criar página</strong> para começar.
                  </div>
                </>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div style={emptyState}>Nenhuma página combina com a busca.</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      checked={allSelected}
                      onChange={() => setSel(allSelected ? [] : visible.map((p) => p.id))}
                    />
                  </th>
                  <th style={th}>Título</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Lojas</th>
                  <th style={th}>Atualizada</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {visible.map((page) => (
                  <tr key={page.id} className="dv-row">
                    <td style={td}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${page.title}`}
                        checked={sel.includes(page.id)}
                        onChange={() => toggleSel(page.id)}
                      />
                    </td>
                    <td style={td}>
                      <Link to={`/app/pages/${page.id}${shopSearch(search)}`} style={titleLink} title="Abrir no editor">
                        {page.title}
                      </Link>
                      {!page.daqui ? (
                        // Só aparece em "Todas as lojas": diz DE QUAL loja é.
                        <span style={{ ...pillNeutral, marginLeft: 6 }} data-outra-loja title={page.ownerDomain ? `Criada em ${page.ownerDomain}` : undefined}>
                          {page.ownerLabel ?? 'outra loja'}
                        </span>
                      ) : null}
                      <div style={subLine}>
                        {page.pageType === 'product'
                          ? // Nesta loja, os produtos desta loja; em todas, o total.
                            (() => {
                              const n = escopo === 'aqui' && storeAtual ? page.productCount : page.productCountAll;
                              return `${n} produto${n === 1 ? '' : 's'} vinculado${n === 1 ? '' : 's'}${escopo === 'aqui' && storeAtual ? ' nesta loja' : ''}`;
                            })()
                          : `/pages/${page.handle}`}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={page.pageType === 'product' ? pillInfo : pillNeutral}>
                        {page.pageType === 'product' ? 'Produto' : 'Normal'}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                        {page.deployments.length === 0 ? (
                          <span style={pillNeutral}>rascunho</span>
                        ) : (
                          page.deployments.map((d) => (
                            <span
                              key={d.id}
                              style={d.isPublished ? pillSuccess : pillNeutral}
                              // Two stores may share a name; the domain says which.
                              title={d.store.unusable ? `${d.store.domain} — sem acesso: ${d.store.unusable}` : d.store.domain}
                            >
                              {d.isPublished ? d.store.label : `${d.store.label} (pausada)`}
                              {d.store.unusable ? ' · sem acesso' : ''}
                            </span>
                          ))
                        )}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--dv-ink-2)', whiteSpace: 'nowrap' }}>
                      <LocalDateTime iso={new Date(page.updatedAt).toISOString()} />
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <div style={rowActions}>
                        {confirming === page.id ? (
                          <>
                            <button
                              type="button"
                              className="dv-btn dv-plain"
                              data-danger
                              style={{ ...rowAction, fontWeight: 600 }}
                              disabled={busy}
                              onClick={() => act('delete', page.id)}
                            >
                              Confirmar exclusão
                            </button>
                            <button type="button" className="dv-btn dv-plain" style={rowAction} onClick={() => setConfirming(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="dv-btn dv-plain" style={rowAction} title="Abre a página compilada numa aba nova" onClick={() => openWithToken(`/preview/${page.id}`)}>
                              Pré-visualizar
                            </button>
                            <button type="button" className="dv-btn dv-plain" style={rowAction} title="Baixa o documento da página em .json" onClick={() => openWithToken(`/api/pages/${page.id}/export`)}>
                              Exportar
                            </button>
                            {page.deployments.some((d) => d.isPublished) ? (
                              <button type="button" className="dv-btn dv-plain" style={rowAction} disabled={busy} title="Tira do ar em todas as lojas; o conteúdo fica" onClick={() => act('unpublish', page.id)}>
                                Despublicar
                              </button>
                            ) : page.deployments.length > 0 ? (
                              <button type="button" className="dv-btn dv-plain" style={rowAction} disabled={busy} title="Volta a mostrar o que já está nas lojas" onClick={() => act('publish', page.id)}>
                                Publicar
                              </button>
                            ) : null}
                            <button type="button" className="dv-btn dv-plain" style={rowAction} disabled={busy} onClick={() => act('duplicate', page.id)}>
                              Duplicar
                            </button>
                            <button type="button" className="dv-btn dv-plain" data-danger style={rowAction} disabled={busy} onClick={() => setConfirming(page.id)}>
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* As lojas, com o nome que você escolher. Duas lojas podem se chamar
            "Côlombia" — por isso o domínio fica SEMPRE na linha de baixo: é
            ele que diz qual é qual quando o nome não diz. */}
        <section style={{ ...card, marginTop: 18 }} data-lojas>
          <div style={storesHead}>
            <div>
              <h2 style={storesTitle}>Lojas</h2>
              <div style={countLine}>
                {stores.length} {stores.length === 1 ? 'loja instalada' : 'lojas instaladas'} · o nome aparece em
                "Publicar em"
              </div>
            </div>
          </div>
          {stores.length === 0 ? (
            <div style={emptyState}>
              Nenhuma loja instalada ainda. Abra o app pelo admin da loja: ela se instala sozinha.
            </div>
          ) : (
            <Form method="post" style={{ padding: '4px 16px 16px' }}>
              <input type="hidden" name="intent" value="renomear-lojas" />
              {stores.map((store) => (
                <div key={store.id} style={storeRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      className="dv-input"
                      // A caixa é não-controlada (`defaultValue`), e o React
                      // não reescreve o DOM de uma dessas: depois de salvar,
                      // o campo continuava mostrando o que foi DIGITADO —
                      // vazio, ou com espaços — enquanto o banco já tinha o
                      // nome tratado. Tela mentindo sobre o que gravou. A
                      // chave inclui o rótulo salvo, então o campo é
                      // remontado quando o nome muda de verdade.
                      key={`${store.id}:${store.label}`}
                      name={`nome-${store.id}`}
                      defaultValue={store.label}
                      maxLength={STORE_LABEL_MAX}
                      aria-label={`Nome de ${store.domain}`}
                      placeholder={store.domain.replace('.myshopify.com', '')}
                      style={{ width: '100%', maxWidth: 320 }}
                    />
                    {/* O domínio nunca some: é a identidade de verdade. */}
                    <div style={subLine}>{store.domain}</div>
                  </div>
                  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                    {store.isProduction ? <span style={pillInfo}>produção</span> : <span style={pillNeutral}>teste</span>}
                    {store.unusable ? (
                      <span style={pillNeutral} title={store.unusable}>
                        sem acesso
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button type="submit" className="dv-btn dv-secondary" disabled={busy} data-salvar-nomes>
                  Salvar nomes
                </button>
                <span style={bulkReason}>
                  Só muda como a loja aparece aqui — nada muda na Shopify. Nome vazio volta a usar o domínio.
                </span>
              </div>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}

const TYPE_TABS: Array<{ key: 'all' | 'regular' | 'product'; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'regular', label: 'Normais' },
  { key: 'product', label: 'Produto' },
];

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const pageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--dv-bg)',
  fontFamily: FONT_STACK,
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--dv-ink)',
};

// Full width, like the admin's own index pages (Produtos, Pedidos): a narrow
// card floating in the middle of a wide frame reads as a demo, not a tool.
const pageWrap: React.CSSProperties = {
  width: '100%',
  padding: '20px 24px 48px',
};

const listHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 14,
};

const listTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '24px',
  margin: 0,
};

const countLine: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-ink-3)',
  marginTop: 2,
};

const card: React.CSSProperties = {
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 12,
  boxShadow: 'var(--dv-shadow-soft)',
  overflow: 'hidden',
};

const cardToolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '6px 12px 0',
  borderBottom: '1px solid var(--dv-edge)',
  minHeight: 44,
};

const tabsRow: React.CSSProperties = { display: 'flex', gap: 2 };

// "Esta loja / Todas as lojas", no cabeçalho, ao lado da contagem.
const scopeRow: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  marginLeft: 16,
  paddingLeft: 16,
  borderLeft: '1px solid var(--dv-edge)',
};

const tabCount: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--dv-ink-3)',
  background: 'var(--dv-inset2)',
  borderRadius: 999,
  padding: '0 6px',
  lineHeight: '16px',
};

const searchWrap: React.CSSProperties = { position: 'relative', width: 320, paddingBottom: 6 };
const searchIcon: React.CSSProperties = { position: 'absolute', left: 9, top: 8, color: 'var(--dv-ink-3)', pointerEvents: 'none' };
const searchInput: React.CSSProperties = { paddingLeft: 30 };

const bulkBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '4px 0 10px',
  fontSize: 13,
};

const bulkReason: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-ink-2)',
};

const emptyState: React.CSSProperties = {
  padding: '40px 24px',
  fontSize: 13.5,
  color: 'var(--dv-ink-2)',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
};

const emptyIcon: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: 'var(--dv-inset2)',
  border: '1px solid var(--dv-edge)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--dv-ink-2)',
  marginBottom: 6,
};

const storesHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderBottom: '1px solid var(--dv-edge)',
};

const storesTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: '20px',
  margin: 0,
};

const storeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0',
  borderBottom: '1px solid var(--dv-edge-soft)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--dv-ink-2)',
  padding: '8px 16px',
  borderBottom: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc-sub)',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--dv-edge-soft)',
  verticalAlign: 'middle',
};

const titleLink: React.CSSProperties = {
  color: 'var(--dv-ink)',
  textDecoration: 'none',
  fontWeight: 600,
};

const subLine: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--dv-ink-3)',
  marginTop: 1,
};

const rowActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 0,
};

const rowAction: React.CSSProperties = {
  fontSize: 12.5,
  padding: '3px 7px',
};
