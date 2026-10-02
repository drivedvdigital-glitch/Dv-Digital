import { useEffect, useRef, useState } from 'react';
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import {
  AB_MAX_VARIANTS,
  AB_MIN_VARIANTS,
  AB_STATUS_LABEL,
  addDays,
  DAY_SHAPE,
  evenWeights,
  localDay,
  percent,
} from '../lib/ab.ts';
import { entryCopySuffix } from '../../../packages/shopify/src/split.ts';
import { buildReport, goLive, pause, storeInfo, takeDown, type Report } from '../lib/ab.server.ts';
import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';
import { passHeaders } from '../lib/headers.ts';
import { storeUnusableReason } from '../lib/shopify.server.ts';
import { shopSearch } from '../ui/embedded.ts';
import { Icon } from '../ui/icons.tsx';
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

export const headers = passHeaders;

/** Variants are named by letter on screen: A, B, C… — the test's own name says why. */
const letter = (i: number) => String.fromCharCode(65 + i);

async function loadTest(request: Request, id: string) {
  const { shop } = await requireShop(request);
  const store = await db.store.findUnique({ where: { domain: shop } });
  const test = await db.abTest.findUnique({ where: { id }, include: { variants: true } });
  // A test belongs to one store; from another store's admin it does not exist.
  if (!store || !test || test.storeId !== store.id) throw new Response('Teste não encontrado nesta loja.', { status: 404 });
  return { store, test };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { store, test } = await loadTest(request, params.id ?? '');
  const info = await storeInfo(store);
  const url = new URL(request.url);
  const today = localDay(new Date(), info.timezone);
  const asked = (name: string) => {
    const value = url.searchParams.get(name) ?? '';
    return DAY_SHAPE.test(value) ? value : null;
  };
  let to = asked('ate') ?? today;
  let from = asked('de') ?? addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  // A year at most: the daily table is one row per day.
  if (from < addDays(to, -366)) from = addDays(to, -366);

  let report: Report | null = null;
  let reportError: string | null = null;
  if (test.status !== 'draft') {
    try {
      report = await buildReport(test, store, from, to);
    } catch (error) {
      reportError = error instanceof Error ? error.message : String(error);
    }
  }
  const variants = [...test.variants].sort((a, b) => a.position - b.position);
  return {
    store: { id: store.id, label: store.label, unusable: storeUnusableReason(store) },
    storeUrl: info.url,
    timezone: info.timezone,
    today,
    from,
    to,
    startedDay: test.startedAt ? localDay(test.startedAt, info.timezone) : null,
    // The template version A is shown with (`?view=`), once the test has been live.
    entryView: test.status === 'draft' ? null : (test.previousSuffix ?? entryCopySuffix(test.id)),
    test: {
      id: test.id,
      name: test.name,
      status: test.status,
      entry: test.entryProductGid ? { gid: test.entryProductGid, handle: test.entryHandle, title: test.entryTitle } : null,
      variants: variants.map((v) => ({ id: v.id, gid: v.productGid, handle: v.handle, title: v.title, weight: v.weight })),
    },
    report,
    reportError,
  };
}

type ProductRef = { gid: string; handle: string; title: string };
type VariantDraft = ProductRef & { id?: string; weight: number };
type Payload = { name: string; entry: ProductRef | null; variants: VariantDraft[] };

const GID = /^gid:\/\/shopify\/Product\/\d+$/;
const isRef = (value: unknown): value is ProductRef =>
  !!value &&
  typeof value === 'object' &&
  GID.test(String((value as ProductRef).gid)) &&
  typeof (value as ProductRef).handle === 'string' &&
  (value as ProductRef).handle.length > 0 &&
  typeof (value as ProductRef).title === 'string';

