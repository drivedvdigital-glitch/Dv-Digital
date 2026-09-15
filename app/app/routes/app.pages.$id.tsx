import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useActionData, useLoaderData, useLocation, useNavigation, useSubmit } from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import { PAGE_BODY_LIMIT_BYTES, SOLO_SUFFIX, TEMPLATE_LIMIT_BYTES } from '../lib/shared.ts';
import { db } from '../lib/db.server.ts';
import {
  BLOCK_LABELS,
  CONTAINER_TYPES,
  duplicateNode,
  effectiveStyle,
  findNode,
  insertNode,
  moveNode,
  newBlock,
  pathTo,
  relocateNode,
  removeNode,
  setNodeStyle,
  toggleHidden,
  updateProps,
  updateStyle,
  type DocNode,
  type DocTree,
} from '../lib/doc-ops.ts';
import {
  clientFor,
  clientForStore,
  deployPage,
  ProductionNotAllowedError,
  toStore,
  updatePage,
} from '../lib/shopify.server.ts';
import {
  bannerErr,
  bannerOk,
  pillDanger,
  pillNeutral,
  pillSuccess,
  ThemeToggle,
  UiStyle,
  useUiTheme,
} from '../ui/theme.tsx';

export async function loader({ params }: LoaderFunctionArgs) {
  const page = await db.page.findUniqueOrThrow({
    where: { id: params.id },
    include: { deployments: { include: { store: true } } },
  });
  const stores = await db.store.findMany({ orderBy: { isProduction: 'asc' } });
  const doc = JSON.parse(page.doc) as Doc;
  const compiled = compile(doc);

  return {
    page: {
      id: page.id,
      title: page.title,
      handle: page.handle,
      pageType: page.pageType,
      showChrome: page.showChrome,
    },
    doc: doc as unknown as DocTree,
    stores,
    deployedStoreIds: page.deployments.map((d) => d.storeId),
    liveUrls: page.deployments
      .filter((d) => d.isPublished)
      .map((d) => `https://${d.store.domain}/pages/${page.handle}`),
    stats: compiled.stats,
    findings: compiled.findings,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const pageId = String(params.id);

  const title = String(form.get('title') ?? '');
  const handle = String(form.get('handle') ?? '');
  const pageType = form.get('pageType') === 'product' ? 'product' : 'regular';
  const showChrome = form.get('showChrome') !== 'off';

  let doc: Doc;
  try {
    doc = JSON.parse(String(form.get('doc'))) as Doc;
  } catch {
    return { ok: false, message: 'Documento ilegível — nada foi salvo.' };
  }

  // Publishing has required fields (a draft can stay incomplete; a live page
  // cannot). Checked before anything is written, and the message names the
  // exact place to fix each one.
  if (intent === 'publish') {
    const missing: string[] = [];
    if (!title.trim()) missing.push('o título (campo no topo do editor)');
    if (!handle.trim()) missing.push('a URL (Configurações da página → URL da página)');
    if (missing.length > 0) {
      return { ok: false, message: `Para publicar, preencha ${missing.join(' e ')}.` };
    }
  }

  // Saving always records a version. compilerVersion travels with it, so a
  // later compiler change cannot rewrite what was already published (I2).
  await db.page.update({
    where: { id: pageId },
    data: { title, handle, doc: JSON.stringify(doc), pageType, showChrome },
  });
  const version = await db.version.create({
    data: { pageId, doc: JSON.stringify(doc), compilerVersion: COMPILER_VERSION },
  });

  if (intent === 'save') return { ok: true, message: 'Salvo.' };

  // Unpublish flips visibility off on every store the page is live on — the
  // content stays in Shopify, ready to be republished.
  if (intent === 'unpublish') {
    const deployments = await db.deployment.findMany({
      where: { pageId, isPublished: true },
      include: { store: true },
    });
    if (deployments.length === 0) return { ok: false, message: 'A página não está no ar.' };
    const outcomes: string[] = [];
    let failures = 0;
    for (const deployment of deployments) {
      try {
        await updatePage(clientFor(deployment.store), deployment.shopifyGid, {
          isPublished: false,
        });
        await db.deployment.update({ where: { id: deployment.id }, data: { isPublished: false } });
        outcomes.push(deployment.store.label);
      } catch (error) {
        failures++;
        outcomes.push(`${deployment.store.label}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return { ok: failures === 0, message: `Despublicada de: ${outcomes.join('; ')}` };
  }

  // --- publish -------------------------------------------------------------
  const storeIds = form.getAll('storeIds').map(String);
  if (storeIds.length === 0) {
    return { ok: false, message: 'Escolha ao menos uma loja.' };
  }
  const rows = await db.store.findMany({ where: { id: { in: storeIds } } });
  const compiled = compile(doc);
  const fragment = toFragment(compiled);

  // The ceilings are Shopify's, not ours: the page body column (64 KB) on the
  // regular track, the theme template (256 KB) behind it. Refusing here, with
  // the number, beats a cryptic API error after the save already happened.
  const fragmentBytes = Buffer.byteLength(fragment, 'utf8');
  const limit = Math.min(PAGE_BODY_LIMIT_BYTES, TEMPLATE_LIMIT_BYTES);
  if (fragmentBytes > limit) {
    return {
      ok: false,
      message:
        `A página compilada tem ${(fragmentBytes / 1024).toFixed(1)} KB e o limite da Shopify para o ` +
        `corpo de uma página é ${(limit / 1024).toFixed(0)} KB. Reduza blocos de HTML colado ou divida a página.`,
    };
  }

  // Each store's page from the last publish, so a renamed handle updates the
  // SAME live page (Shopify adds the redirect) instead of creating a twin.
  const previous = await db.deployment.findMany({ where: { pageId }, include: { store: true } });
  const existingIds = Object.fromEntries(previous.map((d) => [d.store.domain, d.shopifyGid]));

  try {
    const result = await deployPage(
      rows.map(toStore),
      {
        title,
        handle,
        body: fragment,
        // "Mostrar cabeçalho e rodapé" off binds the page to the D&VFly
        // chrome-less template; on returns it to the theme's default.
        templateSuffix: showChrome ? null : SOLO_SUFFIX,
      },
      {
        publish: true,
        allowProduction: form.get('allowProduction') === 'on',
        bindSoloTemplate: !showChrome,
        existingIds,
        clientFor: clientForStore,
      },
    );

    for (const target of result.succeeded) {
      const row = rows.find((r) => r.domain === target.store.domain)!;
      await db.deployment.upsert({
        where: { pageId_storeId: { pageId, storeId: row.id } },
        create: {
          pageId,
          storeId: row.id,
          versionId: version.id,
          shopifyGid: target.page!.id,
          isPublished: true,
          bytes: compiled.stats.bytes.total,
        },
        update: {
          versionId: version.id,
          shopifyGid: target.page!.id,
          isPublished: true,
          publishedAt: new Date(),
          bytes: compiled.stats.bytes.total,
        },
      });
    }

    const failed = result.failed;
    return {
      ok: failed.length === 0,
      message:
        failed.length === 0
          ? `Publicado em ${result.succeeded.length} loja(s).`
          : `${result.succeeded.length} ok, ${failed.length} com erro: ${failed
              .map((f) => `${f.store.label} — ${f.error}`)
              .join('; ')}`,
      urls: result.succeeded.map((t) => `https://${t.store.domain}/pages/${t.page!.handle}`),
    };
  } catch (error) {
    if (error instanceof ProductionNotAllowedError) {
      return { ok: false, message: error.message, needsProductionConfirm: true };
    }
    throw error;
  }
}

/**
 * Preview widths, one per device drawing. Width 0 fills the canvas. The icons
 * are drawn here from scratch — plain strokes, sized for a 28px button.
 */
const deviceIcon = (kind: 'monitor' | 'laptop' | 'tablet' | 'phone') => {
  const shapes: Record<string, React.ReactNode> = {
    monitor: (
      <>
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
        <path d="M5.5 14h5M8 11.5V14" />
      </>
    ),
    laptop: (
      <>
        <rect x="3" y="3" width="10" height="7.5" rx="1" />
        <path d="M1.5 13h13" />
      </>
    ),
    tablet: <rect x="3.5" y="1.5" width="9" height="13" rx="1.5" />,
    phone: (
      <>
        <rect x="5" y="1.5" width="6" height="13" rx="1.5" />
        <path d="M7.2 12.5h1.6" />
      </>
    ),
  };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {shapes[kind]}
    </svg>
  );
};

const DEVICES = [
  { label: 'Computador (tela cheia)', width: 0, icon: 'monitor' as const },
  { label: 'Notebook (1200px)', width: 1200, icon: 'laptop' as const },
  { label: 'Tablet (768px)', width: 768, icon: 'tablet' as const },
  { label: 'Celular (390px)', width: 390, icon: 'phone' as const },
];

/**
 * The 4-device system, one entry per breakpoint: the SAME four targets drive
 * the style breakpoints, the per-device visibility toggles and the preview
 * widths — one mental model everywhere.
 */
const BP_DEVICES = [
  { bp: 'base' as const, icon: 'phone' as const, name: 'Celular', device: 3 },
  { bp: 'md' as const, icon: 'tablet' as const, name: 'Tablet', device: 2 },
  { bp: 'lg' as const, icon: 'laptop' as const, name: 'Notebook', device: 1 },
  { bp: 'xl' as const, icon: 'monitor' as const, name: 'Computador', device: 0 },
];

/** Entrance animations — mirrors the compiler's closed set. */
const ANIMATION_OPTIONS = [
  { value: '', label: 'Nenhuma' },
  { value: 'fade', label: 'Aparecer' },
  { value: 'rise', label: 'Subir' },
  { value: 'zoom', label: 'Aproximar' },
];

/** What the "Atalhos de teclado" panel lists. One row per gesture. */
const SHORTCUTS: Array<{ keys: string[]; what: string }> = [
  { keys: ['Segurar', 'Ctrl'], what: 'Selecionar vários' },
  { keys: ['Ctrl', 'S'], what: 'Salvar' },
  { keys: ['Ctrl', 'Shift', 'S'], what: 'Salvar & publicar' },
  { keys: ['Ctrl', 'Z'], what: 'Desfazer' },
  { keys: ['Ctrl', 'Shift', 'Z'], what: 'Refazer' },
  { keys: ['Ctrl', 'D'], what: 'Duplicar o selecionado' },
  { keys: ['Delete'], what: 'Excluir o selecionado' },
  { keys: ['Ctrl', 'C'], what: 'Copiar estilo' },
  { keys: ['Ctrl', 'V'], what: 'Colar estilo' },
];

/**
 * Blocks offered by "Adicionar", grouped the way page builders teach their
 * catalog: structure first (the default, no fancy name needed), then the
 * everyday blocks, media, and the specialized ones last.
 */
const PALETTE_GROUPS: Array<{ name: string; types: string[] }> = [
  { name: 'Estrutura', types: ['section', 'stack', 'tabs', 'repeater'] },
  { name: 'Básico', types: ['heading', 'text', 'button', 'list', 'divider', 'html'] },
  { name: 'Mídia', types: ['image', 'youtube'] },
  { name: 'Avançado', types: ['accordion', 'countdown'] },
  // Blocks that talk to the store itself (mirror of Shopify's data model —
  // future product/collection blocks land here).
  { name: 'Loja', types: ['contact'] },
];
const PALETTE_COUNT = PALETTE_GROUPS.reduce((n, g) => n + g.types.length, 0);

interface PreviewStats {
  bytes: { html: number; css: number; js: number; total: number };
  htmlOptimization: { inlineStylesHoisted: number };
  cssRules: number;
}

/**
 * The editor takes the whole viewport, the way a page builder is expected to:
 * structure on the left, the page itself in the middle at a chosen device
 * width, the selected block's controls on the right. The arrangement follows
 * what the reference tool taught its users; every pixel is drawn here, from
 * scratch, in the D&VFly skin.
 *
 * Selection is symmetric: clicking a node in the tree highlights it on the
 * canvas, clicking an element on the canvas highlights it in the tree, and the
 * inspector always shows whichever is selected.
 */
export default function PageEditor() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const location = useLocation();
  const busy = navigation.state !== 'idle';

  const shop = new URLSearchParams(location.search).get('shop');
  const [doc, setDoc] = useState<DocTree>(data.doc);

  // Selection is a LIST: hold Ctrl to add or remove blocks. The last one
  // clicked is the "primary" — the one the inspector edits; bulk operations
  // (delete, duplicate, paste style) apply to all of them.
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.length > 0 ? selection[selection.length - 1] : null;
  const select = useCallback((id: string | null, additive = false) => {
    setSelection((prev) => {
      if (!id) return [];
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);
  const [device, setDevice] = useState(0);
  const [tab, setTab] = useState<'geral' | 'estilo'>('geral');
  const [breakpoint, setBreakpoint] = useState<'base' | 'md' | 'lg' | 'xl'>('base');
  const [live, setLive] = useState<{ stats: PreviewStats; findings: { message: string }[] }>({
    stats: data.stats,
    findings: data.findings,
  });
  const frame = useRef<HTMLIFrameElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uiTheme, toggleUiTheme] = useUiTheme();

  // What the theme's font tokens resolve to TODAY, read from the storefront.
  // Labels the tokens ("fonte-do-corpo (Helvetica)") and feeds the canvas so
  // the preview renders with the store's real typography.
  const [themeFonts, setThemeFonts] = useState<{ body: string | null; heading: string | null } | null>(null);
  const themeFontsRef = useRef<typeof themeFonts>(null);
  useEffect(() => {
    fetch(`/api/theme-fonts${shop ? `?shop=${encodeURIComponent(shop)}` : ''}`)
      .then((r) => r.json())
      .then((fonts) => {
        themeFontsRef.current = fonts;
        setThemeFonts(fonts);
        frame.current?.contentWindow?.postMessage({ type: 'dvf:themeFonts', fonts }, '*');
      })
      .catch(() => {});
  }, []);

  // Page settings travel as controlled state + hidden inputs, so they reach
  // every save even while the settings drawer is closed (an unmounted field
  // would silently drop its value from the FormData).
  const [handle, setHandle] = useState(data.page.handle);
  const [pageType, setPageType] = useState(data.page.pageType);
  const [showChrome, setShowChrome] = useState(data.page.showChrome);

  // "Salvar" only exists while there is something to save — the reference
  // behavior. Dirty is: the document differs from the last saved snapshot, or
  // the title/handle fields were touched.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(data.doc));
  const [metaDirty, setMetaDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const pendingSnapshot = useRef<string | null>(null);
  const dirty = metaDirty || JSON.stringify(doc) !== savedSnapshot;

  // Title (native input) and handle (custom element) both bubble `input`, so
  // one React handler on the form marks the page dirty whatever was typed in.
  // It must be REACT's onInput, not a native listener: a setState fired from a
  // native listener mid-event re-renders before React processes the same
  // event, and the controlled field's first keystroke gets silently reverted.
  const onFormInput = useCallback((event: React.FormEvent) => {
    if (event.target !== form.current) setMetaDirty(true);
  }, []);

  // A successful save (publishing also saves) resets the dirty tracking to
  // exactly what was submitted. A plain save also confirms itself as a toast
  // over the canvas — where the eye already is — instead of a side banner.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (result?.ok && pendingSnapshot.current !== null) {
      setSavedSnapshot(pendingSnapshot.current);
      setMetaDirty(false);
      pendingSnapshot.current = null;
    }
    if (result?.ok && result.message === 'Salvo.') {
      setToast('Salvo ✓');
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [result]);

  // Copied style travels between blocks via Ctrl+C / Ctrl+V. A ref, not
  // state: nothing needs to re-render when it changes.
  const styleClipboard = useRef<Record<string, unknown> | null>(null);
  const selectionRef = useRef<string[]>([]);

  // Undo is a list of documents — the payoff of every tree operation being a
  // pure function. Mutations within 600ms coalesce into one entry, so typing a
  // sentence is one undo step, not one per keystroke.
  //
  // The bookkeeping lives OUTSIDE the setState updater on purpose: React's
  // StrictMode invokes updaters twice to flush out impurity, and a history
  // that pushes from inside one gets silently corrupted by exactly that.
  const history = useRef<{ past: DocTree[]; future: DocTree[]; lastPush: number }>({
    past: [],
    future: [],
    lastPush: 0,
  });
  const docRef = useRef(doc);

  const setRoot = useCallback((root: DocNode[]) => {
    const prev = docRef.current;
    if (prev.root === root) return;
    const h = history.current;
    const now = Date.now();
    if (now - h.lastPush > 600) h.past = [...h.past.slice(-49), prev];
    h.lastPush = now;
    h.future = [];
    const next = { ...prev, root };
    docRef.current = next;
    setDoc(next);
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    const last = h.past[h.past.length - 1];
    if (!last) return;
    h.past = h.past.slice(0, -1);
    h.future = [...h.future, docRef.current];
    h.lastPush = 0;
    docRef.current = last;
    setDoc(last);
  }, []);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future[h.future.length - 1];
    if (!next) return;
    h.future = h.future.slice(0, -1);
    h.past = [...h.past, docRef.current];
    h.lastPush = 0;
    docRef.current = next;
    setDoc(next);
  }, []);

  // Polaris buttons submit forms but cannot carry a name/value pair, so the
  // intent is stamped onto the form data here instead of living on the button.
  const act = useCallback(
    (intent: 'save' | 'publish' | 'unpublish') => {
      if (!form.current) return;
      const fd = new FormData(form.current);
      fd.set('intent', intent);
      pendingSnapshot.current = String(fd.get('doc'));
      submit(fd, { method: 'post' });
    },
    [submit],
  );

  // Block operations reachable from shortcuts and from the canvas toolbar
  // alike. They read through refs so one stable callback serves both without
  // re-subscribing listeners on every document change. Delete, duplicate and
  // paste-style apply to the WHOLE selection; copy-style reads the primary.
  const shortcutAction = useCallback(
    (name: string) => {
      if (name === 'save') return act('save');
      if (name === 'publish') return act('publish');
      const ids = selectionRef.current;
      if (ids.length === 0) return;
      const primary = ids[ids.length - 1];
      const root = docRef.current.root;
      if (name === 'duplicate') {
        let next = root;
        for (const id of ids) next = duplicateNode(next, id);
        setRoot(next);
      }
      if (name === 'delete') {
        let next = root;
        for (const id of ids) next = removeNode(next, id);
        setRoot(next);
        select(null);
      }
      if (name === 'copyStyle') {
        const node = findNode(root, primary);
        if (node) {
          styleClipboard.current = JSON.parse(JSON.stringify(node.style ?? {}));
        }
      }
      if (name === 'pasteStyle' && styleClipboard.current) {
        let next = root;
        for (const id of ids) next = setNodeStyle(next, id, styleClipboard.current);
        setRoot(next);
      }
    },
    [act, setRoot, select],
  );

  // The full shortcut map (also listed in the "Atalhos" panel):
  //   Ctrl+S salvar · Ctrl+Shift+S salvar & publicar · Ctrl+Z / Ctrl+Shift+Z
  //   desfazer/refazer · Ctrl+D duplicar · Delete excluir · Ctrl+C/V estilo.
  // Save works even while typing; everything else defers to the field being
  // edited, where the browser's own text editing is what the person expects.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (ctrl && key === 's') {
        event.preventDefault();
        shortcutAction(event.shiftKey ? 'publish' : 'save');
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'S-TEXT-FIELD' ||
          target.isContentEditable);
      if (typing) return;

      if (!ctrl && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        shortcutAction('delete');
        return;
      }
      if (!ctrl) return;

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      } else if (key === 'd') {
        event.preventDefault();
        shortcutAction('duplicate');
      } else if (key === 'c') {
        // No preventDefault: copying selected text must keep working.
        shortcutAction('copyStyle');
      } else if (key === 'v') {
        shortcutAction('pasteStyle');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, shortcutAction]);

  // The preview is the compiler's own output, rendered in an iframe — the same
  // bytes that get published (I1). The editor build adds node id stamps and the
  // selection bridge; published output carries neither.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/preview/${data.page.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, chrome: showChrome }),
      });
      const payload = (await response.json()) as {
        fragment: string;
        stats: PreviewStats;
        findings: { message: string }[];
      };
      setLive({ stats: payload.stats, findings: payload.findings });
      const target = frame.current?.contentDocument;
      if (target) {
        target.open();
        target.write(payload.fragment);
        target.close();
        // The fresh document lost the theme font variables — re-feed them.
        if (themeFontsRef.current) {
          frame.current?.contentWindow?.postMessage(
            { type: 'dvf:themeFonts', fonts: themeFontsRef.current },
            '*',
          );
        }
        // Re-apply the selection to the fresh document.
        frame.current?.contentWindow?.postMessage(
          {
            type: 'dvf:selected',
            id: selected,
            ids: selectionRef.current,
            label: nameOf(selected ? findNode(doc.root, selected) : null),
          },
          '*',
        );
      }
    }, 250);
    return () => clearTimeout(timer);
    // `selected` is intentionally not a dependency: changing it must not recompile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, data.page.id, showChrome]);

  // Canvas → editor: clicks, drops and toolbar actions arrive as messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only the canvas may drive the editor — not any window that got a
      // reference to this one.
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message) return;
      if (message.type === 'dvf:select') select(message.id ?? null, message.additive === true);
      if (message.type === 'dvf:move') {
        setRoot(relocateNode(doc.root, message.id, message.targetId, message.position));
      }
      if (message.type === 'dvf:key') {
        if (message.key === 'undo') undo();
        else if (message.key === 'redo') redo();
        else shortcutAction(message.key);
      }
      // Clicking a theme chrome placeholder opens the drawer where its
      // visibility actually lives.
      if (message.type === 'dvf:chrome') setShowSettings(true);
      // Double-clicking a tab button in the canvas renames the tab inline.
      if (message.type === 'dvf:tabRename') {
        setRoot(updateProps(doc.root, message.id, { title: String(message.title || 'Aba') }));
      }
      if (message.type === 'dvf:action') {
        if (message.action === 'duplicate') setRoot(duplicateNode(doc.root, message.id));
        if (message.action === 'moveUp') setRoot(moveNode(doc.root, message.id, -1));
        if (message.action === 'moveDown') setRoot(moveNode(doc.root, message.id, 1));
        if (message.action === 'delete') {
          setRoot(removeNode(doc.root, message.id));
          select(null);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [doc, setRoot, undo, redo, shortcutAction, select]);

  // Editor → canvas: highlight whatever is selected, however it got selected.
  useEffect(() => {
    selectionRef.current = selection;
    frame.current?.contentWindow?.postMessage(
      {
        type: 'dvf:selected',
        id: selected,
        ids: selection,
        label: nameOf(selected ? findNode(doc.root, selected) : null),
      },
      '*',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const published = data.liveUrls.length > 0;
  const width = DEVICES[device].width;
  const selectedNode = selected ? findNode(doc.root, selected) : null;
  // Display name everywhere a block is named: custom name first, type label after.
  const nameOf = (node: DocNode | null | undefined) =>
    node ? String(node.props?.name ?? '') || (BLOCK_LABELS[node.type] ?? node.type) : '';
  const crumbs = selected ? pathTo(doc.root, selected) : [];
  // The tab-items list stays on screen while editing a tab, not only when the
  // tabs container itself is selected — the row stays inverted as context.
  const parentOfSelected = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const tabsNode =
    selectedNode?.type === 'tabs'
      ? selectedNode
      : selectedNode?.type === 'tab' && parentOfSelected?.type === 'tabs'
        ? parentOfSelected
        : null;

  const addBlock = (type: string) => {
    const block = newBlock(type);
    setRoot(insertNode(doc.root, selected, block));
    select(block.id);
  };

  return (
    <form
      ref={form}
      onSubmit={(e) => e.preventDefault()}
      onInput={onFormInput}
      className="dv-ui"
      data-theme={uiTheme}
      style={shell}
    >
      <UiStyle />
      <input type="hidden" name="doc" value={JSON.stringify(doc)} />
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="pageType" value={pageType} />
      <input type="hidden" name="showChrome" value={showChrome ? 'on' : 'off'} />

      {/* ---- top bar ------------------------------------------------------ */}
      <header style={topBar}>
        <Link to={`/app${location.search}`} style={backLink} aria-label="Voltar para páginas">
          ←
        </Link>
        <img src="/mark.svg" alt="" width={20} height={20} />
        <input name="title" defaultValue={data.page.title} style={titleInput} aria-label="Título da página" />
        <span style={published ? pillSuccess : pillNeutral} data-status>
          {published ? 'publicada' : 'rascunho'}
        </span>
        {published && !busy ? (
          <button
            type="button"
            data-unpublish
            title="Tira a página do ar em todas as lojas; o conteúdo fica guardado"
            onClick={() => act('unpublish')}
            style={unpublishLink}
          >
            Despublicar
          </button>
        ) : null}
        <button
          type="button"
          title="Configurações da página"
          aria-label="Configurações da página"
          onClick={() => setShowSettings(true)}
          style={historyOn}
        >
          {/* Sliders, not a gear: a stroked gear reads as a sun next to the
              theme toggle's actual sun. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <path d="M2 4.5h6.7M12.3 4.5H14M2 11.5h3.2M8.8 11.5H14" />
            <circle cx="10.5" cy="4.5" r="1.8" />
            <circle cx="7" cy="11.5" r="1.8" />
          </svg>
        </button>
        <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} style={historyOn} />

        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            disabled={history.current.past.length === 0}
            onClick={undo}
            style={history.current.past.length === 0 ? historyOff : historyOn}
          >
            ↶
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            disabled={history.current.future.length === 0}
            onClick={redo}
            style={history.current.future.length === 0 ? historyOff : historyOn}
          >
            ↷
          </button>
        </div>

        <div style={deviceGroup}>
          {DEVICES.map((d, i) => (
            <button
              key={d.label}
              type="button"
              title={d.label}
              aria-label={d.label}
              data-device={d.icon}
              onClick={() => setDevice(i)}
              style={i === device ? deviceActive : deviceIdle}
            >
              {deviceIcon(d.icon)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          <button
            type="button"
            title="Atalhos de teclado"
            aria-label="Atalhos de teclado"
            onClick={() => setShowKeys((v) => !v)}
            style={showKeys ? { ...historyOn, background: 'var(--dv-inset)' } : historyOn}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
              <path d="M4 6.8h.01M6.7 6.8h.01M9.4 6.8h.01M12.1 6.8h.01M4.5 9.5h7" />
            </svg>
          </button>
          {showKeys ? (
            <div style={keysPanel}>
              <div style={{ ...panelLabel, marginBottom: 10 }}>Atalhos de teclado</div>
              {SHORTCUTS.map((s) => (
                <div key={s.what} style={keysRow}>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {s.keys.map((k) => (
                      <kbd key={k} style={kbdChip}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span style={{ color: 'var(--dv-ink-2)' }}>{s.what}</span>
                </div>
              ))}
            </div>
          ) : null}
          {published ? (
            <a href={data.liveUrls[0]} target="_blank" rel="noreferrer" style={liveLink}>
              Ver no ar
            </a>
          ) : (
            // Disabled, not hidden: the person learns the function exists and
            // exactly why it is unavailable right now.
            <span style={liveLinkOff} title="Disponível depois de publicar">
              Ver no ar
            </span>
          )}
          {busy ? (
            <button type="button" disabled style={publishButton}>
              {navigation.formData?.get('intent') === 'publish'
                ? 'Publicando…'
                : navigation.formData?.get('intent') === 'unpublish'
                  ? 'Despublicando…'
                  : 'Salvando…'}
            </button>
          ) : dirty ? (
            // While there are pending changes, publishing steps aside: the
            // choice on screen is keep (Salvar) or throw away (Descartar).
            <>
              <span style={unsavedNote}>● Alterações não salvas</span>
              <button
                type="button"
                style={discardButton}
                onClick={() => {
                  if (confirmingDiscard) window.location.reload();
                  else setConfirmingDiscard(true);
                }}
                onBlur={() => setConfirmingDiscard(false)}
              >
                {confirmingDiscard ? 'Descartar mesmo?' : 'Descartar'}
              </button>
              <button type="button" style={publishButton} onClick={() => act('save')}>
                Salvar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => act('publish')} style={publishButton}>
              Publicar
            </button>
          )}
        </div>
      </header>

      {/* ---- left: structure + add + page -------------------------------- */}
      <aside style={leftPanel}>
        <section style={panelSection}>
          <div style={panelLabel}>Estrutura</div>
          {doc.root.length === 0 ? (
            <div style={metaLine}>Página vazia. Adicione um bloco abaixo.</div>
          ) : (
            <Tree
              nodes={doc.root}
              depth={0}
              selectedIds={selection}
              onSelect={select}
              onRelocate={(id, targetId, position) =>
                setRoot(relocateNode(doc.root, id, targetId, position))
              }
              onToggleHidden={(id) => setRoot(toggleHidden(doc.root, id))}
            />
          )}
        </section>

        <section style={panelSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={panelLabel}>Adicionar</div>
            <span style={countPill} title="Blocos disponíveis">
              D&VFly {PALETTE_COUNT}
            </span>
          </div>
          {PALETTE_GROUPS.map((group) => (
            <div key={group.name} style={{ marginBottom: 8 }}>
              <div style={paletteGroupLabel}>{group.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-palette={type}
                    style={paletteButton}
                    onClick={() => addBlock(type)}
                  >
                    {BLOCK_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ ...metaLine, marginTop: 6 }}>
            Entra dentro do bloco selecionado, ou depois dele.
          </div>
        </section>

      </aside>

      {/* ---- center: canvas ----------------------------------------------- */}
      <main style={canvas}>
        <div style={crumbBar}>
          {crumbs.length === 0 ? (
            <span style={{ color: 'var(--dv-ink-3)' }}>Clique num elemento para selecionar</span>
          ) : (
            crumbs.map((node, i) => (
              <span key={node.id}>
                {i > 0 ? <span style={{ color: 'var(--dv-ink-4)' }}> / </span> : null}
                <button type="button" style={crumbButton} onClick={() => select(node.id)}>
                  {nameOf(node)}
                </button>
              </span>
            ))
          )}
        </div>
        <div style={canvasScroll}>
          <div style={{ ...canvasPage, width: width === 0 ? '100%' : width, maxWidth: '100%' }}>
            <iframe ref={frame} title="Preview" style={previewFrame} />
          </div>
        </div>
        {toast ? (
          <div style={toastStyle} data-toast>
            {toast}
          </div>
        ) : null}
        <div style={statusBar}>
          Total {kb(live.stats.bytes.total)} · {((live.stats.bytes.total / PAGE_BODY_LIMIT_BYTES) * 100).toFixed(1)}%
          do teto · {live.stats.htmlOptimization.inlineStylesHoisted} estilos inline →{' '}
          {live.stats.cssRules} regras
        </div>
      </main>

      {/* ---- right: inspector + publish ----------------------------------- */}
      <aside style={rightPanel}>
        {result && result.message !== 'Salvo.' ? (
          <div style={{ padding: '10px 12px 0' }}>
            <div style={result.ok ? bannerOk : bannerErr} data-result>
              <div style={{ fontWeight: 600 }}>{result.message}</div>
              {result.urls?.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--dv-link)', display: 'block', marginTop: 4, fontSize: 12.5, overflowWrap: 'anywhere' }}
                >
                  {url}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <section style={{ ...panelSection, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedNode ? (
            <>
              {selection.length > 1 ? (
                <div style={multiNote} data-multi-note>
                  <strong>{selection.length} blocos selecionados.</strong> Excluir, Duplicar e
                  Colar estilo valem para todos; os campos abaixo editam o último clicado.
                </div>
              ) : null}
              <div style={inspectorHead}>
                <div style={panelLabel}>{BLOCK_LABELS[selectedNode.type] ?? selectedNode.type}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={opButton} title="Subir" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, -1))}>↑</button>
                  <button type="button" style={opButton} title="Descer" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, 1))}>↓</button>
                  <button type="button" style={opButton} title="Duplicar (todos os selecionados)" onClick={() => shortcutAction('duplicate')}>⧉</button>
                  <button
                    type="button"
                    style={{ ...opButton, color: 'var(--dv-danger)' }}
                    title="Excluir"
                    onClick={() => shortcutAction('delete')}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={tabRow}>
                <button
                  type="button"
                  style={tab === 'geral' ? tabOn : tabOff}
                  onClick={() => setTab('geral')}
                >
                  Geral
                </button>
                <button
                  type="button"
                  style={{ ...(tab === 'estilo' ? tabOn : tabOff), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                  title="O Estilo é por dispositivo — o ícone mostra qual está sendo editado"
                  onClick={() => setTab('estilo')}
                >
                  Estilo {deviceIcon(BP_DEVICES.find((d) => d.bp === breakpoint)!.icon)}
                </button>
              </div>
              {tab === 'geral' ? (
                <>
                  {tabsNode ? (
                    <>
                      <div style={{ ...groupLabel, marginTop: 0 }}>Itens de abas</div>
                      <div style={tabItemsBox}>
                        {(tabsNode.children ?? []).map((child) => {
                          const active = selection.includes(child.id);
                          return (
                            <div key={child.id} style={active ? tabItemRowOn : tabItemRow} data-tab-item={child.id}>
                              <button
                                type="button"
                                style={{ ...tabItemLabel, color: active ? 'var(--dv-invert-ink)' : 'var(--dv-ink)' }}
                                onClick={() => select(child.id)}
                              >
                                {String(child.props?.title ?? 'Aba')}
                              </button>
                              <button
                                type="button"
                                title="Duplicar aba"
                                style={{ ...tabItemOp, color: active ? 'var(--dv-invert-ink)' : 'var(--dv-ink-2)' }}
                                onClick={() => setRoot(duplicateNode(doc.root, child.id))}
                              >
                                ⧉
                              </button>
                              <button
                                type="button"
                                title="Excluir aba"
                                style={{ ...tabItemOp, color: active ? 'var(--dv-invert-ink)' : 'var(--dv-danger)' }}
                                onClick={() => {
                                  setRoot(removeNode(doc.root, child.id));
                                  if (active) select(tabsNode.id);
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          data-tab-add
                          style={addItemButton}
                          onClick={() => {
                            const item = newBlock('tab');
                            setRoot(insertNode(doc.root, tabsNode.id, item));
                            select(item.id);
                          }}
                        >
                          Adicionar aba
                        </button>
                      </div>
                      <div style={{ ...metaLine, marginBottom: 8 }}>
                        Reordene arrastando na Estrutura. Dica: <strong>duplo clique</strong> no
                        nome da aba, no canvas, renomeia na hora.
                      </div>
                      {selectedNode.type === 'tab' ? (
                        <Inspector
                          node={selectedNode}
                          onChange={(patch) => setRoot(updateProps(doc.root, selectedNode.id, patch))}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Inspector
                      node={selectedNode}
                      onChange={(patch) => setRoot(updateProps(doc.root, selectedNode.id, patch))}
                    />
                  )}

                  <div style={groupLabel}>Visibilidade</div>
                  <div style={{ ...metaLine, marginBottom: 6 }}>Mostrar este bloco em:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {BP_DEVICES.map(({ bp, icon, name }) => {
                      const style = (selectedNode.style ?? {}) as Record<string, Record<string, unknown>>;
                      const hiddenHere = style[bp]?.hidden === true;
                      return (
                        <button
                          key={bp}
                          type="button"
                          data-visibility={bp}
                          title={hiddenHere ? `Escondido em ${name} — clique para mostrar` : `Visível em ${name} — clique para esconder`}
                          aria-pressed={!hiddenHere}
                          onClick={() =>
                            setRoot(
                              updateStyle(doc.root, selectedNode.id, bp, {
                                hidden: hiddenHere ? undefined : true,
                              }),
                            )
                          }
                          style={hiddenHere ? visOff : visOn}
                        >
                          {deviceIcon(icon)}
                        </button>
                      );
                    })}
                  </div>

                  <div style={groupLabel}>Animação de entrada</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ANIMATION_OPTIONS.map((option) => {
                      const current = String(selectedNode.props?.animation ?? '');
                      const active = current === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          data-animation={option.value}
                          style={active ? animOn : animOff}
                          // Hovering previews the animation on the canvas before
                          // choosing — the microinteraction worth copying.
                          onMouseEnter={() => {
                            if (option.value) {
                              frame.current?.contentWindow?.postMessage(
                                { type: 'dvf:animPreview', id: selectedNode.id, name: option.value },
                                '*',
                              );
                            }
                          }}
                          onMouseLeave={() =>
                            frame.current?.contentWindow?.postMessage(
                              { type: 'dvf:animPreview', id: selectedNode.id, name: '' },
                              '*',
                            )
                          }
                          onClick={() =>
                            setRoot(
                              updateProps(doc.root, selectedNode.id, {
                                animation: option.value || undefined,
                              }),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ ...metaLine, marginTop: 6 }}>
                    Passe o mouse para ver; o bloco anima quando entra na tela do visitante.
                  </div>
                </>
              ) : (
                <StylePanel
                  node={selectedNode}
                  themeFonts={themeFonts}
                  breakpoint={breakpoint}
                  onBreakpoint={(bp) => {
                    setBreakpoint(bp);
                    // Show the width the chosen breakpoint actually governs, so
                    // what is being edited is what is being looked at.
                    setDevice(BP_DEVICES.find((d) => d.bp === bp)!.device);
                  }}
                  onChange={(patch) =>
                    setRoot(updateStyle(doc.root, selectedNode.id, breakpoint, patch))
                  }
                />
              )}
            </>
          ) : (
            <>
              <div style={panelLabel}>Nada selecionado</div>
              <div style={metaLine}>
                Clique num elemento do canvas ou na estrutura para editar o conteúdo dele aqui.
              </div>
            </>
          )}
        </section>

        <section style={{ ...panelSection, borderBottom: 'none' }}>
          <div style={panelLabel}>Publicar em</div>
          {data.stores.length === 0 ? (
            <div style={metaLine}>
              Nenhuma loja registrada ainda. Abra o app pelo admin da Shopify da loja — ela se
              registra sozinha.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.stores.map((store) => (
                <label key={store.id} style={storeRow}>
                  <input
                    type="checkbox"
                    name="storeIds"
                    value={store.id}
                    defaultChecked={data.deployedStoreIds.includes(store.id) || store.domain === shop}
                  />
                  {store.label}
                  {store.isProduction ? <span style={pillDanger}>produção</span> : null}
                </label>
              ))}
              {data.stores.some((s) => s.isProduction) ? (
                <label style={storeRow}>
                  <input type="checkbox" name="allowProduction" value="on" />
                  Confirmo publicar em produção
                </label>
              ) : null}
            </div>
          )}
          {live.findings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {live.findings.map((finding, index) => (
                <div key={index} style={findingLine}>
                  {finding.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </aside>

      {/* ---- page settings drawer ---------------------------------------- */}
      {showSettings ? (
        <>
          <div style={drawerBackdrop} onClick={() => setShowSettings(false)} />
          <div style={drawer} data-settings-drawer>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ ...panelLabel, marginBottom: 0 }}>Configurações da página</div>
              <button type="button" aria-label="Fechar configurações" onClick={() => setShowSettings(false)} style={historyOn}>
                ✕
              </button>
            </div>

            <div style={{ ...metaLine, margin: '10px 0 14px' }}>
              O título no topo do editor é o <strong>título da página</strong>: aparece na aba do
              navegador e no Google quando ela é publicada.
            </div>

            <label style={fieldLabel}>
              URL da página
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <span style={{ color: 'var(--dv-ink-3)', fontSize: 13 }}>/pages/</span>
                <input
                  style={{ ...fieldInput, marginTop: 0 }}
                  data-settings="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
              </span>
            </label>

            <label style={fieldLabel}>
              Tipo de página
              <select
                style={fieldInput}
                data-settings="pageType"
                value={pageType}
                onChange={(e) => setPageType(e.target.value)}
              >
                <option value="regular">Normal</option>
                <option value="product" disabled>
                  Produto — em preparação
                </option>
              </select>
            </label>

            <div style={{ ...groupLabel, marginTop: 14 }}>Seções do tema</div>
            <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                data-settings="showChrome"
                checked={showChrome}
                onChange={(e) => setShowChrome(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                Mostrar cabeçalho e rodapé do tema
                <span style={{ ...metaLine, display: 'block' }}>
                  Desligado, a página é publicada num modelo próprio do D&VFly, sem o cabeçalho e
                  o rodapé da loja — bom para landing pages. A mudança vale a partir da próxima
                  publicação.
                </span>
              </span>
            </label>

            <div style={{ ...groupLabel, marginTop: 14 }}>Nome do modelo</div>
            <div style={{ ...metaLine, fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {showChrome ? 'padrão do tema' : `page.${SOLO_SUFFIX}`}
            </div>
          </div>
        </>
      ) : null}
    </form>
  );
}

/**
 * The structure panel: indented, clickable, container-aware — and draggable.
 *
 * Drop position comes from where the cursor sits on the row: the top quarter
 * means before, the bottom quarter after, and the middle of a *container* row
 * means inside it. The same `relocateNode` the canvas uses applies the move,
 * so both gestures obey identical rules.
 */
/** The eye, open or shut. Drawn inline so hovering can recolor the strokes. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M2.5 9.5c1.6 1.7 3.4 2.5 5.5 2.5s3.9-.8 5.5-2.5" />
          <path d="M3 12.5l1.4-1.6M13 12.5l-1.4-1.6M8 12.2V14" />
        </>
      ) : (
        <>
          <path d="M1.5 8c1.8-2.7 4-4 6.5-4s4.7 1.3 6.5 4c-1.8 2.7-4 4-6.5 4s-4.7-1.3-6.5-4z" />
          <circle cx="8" cy="8" r="1.8" />
        </>
      )}
    </svg>
  );
}

function Tree({
  nodes,
  depth,
  selectedIds,
  onSelect,
  onRelocate,
  onToggleHidden,
  parentHidden = false,
}: {
  nodes: DocNode[];
  depth: number;
  selectedIds: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onRelocate: (id: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onToggleHidden: (id: string) => void;
  parentHidden?: boolean;
}) {
  const [hint, setHint] = useState<{ id: string; position: string } | null>(null);

  const positionFor = (event: React.DragEvent, node: DocNode): 'before' | 'after' | 'inside' => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    if (CONTAINER_TYPES.has(node.type) && y > 0.3 && y < 0.7) return 'inside';
    return y < 0.5 ? 'before' : 'after';
  };

  const hintStyle = (node: DocNode): React.CSSProperties => {
    if (hint?.id !== node.id) return {};
    if (hint.position === 'inside') return { background: 'var(--dv-accent-tint)', outline: '2px solid var(--dv-accent)' };
    return hint.position === 'before'
      ? { boxShadow: '0 -3px 0 0 var(--dv-accent)' }
      : { boxShadow: '0 3px 0 0 var(--dv-accent)' };
  };

  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            type="button"
            data-tree-id={node.id}
            data-tree-selected={selectedIds.includes(node.id) || undefined}
            draggable
            onClick={(event) => onSelect(node.id, event.ctrlKey || event.metaKey)}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/dvf-node', node.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('text/dvf-node')) return;
              event.preventDefault();
              setHint({ id: node.id, position: positionFor(event, node) });
            }}
            onDragLeave={() => setHint((h) => (h?.id === node.id ? null : h))}
            onDrop={(event) => {
              const dragged = event.dataTransfer.getData('text/dvf-node');
              event.preventDefault();
              setHint(null);
              if (dragged && dragged !== node.id) {
                onRelocate(dragged, node.id, positionFor(event, node));
              }
            }}
            style={{
              ...treeRow,
              paddingLeft: 8 + depth * 14,
              ...(selectedIds.includes(node.id) ? treeRowSelected : {}),
              ...(node.hidden || parentHidden ? treeRowHidden : {}),
              ...hintStyle(node),
            }}
          >
            <span style={treeIcon}>{CONTAINER_TYPES.has(node.type) ? '▸' : '·'}</span>
            <span style={node.hidden || parentHidden ? { textDecoration: 'line-through' } : undefined}>
              {String(node.props?.name ?? '') || (BLOCK_LABELS[node.type] ?? node.type)}
            </span>
            {node.type === 'heading' || node.type === 'text' ? (
              <span style={treeHint}> {String(node.props?.text ?? '').slice(0, 18)}</span>
            ) : null}
            <span
              role="button"
              tabIndex={0}
              data-eye={node.id}
              title={node.hidden ? 'Mostrar este bloco' : 'Esconder este bloco (não sai na página)'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleHidden(node.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleHidden(node.id);
                }
              }}
              style={{ ...eyeButton, ...(node.hidden ? eyeOff : {}) }}
            >
              <EyeIcon off={Boolean(node.hidden)} />
            </span>
          </button>
          {node.children ? (
            <Tree
              nodes={node.children}
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onRelocate={onRelocate}
              onToggleHidden={onToggleHidden}
              parentHidden={parentHidden || Boolean(node.hidden)}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

/**
 * Content controls for the selected block. Plain inputs on purpose: these are
 * controlled fields driving React state, and native elements are the one kind
 * whose events React 18 handles without surprises.
 */
function Inspector({
  node,
  onChange,
}: {
  node: DocNode;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const p = node.props ?? {};

  switch (node.type) {
    case 'heading':
      return (
        <>
          <label style={fieldLabel}>
            Texto
            <textarea
              style={fieldArea}
              rows={3}
              value={String(p.text ?? '')}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Nível
            <select
              style={fieldInput}
              value={Number(p.level ?? 2)}
              onChange={(e) => onChange({ level: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  H{level}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    case 'text':
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Texto
          <textarea
            style={{ ...fieldArea, flex: 1 }}
            value={String(p.text ?? '')}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </label>
      );
    case 'button': {
      // The action kind is derived from the href's shape, not stored twice:
      // mailto: is e-mail, tel: is phone, # is an on-page anchor, else a link.
      const href = String(p.href ?? '');
      const kind = href.startsWith('mailto:')
        ? 'email'
        : href.startsWith('tel:')
          ? 'tel'
          : href.startsWith('#')
            ? 'anchor'
            : 'url';
      const KINDS = [
        { value: 'url', label: 'Abrir um link', prefix: '', placeholder: '/products/meu-produto' },
        { value: 'anchor', label: 'Rolar até uma âncora', prefix: '#', placeholder: 'ofertas' },
        { value: 'email', label: 'Enviar e-mail', prefix: 'mailto:', placeholder: 'contato@loja.com' },
        { value: 'tel', label: 'Ligar para um número', prefix: 'tel:', placeholder: '+5511999999999' },
      ];
      const active = KINDS.find((k) => k.value === kind)!;
      return (
        <>
          <label style={fieldLabel}>
            Rótulo
            <input
              style={fieldInput}
              value={String(p.label ?? '')}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Ação ao clicar
            <select
              style={fieldInput}
              data-cta-kind
              value={kind}
              onChange={(e) => {
                const next = KINDS.find((k) => k.value === e.target.value)!;
                const bare = href.replace(/^(mailto:|tel:|#)/, '');
                onChange({ href: bare ? next.prefix + bare : next.prefix });
              }}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            {kind === 'url' ? 'Endereço' : kind === 'anchor' ? 'Âncora (id da seção)' : kind === 'email' ? 'E-mail' : 'Telefone'}
            <input
              style={fieldInput}
              data-cta-value
              value={href.replace(/^(mailto:|tel:|#)/, '')}
              placeholder={active.placeholder}
              onChange={(e) => {
                const value = e.target.value.trim();
                onChange({ href: value ? active.prefix + value : undefined });
              }}
            />
          </label>
        </>
      );
    }
    case 'image':
      return (
        <>
          <label style={fieldLabel}>
            URL da imagem
            <input
              style={fieldInput}
              value={String(p.src ?? '')}
              onChange={(e) => onChange({ src: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Texto alternativo
            <input
              style={fieldInput}
              value={String(p.alt ?? '')}
              onChange={(e) => onChange({ alt: e.target.value })}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Largura
              <input
                style={fieldInput}
                type="number"
                value={Number(p.width ?? 0) || ''}
                onChange={(e) => onChange({ width: Number(e.target.value) || undefined })}
              />
            </label>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Altura
              <input
                style={fieldInput}
                type="number"
                value={Number(p.height ?? 0) || ''}
                onChange={(e) => onChange({ height: Number(e.target.value) || undefined })}
              />
            </label>
          </div>
        </>
      );
    case 'list':
      return (
        <>
          <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
            Itens — um por linha
            <textarea
              style={{ ...fieldArea, flex: 1 }}
              value={String(p.text ?? '')}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
          <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              data-list-ordered
              checked={p.ordered === true}
              onChange={(e) => onChange({ ordered: e.target.checked ? true : undefined })}
            />
            Numerada (1, 2, 3…)
          </label>
        </>
      );
    case 'youtube':
      return (
        <>
          <label style={fieldLabel}>
            Link do vídeo
            <input
              style={fieldInput}
              data-youtube-url
              value={String(p.url ?? '')}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Título (acessibilidade)
            <input
              style={fieldInput}
              value={String(p.title ?? '')}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          <div style={metaLine}>
            Cole qualquer link do YouTube (watch, youtu.be, Shorts) — só o vídeo entra na
            página, sem cookies antes do play.
          </div>
        </>
      );
    case 'html':
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Código
          <textarea
            style={{ ...fieldArea, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
            spellCheck={false}
            value={String(p.html ?? '')}
            onChange={(e) => onChange({ html: e.target.value })}
          />
        </label>
      );
    case 'contact':
      return (
        <>
          <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              data-contact-name
              checked={p.askName !== false}
              onChange={(e) => onChange({ askName: e.target.checked })}
            />
            Pedir nome
          </label>
          <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              data-contact-phone
              checked={p.askPhone === true}
              onChange={(e) => onChange({ askPhone: e.target.checked ? true : undefined })}
            />
            Pedir telefone
          </label>
          <label style={fieldLabel}>
            Texto do botão
            <input
              style={fieldInput}
              data-contact-button
              value={String(p.buttonLabel ?? 'Enviar')}
              onChange={(e) => onChange({ buttonLabel: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Mensagem de sucesso
            <input
              style={fieldInput}
              value={String(p.success ?? '')}
              onChange={(e) => onChange({ success: e.target.value })}
            />
          </label>
          <div style={metaLine}>
            E-mail e mensagem são sempre pedidos. O envio cai na caixa de entrada da própria
            loja (Shopify → Configurações → Notificações) — nada passa por servidor nosso. A
            mensagem de sucesso aparece quando a loja confirma o envio.
          </div>
        </>
      );
    case 'tab':
      return (
        <>
          <label style={fieldLabel}>
            Texto do cabeçalho
            <input
              style={fieldInput}
              data-tab-title
              value={String(p.title ?? '')}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          <label style={fieldLabel}>
            Âncora (link direto)
            <input
              style={fieldInput}
              data-tab-anchor
              value={String(p.anchor ?? '')}
              placeholder="ofertas"
              onChange={(e) =>
                onChange({
                  anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') || undefined,
                })
              }
            />
          </label>
          <div style={metaLine}>
            Com a âncora, o endereço da página + <strong>#ofertas</strong> abre já nesta aba.
            Funciona na página publicada. O conteúdo da aba são os filhos dela na árvore.
          </div>
        </>
      );
    case 'section':
    case 'stack':
      return (
        <>
          <label style={fieldLabel}>
            Nome na estrutura
            <input
              style={fieldInput}
              data-tree-name
              value={String(p.name ?? '')}
              placeholder={BLOCK_LABELS[node.type]}
              onChange={(e) => onChange({ name: e.target.value || undefined })}
            />
          </label>
          <div style={metaLine}>
            Numa página longa, nomes como "Banner principal" ou "Depoimentos" tornam a
            estrutura navegável. O conteúdo deste bloco são os filhos na árvore — use{' '}
            <strong>Adicionar</strong> para pôr algo dentro.
          </div>
        </>
      );
    case 'divider':
      return <div style={metaLine}>Uma linha separadora. Não tem conteúdo para editar.</div>;
    default:
      // Honest fallback for blocks whose dedicated controls do not exist yet
      // (accordion, repeater, countdown): edit the props as data.
      return (
        <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
          Propriedades (JSON) — controles dedicados ainda não existem para este bloco
          <textarea
            style={{ ...fieldArea, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
            spellCheck={false}
            defaultValue={JSON.stringify(p, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                // Half-typed JSON is expected while editing; apply when it parses.
              }
            }}
          />
        </label>
      );
  }
}

/** '' → inherited; plain number → px; anything else is its own unit. */
function parseLength(raw: string): number | string | undefined {
  const value = raw.trim();
  if (value === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

const BP_LABELS: Record<string, string> = {
  base: 'Celular — a base: vale em toda largura',
  md: 'Tablet (≥ 768px) — sobrepõe a base',
  lg: 'Notebook (≥ 1200px) — sobrepõe as anteriores',
  xl: 'Computador (≥ 1440px) — sobrepõe todas',
};

/**
 * The Estilo tab: the compiler's closed style vocabulary as a form, one
 * breakpoint at a time, mobile-first (U4: one design plus overrides).
 *
 * A field left empty inherits from the breakpoints before it — the inherited
 * value shows as the placeholder — and typing into it creates the override.
 * Clearing the field removes the override again. There is deliberately no
 * field here the compiler cannot emit.
 */
function StylePanel({
  node,
  themeFonts,
  breakpoint,
  onBreakpoint,
  onChange,
}: {
  node: DocNode;
  themeFonts: { body: string | null; heading: string | null } | null;
  breakpoint: 'base' | 'md' | 'lg' | 'xl';
  onBreakpoint: (bp: 'base' | 'md' | 'lg' | 'xl') => void;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const style = (node.style ?? {}) as Record<string, Record<string, unknown>>;
  const own = style[breakpoint] ?? {};
  const inherited = (key: string) => effectiveStyle(style, breakpoint, key);

  const ownOr = (key: string): string => {
    const value = own[key];
    return value === undefined ? '' : String(value);
  };
  const hint = (key: string): string => {
    const value = inherited(key);
    return value === undefined ? '' : String(value);
  };

  const length = (label: string, key: string) => (
    <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
      {label}
      <input
        style={fieldInput}
        data-style={key}
        value={ownOr(key)}
        placeholder={hint(key) || '—'}
        onChange={(e) => onChange({ [key]: parseLength(e.target.value) })}
      />
    </label>
  );

  const color = (label: string, key: string) => {
    const value = ownOr(key);
    const shown = value || hint(key);
    return (
      <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
        {label}
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: '1px solid var(--dv-edge-input)',
              background: shown || '#ffffff',
              flexShrink: 0,
            }}
          />
          <input
            style={{ ...fieldInput, marginTop: 0 }}
            value={value}
            placeholder={hint(key) || 'ex.: #17201c'}
            onChange={(e) => onChange({ [key]: e.target.value.trim() || undefined })}
          />
        </span>
      </label>
    );
  };

  const box = (label: string, key: 'padding' | 'margin') => {
    const value = (own[key] ?? {}) as Record<string, unknown>;
    const base = (inherited(key) ?? {}) as Record<string, unknown>;
    const side = (name: 'top' | 'right' | 'bottom' | 'left', short: string) => (
      <label key={name} style={{ ...fieldLabel, flex: 1, marginBottom: 0 }}>
        {short}
        <input
          style={fieldInput}
          value={value[name] === undefined ? '' : String(value[name])}
          placeholder={base[name] === undefined ? '—' : String(base[name])}
          onChange={(e) => {
            const next = { ...value };
            const parsed = parseLength(e.target.value);
            if (parsed === undefined) delete next[name];
            else next[name] = parsed;
            onChange({ [key]: Object.keys(next).length > 0 ? next : undefined });
          }}
        />
      </label>
    );
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...fieldLabel, marginBottom: 2 }}>{label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {side('top', '↑')}
          {side('right', '→')}
          {side('bottom', '↓')}
          {side('left', '←')}
        </div>
      </div>
    );
  };

  const choice = (
    label: string,
    key: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <label style={{ ...fieldLabel, flex: 1, marginBottom: 8 }}>
      {label}
      <select
        style={fieldInput}
        data-style={key}
        value={ownOr(key)}
        onChange={(e) => onChange({ [key]: e.target.value || undefined })}
      >
        <option value="">{hint(key) ? `herdado (${hint(key)})` : 'herdado'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const isContainer = CONTAINER_TYPES.has(node.type);
  const isTexty = ['heading', 'text', 'button', 'html', 'section', 'stack'].includes(node.type);

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={bpRow}>
        {BP_DEVICES.map(({ bp, icon, name }) => (
          <button
            key={bp}
            type="button"
            data-breakpoint={bp}
            title={BP_LABELS[bp]}
            aria-label={name}
            style={bp === breakpoint ? bpOn : bpOff}
            onClick={() => onBreakpoint(bp)}
          >
            {deviceIcon(icon)}
          </button>
        ))}
      </div>
      <div style={{ ...metaLine, marginBottom: 10 }}>{BP_LABELS[breakpoint]}</div>

      {isContainer ? (
        <>
          <div style={groupLabel}>Layout</div>
          {choice('Direção', 'direction', [
            { value: 'column', label: 'Coluna' },
            { value: 'row', label: 'Linha' },
          ])}
          <div style={{ display: 'flex', gap: 8 }}>
            {length('Espaço entre itens', 'gap')}
            {choice('Alinhar', 'align', [
              { value: 'start', label: 'Início' },
              { value: 'center', label: 'Centro' },
              { value: 'end', label: 'Fim' },
              { value: 'stretch', label: 'Esticar' },
            ])}
          </div>
        </>
      ) : null}

      <div style={groupLabel}>Espaçamento</div>
      {box('Interno (padding)', 'padding')}
      {box('Externo (margin)', 'margin')}

      {isTexty ? (
        <>
          <div style={groupLabel}>Texto</div>
          {/* Token first, resolved font in parentheses: the person picks the
              ROLE (body / heading) and sees which font that is today. Change
              the theme and both follow automatically. */}
          {choice('Fonte', 'fontFamily', [
            {
              value: 'theme-body',
              label: `fonte-do-corpo${themeFonts?.body ? ` (${themeFonts.body.split(',')[0].trim()})` : ' (do tema)'}`,
            },
            {
              value: 'theme-heading',
              label: `fonte-de-título${themeFonts?.heading ? ` (${themeFonts.heading.split(',')[0].trim()})` : ' (do tema)'}`,
            },
          ])}
          <div style={{ display: 'flex', gap: 8 }}>
            {length('Tamanho', 'fontSize')}
            {choice('Peso', 'fontWeight', [
              { value: '400', label: 'Normal' },
              { value: '600', label: 'Meio-negrito' },
              { value: '700', label: 'Negrito' },
              { value: '800', label: 'Pesado' },
            ])}
          </div>
          {choice('Alinhamento', 'textAlign', [
            { value: 'left', label: 'Esquerda' },
            { value: 'center', label: 'Centro' },
            { value: 'right', label: 'Direita' },
          ])}
        </>
      ) : null}

      <div style={groupLabel}>Aparência</div>
      {color('Cor do texto', 'color')}
      {color('Fundo', 'background')}
      <div style={{ display: 'flex', gap: 8 }}>
        {length('Cantos', 'radius')}
        {length('Largura máx.', 'maxWidth')}
      </div>

      <div style={groupLabel}>Visibilidade</div>
      <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={own.hidden === true}
          onChange={(e) => onChange({ hidden: e.target.checked ? true : undefined })}
        />
        Esconder neste dispositivo (só nesta faixa de tela)
      </label>
    </div>
  );
}

// ---- styles ---------------------------------------------------------------
// The editor's chrome is deliberately plain CSS: it is the one screen that is
// not a form-over-data page, and its layout (fixed viewport grid) is not what
// Polaris pages are built for.

const shell: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '52px 1fr',
  gridTemplateColumns: '260px 1fr 340px',
  gridTemplateAreas: `"top top top" "left canvas right"`,
  background: 'var(--dv-sfc)',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: 'var(--dv-ink)',
  zIndex: 10,
};

const topBar: React.CSSProperties = {
  gridArea: 'top',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 12px',
  borderBottom: '1px solid var(--dv-edge)',
};

const backLink: React.CSSProperties = {
  fontSize: 18,
  textDecoration: 'none',
  color: 'var(--dv-ink-2)',
  padding: '2px 8px',
  borderRadius: 8,
};

const titleInput: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '6px 8px',
  width: 260,
  background: 'transparent',
};

const deviceGroup: React.CSSProperties = {
  marginLeft: 'auto',
  marginRight: 12,
  display: 'flex',
  background: 'var(--dv-inset)',
  borderRadius: 8,
  padding: 2,
  gap: 2,
};

const deviceBase: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: '5px 9px',
  fontSize: 12,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--dv-ink-2)',
  display: 'flex',
  alignItems: 'center',
};
const deviceIdle = deviceBase;
const deviceActive: React.CSSProperties = {
  ...deviceBase,
  background: 'var(--dv-sfc)',
  color: 'var(--dv-ink)',
  fontWeight: 600,
  boxShadow: 'var(--dv-shadow-soft)',
};

const historyBase: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  borderRadius: 6,
  width: 28,
  height: 28,
  fontSize: 15,
  lineHeight: 1,
};
const historyOn: React.CSSProperties = { ...historyBase, color: 'var(--dv-ink)', cursor: 'pointer' };
const historyOff: React.CSSProperties = { ...historyBase, color: 'var(--dv-ink-4)', cursor: 'default' };

const liveLink: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--dv-link)',
  textDecoration: 'none',
  marginRight: 4,
};

const liveLinkOff: React.CSSProperties = {
  ...liveLink,
  color: 'var(--dv-ink-4)',
  cursor: 'default',
};

const unpublishLink: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--dv-warn-text)',
  fontSize: 12.5,
  cursor: 'pointer',
  padding: '2px 4px',
  textDecoration: 'underline',
};

const unsavedNote: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-warn-text)',
  whiteSpace: 'nowrap',
};

const discardButton: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
};

const publishButton: React.CSSProperties = {
  background: 'var(--dv-accent)',
  color: 'var(--dv-accent-ink)',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const leftPanel: React.CSSProperties = {
  gridArea: 'left',
  borderRight: '1px solid var(--dv-edge)',
  overflowY: 'auto',
};

const rightPanel: React.CSSProperties = {
  gridArea: 'right',
  borderLeft: '1px solid var(--dv-edge)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const panelSection: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid var(--dv-edge-soft)',
};

const panelLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--dv-ink-3)',
  marginBottom: 8,
};

const inspectorHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const opButton: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 6,
  width: 26,
  height: 26,
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
  lineHeight: 1,
};

const treeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  fontSize: 13,
  padding: '5px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--dv-ink)',
};

const treeRowSelected: React.CSSProperties = {
  background: 'var(--dv-accent-tint)',
  outline: '1px solid var(--dv-accent-edge)',
  fontWeight: 600,
};

const treeIcon: React.CSSProperties = { fontSize: 10, color: 'var(--dv-accent-text)', width: 10 };
const treeHint: React.CSSProperties = { color: 'var(--dv-ink-3)', fontWeight: 400, fontSize: 12 };

/** A hidden row reads as switched off: gray all over, label struck through. */
const treeRowHidden: React.CSSProperties = { color: 'var(--dv-ink-4)' };

const eyeButton: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  padding: 2,
  borderRadius: 4,
  color: 'var(--dv-ink-3)',
  cursor: 'pointer',
};
const eyeOff: React.CSSProperties = { color: 'var(--dv-ink-4)' };

const keysPanel: React.CSSProperties = {
  position: 'absolute',
  top: 40,
  right: 0,
  zIndex: 30,
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 12,
  boxShadow: 'var(--dv-shadow-pop)',
  padding: 14,
  width: 250,
};

const keysRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 12.5,
  padding: '4px 0',
};

const visBase: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  width: 34,
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
const visOn: React.CSSProperties = {
  ...visBase,
  background: 'var(--dv-accent-tint)',
  borderColor: 'var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
};
const visOff: React.CSSProperties = { ...visBase, color: 'var(--dv-ink-4)' };

const animOff: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  cursor: 'pointer',
  color: 'var(--dv-ink)',
};
const animOn: React.CSSProperties = {
  ...animOff,
  background: 'var(--dv-accent-tint)',
  borderColor: 'var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
  fontWeight: 600,
};

// The tab items list: the container owns its add button, and the active row
// is a FULL color inversion — instantly readable.
const tabItemsBox: React.CSSProperties = {
  background: 'var(--dv-inset2)',
  borderRadius: 10,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const tabItemRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  background: 'transparent',
  borderRadius: 8,
  padding: '2px 4px',
};

const tabItemRowOn: React.CSSProperties = {
  ...tabItemRow,
  background: 'var(--dv-invert-bg)',
};

const tabItemLabel: React.CSSProperties = {
  flex: 1,
  textAlign: 'left',
  border: 0,
  background: 'transparent',
  fontSize: 13,
  padding: '6px 6px',
  cursor: 'pointer',
};

const tabItemOp: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  width: 26,
  height: 26,
  fontSize: 13,
  cursor: 'pointer',
  lineHeight: 1,
};

const addItemButton: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  padding: '8px 0',
  fontSize: 12.5,
  cursor: 'pointer',
  color: 'var(--dv-ink)',
  width: '100%',
  marginTop: 2,
};

const multiNote: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-accent-text)',
  background: 'var(--dv-accent-tint)',
  border: '1px solid var(--dv-accent-edge)',
  borderRadius: 8,
  padding: '8px 10px',
  marginBottom: 10,
};

const drawerBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--dv-backdrop)',
  zIndex: 40,
};

const drawer: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 360,
  background: 'var(--dv-sfc)',
  zIndex: 41,
  padding: 16,
  overflowY: 'auto',
  boxShadow: 'var(--dv-shadow-drawer)',
};

const kbdChip: React.CSSProperties = {
  background: 'var(--dv-inset)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 5,
  padding: '2px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  color: 'var(--dv-ink)',
};

const paletteButton: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  cursor: 'pointer',
  color: 'var(--dv-ink)',
};

const metaLine: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-2)', padding: '2px 0' };

const storeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer',
};
const findingLine: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--dv-warn-text)',
  background: 'var(--dv-warn-tint)',
  border: '1px solid var(--dv-warn-edge)',
  borderRadius: 6,
  padding: '6px 8px',
  marginTop: 6,
};

const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  background: 'var(--dv-inset)',
  borderRadius: 8,
  padding: 2,
  marginBottom: 10,
};
const tabBase2: React.CSSProperties = {
  flex: 1,
  border: 0,
  borderRadius: 6,
  padding: '6px 0',
  fontSize: 12.5,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--dv-ink-2)',
};
const tabOff = tabBase2;
const tabOn: React.CSSProperties = {
  ...tabBase2,
  background: 'var(--dv-sfc)',
  color: 'var(--dv-ink)',
  fontWeight: 600,
  boxShadow: 'var(--dv-shadow-soft)',
};

const bpRow: React.CSSProperties = { display: 'flex', gap: 4, marginBottom: 4 };
const bpBase: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
};
const bpOff = bpBase;
const bpOn: React.CSSProperties = {
  ...bpBase,
  background: 'var(--dv-accent-tint)',
  borderColor: 'var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
  fontWeight: 600,
};

const groupLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--dv-ink-3)',
  margin: '10px 0 6px',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--dv-ink-2)',
  marginBottom: 10,
};

const fieldInput: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  border: '1px solid var(--dv-edge-input)',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 13,
  boxSizing: 'border-box',
  background: 'var(--dv-sfc)',
};

const fieldArea: React.CSSProperties = {
  ...fieldInput,
  resize: 'vertical',
  minHeight: 64,
  lineHeight: 1.5,
};

const canvas: React.CSSProperties = {
  gridArea: 'canvas',
  background: 'var(--dv-canvas-bg)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  minHeight: 0,
  position: 'relative',
};

/** Confirmation toast, floating over the canvas near the bottom. */
const toastStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 44,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--dv-toast-bg)',
  color: 'var(--dv-toast-ink)',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  boxShadow: 'var(--dv-shadow-pop)',
  zIndex: 20,
};

