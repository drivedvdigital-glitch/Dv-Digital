import { data, redirect, useActionData, useLoaderData, useLocation, useNavigation } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { limiter, lockEnabled, storeUnlocked, unlockStore, waitLabel } from '../lib/access.server.ts';
import { keyMatches } from '../lib/access.ts';
import { requireShop } from '../lib/auth.server.ts';
import { config } from '../lib/config.server.ts';
import { passHeaders } from '../lib/headers.ts';
import { SHOP_DOMAIN } from '../lib/shopify.server.ts';
import { bannerErr, FONT_STACK, ThemeToggle, UiStyle, useUiTheme } from '../ui/theme.tsx';

/**
 * The lock screen: where a store that installed the app but was never let in
 * ends up.
 *
 * It is a screen of ours, not a 403: a 403 tells whoever installed the app
 * that it is broken, and tells us nothing. This says what is happening (the
 * app is private), what to do (type the key), and — for the person who has no
 * business being here — nothing else at all: no store list, no page count, no
 * hint of what the key looks like.
 */

/** Only a destination inside this app; `//outro-site` and friends fall back. */
function safeTarget(raw: string | null, origin: string): string {
  try {
    const parsed = new URL(raw ?? '/app', origin);
    if (parsed.origin !== origin) return '/app';
    if (parsed.pathname === '/liberar' || parsed.pathname === '/bounce') return '/app';
    return parsed.pathname + parsed.search;
  } catch {
    return '/app';
  }
}

function frameAncestors(shop: string): string {
  const origins = ['https://admin.shopify.com'];
  if (SHOP_DOMAIN.test(shop)) origins.push(`https://${shop}`);
  return `frame-ancestors ${origins.join(' ')};`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const who = await requireShop(request);
  const url = new URL(request.url);
  const to = safeTarget(url.searchParams.get('to'), url.origin);

  // Nothing to ask: either there is no lock, or this store is already through
  // it. Sending them on beats showing a form that would do nothing.
  if (!lockEnabled() || (await storeUnlocked(who.shop))) throw redirect(to);

  return data(
    { shop: who.shop, to },
    { headers: { 'Content-Security-Policy': frameAncestors(who.shop) } },
  );
}

export const headers = passHeaders;

export async function action({ request }: ActionFunctionArgs) {
  const who = await requireShop(request);
  const url = new URL(request.url);
  const form = await request.formData();
  const to = safeTarget(String(form.get('to') ?? ''), url.origin);

  if (!config.accessKey) throw redirect(to);

  const waiting = limiter.blockedFor(who.shop);
  if (waiting > 0) {
    return { ok: false, message: `Muitas tentativas. Tente de novo em ${waitLabel(waiting)}.` };
  }

  const typed = String(form.get('senha') ?? '');
  if (!keyMatches(typed, config.accessKey)) {
    const blocked = limiter.fail(who.shop);
    if (blocked > 0) {
      return { ok: false, message: `Senha incorreta. Muitas tentativas — espere ${waitLabel(blocked)}.` };
    }
    const left = limiter.triesLeft(who.shop);
    return {
      ok: false,
      message: `Senha incorreta. ${left} ${left === 1 ? 'tentativa restante' : 'tentativas restantes'} antes de uma pausa.`,
    };
  }

  limiter.clear(who.shop);
  await unlockStore(who.shop);

  // The way back carries the token too, for the same reason the way in does:
  // the screen after this one is a document request, and without a token it
  // would go through the bounce — which asks App Bridge, which is exactly what
  // may be broken in the browser that ended up here. With the token, the store
  // lands on the app itself.
  const back = new URL(to, url.origin);
  const carried = url.searchParams.get('id_token');
  if (carried) back.searchParams.set('id_token', carried);
  throw redirect(back.pathname + back.search);
}

export default function Liberar() {
  const { shop, to } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const location = useLocation();
  const busy = useNavigation().state !== 'idle';
  const [uiTheme, toggleUiTheme] = useUiTheme();

  return (
    <div className="dv-ui" data-theme={uiTheme} style={shell}>
      <UiStyle />
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-btn dv-secondary dv-icon-btn" />
      </div>
      <div style={card}>
        <h1 style={title}>Este app é privado</h1>
        <p style={text}>
          O D&amp;VFly não é aberto a qualquer loja. Para usar nesta loja
          {' '}<strong style={{ fontWeight: 600 }}>{shop}</strong>, digite a senha de acesso.
        </p>
        <p style={{ ...text, color: 'var(--dv-ink-3)' }}>
          É uma vez só: a partir daí esta loja fica liberada e ninguém pede a senha de novo.
        </p>

        {result && !result.ok ? (
          <div style={{ ...bannerErr, marginBottom: 12 }} data-result>
            {result.message}
          </div>
        ) : null}

        {/*
          A real form, posting to THIS url — query string and all.

          Every other screen of the app submits through `useSubmit`, which App
          Bridge decorates with the ID token. This one must not: it is the screen
          a store sees when something is already unusual, and in a real store the
          unusual thing WAS App Bridge (a browser shield was eating
          cdn.shopify.com). Without it the page never hydrated, the controlled
          input never updated React state, and the button stayed disabled — a
          lock with no key hole. A plain form submits with the browser alone, and
          the token the gate put in this url rides along with the post.
        */}
        <form method="post" action={location.pathname + location.search}>
          <input type="hidden" name="to" value={to} />
          <label htmlFor="senha" style={label}>
            Senha de acesso
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            className="dv-input"
            autoComplete="off"
            autoFocus
            required
            style={{ width: '100%', marginBottom: 14 }}
          />

          <button
            type="submit"
            className="dv-btn dv-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={busy || undefined}
          >
            {busy ? 'Conferindo…' : 'Liberar esta loja'}
          </button>
        </form>

        <p style={{ ...text, color: 'var(--dv-ink-3)', marginTop: 16, marginBottom: 0 }}>
          Não tem a senha? Ela é de quem administra o D&amp;VFly. Sem ela, nada nesta loja é
          publicado por aqui.
        </p>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  background: 'var(--dv-bg)',
  fontFamily: FONT_STACK,
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--dv-ink)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 12,
  boxShadow: 'var(--dv-shadow-soft)',
  padding: 24,
};

const title: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '24px',
  margin: '0 0 10px',
};

const text: React.CSSProperties = {
  fontSize: 13,
  margin: '0 0 12px',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 500,
  marginBottom: 6,
};
