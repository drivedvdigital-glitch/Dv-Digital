import { Link, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { AB_LONG_TEST_DAYS, AB_STATUS_LABEL, localDateTime } from '../lib/ab.ts';
import { checkClickGoal, flushHits, liveDaysOf, startDueTests, storeInfo } from '../lib/ab.server.ts';
import { requireShop } from '../lib/auth.server.ts';
import { db } from '../lib/db.server.ts';
import { passHeaders } from '../lib/headers.ts';
import { shopSearch } from '../ui/embedded.ts';
import { Icon } from '../ui/icons.tsx';
import { LocalDateTime } from '../ui/local-time.tsx';
import { FONT_STACK, pillInfo, pillNeutral, pillSuccess, pillWarn, ThemeToggle, UiStyle, useUiTheme } from '../ui/theme.tsx';

export const headers = passHeaders;

/**
 * "Teste A | B": the tests of the store the admin was opened from. A test
 * belongs to ONE store — its URL, its products and its orders are that
 * store's — so there is no "all stores" view here, unlike the pages list.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const store = await db.store.findUnique({ where: { domain: shop } });
  if (!store) return { store: null, tests: [] };
  await flushHits();
  await startDueTests();
  // A goal reached while nobody was looking is acted on before the list says "no ar".
  const withGoal = await db.abTest.findMany({ where: { storeId: store.id, status: 'live', clickGoal: { not: null } }, select: { id: true } });
  for (const t of withGoal) await checkClickGoal(t.id);
  const tests = await db.abTest.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    include: { variants: { select: { id: true } } },
  });
  const { timezone } = await storeInfo(store);
  const clicks = await db.abStat.groupBy({
    by: ['testId'],
    where: { testId: { in: tests.map((t) => t.id) } },
    _sum: { clicks: true },
  });
  return {
    store: { label: store.label, domain: store.domain },
    tests: tests.map((t) => ({
      id: t.id,
      name: t.name,
      entryHandle: t.entryHandle,
      status: t.status,
      variants: t.variants.length,
      startedAt: t.startedAt?.toISOString() ?? null,
      // Days live, pauses left out, by the server's clock (the page renders the same on both sides).
      liveDays: t.status === 'live' ? liveDaysOf(t) : null,
      clicks: clicks.find((c) => c.testId === t.id)?._sum.clicks ?? 0,
      clickGoal: t.clickGoal,
      goalReached: t.status === 'paused' && !!t.goalReachedAt,
      // On the store's clock, like the screen that set it.
      startAt: t.startAt && t.status !== 'live' ? localDateTime(t.startAt, timezone) : null,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const store = await db.store.findUnique({ where: { domain: shop } });
  if (!store) throw new Response('Loja não instalada.', { status: 404 });
  const test = await db.abTest.create({
    data: { storeId: store.id, name: 'Novo teste', entryProductGid: '', entryHandle: '', entryTitle: '' },
  });
  return redirect(`/app/testes/${test.id}${shopSearch(new URL(request.url).search)}`);
}

export default function TestsList() {
  const { store, tests } = useLoaderData<typeof loader>();
  const search = useLocation().search;
  const submit = useSubmit();
  const busy = useNavigation().state !== 'idle';
  const [uiTheme, toggleUiTheme] = useUiTheme();
  const live = tests.filter((t) => t.status === 'live').length;

  return (
    <div className="dv-ui" data-theme={uiTheme} style={shell}>
      <UiStyle />
      <div style={wrap}>
        <header style={head}>
          <div>
            <h1 style={title}>Teste A | B</h1>
            <div style={muted} data-count>
              {tests.length} {tests.length === 1 ? 'teste' : 'testes'}
              {store ? ` de ${store.label}` : ''} · {live} no ar
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-btn dv-secondary dv-icon-btn" />
            <Link to={`/app${shopSearch(search)}`} className="dv-btn dv-secondary">
              Páginas
            </Link>
            <button
              type="button"
              className="dv-btn dv-primary"
              disabled={busy || !store}
              data-criar-teste
              onClick={() => submit(new FormData(), { method: 'post' })}
            >
              <Icon name="plus" />
              Criar teste
            </button>
          </div>
        </header>

        <p style={{ ...muted, margin: '0 0 14px', maxWidth: 760, fontSize: 13 }}>
          Uma URL de produto que você coloca no anúncio e que divide os visitantes entre várias versões da página, pela
          porcentagem que você escolher. Cada versão é outro produto da loja, e o relatório mostra cliques e pedidos de cada
          uma, dia a dia.
        </p>

        <div style={card}>
          {tests.length === 0 ? (
            <div style={empty}>
              <span style={emptyIcon}>
                <Icon name="layers" size={20} />
              </span>
              <div style={{ fontWeight: 600, color: 'var(--dv-ink)' }}>Nenhum teste ainda</div>
              <div>
                Clique em <strong>Criar teste</strong> e escolha o produto da URL do anúncio e as versões.
              </div>
            </div>
          ) : (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Teste</th>
                  <th style={th}>Situação</th>
                  <th style={th}>Versões</th>
                  <th style={th}>Cliques (total)</th>
                  <th style={th}>No ar desde</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="dv-row" data-teste={t.id}>
                    <td style={td}>
                      <Link to={`/app/testes/${t.id}${shopSearch(search)}`} style={link}>
                        {t.name}
                      </Link>
                      <div style={sub}>{t.entryHandle ? `/products/${t.entryHandle}` : 'produto de entrada não escolhido'}</div>
                    </td>
                    <td style={td}>
                      <span style={t.status === 'live' ? pillSuccess : pillNeutral}>{AB_STATUS_LABEL[t.status] ?? t.status}</span>
                      {t.liveDays !== null && t.liveDays >= AB_LONG_TEST_DAYS ? (
                        <div style={{ marginTop: 4 }}>
                          <span style={pillWarn} data-teste-longo title="O Google pede que um teste não fique rodando indefinidamente">
                            {t.liveDays} dias no ar: decida a vencedora
                          </span>
                        </div>
                      ) : null}
                      {t.startAt ? (
                        <div style={{ marginTop: 4 }}>
                          <span style={pillInfo} data-programado-lista>
                            Programado · {t.startAt.slice(8, 10)}/{t.startAt.slice(5, 7)} às {t.startAt.slice(11, 16)}
                          </span>
                        </div>
                      ) : null}
                      {t.goalReached ? (
                        <div style={{ marginTop: 4 }}>
                          <span style={pillNeutral} data-parou-na-meta>
                            Parou na meta de {(t.clickGoal ?? 0).toLocaleString('pt-BR')} cliques
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td style={td}>{t.variants}</td>
                    <td style={td} data-cliques-lista>
                      {t.clicks.toLocaleString('pt-BR')}
                      {t.clickGoal !== null && !t.goalReached && t.status !== 'ended' ? (
                        <span style={{ color: 'var(--dv-ink-3)' }}> de {t.clickGoal.toLocaleString('pt-BR')}</span>
                      ) : null}
                    </td>
                    <td style={{ ...td, color: 'var(--dv-ink-2)', whiteSpace: 'nowrap' }}>
                      {t.startedAt ? <LocalDateTime iso={t.startedAt} /> : '—'}
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

const shell: React.CSSProperties = { minHeight: '100vh', background: 'var(--dv-bg)', fontFamily: FONT_STACK, fontSize: 13, lineHeight: 1.45, color: 'var(--dv-ink)' };
const wrap: React.CSSProperties = { width: '100%', padding: '20px 24px 48px' };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 };
const title: React.CSSProperties = { fontSize: 20, fontWeight: 600, lineHeight: '24px', margin: 0 };
const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-3)', marginTop: 2 };
const card: React.CSSProperties = { background: 'var(--dv-sfc)', border: '1px solid var(--dv-edge)', borderRadius: 12, boxShadow: 'var(--dv-shadow-soft)', overflow: 'hidden' };
const empty: React.CSSProperties = { padding: '40px 24px', fontSize: 13.5, color: 'var(--dv-ink-2)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 };
const emptyIcon: React.CSSProperties = { width: 40, height: 40, borderRadius: 10, background: 'var(--dv-inset2)', border: '1px solid var(--dv-edge)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dv-ink-2)', marginBottom: 6 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--dv-ink-2)', padding: '8px 16px', borderBottom: '1px solid var(--dv-edge)', background: 'var(--dv-sfc-sub)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--dv-edge-soft)', verticalAlign: 'middle' };
const link: React.CSSProperties = { color: 'var(--dv-ink)', textDecoration: 'none', fontWeight: 600 };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--dv-ink-3)', marginTop: 1 };
