import type { ActionFunctionArgs } from 'react-router';

import { ANIMATION_CSS, compile, toFragment, type Doc } from '../lib/compiler.server.ts';

/**
 * The canvas side of the editor: click-to-select, drag-to-reorder, and the
 * floating toolbar over the selected element.
 *
 * Runs inside the preview iframe only. Clicks are captured before the page's
 * own handlers (so a link inside the canvas selects instead of navigating);
 * drags report where the node was dropped relative to which other node; the
 * toolbar's buttons report actions. The editor owns all state — the bridge
 * only reports gestures and paints what the editor tells it to.
 */
const EDITOR_BRIDGE = `
<style>
  /* The animation vocabulary again, so hover-preview works even when no block
     on the page animates yet (the compiled CSS only ships it when used). */
  ${ANIMATION_CSS}
  [data-dvf-id] { cursor: default; }
  [data-dvf-id]:hover { outline: 1px dashed rgba(11,224,92,.8); outline-offset: 1px; }
  [data-dvf-selected] { outline: 2px solid #0BE05C !important; outline-offset: 2px; }
  [data-dvf-drop="before"] { box-shadow: 0 -3px 0 0 #0BE05C !important; }
  [data-dvf-drop="after"] { box-shadow: 0 3px 0 0 #0BE05C !important; }
  #dvf-toolbar {
    position: absolute; z-index: 2147483647; display: none;
    background: #1a1a1a; color: #fff; border-radius: 8px;
    padding: 3px 4px; gap: 2px; align-items: center;
    font: 12px/1 -apple-system, system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,.3);
  }
  #dvf-toolbar span { padding: 0 6px; color: #9ef7c0; font-weight: 600; cursor: grab; }
  #dvf-toolbar button {
    background: transparent; border: 0; color: #fff; cursor: pointer;
    border-radius: 5px; width: 24px; height: 24px; font-size: 13px; line-height: 1;
  }
  #dvf-toolbar button:hover { background: #333; }
  #dvf-toolbar button[data-action="delete"]:hover { background: #7f1d1d; }
</style>
<script>
(function () {
  var selectedId = null;

  var toolbar = document.createElement('div');
  toolbar.id = 'dvf-toolbar';
  toolbar.innerHTML =
    '<span id="dvf-label" draggable="true" title="Arraste para mover"></span>' +
    '<button type="button" data-action="moveUp" title="Subir">\\u2191</button>' +
    '<button type="button" data-action="moveDown" title="Descer">\\u2193</button>' +
    '<button type="button" data-action="duplicate" title="Duplicar">\\u29c9</button>' +
    '<button type="button" data-action="delete" title="Excluir">\\u2715</button>';
  document.body.appendChild(toolbar);
  toolbar.style.display = 'none';

  toolbar.addEventListener('click', function (event) {
    var action = event.target.getAttribute && event.target.getAttribute('data-action');
    if (action && selectedId) {
      parent.postMessage({ type: 'dvf:action', action: action, id: selectedId }, '*');
    }
  });

  function positionToolbar(el) {
    var rect = el.getBoundingClientRect();
    toolbar.style.display = 'flex';
    var top = rect.top + window.scrollY - toolbar.offsetHeight - 6;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 6;
    toolbar.style.top = top + 'px';
    toolbar.style.left = Math.max(4, rect.left + window.scrollX) + 'px';
  }

  function apply(id, label) {
    selectedId = id;
    document.querySelectorAll('[data-dvf-selected]').forEach(function (el) {
      el.removeAttribute('data-dvf-selected');
    });
    var el = id && document.querySelector('[data-dvf-id="' + id + '"]');
    if (!el) { toolbar.style.display = 'none'; return; }
    el.setAttribute('data-dvf-selected', '');
    el.scrollIntoView({ block: 'nearest' });
    document.getElementById('dvf-label').textContent = label || '';
    positionToolbar(el);
  }

  document.addEventListener('click', function (event) {
    if (toolbar.contains(event.target)) return;
    var el = event.target.closest('[data-dvf-id]');
    event.preventDefault();
    event.stopPropagation();
    parent.postMessage({ type: 'dvf:select', id: el ? el.getAttribute('data-dvf-id') : null }, '*');
  }, true);

  // ---- drag to reorder ----------------------------------------------------
  // The toolbar's label is the drag handle for the selected element; every
  // block is also draggable directly. Drops land before/after the hovered
  // block by cursor height; the editor applies the actual move.
  var dragId = null;

  document.addEventListener('dragstart', function (event) {
    var el = event.target.closest && event.target.closest('[data-dvf-id]');
    if (event.target.id === 'dvf-label') { dragId = selectedId; }
    else if (el) { dragId = el.getAttribute('data-dvf-id'); }
    else return;
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', dragId); } catch (e) {}
  });

  function clearDrop() {
    document.querySelectorAll('[data-dvf-drop]').forEach(function (el) {
      el.removeAttribute('data-dvf-drop');
    });
  }

  document.addEventListener('dragover', function (event) {
    if (!dragId) return;
    var el = event.target.closest && event.target.closest('[data-dvf-id]');
    clearDrop();
    if (!el || el.getAttribute('data-dvf-id') === dragId) return;
    event.preventDefault();
    var rect = el.getBoundingClientRect();
    var pos = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    el.setAttribute('data-dvf-drop', pos);
  });

  document.addEventListener('drop', function (event) {
    if (!dragId) return;
    event.preventDefault();
    var el = event.target.closest && event.target.closest('[data-dvf-id]');
    var target = el && el.getAttribute('data-dvf-id');
    var pos = el && el.getAttribute('data-dvf-drop');
    clearDrop();
    if (target && pos && target !== dragId) {
      parent.postMessage({ type: 'dvf:move', id: dragId, targetId: target, position: pos }, '*');
    }
    dragId = null;
  });

  document.addEventListener('dragend', function () { clearDrop(); dragId = null; });

  document.querySelectorAll('[data-dvf-id]').forEach(function (el) {
    el.setAttribute('draggable', 'true');
  });

  // The iframe swallows keystrokes when the canvas has focus, so every editor
  // shortcut is forwarded out instead of silently dying here. The editor owns
  // what each key means; the bridge only reports.
  document.addEventListener('keydown', function (event) {
    var send = function (name) {
      event.preventDefault();
      parent.postMessage({ type: 'dvf:key', key: name }, '*');
    };
    var key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey)) {
      if (event.key === 'Delete' || event.key === 'Backspace') send('delete');
      return;
    }
    if (key === 'z' && !event.shiftKey) send('undo');
    else if ((key === 'z' && event.shiftKey) || key === 'y') send('redo');
    else if (key === 's') send(event.shiftKey ? 'publish' : 'save');
    else if (key === 'd') send('duplicate');
    else if (key === 'c') parent.postMessage({ type: 'dvf:key', key: 'copyStyle' }, '*');
    else if (key === 'v') parent.postMessage({ type: 'dvf:key', key: 'pasteStyle' }, '*');
  });

  // ---- entrance animations, editor behavior -------------------------------
  // In the canvas they arrive settled (recompiling on every keystroke must not
  // replay them); hovering an option in the inspector replays one on demand.
  document.querySelectorAll('[data-dvf-anim]').forEach(function (el) {
    el.classList.add('dvf-anim', 'dvf-in');
  });

  var animEl = null;
  var animOrig = null;
  function animPreview(id, name) {
    var el = id && document.querySelector('[data-dvf-id="' + id + '"]');
    if (name && el) {
      if (animEl && animEl !== el) animPreview(null, '');
      if (animEl !== el) {
        animOrig = el.getAttribute('data-dvf-anim');
        animEl = el;
      }
      el.setAttribute('data-dvf-anim', name);
      el.classList.add('dvf-anim');
      el.classList.remove('dvf-in');
      void el.offsetWidth; // reflow: the pre-state must paint before the reveal
      el.classList.add('dvf-in');
    } else if (animEl) {
      if (animOrig === null) {
        animEl.removeAttribute('data-dvf-anim');
        animEl.classList.remove('dvf-anim');
      } else {
        animEl.setAttribute('data-dvf-anim', animOrig);
      }
      animEl.classList.add('dvf-in');
      animEl = null;
      animOrig = null;
    }
  }

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'dvf:selected') apply(event.data.id, event.data.label);
    if (event.data && event.data.type === 'dvf:animPreview') animPreview(event.data.id, event.data.name);
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
