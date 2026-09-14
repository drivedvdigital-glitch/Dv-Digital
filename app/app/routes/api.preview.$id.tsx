import type { ActionFunctionArgs } from 'react-router';

import { compile, toFragment } from '../lib/compiler.server.ts';

/**
 * Compiles markup for the editor preview.
 *
 * The point is that this calls the same `compile` the publish path calls. If
 * the preview had its own renderer, the editor and the live page would drift —
 * which is the single most-cited complaint about the competitor (research 3.1).
 */
export async function action({ request }: ActionFunctionArgs) {
  const { html } = (await request.json()) as { html: string };
  const compiled = compile({
    version: 1,
    root: [{ id: 'html', type: 'html', props: { html } }],
  });
  return Response.json({
    fragment: toFragment(compiled),
    bytes: compiled.stats.bytes,
  });
}
