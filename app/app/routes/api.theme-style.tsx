import type { LoaderFunctionArgs } from 'react-router';

import { requireShop } from '../lib/auth.server.ts';
import { EMPTY_THEME_STYLE, readThemeStyle, storeForThemeStyle } from '../lib/theme-style.server.ts';

/**
 * Hands the editor the store theme's own styling (see `theme-style.server.ts`).
 *
 * Two things ride on it: the inspector labels the font tokens with the real
 * font name ("fonte-do-corpo (Helvetica)"), and the canvas loads the theme's
 * stylesheets so the preview is the page inside its real frame instead of over
 * the browser's defaults.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireShop(request);
  const shop = new URL(request.url).searchParams.get('shop');
  const store = await storeForThemeStyle(shop);
  if (!store) return Response.json(EMPTY_THEME_STYLE);
  return Response.json(await readThemeStyle(store.domain));
}
