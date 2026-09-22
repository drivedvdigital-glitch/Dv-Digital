/**
 * The little the browser side needs to know about being embedded.
 *
 * App Bridge decorates `fetch` with the ID token, so data requests need
 * nothing from us. A link that opens a NEW tab (preview, export) leaves the
 * admin, where no App Bridge can mint a token — so the token goes in the URL.
 * The tab is opened synchronously, inside the click (popup blockers only
 * allow that), and pointed at the final URL once the token arrives. Outside
 * the admin (development) the link simply opens.
 */
declare global {
  interface Window {
    shopify?: { idToken?: () => Promise<string> };
  }
}

/**
 * The query an in-app link carries forward: the shop and host the admin put
 * in the first URL — never the ID token, which lives for a minute and has no
 * business in a link, a bookmark or a server log.
 */
export function shopSearch(search: string): string {
  const incoming = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const name of ['shop', 'host', 'embedded']) {
    const value = incoming.get(name);
    if (value) kept.set(name, value);
  }
  const text = kept.toString();
  return text ? `?${text}` : '';
}

/** Drops the ID token from the address bar once the page has used it. */
export function forgetUrlToken(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('id_token') && !url.searchParams.has('dv_bounced')) return;
  url.searchParams.delete('id_token');
  url.searchParams.delete('dv_bounced');
  window.history.replaceState(window.history.state, '', url);
}

export function openWithToken(path: string): void {
  // No `noopener` here: with it `window.open` returns null by design, so the
  // tab could never be pointed anywhere — it stayed `about:blank` and the
  // fallback below navigated the app's OWN frame, putting the preview inside
  // the admin (22/09). The link to the opener is cut by hand instead.
  const tab = window.open('', '_blank');
  if (tab) {
    tab.opener = null;
    try {
      tab.document.write('<p style="font:14px system-ui;padding:24px">Abrindo…</p>');
    } catch {
      // A tab we cannot write into still navigates below.
    }
  }
  const go = (url: string) => {
    if (tab && !tab.closed) tab.location.replace(url);
    // No tab (blocked): outside the admin the page opens here; inside it,
    // never — the admin's frame is the app, and the preview must not
    // replace it. One more try at a tab is all that is safe.
    else if (window.top === window) window.location.assign(url);
    else window.open(url, '_blank');
  };
  const mint = window.shopify?.idToken;
  if (!mint) {
    go(path);
    return;
  }
  mint()
    .then((token) => go(path + (path.includes('?') ? '&' : '?') + 'id_token=' + encodeURIComponent(token)))
    .catch(() => go(path));
}