/** What the form sent, checked; the message says what to fix, in the screen's words. */
function readPayload(raw: string): Payload | string {
  let data: Payload;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'Os dados do formulário chegaram ilegíveis. Recarregue a página.';
  }
  const name = String(data.name ?? '').trim().slice(0, 80) || 'Teste sem nome';
  const entry = data.entry && isRef(data.entry) ? data.entry : null;
  const variants = Array.isArray(data.variants) ? data.variants : [];
  if (variants.length > AB_MAX_VARIANTS) return `No máximo ${AB_MAX_VARIANTS} versões por teste.`;
  for (const [i, v] of variants.entries()) {
    if (!isRef(v)) return `Versão ${letter(i)}: escolha o produto.`;
    if (!Number.isInteger(v.weight) || v.weight < 0 || v.weight > 100) return `Versão ${letter(i)}: a porcentagem vai de 0 a 100.`;
  }
  return { name, entry, variants: variants.map((v) => ({ ...v, id: typeof v.id === 'string' ? v.id : undefined })) };
}

/** What has to hold before the test can be on the store. */
function readyProblem(p: Payload): string | null {
  if (!p.entry) return 'Escolha o produto da URL de entrada (a do anúncio).';
  if (p.variants.length < AB_MIN_VARIANTS) return `Um teste precisa de pelo menos ${AB_MIN_VARIANTS} versões.`;
  const sum = p.variants.reduce((s, v) => s + v.weight, 0);
  if (sum !== 100) return `As porcentagens somam ${sum}%; precisam somar 100%.`;
  if (new Set(p.variants.map((v) => v.gid)).size !== p.variants.length) return 'Duas versões apontam para o mesmo produto.';
  return null;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { store, test } = await loadTest(request, params.id ?? '');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const back = shopSearch(new URL(request.url).search);
  const fail = (message: string) => ({ ok: false, message });

  try {
    if (intent === 'pause') {
      if (test.status !== 'live') return fail('O teste não está no ar.');
      const { restored } = await pause(test, store);
      return {
        ok: true,
        message: restored
          ? `Teste pausado. /products/${test.entryHandle} voltou a mostrar a página dele; os números ficam guardados.`
          : `Teste pausado. O produto de entrada já tinha outro modelo escolhido na Shopify e ficou como estava.`,
      };
    }

    if (intent === 'delete') {
      await takeDown(test, store);
      await db.abTest.delete({ where: { id: test.id } });
      return redirect(`/app/testes${back}`);
    }

    if (intent !== 'save' && intent !== 'live') return fail('Ação desconhecida.');
    const payload = readPayload(String(form.get('payload') ?? ''));
    if (typeof payload === 'string') return fail(payload);

    // The entry product is where the store's template was swapped. Swapping
    // the entry under a live test would leave the old one pointing at us.
    const entryChanged = (payload.entry?.gid ?? '') !== test.entryProductGid;
    if (test.status === 'live' && entryChanged) {
      return fail('Pause o teste antes de trocar o produto de entrada: é nele que o teste está instalado.');
    }
    const goingLive = intent === 'live' || test.status === 'live';
    if (goingLive) {
      const problem = readyProblem(payload);
      if (problem) return fail(problem);
    }
    // Chains (a variant that is itself the door of another test) would send
    // visitors on a second hop and count them twice.
    const others = await db.abTest.findMany({
      where: { storeId: store.id, id: { not: test.id } },
      select: { name: true, entryProductGid: true },
    });
    const clash = others.find((o) => o.entryProductGid && o.entryProductGid === payload.entry?.gid);
    if (clash) return fail(`Esse produto já é a entrada do teste "${clash.name}".`);
    const chain = others.find((o) => payload.variants.some((v) => v.gid === o.entryProductGid));
    if (chain) return fail(`Uma das versões é a entrada do teste "${chain.name}": o visitante pularia duas vezes.`);

    // Variants keep their id (and their numbers) across edits; a removed one
    // takes its numbers with it.
    const keep = payload.variants.filter((v) => v.id && test.variants.some((t) => t.id === v.id)).map((v) => v.id!);
    await db.$transaction([
      db.abVariant.deleteMany({ where: { testId: test.id, id: { notIn: keep } } }),
      db.abTest.update({
        where: { id: test.id },
        data: {
          name: payload.name,
          entryProductGid: payload.entry?.gid ?? '',
          entryHandle: payload.entry?.handle ?? '',
          entryTitle: payload.entry?.title ?? '',
        },
      }),
      ...payload.variants.map((v, position) => {
        const data = { productGid: v.gid, handle: v.handle, title: v.title, weight: v.weight, position };
        return v.id && keep.includes(v.id)
          ? db.abVariant.update({ where: { id: v.id }, data })
          : db.abVariant.create({ data: { ...data, testId: test.id } });
      }),
    ]);

    if (!goingLive) return { ok: true, message: 'Teste salvo. Nada mudou na loja.' };
    const fresh = await db.abTest.findUniqueOrThrow({ where: { id: test.id }, include: { variants: true } });
    await goLive(fresh, store, new URL(request.url).origin);
    return {
      ok: true,
      message:
        test.status === 'live'
          ? 'Mudanças aplicadas na loja: os próximos visitantes já seguem as porcentagens novas.'
          : `Teste no ar. Quem abrir /products/${fresh.entryHandle} vai para uma das versões.`,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------

type Picked = { gid: string; handle: string; title: string };

/** Product search against the store, the same one the page settings use. */
function ProductPicker({
  storeId,
  value,
  onPick,
  disabled,
  disabledReason,
  name,
}: {
  storeId: string;
  value: Picked | null;
  onPick: (p: Picked) => void;
  disabled?: boolean;
  disabledReason?: string;
  name: string;
}) {
  const [open, setOpen] = useState(!value);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; handle: string; title: string; imageUrl: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open || disabled) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/products?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (mine !== seq.current) return;
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        setResults(data.products ?? []);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query, storeId, disabled]);

  if (value && (!open || disabled)) {
    return (
      <div style={pickedRow} data-picked={name}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.title}</div>
          <div style={sub}>/products/{value.handle}</div>
        </div>
        <button
          type="button"
          className="dv-btn dv-plain"
          style={{ marginLeft: 'auto' }}
          disabled={disabled || undefined}
          title={disabled ? disabledReason : 'Escolher outro produto'}
          onClick={() => setOpen(true)}
        >
          Trocar
        </button>
        {disabled && disabledReason ? <span style={reason}>{disabledReason}</span> : null}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="dv-input"
          placeholder="Buscar produto pelo nome ou endereço"
          aria-label={`Buscar produto: ${name}`}
          data-busca={name}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {value ? (
          <button type="button" className="dv-btn dv-plain" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        ) : null}
      </div>
      <div style={resultsBox}>
        {error ? (
          <div style={{ ...reason, padding: 8, color: 'var(--dv-danger)' }}>{error}</div>
        ) : loading && results.length === 0 ? (
          <div style={{ ...reason, padding: 8 }}>Buscando…</div>
        ) : results.length === 0 ? (
          <div style={{ ...reason, padding: 8 }}>Nenhum produto ativo com esse nome.</div>
        ) : (
          results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="dv-tree-row"
              data-resultado={p.handle}
              onClick={() => {
                onPick({ gid: p.id, handle: p.handle, title: p.title });
                setOpen(false);
                setQuery('');
              }}
            >
              {p.imageUrl ? <img src={p.imageUrl} alt="" width={24} height={24} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <Icon name="tag" />}
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
              <span style={{ ...sub, marginLeft: 'auto', marginTop: 0 }}>/products/{p.handle}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function TestScreen() {
  const data = useLoaderData<typeof loader>();
  const { test, store, report } = data;
  const result = useActionData<typeof action>();
  const submit = useSubmit();
  const busy = useNavigation().state !== 'idle';
  const search = useLocation().search;
  const [uiTheme, toggleUiTheme] = useUiTheme();
  const live = test.status === 'live';

  const [name, setName] = useState(test.name);
  const [entry, setEntry] = useState<Picked | null>(test.entry);
  const [variants, setVariants] = useState<Array<VariantDraft & { key: string }>>(
    test.variants.map((v) => ({ ...v, key: v.id })),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  // After a save the loader's numbers are the truth again (ids of new variants).
  useEffect(() => {
    setName(test.name);
    setEntry(test.entry);
    setVariants(test.variants.map((v) => ({ ...v, key: v.id })));
  }, [test]);

  const sum = variants.reduce((s, v) => s + v.weight, 0);
  const complete = variants.every((v) => v.gid);
  const dirty =
    name !== test.name ||
    (entry?.gid ?? null) !== (test.entry?.gid ?? null) ||
    JSON.stringify(variants.map(({ id, gid, weight }) => [id ?? null, gid, weight])) !==
      JSON.stringify(test.variants.map(({ id, gid, weight }) => [id, gid, weight]));
  const readyReason = !entry
    ? 'Escolha o produto de entrada.'
    : variants.length < AB_MIN_VARIANTS
      ? `Adicione pelo menos ${AB_MIN_VARIANTS} versões.`
      : !complete
        ? 'Escolha o produto de cada versão.'
        : sum !== 100
          ? `As porcentagens somam ${sum}%; precisam somar 100%.`
          : new Set(variants.map((v) => v.gid)).size !== variants.length
            ? 'Duas versões apontam para o mesmo produto.'
            : null;
  const entryIsA = !!entry && variants.some((v) => v.gid === entry.gid);
  /** Picking the entry: the version that WAS the entry follows it; a fresh test starts with it as A. */
  const pickEntry = (p: Picked) => {
    setVariants((list) => {
      const old = entry ? list.find((v) => v.gid === entry.gid) : undefined;
      if (old) return list.map((v) => (v === old ? { ...v, ...p } : v));
      if (list.length === 0) return [{ key: `novo-${Date.now()}`, ...p, weight: 0 }];
      return list;
    });
    setEntry(p);
  };
  const toggleEntryIsA = (on: boolean) =>
    setVariants((list) =>
      on && entry
        ? [{ key: `novo-${Date.now()}`, ...entry, weight: 0 }, ...list.filter((v) => v.gid !== entry.gid)]
        : list.filter((v) => v.gid !== entry?.gid),
    );

  const send = (intent: string) => {
    const fd = new FormData();
    fd.set('intent', intent);
    fd.set(
      'payload',
      JSON.stringify({
        name,
        entry,
        variants: variants.map(({ id, gid, handle, title, weight }) => ({ id, gid, handle, title, weight })),
      }),
    );
    submit(fd, { method: 'post' });
  };

  const entryUrl = entry ? `${data.storeUrl}/products/${entry.handle}` : null;
  const updateVariant = (key: string, patch: Partial<VariantDraft>) =>
    setVariants((list) => list.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  const addVariant = () =>
    setVariants((list) => [...list, { key: `novo-${Date.now()}`, gid: '', handle: '', title: '', weight: 0 }]);
  const splitEvenly = () =>
    setVariants((list) => {
      const weights = evenWeights(list.length);
      return list.map((v, i) => ({ ...v, weight: weights[i] }));
    });

  const range = (from: string, to: string) => {
    const params = new URLSearchParams(shopSearch(search));
    params.set('de', from);
    params.set('ate', to);
    return `?${params.toString()}`;
  };
  const presets: Array<[string, string, string]> = [
    ['Hoje', data.today, data.today],
    ['Ontem', addDays(data.today, -1), addDays(data.today, -1)],
    ['7 dias', addDays(data.today, -6), data.today],
    ['30 dias', addDays(data.today, -29), data.today],
    ...(data.startedDay ? ([['Desde o início', data.startedDay, data.today]] as Array<[string, string, string]>) : []),
  ];
  const money = (value: number) =>
    report?.currency
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: report.currency, maximumFractionDigits: 0 })
      : value.toLocaleString('pt-BR');
  const totals = report
    ? report.rows.reduce(
        (t, r) => ({ clicks: t.clicks + r.clicks, visitors: t.visitors + r.visitors, orders: t.orders + r.orders, revenue: t.revenue + r.revenue }),
        { clicks: 0, visitors: 0, orders: 0, revenue: 0 },
      )
    : null;

  return (
    <div className="dv-ui" data-theme={uiTheme} style={shell}>
      <UiStyle />
      <div style={wrap}>
        <header style={head}>
          <Link to={`/app/testes${shopSearch(search)}`} className="dv-btn dv-plain dv-icon-btn" aria-label="Voltar aos testes" title="Voltar aos testes">
            <Icon name="back" />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1 style={title}>
              {test.name}{' '}
              <span style={live ? pillSuccess : test.status === 'paused' ? pillInfo : pillNeutral} data-status={test.status}>
                {AB_STATUS_LABEL[test.status] ?? test.status}
              </span>
            </h1>
            <div style={muted}>Teste A | B · {store.label}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-btn dv-secondary dv-icon-btn" />
            {live ? (
              <button type="button" className="dv-btn dv-secondary" disabled={busy || undefined} data-pausar onClick={() => send('pause')} title="Devolve ao produto de entrada a página que ele tinha; os números ficam">
                Pausar teste
              </button>
            ) : null}
            {live ? (
              <button
                type="button"
                className="dv-btn dv-primary"
                disabled={busy || !dirty || !!readyReason || undefined}
                title={!dirty ? 'Nada mudou desde o que está na loja' : (readyReason ?? 'Grava as porcentagens e versões novas na loja')}
                data-aplicar
                onClick={() => send('save')}
              >
                Aplicar mudanças na loja
              </button>
            ) : (
              <>
                <button type="button" className="dv-btn dv-secondary" disabled={busy || !dirty || undefined} data-salvar onClick={() => send('save')}>
                  Salvar
                </button>
                <button type="button" className="dv-btn dv-primary" disabled={busy || !!readyReason || !!store.unusable || undefined} data-no-ar onClick={() => send('live')}>
                  {test.status === 'paused' ? 'Voltar a rodar' : 'Colocar no ar'}
                </button>
              </>
            )}
          </div>
        </header>
        {!live && (readyReason || store.unusable) ? (
          <div style={{ ...reason, textAlign: 'right', marginTop: -6, marginBottom: 10 }} data-motivo>
            {store.unusable ? `Sem acesso à loja: ${store.unusable}.` : readyReason}
          </div>
        ) : live && dirty && readyReason ? (
          <div style={{ ...reason, textAlign: 'right', marginTop: -6, marginBottom: 10 }} data-motivo>
            {readyReason}
          </div>
        ) : null}

        {result ? (
          <div style={{ ...(result.ok ? bannerOk : bannerErr), marginBottom: 14 }} data-result>
            {result.message}
          </div>
        ) : null}

        <section style={card} data-config>
          <div style={cardHead}>
            <h2 style={h2}>Configuração</h2>
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 18 }}>
            <label style={field}>
              <span style={labelText}>Nome do teste</span>
              <input className="dv-input" style={{ maxWidth: 420 }} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-nome />
            </label>

            <div style={field}>
              <span style={labelText}>URL de entrada (a que vai no anúncio)</span>
              <div style={{ maxWidth: 620 }}>
                <ProductPicker
                  storeId={store.id}
                  value={entry}
                  name="entrada"
                  onPick={pickEntry}
                  disabled={live}
                  disabledReason="Pause o teste para trocar: é neste produto que ele está instalado."
                />
              </div>
              {entryUrl ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                  <code style={code} data-url-entrada>{entryUrl}</code>
                  <button
                    type="button"
                    className="dv-btn dv-secondary"
                    onClick={() => {
                      navigator.clipboard?.writeText(entryUrl).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                  >
                    <Icon name={copied ? 'check' : 'copy'} />
                    {copied ? 'Copiada' : 'Copiar URL'}
                  </button>
                  {entryIsA && data.entryView ? (
                    <a className="dv-btn dv-plain" href={`${entryUrl}?view=${data.entryView}`} target="_blank" rel="noreferrer" title="Abre a página que a versão A mostra, sem sorteio e sem contar clique">
                      <Icon name="external" />
                      Ver a versão A
                    </a>
                  ) : null}
                </div>
              ) : null}
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={entryIsA}
                  disabled={!entry || undefined}
                  data-entrada-e-a
                  onChange={(e) => toggleEntryIsA(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontWeight: 500 }}>A própria URL de entrada é a versão A</span>
                  <span style={{ ...reason, display: 'block' }}>
                    {!entry
                      ? 'Escolha o produto de entrada primeiro.'
                      : entryIsA
                        ? 'Quem cair na A fica nesta mesma URL e vê a página que este produto já tinha; os outros vão para as versões B, C…'
                        : 'Desligado: a URL só distribui, e o conteúdo dela não aparece para ninguém enquanto o teste roda.'}
                  </span>
                </span>
              </label>
              <span style={reason}>O produto de entrada precisa estar ativo na loja.</span>
            </div>

            <div style={field}>
              <span style={labelText}>
                Versões ({variants.length} de no máximo {AB_MAX_VARIANTS}) · total{' '}
                <strong style={{ color: sum === 100 ? 'var(--dv-accent-text)' : 'var(--dv-danger)' }} data-soma>
                  {sum}%
                </strong>
              </span>
              <div style={{ display: 'grid', gap: 8, maxWidth: 820 }}>
                {variants.map((v, i) => (
                  <div key={v.key} style={variantRow} data-versao={letter(i)}>
                    <span style={letterBadge}>{letter(i)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {entry && v.gid === entry.gid ? (
                        <div style={pickedRow} data-picked={`versao-${letter(i)}`}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{v.title}</div>
                            <div style={sub}>/products/{v.handle} · a própria URL de entrada, com a página que ela já tinha</div>
                          </div>
                        </div>
                      ) : (
                      <ProductPicker
                        storeId={store.id}
                        value={v.gid ? { gid: v.gid, handle: v.handle, title: v.title } : null}
                        name={`versao-${letter(i)}`}
                        onPick={(p) => updateVariant(v.key, p)}
                      />
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        className="dv-input"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 72, textAlign: 'right' }}
                        aria-label={`Porcentagem da versão ${letter(i)}`}
                        data-peso={letter(i)}
                        value={v.weight}
                        onChange={(e) => updateVariant(v.key, { weight: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                      />
                      %
                    </label>
                    <button
                      type="button"
                      className="dv-btn dv-plain"
                      data-danger
                      title={v.id ? 'Remove a versão do teste; os números dela são apagados ao salvar' : 'Remove a versão'}
                      onClick={() => setVariants((list) => list.filter((x) => x.key !== v.key))}
                    >
                      <Icon name="trash" />
                      Remover
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <button type="button" className="dv-btn dv-secondary" disabled={variants.length >= AB_MAX_VARIANTS || undefined} onClick={addVariant} data-adicionar>
                  <Icon name="plus" />
                  Adicionar versão
                </button>
                <button type="button" className="dv-btn dv-secondary" disabled={variants.length === 0 || undefined} onClick={splitEvenly} data-dividir>
                  Dividir igualmente
                </button>
                {variants.length >= AB_MAX_VARIANTS ? <span style={reason}>Limite de {AB_MAX_VARIANTS} versões.</span> : null}
              </div>
              <span style={reason}>
                Cada versão além da A é outro produto da loja (por exemplo, /products/piadebanho1). Porcentagem 0 deixa a versão no
                relatório sem mandar ninguém para ela. A mesma pessoa sempre cai na mesma versão.
              </span>
            </div>
          </div>
        </section>

        <section style={{ ...card, marginTop: 18 }} data-resultados>
          <div style={{ ...cardHead, flexWrap: 'wrap' }}>
            <h2 style={h2}>Resultados</h2>
            {test.status !== 'draft' ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                {presets.map(([label, from, to]) => (
                  <Link
                    key={label}
                    to={range(from, to)}
                    className="dv-btn dv-plain"
                    data-on={data.from === from && data.to === to ? true : undefined}
                    data-periodo={label}
                  >
                    {label}
                  </Link>
                ))}
                <Form method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }} data-calendario>
                  {[...new URLSearchParams(shopSearch(search))].map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={v} />
                  ))}
                  <input className="dv-input" type="date" name="de" defaultValue={data.from} key={`de-${data.from}`} max={data.today} aria-label="De" style={{ width: 150 }} />
                  <span style={muted}>até</span>
                  <input className="dv-input" type="date" name="ate" defaultValue={data.to} key={`ate-${data.to}`} max={data.today} aria-label="Até" style={{ width: 150 }} />
                  <button type="submit" className="dv-btn dv-secondary" data-ver-periodo>
                    Ver período
                  </button>
                </Form>
              </div>
            ) : null}
          </div>

          {test.status === 'draft' ? (
            <div style={empty}>Os números aparecem aqui depois que o teste for colocado no ar.</div>
          ) : data.reportError ? (
            <div style={{ ...bannerErr, margin: 16 }}>{data.reportError}</div>
          ) : report && totals ? (
            <div style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={muted}>
                {formatDay(report.from)} a {formatDay(report.to)} · dias contados no fuso da loja ({report.timezone})
                {data.startedDay && data.startedDay > report.from
                  ? ` · o teste começou em ${formatDay(data.startedDay)}: pedidos de antes disso não contam`
                  : ''}
              </div>
              <div style={report.verdict.confident ? bannerOk : verdictNeutral} data-veredito>
                {report.verdict.note}
              </div>
              {report.ordersNote ? (
                <div style={report.ordersOk ? verdictNeutral : bannerErr} data-pedidos-aviso>
                  {report.ordersNote}
                </div>
              ) : null}
              <div style={{ overflowX: 'auto' }}>
                <table style={table} data-tabela-resumo>
                  <thead>
                    <tr>
                      <th style={th}>Versão</th>
                      <th style={thNum}>Configurado</th>
                      <th style={thNum}>Cliques</th>
                      <th style={thNum} title="Navegadores que caíram na versão pela primeira vez">Visitantes únicos</th>
                      <th style={thNum} title="Parte dos cliques que de fato foi para esta versão">Parte real</th>
                      <th style={thNum}>Pedidos</th>
                      <th style={thNum} title="Pedidos ÷ cliques">Conversão</th>
                      <th style={thNum}>Faturamento</th>
                      <th style={thNum} title="Pedidos cancelados, fora da contagem de pedidos">Cancelados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={r.id} className="dv-row" data-linha={letter(i)}>
                        <td style={td}>
                          <span style={letterBadge}>{letter(i)}</span>{' '}
                          <a
                            className="dv-link"
                            href={`${data.storeUrl}/products/${r.handle}${r.handle === test.entry?.handle && data.entryView ? `?view=${data.entryView}` : ''}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.title}
                          </a>
                          {report.verdict.leaderId === r.id ? (
                            <span style={{ ...(report.verdict.confident ? pillSuccess : pillNeutral), marginLeft: 6 }}>
                              {report.verdict.confident ? 'vencedora' : 'na frente'}
                            </span>
                          ) : null}
                          <div style={sub}>
                            /products/{r.handle}
                            {r.handle === test.entry?.handle ? ' · a URL de entrada' : ''}
                          </div>
                        </td>
                        <td style={tdNum}>{r.weight}%</td>
                        <td style={tdNum} data-cliques>{r.clicks.toLocaleString('pt-BR')}</td>
                        <td style={tdNum}>{r.visitors.toLocaleString('pt-BR')}</td>
                        <td style={tdNum}>{percent(r.clicks, totals.clicks)}</td>
                        <td style={tdNum} data-pedidos>{r.orders.toLocaleString('pt-BR')}</td>
                        <td style={{ ...tdNum, fontWeight: 600 }} data-conversao>{percent(r.orders, r.clicks)}</td>
                        <td style={tdNum}>{money(r.revenue)}</td>
                        <td style={tdNum}>{r.cancelled}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, fontWeight: 600 }}>Total</td>
                      <td style={tdNum} />
                      <td style={{ ...tdNum, fontWeight: 600 }} data-total-cliques>{totals.clicks.toLocaleString('pt-BR')}</td>
                      <td style={tdNum}>{totals.visitors.toLocaleString('pt-BR')}</td>
                      <td style={tdNum} />
                      <td style={{ ...tdNum, fontWeight: 600 }}>{totals.orders.toLocaleString('pt-BR')}</td>
                      <td style={{ ...tdNum, fontWeight: 600 }}>{percent(totals.orders, totals.clicks)}</td>
                      <td style={tdNum}>{money(totals.revenue)}</td>
                      <td style={tdNum} />
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 style={{ ...h2, fontSize: 13.5, marginTop: 6 }}>Dia a dia (cliques · pedidos · conversão)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={table} data-tabela-dias>
                  <thead>
                    <tr>
                      <th style={th}>Dia</th>
                      {report.rows.map((r, i) => (
                        <th key={r.id} style={thNum} title={r.title}>
                          {letter(i)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.days].reverse().map((d) => (
                      <tr key={d.day} className="dv-row" data-dia={d.day}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDay(d.day)}</td>
                        {report.rows.map((r) => {
                          const cell = d.byVariant[r.id];
                          return (
                            <td key={r.id} style={tdNum}>
                              {cell.clicks || cell.orders ? (
                                <>
                                  {cell.clicks.toLocaleString('pt-BR')} · {cell.orders} ·{' '}
                                  <span style={{ color: 'var(--dv-ink-2)' }}>{percent(cell.orders, cell.clicks)}</span>
                                </>
                              ) : (
                                <span style={{ color: 'var(--dv-ink-4)' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={reason}>
                Cliques: cada visita pela URL de entrada, contada no momento do redirecionamento (robôs e o PageSpeed são
                redirecionados como todo mundo, mas não entram na conta). Pedidos: pedidos que contêm o produto da versão,
                venham de onde vierem — inclusive de quem abriu o endereço da versão direto. Pedido de teste fica de fora.
              </div>
            </div>
          ) : null}
        </section>

        <section style={{ ...card, marginTop: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Excluir teste</div>
            <div style={reason}>
              Tira o teste da loja (o produto de entrada volta a mostrar a página dele) e apaga os cliques guardados. Os pedidos
              continuam na Shopify.
            </div>
          </div>
          {confirmDelete ? (
            <>
              <button type="button" className="dv-btn dv-plain" data-danger style={{ fontWeight: 600 }} disabled={busy || undefined} data-confirmar-exclusao onClick={() => send('delete')}>
                Confirmar exclusão
              </button>
              <button type="button" className="dv-btn dv-plain" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="dv-btn dv-plain" data-danger disabled={busy || undefined} data-excluir onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" />
              Excluir teste
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

const formatDay = (day: string) => {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
};

const shell: React.CSSProperties = { minHeight: '100vh', background: 'var(--dv-bg)', fontFamily: FONT_STACK, fontSize: 13, lineHeight: 1.45, color: 'var(--dv-ink)' };
const wrap: React.CSSProperties = { width: '100%', padding: '20px 24px 48px' };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 };
const title: React.CSSProperties = { fontSize: 20, fontWeight: 600, lineHeight: '24px', margin: 0, display: 'flex', alignItems: 'center', gap: 8 };
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-3)' };
const reason: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-2)' };
const card: React.CSSProperties = { background: 'var(--dv-sfc)', border: '1px solid var(--dv-edge)', borderRadius: 12, boxShadow: 'var(--dv-shadow-soft)' };
const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--dv-edge)', minHeight: 48 };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 600, lineHeight: '20px', margin: 0 };
const field: React.CSSProperties = { display: 'grid', gap: 6 };
const labelText: React.CSSProperties = { fontSize: 13, fontWeight: 500 };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--dv-ink-3)', marginTop: 1 };
const code: React.CSSProperties = { fontSize: 12.5, background: 'var(--dv-inset2)', border: '1px solid var(--dv-edge)', borderRadius: 6, padding: '4px 8px', wordBreak: 'break-all' };
const pickedRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--dv-edge)', borderRadius: 8, padding: '6px 6px 6px 10px', background: 'var(--dv-sfc-sub)', flexWrap: 'wrap' };
const resultsBox: React.CSSProperties = { marginTop: 4, border: '1px solid var(--dv-edge)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', background: 'var(--dv-sfc)', padding: 4 };
const variantRow: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8 };
const letterBadge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'var(--dv-inset)', fontWeight: 600, fontSize: 12, flex: 'none', marginTop: 4 };
const empty: React.CSSProperties = { padding: '32px 24px', fontSize: 13.5, color: 'var(--dv-ink-2)', textAlign: 'center' };
const verdictNeutral: React.CSSProperties = { borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.45, background: 'var(--dv-warn-tint)', border: '1px solid var(--dv-warn-edge)', color: 'var(--dv-warn-text)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--dv-ink-2)', padding: '8px 12px', borderBottom: '1px solid var(--dv-edge)', background: 'var(--dv-sfc-sub)', whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--dv-edge-soft)', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
