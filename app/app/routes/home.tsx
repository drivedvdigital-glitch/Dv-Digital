import { redirect, type LoaderFunctionArgs } from 'react-router';

/**
 * Shopify opens the app at its App URL with `?shop=` and `?host=`. Forward
 * those along, because every screen needs to know which store it is inside.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
}
