import type { ActionFunctionArgs } from 'react-router';

import { compile, toFragment, type Doc } from '../lib/compiler.server.ts';

/**
 * The canvas side of click-to-select.
 *
 * Runs inside the preview iframe only. Clicks are captured before the page's
 * own handlers (so a link inside the canvas selects instead of navigating) and
 * reported to the editor; the editor answers with the id to highlight, which
 * also covers selection made from the tree panel.
 */
const EDITOR_BRIDGE = `
<style>
  [data-dvf-id] { cursor: default; }
  [data-dvf-id]:hover { outline: 1px dashed rgba(11,224,92,.8); outline-offset: 1px; }
  [data-dvf-selected] { outline: 2px solid #0BE05C !important; outline-offset: 2px; }
</style>
<script>
(function () {
  function apply(id) {
    document.querySelectorAll('[data-dvf-selected]').forEach(function (el) {
      el.removeAttribute('data-dvf-selected');
    });
    if (!id) return;
    var el = document.querySelector('[data-dvf-id="' + id + '"]');
    if (el) {
      el.setAttribute('data-dvf-selected', '');
      el.scrollIntoView({ block: 'nearest' });
    }
  }
  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-dvf-id]');
    event.preventDefault();
    event.stopPropagation();
    parent.postMessage({ type: 'dvf:select', id: el ? el.getAttribute('data-dvf-id') : null }, '*');
  }, true);
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'dvf:selected') apply(event.data.id);
  });
})();
</script>`;

/**
 * Compiles the document for the editor preview.
 *
 * The point is that this calls the same `compile` the publish path calls. If
 * the preview had its own renderer, the editor and the live page would drift —
 * which is the single most-cited complaint about the competitor (research 3.1).
 * The only editor-specific additions are the node id stamps and the selection
 * bridge, neither of which exists in published output.
 */
export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json()) as { doc?: Doc; html?: string };
  const doc: Doc = body.doc ?? {
    version: 1,
    root: [{ id: 'html', type: 'html', props: { html: body.html ?? '' } }],
  };

  const compiled = compile(doc, { nodeIds: true });
  return Response.json({
    fragment: toFragment(compiled) + EDITOR_BRIDGE,
    bytes: compiled.stats.bytes,
    stats: compiled.stats,
    findings: compiled.findings,
  });
}