const countPill: React.CSSProperties = {
  background: 'var(--dv-accent-tint)',
  border: '1px solid var(--dv-accent-edge)',
  color: 'var(--dv-accent-text)',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 8,
};

const paletteGroupLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: 'var(--dv-ink-4)',
  margin: '4px 0',
};

const crumbBar: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 12.5,
  borderBottom: '1px solid var(--dv-edge-soft)',
  background: 'var(--dv-sfc-sub)',
};

const crumbButton: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--dv-link)',
  fontSize: 12.5,
  cursor: 'pointer',
  padding: 0,
};

const canvasScroll: React.CSSProperties = {
  overflow: 'auto',
  display: 'flex',
  justifyContent: 'center',
  padding: 20,
  minHeight: 0,
};

const canvasPage: React.CSSProperties = {
  // Literal white on purpose: this is the storefront page's paper, not editor
  // chrome — it does not follow the dark skin.
  background: '#ffffff',
  borderRadius: 8,
  boxShadow: 'var(--dv-shadow-page)',
  overflow: 'hidden',
  height: 'fit-content',
  minHeight: '100%',
  transition: 'width .15s ease',
};

const previewFrame: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 600,
  border: 0,
  display: 'block',
  background: '#ffffff',
};

const statusBar: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  color: 'var(--dv-ink-2)',
  borderTop: '1px solid var(--dv-edge-soft)',
  background: 'var(--dv-sfc-sub)',
};
