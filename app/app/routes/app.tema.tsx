import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router';

import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';
import { passHeaders } from '../lib/headers.ts';
import { clientFor } from '../lib/shopify.server.ts';
import {
  appEmbeds,
  checkItem,
  disableAppEmbeds,
  likelySource,
  listThemes,
  missingTemplates,
  prepareItem,
  prepInventory,
  themePair,
  type AppEmbed,
  type PrepItem,
} from '../lib/theme-prep.server.ts';
import { shopSearch } from '../ui/embedded.ts';
import { Icon } from '../ui/icons.tsx';
import {
  bannerErr,
  bannerOk,
  FONT_STACK,
  pillDanger,
  pillInfo,
  pillNeutral,
  pillSuccess,
  pillWarn,
  ThemeToggle,
  UiStyle,
  useUiTheme,
} from '../ui/theme.tsx';

export const headers = passHeaders;

/** The app whose embed this screen offers to switch off: it loads ~27 files on every page (measured 07/10). */
const PAGEFLY = 'pagefly-ai-page-builder';

const APP_NAMES: Record<string, string> = {
  'easysell-cod-form': 'EasySell (formulário de pedido)',
  [PAGEFLY]: 'PageFly',
  'areviews-reviews-importer': 'aReviews',
};
const appName = (handle: string) => APP_NAMES[handle] ?? handle;

/**
 * "Trocar de tema": before the store publishes another theme, D&VFly writes
 * into it every file its pages and live A | B tests need (theme-prep.ts).
 * Without that, products point at templates the new theme does not have and
 * Shopify shows its default product page in their place.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const store = await db.store.findUnique({ where: { domain: shop } });
  if (!store) return { ok: false as const, error: 'Loja não instalada.' };
  let client;
  try {
    client = clientFor(store);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    return await screenData(request, store, client);
  } catch (error) {
    return { ok: false as const, error: `Não foi possível ler os temas da loja agora: ${error instanceof Error ? error.message : String(error)}. Recarregue em instantes.` };
  }
}

async function screenData(request: Request, store: NonNullable<Awaited<ReturnType<typeof db.store.findUnique>>>, client: ReturnType<typeof clientFor>) {
  const themes = await listThemes(client);
  const main = themes.find((t) => t.role === 'MAIN') ?? null;
  const url = new URL(request.url);
  const unpublished = themes.filter((t) => t.role === 'UNPUBLISHED');
  const targetId =
    url.searchParams.get('alvo') ?? unpublished.find((t) => !t.processing && !t.processingFailed)?.id ?? unpublished[0]?.id ?? null;
  const target = themes.find((t) => t.id === targetId) ?? null;
  const repair = target?.role === 'MAIN';
  const inventory = await prepInventory(store, client);
  // Normally the source is the published theme; completing a theme already
  // published takes the one it replaced (the one holding this store's pages).
  const sourceId = repair
    ? (url.searchParams.get('origem') ?? (await likelySource(client, unpublished, inventory.items))?.id ?? null)
    : (main?.id ?? null);
  const source = themes.find((t) => t.id === sourceId) ?? null;
  let foreignMissing: Array<{ suffix: string; resource: string; titles: string[] }> = [];
  let embedsOffInTarget: string[] = [];
  let pageflyOn = false;
  let checksError: string | null = null;
  // Templates of the store that look like PageFly's: switching its embed off would break them.
  const pageflyInUse = inventory.foreign.filter((u) => /^pf-|pagefly/i.test(u.suffix)).flatMap((u) => u.titles);
  if (target && source && !target.processing && !target.processingFailed) {
    try {
      foreignMissing = (await missingTemplates(client, target.id, inventory.foreign)).map((u) => ({
        suffix: u.suffix,
        resource: u.resource,
        titles: u.titles,
      }));
      const [fromEmbeds, toEmbeds] = await Promise.all([appEmbeds(client, source.id), appEmbeds(client, target.id)]);
      const on = (list: AppEmbed[], app: string) => list.some((e) => e.app === app && e.enabled);
      embedsOffInTarget = [...new Set(fromEmbeds.filter((e) => e.enabled && !on(toEmbeds, e.app) && e.app !== PAGEFLY).map((e) => e.app))];
      pageflyOn = on(toEmbeds, PAGEFLY);
    } catch (error) {
      checksError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    ok: true as const,
    store: { label: store.label },
    themes: themes.map((t) => ({ id: t.id, name: t.name, role: t.role, processing: t.processing, processingFailed: t.processingFailed })),
    main: main ? { id: main.id, name: main.name } : null,
    target: target ? { id: target.id, name: target.name, role: target.role, processing: target.processing, processingFailed: target.processingFailed } : null,
    source: source ? { id: source.id, name: source.name } : null,
    repair,
    items: inventory.items,
    foreignMissing,
    embedsOffInTarget: embedsOffInTarget.map(appName),
    pageflyOn,
    pageflyInUse,
    checksError,
  };
}

/**
 * Each item answers on its own row; reloading the whole screen after every
 * one would scan every product and page of the store again each time.
 * Switching an embed off does change what the screen shows.
 */
