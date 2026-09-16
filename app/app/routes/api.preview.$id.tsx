import type { ActionFunctionArgs } from 'react-router';

import { requireShop } from '../lib/auth.server.ts';
import { ANIMATION_CSS, compile, TEMPLATE_LIMIT_BYTES, toFragment, type Doc } from '../lib/compiler.server.ts';

/** A block document is far smaller than its output; 8× the output ceiling is generous. */
const PREVIEW_INPUT_LIMIT = TEMPLATE_LIMIT_BYTES * 8;

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
  [data-dvf-chrome] {
    background: repeating-linear-gradient(-45deg, #f4f4f4, #f4f4f4 10px, #ededed 10px, #ededed 20px);
    color: #8a8a8a; text-align: center; font: 12.5px/1.5 -apple-system, system-ui, sans-serif;
    padding: 22px 16px; cursor: pointer; user-select: none;
  }
  [data-dvf-chrome]:hover { color: #5c5c5c; }
  [data-dvf-chrome="product"] { padding: 40px 16px; }
  [data-dvf-empty] {
    display: flex; flex-direction: column; gap: 6px; align-items: center;
    padding: 72px 24px; text-align: center; color: #616161;
    font: 13.5px/1.6 -apple-system, system-ui, sans-serif;
  }
  [data-dvf-empty] strong { font-size: 16px; color: #303030; }
  [data-dvf-id]:hover { outline: 1px dashed rgba(10,143,74,.7); outline-offset: 1px; }
  [data-dvf-selected] { outline: 2px solid #0a8f4a !important; outline-offset: 2px; }
  [data-dvf-drop="before"] { box-shadow: 0 -3px 0 0 #0a8f4a !important; }
  [data-dvf-drop="after"] { box-shadow: 0 3px 0 0 #0a8f4a !important; }
  #dvf-toolbar {
    position: absolute; z-index: 2147483647; display: none;
    background: #202320; color: #fff; border-radius: 8px;
    padding: 3px 4px; gap: 2px; align-items: center;
    font: 12px/1 Inter, -apple-system, system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,.28);
  }
  #dvf-toolbar span { padding: 0 8px 0 4px; color: #fff; font-weight: 600; cursor: grab; display: inline-flex; align-items: center; gap: 4px; }
  #dvf-toolbar span svg { color: #8a8a8a; }
  #dvf-toolbar button {
    background: transparent; border: 0; color: #e8e8e8; cursor: pointer;
    border-radius: 5px; width: 26px; height: 24px; display: inline-flex; align-items: center; justify-content: center; padding: 0;
  }
  #dvf-toolbar button:hover { background: #3a3a3a; }
  #dvf-toolbar button[data-action="delete"]:hover { background: #8e1f0b; }
  #dvf-toolbar svg { pointer-events: none; }
</style>
<script>
(function () {
  var selectedId = null;

  var toolbar = document.createElement('div');
  toolbar.id = 'dvf-toolbar';
  // The same stroked icons the editor draws, so the canvas toolbar reads as
  // part of the same tool.
  var svg = function (body) {
    return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  var grip = '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="3.5" r="1.1"/><circle cx="10.5" cy="3.5" r="1.1"/><circle cx="5.5" cy="8" r="1.1"/><circle cx="10.5" cy="8" r="1.1"/><circle cx="5.5" cy="12.5" r="1.1"/><circle cx="10.5" cy="12.5" r="1.1"/></g>';
  toolbar.innerHTML =
    '<span id="dvf-label" draggable="true" title="Arraste pelo nome para mover o bloco">' + svg(grip) + '<b></b></span>' +
    '<button type="button" data-action="moveUp" title="Subir uma posi\\u00e7\\u00e3o">' + svg('<path d="M8 13V3M4 7l4-4 4 4"/>') + '</button>' +
    '<button type="button" data-action="moveDown" title="Descer uma posi\\u00e7\\u00e3o">' + svg('<path d="M8 3v10M4 9l4 4 4-4"/>') + '</button>' +
    '<button type="button" data-action="duplicate" title="Duplicar (Ctrl+D)">' + svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>') + '</button>' +
    '<button type="button" data-action="delete" title="Excluir (Delete) \\u2014 Ctrl+Z desfaz">' + svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>') + '</button>';
  document.body.appendChild(toolbar);
  toolbar.style.display = 'none';

  toolbar.addEventListener('click', function (event) {
    var btn = event.target.closest && event.target.closest('button[data-action]');
    var action = btn && btn.getAttribute('data-action');
    if (action && selectedId) {
      parent.postMessage({ type: 'dvf:action', action: action, id: selectedId }, '*');
    }
  });

  function positionToolbar(el) {
    var rect = el.getBoundingClientRect();
    // A block hidden at this width has no box; a toolbar for it would float
    // in the corner over nothing.
    if (rect.width === 0 && rect.height === 0) { toolbar.style.display = 'none'; return; }
    toolbar.style.display = 'flex';
    var top = rect.top + window.scrollY - toolbar.offsetHeight - 6;
    // A tab panel's toolbar would sit exactly over the tab buttons — go below.
    if (el.hasAttribute('data-dvf-tab-panel')) top = rect.bottom + window.scrollY + 6;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 6;
    toolbar.style.top = top + 'px';
    toolbar.style.left = Math.max(4, rect.left + window.scrollX) + 'px';
  }

  function apply(id, label, ids) {
    selectedId = id;
    document.querySelectorAll('[data-dvf-selected]').forEach(function (el) {
      el.removeAttribute('data-dvf-selected');
    });
    // Every selected block gets the outline; the toolbar follows the primary.
    (ids && ids.length ? ids : id ? [id] : []).forEach(function (each) {
      var mark = document.querySelector('[data-dvf-id="' + each + '"]');
      if (mark) mark.setAttribute('data-dvf-selected', '');
    });
    var el = id && document.querySelector('[data-dvf-id="' + id + '"]');
    if (!el) { toolbar.style.display = 'none'; return; }
    // Selecting something inside a closed tab opens that tab first.
    var panel = el.closest('[data-dvf-tab-panel]');
    if (panel && panel.hasAttribute('hidden')) {
      var rootT = panel.closest('[data-dvf-tabs]');
      if (rootT) {
        var idx = [].indexOf.call(rootT.querySelectorAll('[data-dvf-tab-panel]'), panel);
        var btn = rootT.querySelectorAll('[data-dvf-tab-btn]')[idx];
        if (btn) activateTab(btn);
      }
    }
    el.scrollIntoView({ block: 'nearest' });
    document.querySelector('#dvf-label b').textContent = label || '';
    positionToolbar(el);
  }

  // Right-click on a block: the editor draws a menu with every action, at the
  // pointer. Coordinates are the iframe's; the editor adds its own offset.
  document.addEventListener('contextmenu', function (event) {
    if (event.target.isContentEditable) return;
    var el = event.target.closest('[data-dvf-id]');
    if (!el) return;
    event.preventDefault();
    parent.postMessage({
      type: 'dvf:context',
      id: el.getAttribute('data-dvf-id'),
      x: event.clientX,
      y: event.clientY,
    }, '*');
  });

  document.addEventListener('click', function (event) {
    if (toolbar.contains(event.target)) return;
    // The theme chrome placeholders are not page content: clicking one opens
    // the page settings, where their visibility actually lives.
    if (event.target.closest('[data-dvf-chrome]')) {
      event.preventDefault();
      event.stopPropagation();
      parent.postMessage({ type: 'dvf:chrome' }, '*');
      return;
    }
    // A tab button switches the tab locally AND selects the tab's node —
    // the runtime's own listener never fires here (we capture first).
    var tabBtn = event.target.closest('[data-dvf-tab-btn]');
    if (tabBtn && !tabBtn.isContentEditable) {
      event.preventDefault();
      event.stopPropagation();
      activateTab(tabBtn);
      var forId = tabBtn.getAttribute('data-dvf-tab-for');
      if (forId) {
        parent.postMessage({ type: 'dvf:select', id: forId, additive: event.ctrlKey || event.metaKey }, '*');
      }
      return;
    }
    if (event.target.isContentEditable) return;
    var el = event.target.closest('[data-dvf-id]');
    event.preventDefault();
    event.stopPropagation();
    parent.postMessage({
      type: 'dvf:select',
      id: el ? el.getAttribute('data-dvf-id') : null,
      additive: event.ctrlKey || event.metaKey,
    }, '*');
  }, true);

  function activateTab(btn) {
    var root = btn.closest('[data-dvf-tabs]');
    if (!root) return;
    var btns = [].slice.call(root.querySelectorAll('[data-dvf-tab-btn]'));
    var panels = root.querySelectorAll('[data-dvf-tab-panel]');
    var index = btns.indexOf(btn);
    btns.forEach(function (b, j) { b.setAttribute('aria-selected', j === index ? 'true' : 'false'); });
    panels.forEach(function (p, j) {
      if (j === index) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
  }

  // Double-click renames the tab right on the canvas — Enter confirms,
  // Escape cancels. (The reference makes you dig into the panel for this.)
  document.addEventListener('dblclick', function (event) {
    var btn = event.target.closest('[data-dvf-tab-btn]');
    if (!btn || !btn.getAttribute('data-dvf-tab-for')) return;
    event.preventDefault();
    event.stopPropagation();
    var original = btn.textContent;
    btn.setAttribute('contenteditable', 'true');
    btn.focus();
    var range = document.createRange();
    range.selectNodeContents(btn);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    function finish(commit) {
      btn.removeAttribute('contenteditable');
      btn.removeEventListener('blur', onBlur);
      btn.removeEventListener('keydown', onKey);
      if (commit) {
        parent.postMessage({
          type: 'dvf:tabRename',
          id: btn.getAttribute('data-dvf-tab-for'),
          title: btn.textContent.trim(),
        }, '*');
      } else {
        btn.textContent = original;
      }
    }
    function onBlur() { finish(true); }
    function onKey(e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); btn.blur(); }
      if (e.key === 'Escape') { finish(false); }
    }
    btn.addEventListener('blur', onBlur);
    btn.addEventListener('keydown', onKey);
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
    // Typing inside an inline rename must never trigger editor shortcuts.
    if (event.target.isContentEditable) return;
    var send = function (name) {
      event.preventDefault();
      parent.postMessage({ type: 'dvf:key', key: name }, '*');
    };
    var key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey)) {
      if (event.key === 'Delete' || event.key === 'Backspace') send('delete');
      // Escape closes whatever the editor has open (the right-click menu).
      else if (event.key === 'Escape') parent.postMessage({ type: 'dvf:key', key: 'escape' }, '*');
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
    // Only the editor that owns this frame.
    if (event.source !== window.parent) return;
    if (event.data && event.data.type === 'dvf:selected') apply(event.data.id, event.data.label, event.data.ids);
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
  await requireShop(request);
  // A document several times the size of anything publishable is not a
  // preview request; the parser must not be handed unbounded input.
  const raw = await request.text();
  if (raw.length > PREVIEW_INPUT_LIMIT) {
    return Response.json({ error: 'Documento grande demais para pré-visualizar.' }, { status: 413 });
  }
  let body: { doc?: Doc; html?: string; chrome?: boolean; productSections?: 'above' | 'below' | null };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'JSON ilegível.' }, { status: 400 });
  }
  const doc: Doc = body.doc ?? {
    version: 1,
    root: [{ id: 'html', type: 'html', props: { html: body.html ?? '' } }],
  };

  const compiled = compile(doc, { nodeIds: true, editorHints: true });

  // Editor-only framing, never part of the compiled page: the theme's header
  // and footer as gray placeholders (so the page is seen inside its real
  // frame, and the boundary between builder and theme is visible), and an
  // instructive empty state instead of a blank void.
  const header = body.chrome !== false
    ? `<div data-dvf-chrome="header" title="Abrir Configurações da página">Cabeçalho do tema — aparece aqui quando publicada. Visibilidade em <u>Configurações da página</u>.</div>`
    : '';
  const footer = body.chrome !== false
    ? `<div data-dvf-chrome="footer" title="Abrir Configurações da página">Rodapé do tema</div>`
    : '';
  const empty = doc.root.length === 0
    ? `<div data-dvf-empty>
         <strong>Esta página está vazia</strong>
         <span>Escolha um bloco no painel <b>Adicionar</b>, à esquerda, para começar a montar.</span>
       </div>`
    : '';

  // A product page renders inside the product's own template: the theme's
  // product sections (media, price, variants, buy) are drawn as a placeholder
  // on the side the settings put them.
  const productSections = body.productSections
    ? `<div data-dvf-chrome="product" title="Abrir Configurações da página">Seções de produto do tema — imagens, preço, variantes e comprar. Posição em <u>Configurações da página</u>.</div>`
    : '';
  const content = toFragment(compiled) + empty;
  const middle =
    body.productSections === 'above'
      ? productSections + content
      : body.productSections === 'below'
        ? content + productSections
        : content;

  return Response.json({
    fragment: header + middle + footer + EDITOR_BRIDGE,
    bytes: compiled.stats.bytes,
    stats: compiled.stats,
    findings: compiled.findings,
  });
}
