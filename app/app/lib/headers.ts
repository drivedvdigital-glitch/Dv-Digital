import type { HeadersFunction } from 'react-router';

/**
 * Lets a route's loader, action and thrown responses set headers on what the
 * browser receives. Without a `headers` export, React Router forwards only
 * the parent's headers on data requests — and the 401 `requireShop` throws
 * would reach App Bridge without `X-Shopify-Retry-Invalid-Session-Request`,
 * so an expired token would fail the save instead of being retried.
 */
export const passHeaders: HeadersFunction = ({ parentHeaders, loaderHeaders, actionHeaders, errorHeaders }) => {
  const merged = new Headers(parentHeaders);
  for (const source of [loaderHeaders, actionHeaders, errorHeaders]) {
    source?.forEach((value, name) => merged.set(name, value));
  }
  return merged;
};