export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const intent = formData?.get('intent');
  if (intent === 'preparar' || intent === 'conferir') return false;
  return defaultShouldRevalidate;
}

type ActionResult =
  | { key: string; phase: 'preparar' | 'conferir'; status: string; detail: string | null; notes: string[] }
  | { embeds: number; error?: undefined }
  | { error: string; key?: string; phase?: 'preparar' | 'conferir' };

/** One item per request: a slow store never hits a request time limit, and a failure stays on its own row. */
export async function action({ request }: ActionFunctionArgs): Promise<ActionResult> {
  const { shop } = await requireShop(request);
  const store = await db.store.findUnique({ where: { domain: shop } });
  if (!store) return { error: 'Loja não instalada.' };
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const key = String(form.get('key') ?? '');
  const phase = intent === 'conferir' ? 'conferir' : 'preparar';
  // A failure from Shopify (an outage, throttling) answers on its own row:
  // the run goes on and the screen stays.
  try {
    return await act(request, store, form, intent, key, phase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return intent === 'desligar-embed' ? { error: message } : { error: message, key, phase };
  }
}

async function act(
  request: Request,
  store: NonNullable<Awaited<ReturnType<typeof db.store.findUnique>>>,
  form: FormData,
  intent: string,
  key: string,
  phase: 'preparar' | 'conferir',
): Promise<ActionResult> {
  const client = clientFor(store);
  const pair = await themePair(client, String(form.get('origem') ?? ''), String(form.get('alvo') ?? ''));
  if (typeof pair === 'string') return intent === 'desligar-embed' ? { error: pair } : { error: pair, key, phase };

  if (intent === 'desligar-embed') {
    const embeds = await disableAppEmbeds(client, pair.target.id, PAGEFLY);
    return { embeds };
  }

  // The item, re-validated: only our own suffixes, only this store's live tests.
  let item: PrepItem;
  const template = /^(product|page):(dvfly-[a-z0-9-]+)$/i.exec(key);
  const split = /^ab:([a-z0-9]+)$/i.exec(key);
  if (template) {
    item = { key, kind: 'template', resource: template[1] as 'product' | 'page', suffix: template[2], label: '', type: '', usedBy: [], note: null };
  } else if (split && (await db.abTest.count({ where: { id: split[1], storeId: store.id, status: 'live' } })) === 1) {
    item = { key, kind: 'split', testId: split[1], label: '', type: '', usedBy: [], note: null };
  } else {
    return { error: 'Item desconhecido. Recarregue a página.', key, phase };
  }
  const origin = new URL(request.url).origin;
  if (intent === 'conferir') {
    const check = await checkItem(store, client, pair, item, origin);
    return { key, phase, status: check.status, detail: check.detail, notes: [] };
  }
  if (intent !== 'preparar') return { error: 'Ação desconhecida.' };
  const outcome = await prepareItem(store, client, pair, item, origin);
  return { key, phase, status: outcome.status, detail: outcome.problem, notes: outcome.notes };
}

type Row = { status: string; detail: string | null; notes: string[]; phase: 'preparar' | 'conferir' };

const STATUS_LABEL: Record<string, string> = {
  pronto: 'Pronto',
  falhou: 'Falhou',
  falta: 'Falta no tema',
  desatualizado: 'Desatualizado',
};
const STATUS_PILL: Record<string, React.CSSProperties> = {
  pronto: pillSuccess,
  falhou: pillDanger,
  falta: pillWarn,
  desatualizado: pillWarn,
};

export default function ThemeSwitch() {
  const data = useLoaderData<typeof loader>();
  const search = useLocation().search;
  const navigate = useNavigate();
  const [uiTheme, toggleUiTheme] = useUiTheme();
  const fetcher = useFetcher<ActionResult>();
  const embedFetcher = useFetcher<ActionResult>();
  const [rows, setRows] = useState<Record<string, Row>>({});
  // A run keeps the list and the pair of themes it started with: the screen
  // changing under it (another pair picked, a reload) stops it, never
  // re-aims it.
  const [run, setRun] = useState<{
    phase: 'preparar' | 'conferir';
    index: number;
    items: PrepItem[];
    pair: string;
    sourceId: string;
    targetId: string;
  } | null>(null);
  const sent = useRef<string | null>(null);
  const revalidator = useRevalidator();

  const items = data.ok ? data.items : [];
  const target = data.ok ? data.target : null;
  const source = data.ok ? data.source : null;
  const themeKey = `${source?.id}>${target?.id}`;

  // A different pair of themes starts a clean table and stops a run.
  useEffect(() => {
    setRows({});
    setRun(null);
    sent.current = null;
  }, [themeKey]);

  // Sends the next item when the previous answer is in.
  useEffect(() => {
    if (!run) return;
    if (run.pair !== themeKey) {
      setRun(null);
      return;
    }
    if (fetcher.state !== 'idle') return;
    const answer = fetcher.data;
    if (answer && 'key' in answer && answer.key && sent.current === `${run.phase}:${answer.key}`) {
      sent.current = null;
      setRows((r) => ({
        ...r,
        [answer.key!]: 'status' in answer
          ? { status: answer.status, detail: answer.detail, notes: answer.notes, phase: answer.phase }
          : { status: 'falhou', detail: answer.error ?? null, notes: [], phase: run.phase },
      }));
      setRun({ ...run, index: run.index + 1 });
      return;
    }
    if (sent.current) return;
    const item = run.items[run.index];
    if (!item) {
      setRun(null);
      // Once, at the end: the warnings may have changed (a snippet copied, a template written).
      revalidator.revalidate();
      return;
    }
    sent.current = `${run.phase}:${item.key}`;
    const form = new FormData();
    form.set('intent', run.phase);
    form.set('key', item.key);
    form.set('origem', run.sourceId);
    form.set('alvo', run.targetId);
    fetcher.submit(form, { method: 'post' });
  }, [run, fetcher.state, fetcher.data, themeKey, revalidator]);

  const counts = useMemo(() => {
    const c = { produto: 0, pagina: 0, teste: 0 };
    for (const i of items) {
      if (i.kind === 'split') c.teste++;
      else if (i.resource === 'page') c.pagina++;
      else c.produto++;
    }
    return c;
  }, [items]);

  if (!data.ok) {
    return (
      <div className="dv-ui" data-theme={uiTheme} style={shell}>
        <UiStyle />
        <div style={wrap}>
          <h1 style={title}>Trocar de tema</h1>
          <div style={{ ...bannerErr, marginTop: 12 }} data-erro-loja>
            {data.error}
          </div>
        </div>
      </div>
    );
  }

  const busy = run !== null;
  const done = items.filter((i) => rows[i.key]);
  const failed = done.filter((i) => rows[i.key].status !== 'pronto');
  const allReady = !busy && items.length > 0 && done.length === items.length && failed.length === 0;
  const blocked = !target || !source || target.processing || target.processingFailed;
  const blockedReason = !target
    ? 'Envie o tema novo em Loja virtual → Temas → Adicionar tema; depois volte aqui.'
    : target.processing
      ? 'A Shopify ainda está processando este tema. Recarregue em alguns minutos.'
      : target.processingFailed
        ? 'A Shopify não conseguiu processar este tema. Envie o arquivo de novo.'
        : !source
          ? 'Escolha de qual tema vêm os arquivos.'
          : null;
  const start = (phase: 'preparar' | 'conferir') => {
    if (!source || !target) return;
    sent.current = null;
    setRows({});
    setRun({ phase, index: 0, items, pair: themeKey, sourceId: source.id, targetId: target.id });
  };
  const pickTarget = (id: string) => {
    const params = new URLSearchParams(search);
    params.set('alvo', id);
    params.delete('origem');
    navigate(`?${params.toString()}`);
  };
  const pickSource = (id: string) => {
    const params = new URLSearchParams(search);
    params.set('origem', id);
    navigate(`?${params.toString()}`);
  };
  const candidates = data.themes.filter((t) => t.role === 'UNPUBLISHED' || t.role === 'MAIN');
  const progress = run ? `${Math.min(run.index + 1, run.items.length)} de ${run.items.length}` : null;
  const embedsOff = embedFetcher.data && 'embeds' in embedFetcher.data ? embedFetcher.data.embeds : null;
  const pageflyOn = data.pageflyOn && embedsOff === null;
  // The confirmation stays on screen after the reload that follows switching it off.
  const showPagefly = data.pageflyOn || embedsOff !== null;
  const sourceName = source?.name ?? 'o tema de origem';

  return (
    <div className="dv-ui" data-theme={uiTheme} style={shell}>
      <UiStyle />
      <div style={wrap}>
        <header style={head}>
          <div>
            <h1 style={title}>Trocar de tema</h1>
            <div style={muted}>{data.store.label}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-btn dv-secondary dv-icon-btn" />
            <Link to={`/app${shopSearch(search)}`} className="dv-btn dv-secondary">
              Páginas
            </Link>
          </div>
        </header>

        <p style={{ ...muted, margin: '0 0 14px', maxWidth: 780, fontSize: 13 }}>
          As páginas do D&amp;VFly ficam em arquivos dentro do tema publicado, e os produtos apontam para eles. Antes de publicar
          outro tema, o D&amp;VFly grava esses arquivos nele: sem isso, a Shopify mostra a página padrão de produto no lugar das
          suas páginas.
        </p>

        <section style={card}>
          <div style={cardBody}>
            <div style={grid}>
              <div style={label}>Publicado agora</div>
              <div data-tema-publicado>{data.main?.name ?? '—'}</div>
              <label style={label} htmlFor="alvo">
                Tema a preparar
              </label>
              <div>
                <select
                  id="alvo"
                  data-tema-alvo
                  value={target?.id ?? ''}
                  disabled={busy || undefined}
                  onChange={(e) => pickTarget(e.target.value)}
                  style={select}
                >
                  {target ? null : <option value="">Nenhum tema para preparar</option>}
                  {candidates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.role === 'MAIN' ? ' (publicado — completar o que faltar)' : ''}
                      {t.processing ? ' (a Shopify ainda está processando)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {data.repair ? (
                <>
                  <label style={label} htmlFor="origem">
                    Arquivos vêm de
                  </label>
                  <div>
                    <select
                      id="origem"
                      data-tema-origem
                      value={source?.id ?? ''}
                      disabled={busy || undefined}
                      onChange={(e) => pickSource(e.target.value)}
                      style={select}
                    >
                      {data.themes
                        .filter((t) => t.role === 'UNPUBLISHED')
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    <div style={hint}>
                      «{target?.name}» já está publicado: o D&amp;VFly grava nele o que falta e o que lá está mais antigo do que em «
                      {sourceName}» (uma página publicada antes da troca). Um arquivo mais novo em «{target?.name}» fica como está, e
                      os testes A | B no ar são regravados nele.
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div style={{ ...hint, marginTop: 14 }} data-resumo>
              {items.length === 0
                ? 'Nenhuma página nem teste do D&VFly usa o tema nesta loja: não há nada para levar.'
                : `${items.length} ${items.length === 1 ? 'item' : 'itens'}: ${counts.produto} ${counts.produto === 1 ? 'página de produto' : 'páginas de produto'}, ${counts.pagina} ${counts.pagina === 1 ? 'página' : 'páginas'}, ${counts.teste} ${counts.teste === 1 ? 'teste A | B no ar' : 'testes A | B no ar'}.` +
                  (data.repair || !target ? '' : ` Nada muda na loja agora: «${target.name}» não está publicado e o tema publicado não é tocado.`)}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="dv-btn dv-primary"
                data-preparar
                disabled={busy || blocked || items.length === 0 || undefined}
                onClick={() => start('preparar')}
              >
                <Icon name="layers" />
                {data.repair ? `Completar «${target?.name ?? ''}»` : `Preparar «${target?.name ?? 'tema'}»`}
              </button>
              <button
                type="button"
                className="dv-btn dv-secondary"
                data-conferir
                disabled={busy || blocked || items.length === 0 || undefined}
                onClick={() => start('conferir')}
              >
                <Icon name="check" />
                Conferir
              </button>
              {progress ? (
                <span style={muted} data-progresso>
                  {run?.phase === 'preparar' ? 'Gravando' : 'Conferindo'} {progress}…
                </span>
              ) : null}
              {blockedReason ? (
                <span style={muted} data-motivo-bloqueio>
                  {blockedReason}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        {data.checksError ? (
          <div style={{ ...bannerErr, marginTop: 14 }} data-avisos-falharam>
            Não deu para conferir os avisos de antes de publicar agora ({data.checksError}). Recarregue a página antes de publicar.
          </div>
        ) : null}

        {target && (data.foreignMissing.length > 0 || data.embedsOffInTarget.length > 0 || showPagefly) ? (
          <section style={{ ...card, marginTop: 14 }} data-confira>
            <div style={cardBody}>
              <h2 style={h2}>Antes de publicar, confira</h2>
              <ul style={list}>
                {data.foreignMissing.map((f) => (
                  <li key={`${f.resource}.${f.suffix}`} data-modelo-ausente>
                    {f.titles.slice(0, 3).join(', ')}
                    {f.titles.length > 3 ? ` e mais ${f.titles.length - 3}` : ''} {f.titles.length === 1 ? 'usa' : 'usam'} o modelo «
                    {f.suffix}», que «{target.name}» não tem: depois da troca, {f.resource === 'product' ? 'a Shopify mostra a página padrão de produto' : 'a Shopify mostra a página padrão'} no lugar.
                    {' '}Não é do D&amp;VFly, então ele não leva esse modelo.
                  </li>
                ))}
                {data.embedsOffInTarget.map((app) => (
                  <li key={app} data-embed-desligado>
                    O app <strong>{app}</strong> está ligado em «{sourceName}» e desligado em «{target.name}». Ligue em Loja virtual →
                    Temas → «{target.name}» → Personalizar → Incorporações de aplicativo
                    {data.repair ? '.' : ' antes de publicar.'}
                  </li>
                ))}
                {showPagefly ? (
                  <li data-pagefly>
                    {pageflyOn ? (
                      <>
                        O <strong>PageFly</strong> está ligado em «{target.name}» e carrega os arquivos dele em toda página, inclusive
                        nas do D&amp;VFly (nas LPs desta loja, em 07/10, eram 27).{' '}
                        {data.pageflyInUse.length > 0 ? (
                          <span data-pagefly-em-uso>
                            Atenção: {data.pageflyInUse.slice(0, 3).join(', ')}
                            {data.pageflyInUse.length > 3 ? ` e mais ${data.pageflyInUse.length - 3}` : ''} ainda{' '}
                            {data.pageflyInUse.length === 1 ? 'usa' : 'usam'} modelo do PageFly; sem o embed, essas páginas deixam de
                            funcionar.
                          </span>
                        ) : (
                          'Nenhum produto ou página da loja usa modelo do PageFly.'
                        )}{' '}
                        <button
                          type="button"
                          className="dv-btn dv-secondary"
                          data-desligar-pagefly
                          disabled={busy || embedFetcher.state !== 'idle' || undefined}
                          onClick={() => {
                            const form = new FormData();
                            form.set('intent', 'desligar-embed');
                            form.set('origem', source!.id);
                            form.set('alvo', target.id);
                            embedFetcher.submit(form, { method: 'post' });
                          }}
                          style={{ marginLeft: 6 }}
                        >
                          Desligar o PageFly em «{target.name}»
                        </button>
                      </>
                    ) : (
                      <span data-pagefly-desligado>
                        PageFly desligado em «{target.name}». Para ligar de novo: Personalizar → Incorporações de aplicativo.
                      </span>
                    )}
                  </li>
                ) : null}
              </ul>
              {embedFetcher.data && 'error' in embedFetcher.data && embedFetcher.data.error ? (
                <div style={{ ...bannerErr, marginTop: 8 }}>{embedFetcher.data.error}</div>
              ) : null}
            </div>
          </section>
        ) : null}

        {allReady ? (
          <div style={{ ...bannerOk, marginTop: 14 }} data-tudo-pronto>
            {data.repair
              ? `«${target?.name}» tem tudo o que as páginas e os testes do D&VFly precisam.`
              : `Tudo pronto em «${target?.name}». Agora publique o tema: Loja virtual → Temas → «${target?.name}» → Publicar. Depois volte aqui, escolha «${target?.name}» e clique em Completar: o que for publicado no D&VFly até lá ainda vai para o tema atual, e isso leva para o novo.`}
          </div>
        ) : failed.length > 0 && !busy ? (
          <div style={{ ...bannerErr, marginTop: 14 }} data-algo-falhou>
            {failed.length} {failed.length === 1 ? 'item não ficou pronto' : 'itens não ficaram prontos'}: veja o motivo em cada linha.
            Não publique «{target?.name}» até todos ficarem prontos.
          </div>
        ) : null}

        {items.length > 0 ? (
          <section style={{ ...card, marginTop: 14 }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Nome</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Usado por</th>
                  <th style={th}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const row = rows[item.key];
                  return (
                    <tr key={item.key} className="dv-row" data-item={item.key}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{item.label}</div>
                        {item.note ? <div style={sub}>{item.note}</div> : null}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{item.type}</td>
                      <td style={{ ...td, color: 'var(--dv-ink-2)' }}>
                        {item.usedBy.length === 0
                          ? '—'
                          : `${item.usedBy.slice(0, 2).join(', ')}${item.usedBy.length > 2 ? ` e mais ${item.usedBy.length - 2}` : ''}`}
                      </td>
                      <td style={td} data-situacao={row?.status ?? 'pendente'}>
                        {row ? (
                          <>
                            <span style={STATUS_PILL[row.status] ?? pillNeutral}>{STATUS_LABEL[row.status] ?? row.status}</span>
                            {row.detail ? <div style={{ ...sub, color: 'var(--dv-ink-2)' }}>{row.detail}</div> : null}
                            {row.notes.map((n) => (
                              <div key={n} style={sub}>
                                {n}
                              </div>
                            ))}
                          </>
                        ) : (
                          <span style={pillInfo}>{run && items[run.index]?.key === item.key ? 'Em andamento' : 'A fazer'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </div>
  );
}

const shell: React.CSSProperties = { minHeight: '100vh', background: 'var(--dv-bg)', fontFamily: FONT_STACK, fontSize: 13, lineHeight: 1.45, color: 'var(--dv-ink)' };
const wrap: React.CSSProperties = { width: '100%', padding: '20px 24px 48px', maxWidth: 1100 };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 };
const title: React.CSSProperties = { fontSize: 20, fontWeight: 600, lineHeight: '24px', margin: 0 };
const h2: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: '0 0 8px' };
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-3)', marginTop: 2 };
const hint: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-2)', marginTop: 4, maxWidth: 720 };
const card: React.CSSProperties = { background: 'var(--dv-sfc)', border: '1px solid var(--dv-edge)', borderRadius: 12, boxShadow: 'var(--dv-shadow-soft)', overflow: 'hidden' };
const cardBody: React.CSSProperties = { padding: '16px 18px' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: '10px 16px', alignItems: 'center' };
const label: React.CSSProperties = { color: 'var(--dv-ink-2)', fontSize: 12.5 };
const select: React.CSSProperties = { font: 'inherit', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--dv-edge)', background: 'var(--dv-sfc)', color: 'var(--dv-ink)', minWidth: 320 };
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--dv-ink-2)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--dv-ink-2)', padding: '8px 16px', borderBottom: '1px solid var(--dv-edge)', background: 'var(--dv-sfc-sub)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--dv-edge-soft)', verticalAlign: 'top' };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--dv-ink-3)', marginTop: 3 };
