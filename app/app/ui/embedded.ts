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

export function openWithToken(path: string): void {
  const tab = window.open('', '_blank', 'noopener');
  const go = (url: string) => {
    if (tab) tab.location.replace(url);
    else window.location.assign(url);
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
