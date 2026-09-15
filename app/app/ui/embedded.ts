/**
 * The little the browser side needs to know about being embedded.
 *
 * App Bridge decorates `fetch` with the ID token, so data requests need
 * nothing from us. A link that opens a NEW tab (preview, export) leaves the
 * admin, where no App Bridge can mint a token — so the token goes in the URL,
 * fetched right before opening. Outside the admin (development) the link
 * simply opens.
 */
declare global {
  interface Window {
    shopify?: { idToken?: () => Promise<string> };
  }
}

export async function openWithToken(path: string): Promise<void> {
  let url = path;
  try {
    const token = await window.shopify?.idToken?.();
    if (token) url += (path.includes('?') ? '&' : '?') + 'id_token=' + encodeURIComponent(token);
  } catch {
    // Not embedded: open as is.
  }
  window.open(url, '_blank', 'noopener');
}
