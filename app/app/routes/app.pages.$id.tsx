import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigation,
  useSubmit,
} from 'react-router';
import type { ActionFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router';

import { COMPILER_VERSION, compile, toFragment, type Doc } from '../lib/compiler.server.ts';
import {
  BUDGET_BYTES,
  PAGE_BODY_LIMIT_BYTES,
  SOLO_SUFFIX,
  TEMPLATE_LIMIT_BYTES,
  themeEditorUrl,
  themeHead,
  type ThemeStyleData,
} from '../lib/shared.ts';
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
import { requireShop } from '../lib/auth.server.ts';
import { passHeaders } from '../lib/headers.ts';
import {
  applyLinkNow,
  deploymentKind,
  kindLabel,
  otherKindDeployments,
  retireOtherKind,
  switchPage,
} from '../lib/publish.server.ts';
import { readThemeStyle, storeForThemeStyle } from '../lib/theme-style.server.ts';
import { openWithToken, shopSearch } from '../ui/embedded.ts';
import { BLOCK_ICONS, Icon, type IconName } from '../ui/icons.tsx';
import {
  clientForStore,
  deployPage,
  deployProductPage,
  ProductionNotAllowedError,
  productSuffix,
  storeUnusableReason,
  toStore,
} from '../lib/shopify.server.ts';

export const headers = passHeaders;
import {
  bannerErr,
  bannerOk,
  buttonGhost,
  FONT_STACK,
  pillDanger,
  pillNeutral,
  pillSuccess,
  ThemeToggle,
  UiStyle,
  useUiTheme,
} from '../ui/theme.tsx';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  // Independent queries, one round trip: on a remote Postgres each await is
  // tens of milliseconds the person waits for the editor to appear.
  const [page, stores, theme] = await Promise.all([
    db.page.findUniqueOrThrow({
      where: { id: params.id },
      include: { deployments: { include: { store: true } }, productLinks: { orderBy: { createdAt: 'asc' } } },
    }),
    db.store.findMany({ orderBy: { isProduction: 'asc' } }),
    storeForThemeStyle(shop).then((store) => readThemeStyle(store?.domain)),
  ]);
  const doc = JSON.parse(page.doc) as Doc;
  // The numbers the status bar opens with, built the way the canvas builds:
  // pasted HTML rebased on the theme's rem, not the browser's.
  const compiled = compile(doc, { rootPx: theme.rootPx });

  // A product page has no URL of its own: it is seen at the URL of every
  // product that adopted it. "Ver no ar" opens the first linked product of
  // the first store it is live on. What is live is what each deployment IS
  // on its store — a page whose type changed since keeps its old URLs until
  // it is published again.
  const live = page.deployments.filter((d) => d.isPublished);
  const liveUrls = live.flatMap((d) =>
    deploymentKind(d.shopifyGid) === 'product'
      ? page.productLinks
          .filter((l) => l.storeId === d.storeId)
          .map((l) => `https://${d.store.domain}/products/${l.productHandle}`)
      : [`https://${d.store.domain}/pages/${page.handle}`],
  );

  return {
    // WHICH store this screen was opened from, said by the verified token and
    // not by the query string. The publish panel decides what comes ticked and
    // what needs confirming from this, and a screen that has to guess it after
    // a bounce would decide wrong on the one thing that must not be wrong.
    shop,
    page: {
      id: page.id,
      title: page.title,
      handle: page.handle,
      pageType: page.pageType,
      showChrome: page.showChrome,
      productContentAbove: page.productContentAbove,
      bareLayout: page.bareLayout,
    },
    doc: doc as unknown as DocTree,
    // Only what the screen needs — never a store's token or credentials.
    stores: stores.map((s) => ({
      id: s.id,
      domain: s.domain,
      label: s.label,
      isProduction: s.isProduction,
      unusable: storeUnusableReason(s),
    })),
    deployedStoreIds: page.deployments.map((d) => d.storeId),
    liveStoreIds: live.map((d) => d.storeId),
    // What is live on each store decides which theme template to open.
    liveKinds: Object.fromEntries(live.map((d) => [d.storeId, deploymentKind(d.shopifyGid)])),
    productLinks: page.productLinks.map((l) => ({
      id: l.id,
      storeId: l.storeId,
      productGid: l.productGid,
      productHandle: l.productHandle,
      productTitle: l.productTitle,
    })),
    productSuffix: productSuffix(page.id),
    liveUrls,
    stats: compiled.stats,
    findings: compiled.findings,
  };
}

/**
 * A plain save changes nothing the loader reports (the screen keeps its own
 * copy of the document and the settings), so re-running three queries, a
 * compile and a 60 KB download after every Ctrl+S is work nobody sees.
 * Publishing, unpublishing and product links do change what the loader
 * says, and revalidate as usual.
 */
export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formData?.get('intent') === 'save') return false;
  return defaultShouldRevalidate;
}

/**
 * Every refusal this screen produces, also in the server's log.
 *
 * A refused publish answers HTTP 200 with `{ ok: false, message }` — correct
 * (nothing broke; the app is saying no on purpose) and invisible: the log
 * showed a healthy POST while the person stared at a red banner, and the only
 * copy of the reason was on their screen. The message is written for them, so
 * it is the right thing to keep.
 */
export async function action(args: ActionFunctionArgs) {
  const result = await handleAction(args);
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
    console.warn(`[dvfly] recusado em ${new URL(args.request.url).pathname}: ${result.message}`);
  }
  return result;
}

async function handleAction({ request, params }: ActionFunctionArgs) {
  const { shop: currentShop } = await requireShop(request);
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const pageId = String(params.id);

  // --- product links: independent of the document, applied on the spot ----
  if (intent === 'link-product') {
    const storeId = String(form.get('storeId') ?? '');
    const productGid = String(form.get('productGid') ?? '');
    const productHandle = String(form.get('productHandle') ?? '');
    const productTitle = String(form.get('productTitle') ?? '');
    if (!storeId || !productGid || !productHandle) return { ok: false, message: 'Produto incompleto.' };
    const clash = await db.productLink.findFirst({
      where: { storeId, productGid, NOT: { pageId } },
      include: { page: true },
    });
    if (clash) {
      // One product renders one template; two pages claiming it would take
      // turns silently. Said out loud instead.
      return {
        ok: false,
        message: `Este produto já está vinculado à página "${clash.page.title}". Desvincule lá primeiro.`,
      };
    }
    await db.productLink.upsert({
      where: { pageId_storeId_productGid: { pageId, storeId, productGid } },
      create: { pageId, storeId, productGid, productHandle, productTitle },
      update: { productHandle, productTitle },
    });
    try {
      const applied = await applyLinkNow(pageId, storeId, productGid, true);
      return {
        ok: true,
        message:
          applied === 'applied'
            ? `"${productTitle}" já está mostrando esta página.`
            : `"${productTitle}" vinculado — passa a usar esta página na próxima publicação.`,
        quiet: true,
      };
    } catch (error) {
      return { ok: false, message: `Vinculado, mas não consegui aplicar na loja agora: ${error instanceof Error ? error.message : error}` };
    }
  }
  if (intent === 'unlink-product') {
    const link = await db.productLink.findUnique({ where: { id: String(form.get('linkId') ?? '') } });
    if (!link || link.pageId !== pageId) return { ok: false, message: 'Vínculo não encontrado.' };
    try {
      await applyLinkNow(pageId, link.storeId, link.productGid, false);
    } catch (error) {
      return { ok: false, message: `Não consegui devolver o produto ao modelo do tema: ${error instanceof Error ? error.message : error}` };
    }
    await db.productLink.delete({ where: { id: link.id } });
    return { ok: true, message: `"${link.productTitle}" voltou ao modelo padrão do tema.` };
  }

  const title = String(form.get('title') ?? '');
  const handle = String(form.get('handle') ?? '');
  const pageType = form.get('pageType') === 'product' ? 'product' : 'regular';
  const showChrome = form.get('showChrome') !== 'off';
  const productContentAbove = form.get('productContentAbove') === 'on';
  // Stored as ticked, whatever the page type: a page that later becomes a
  // product page must still be light by default. Publishing applies it to
  // product pages only (a regular page has no theme sections to leave out).
  const bareLayout = form.get('bareLayout') !== 'off';

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
    // A product page has the products' URLs; only a regular page needs its own.
    if (pageType !== 'product' && !handle.trim()) {
      missing.push('a URL (Configurações da página → URL da página)');
    }
    if (missing.length > 0) {
      return { ok: false, message: `Para publicar, preencha ${missing.join(' e ')}.` };
    }
  }

  // Saving always records a version. compilerVersion travels with it, so a
  // later compiler change cannot rewrite what was already published (I2).
  await db.page.update({
    where: { id: pageId },
    data: { title, handle, doc: JSON.stringify(doc), pageType, showChrome, productContentAbove, bareLayout },
  });
  const version = await db.version.create({
    data: { pageId, doc: JSON.stringify(doc), compilerVersion: COMPILER_VERSION },
  });

  if (intent === 'save') return { ok: true, message: 'Salvo.' };

  // Unpublish flips visibility off on every store the page is live on — the
  // content stays in Shopify, ready to be republished.
  if (intent === 'unpublish') {
    const result = await switchPage(pageId, false, { publishedOnly: true });
    if (result.touched === 0) return { ok: false, message: 'A página não está no ar.' };
    return { ok: result.ok, message: `Despublicada de: ${result.outcomes.join('; ')}` };
  }

  if (intent !== 'publish') return { ok: false, message: 'Ação desconhecida — nada foi publicado.', saved: true };

  // --- publish -------------------------------------------------------------
  // From here on the page IS saved; a refusal below says so (`saved`), so the
  // editor does not keep asking to save what it already saved.
  const storeIds = form.getAll('storeIds').map(String);
  if (storeIds.length === 0) {
    return { ok: false, message: 'Escolha ao menos uma loja.', saved: true };
  }
  const rows = await db.store.findMany({ where: { id: { in: storeIds } } });
  const unreachable = rows.map((r) => [r.label, storeUnusableReason(r)] as const).filter(([, why]) => why);
  if (unreachable.length > 0) {
    return { ok: false, message: `Sem acesso a ${unreachable.map(([l, why]) => `${l} (${why})`).join('; ')}.`, saved: true };
  }
  // The `rem` base of pasted HTML is the theme's root font-size, read from
  // the store this editor was opened in — the same store whose theme the
  // canvas rendered against, so what was approved there is what ships (I1).
  // (Every store the page goes to gets the same bytes; a page is designed
  // once, not once per store.)
  const theme = await readThemeStyle((await storeForThemeStyle(currentShop))?.domain);
  const compiled = compile(doc, { rootPx: theme.rootPx });
  const fragment = toFragment(compiled);
  const confirmouOutras = form.get('allowProduction') === 'on';

  // The ceilings are Shopify's, not ours: the page body column (64 KB) on the
  // regular track, the theme section file (256 KB) for a product page.
  // Refusing here, with the number, beats a cryptic API error — and comes
  // before anything on the stores is touched.
  const fragmentBytes = Buffer.byteLength(fragment, 'utf8');
  const limit = pageType === 'product' ? TEMPLATE_LIMIT_BYTES : Math.min(PAGE_BODY_LIMIT_BYTES, TEMPLATE_LIMIT_BYTES);
  if (fragmentBytes > limit) {
    return {
      ok: false,
      saved: true,
      message:
        `A página compilada tem ${(fragmentBytes / 1024).toFixed(1)} KB e o limite da Shopify para ` +
        (pageType === 'product' ? 'um arquivo de seção do tema' : 'o corpo de uma página') +
        ` é ${(limit / 1024).toFixed(0)} KB. Reduza blocos de HTML colado ou divida a página.`,
    };
  }

  // A page that was live as the other kind (type changed after publishing)
  // is taken down as that kind first; publishing over it would strand it.
  // Taking something off a production store is as deliberate as publishing
  // to one, so the confirmation covers both before anything happens.
  //
  // The store you OPENED the app from is not one of them. Publishing into the
  // store whose admin you are standing in is the normal act, it is what the
  // button says it does, and "Despublicar" undoes it. Asking to confirm it
  // every time taught the only lesson a confirmation must never teach: tick it
  // without reading. What deserves the gate is the other store — the one you
  // are not looking at, in another country, that a stray click would change.
  const retiring = await otherKindDeployments(pageId, pageType);
  const production = [...rows, ...retiring.map((d) => d.store)].filter(
    (s, i, all) => s.isProduction && s.domain !== currentShop && all.findIndex((x) => x.id === s.id) === i,
  );
  if (production.length > 0 && !confirmouOutras) {
    return { ok: false, saved: true, message: new ProductionNotAllowedError(production.map(toStore)).message, needsProductionConfirm: true };
  }
  // Passada a regra desta tela, o deploy ESTÁ autorizado — e é preciso dizer
  // isso à biblioteca.
  //
  // `deployPage` tem um portão próprio, e ele conta TODA loja de produção,
  // inclusive aquela cujo admin você está usando. Enquanto a loja nova estava
  // (por defeito) marcada como "não produção", os dois portões concordavam por
  // acidente; consertar a marca acordou o de baixo, e publicar na própria loja
  // passou a ser recusado com uma mensagem escrita para quem chama a
  // biblioteca por script ("Passe allowProduction: true"). A política mora
  // aqui, numa regra só; lá embaixo fica a trava que protege os outros
  // chamadores, e esta tela responde por ela.
  const allowProduction = true;
  const retired = await retireOtherKind(pageId, pageType);
  if (retired.failed.length > 0) {
    return {
      ok: false,
      saved: true,
      message: `Antes de publicar como ${kindLabel(pageType)}, não consegui tirar do ar a versão anterior em ${retired.failed.join('; ')}.`,
    };
  }
  // Said in the result: a store not in this publish lost its old version too.
  const retiredNote =
    retired.retired.length > 0
      ? ` Tirada do ar como ${kindLabel(pageType === 'product' ? 'regular' : 'product')} em: ${retired.retired.join(', ')}.`
      : '';

  if (pageType === 'product') {
    return publishProductPage({ pageId, title, fragment, bytes: fragmentBytes, rows, versionId: version.id, productContentAbove, showChrome, bareLayout, allowProduction, retiredNote });
  }

  // Each store's page from the last publish, so a renamed handle updates the
  // SAME live page (Shopify adds the redirect) instead of creating a twin.
  const previous = await db.deployment.findMany({ where: { pageId }, include: { store: true } });
  const existingIds = Object.fromEntries(
    previous.filter((d) => deploymentKind(d.shopifyGid) === 'regular').map((d) => [d.store.domain, d.shopifyGid]),
  );

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
        allowProduction,
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
          bytes: fragmentBytes,
        },
        update: {
          versionId: version.id,
          shopifyGid: target.page!.id,
          isPublished: true,
          publishedAt: new Date(),
          bytes: fragmentBytes,
        },
      });
    }

    const failed = result.failed;
    return {
      ok: failed.length === 0,
      saved: true,
      message:
        (failed.length === 0
          ? `Publicado em ${result.succeeded.length} loja(s).`
          : `${result.succeeded.length} ok, ${failed.length} com erro: ${failed
              .map((f) => `${f.store.label} — ${f.error}`)
              .join('; ')}`) + retiredNote,
      urls: result.succeeded.map((t) => `https://${t.store.domain}/pages/${t.page!.handle}`),
    };
  } catch (error) {
    if (error instanceof ProductionNotAllowedError) {
      return { ok: false, saved: true, message: error.message, needsProductionConfirm: true };
    }
    throw error;
  }
}

/**
 * A product page goes into each store's theme as a template + section, and
 * every linked product on that store is pointed at it. The section is a
 * Liquid file, so the 256 KB theme-file ceiling is the one that applies.
 */
async function publishProductPage(input: {
  pageId: string;
  title: string;
  fragment: string;
  bytes: number;
  rows: Awaited<ReturnType<typeof db.store.findMany>>;
  versionId: string;
  productContentAbove: boolean;
  showChrome: boolean;
  bareLayout: boolean;
  allowProduction: boolean;
  retiredNote: string;
}) {
  const links = await db.productLink.findMany({ where: { pageId: input.pageId }, include: { store: true } });
  const productsByDomain: Record<string, string[]> = {};
  for (const link of links) (productsByDomain[link.store.domain] ??= []).push(link.productGid);

  try {
    const result = await deployProductPage(
      input.rows.map(toStore),
      {
        pageId: input.pageId,
        title: input.title,
        fragment: input.fragment,
        contentAbove: input.productContentAbove,
        chrome: input.showChrome,
        bare: input.bareLayout,
        productsByDomain,
      },
      { allowProduction: input.allowProduction, clientFor: clientForStore },
    );
    for (const target of result.succeeded) {
      const row = input.rows.find((r) => r.domain === target.store.domain)!;
      await db.deployment.upsert({
        where: { pageId_storeId: { pageId: input.pageId, storeId: row.id } },
        create: {
          pageId: input.pageId,
          storeId: row.id,
          versionId: input.versionId,
          shopifyGid: `template:product.${target.suffix}`,
          isPublished: true,
          bytes: input.bytes,
        },
        update: {
          versionId: input.versionId,
          shopifyGid: `template:product.${target.suffix}`,
          isPublished: true,
          publishedAt: new Date(),
          bytes: input.bytes,
        },
      });
    }
    const unbound = result.succeeded
      .filter((t) => (t.bound ?? 0) === 0 && (t.failedProducts?.length ?? 0) === 0)
      .map((t) => t.store.label);
    const bound = result.succeeded.reduce((n, t) => n + (t.bound ?? 0), 0);
    // A product that refused the template (deleted or archived since it was
    // linked) is named by title, with the fix: unlink it.
    const titleOf = (domain: string, id: string) =>
      links.find((l) => l.store.domain === domain && l.productGid === id)?.productTitle ?? id;
    const refused = result.succeeded.flatMap((t) =>
      (t.failedProducts ?? []).map((f) => `"${titleOf(t.store.domain, f.id)}" em ${t.store.label}`),
    );
    const failed = result.failed;
    const summary =
      `Modelo de produto publicado em ${result.succeeded.length} loja(s), aplicado a ${bound} produto(s).` +
      (unbound.length > 0
        ? ` Em ${unbound.join(', ')} nenhum produto está vinculado ainda — vincule em Configurações da página → Produtos vinculados.`
        : '') +
      (refused.length > 0
        ? ` Não aceitou o modelo: ${refused.join('; ')} — o produto pode ter sido excluído ou arquivado; desvincule em Configurações da página → Produtos vinculados.`
        : '');
    return {
      ok: failed.length === 0 && refused.length === 0,
      saved: true,
      message:
        (failed.length === 0
          ? summary
          : `${summary} ${failed.length} com erro: ${failed.map((f) => `${f.store.label} — ${f.error}`).join('; ')}`) +
        input.retiredNote,
      urls: result.succeeded.flatMap((t) =>
        links
          .filter((l) => l.store.domain === t.store.domain && !t.failedProducts?.some((f) => f.id === l.productGid))
          .map((l) => `https://${t.store.domain}/products/${l.productHandle}`),
      ),
    };
  } catch (error) {
    if (error instanceof ProductionNotAllowedError) {
      return { ok: false, saved: true, message: error.message, needsProductionConfirm: true };
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

/** Blocks in the document, containers included. */
const countBlocks = (nodes: DocNode[]): number =>
  nodes.reduce((n, node) => n + 1 + (node.children ? countBlocks(node.children) : 0), 0);

/** Accent-insensitive "contains", for the element search. */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matchesQuery = (label: string, query: string) => !query.trim() || fold(label).includes(fold(query.trim()));

interface PreviewStats {
  bytes: { html: number; css: number; js: number; total: number };
  htmlOptimization: { inlineStylesKept: number; remRebased?: number };
  cssRules: number;
  /** Images across the page: how many, how many served responsively, and the one fetched first. */
  images?: { total: number; responsive: number; lcp: string | null };
  /** What a `rem` in pasted HTML was worth in this build (the theme's root, or 16). */
  rootPx?: number;
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

  const shop = data.shop;
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
  // "Como usar": a popover from the "?" button any time, and — on the first
  // visit of this browser — laid out inside the empty inspector, where it
  // covers nothing and stays until the person says "Entendi". A guide that
  // never shows is a guide nobody reads; one that hides the controls is worse.
  const [showHelp, setShowHelp] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('dvfly:help-seen')) setFirstVisit(true);
    } catch {
      // No storage: the guide stays a click away.
    }
  }, []);
  const dismissGuide = () => {
    setFirstVisit(false);
    try {
      window.localStorage.setItem('dvfly:help-seen', '1');
    } catch {
      // Fine — it will show again next time.
    }
  };
  // The right-click menu: which block, and where on screen. Focus moves into
  // it when it opens, so Escape and the arrow keys work wherever the click
  // came from (the canvas iframe included), and closes with it.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        if (items.length === 0) return;
        event.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      }
    };
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const [showSettings, setShowSettings] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [uiTheme, toggleUiTheme] = useUiTheme();

  // The store theme's own styling, read from the storefront. It labels the font
  // tokens ("fonte-do-corpo (Helvetica)") and, above all, it is what the canvas
  // renders against: without the theme's stylesheets the preview shows our
  // blocks over the browser's defaults, which is not what the visitor will see.
  const [themeTick, setThemeTick] = useState(0);
  const [themeStyle, setThemeStyle] = useState<ThemeStyleData | null>(null);
  const themeStyleRef = useRef<ThemeStyleData | null>(null);
  // The first canvas write waits for the theme (briefly): written before it,
  // the page would be built twice — once bare, once again with the theme a
  // moment later — and the bare one is a flash of the wrong page. A theme
  // that takes longer than the cap is not worth a blank canvas, though.
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    const cap = setTimeout(() => setThemeReady(true), 1500);
    fetch(`/api/theme-style${shop ? `?shop=${encodeURIComponent(shop)}` : ''}`)
      .then((r) => r.json())
      .then((style: ThemeStyleData) => {
        themeStyleRef.current = style;
        setThemeStyle(style);
        // A canvas already on screen (the cap fired first) was written without
        // the theme; rewrite it by nudging the preview effect.
        setThemeTick((tick) => tick + 1);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(cap);
        setThemeReady(true);
      });
    return () => clearTimeout(cap);
  }, []);

  // Page settings travel as controlled state + hidden inputs, so they reach
  // every save even while the settings drawer is closed (an unmounted field
  // would silently drop its value from the FormData).
  const [handle, setHandle] = useState(data.page.handle);
  const [pageType, setPageType] = useState(data.page.pageType);
  const [showChrome, setShowChrome] = useState(data.page.showChrome);
  const [productContentAbove, setProductContentAbove] = useState(data.page.productContentAbove);
  const [bareLayout, setBareLayout] = useState(data.page.bareLayout);
  // Bare mode is a product-page thing: it only counts while the page is one.
  const bare = pageType === 'product' && bareLayout;

  // "Salvar" only exists while there is something to save — the reference
  // behavior. Dirty is: the document differs from the last saved snapshot, or
  // the title/handle fields were touched.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(data.doc));
  const [metaDirty, setMetaDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const pendingSnapshot = useRef<string | null>(null);
  const dirty = metaDirty || JSON.stringify(doc) !== savedSnapshot;

  // The title and the page settings are the only fields saved outside the
  // document, so only they mark the page dirty — not the store checkboxes,
  // the production confirmation or the product search, which live in the
  // same form and are never saved. Block edits are covered by comparing the
  // document with its saved snapshot, which undo also satisfies.
  // It must be REACT's onInput, not a native listener: a setState fired from a
  // native listener mid-event re-renders before React processes the same
  // event, and the controlled field's first keystroke gets silently reverted.
  const onFormInput = useCallback((event: React.FormEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches?.('[name="title"], [data-settings]')) setMetaDirty(true);
  }, []);

  // A successful save (publishing also saves) resets the dirty tracking to
  // exactly what was submitted. A plain save also confirms itself as a toast
  // over the canvas — where the eye already is — instead of a side banner.
  const [toast, setToast] = useState<string | null>(null);

  // Which stores this publish goes to.
  //
  // It starts ticked where the page already lives plus the store you opened
  // the app from: the screen arrives knowing where it is instead of asking.
  // Controlled (not defaultChecked) because the production confirmation below
  // has to appear and disappear with the selection — a confirmation that is
  // always on screen is one nobody reads.
  const [publishTo, setPublishTo] = useState<string[]>(() =>
    data.stores
      .filter((s) => !s.unusable && (data.deployedStoreIds.includes(s.id) || s.domain === data.shop))
      .map((s) => s.id),
  );

  // The stores this publish would change that are NOT the one you are in, and
  // are production. Exactly these are what the confirmation is for: an empty
  // list means there is nothing to confirm, and no checkbox is drawn.
  const outrasEmProducao = data.stores.filter(
    (s) => publishTo.includes(s.id) && s.isProduction && s.domain !== data.shop,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A short confirmation over the canvas, replacing any that is still up. */
  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => {
    // A publish refused after the save (size, production confirmation, a
    // store out of reach) still saved: the editor must not ask again.
    const saved = result?.ok || (result && 'saved' in result && result.saved);
    if (saved && pendingSnapshot.current !== null) {
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
        // Deleting is instant (reversible); the toast teaches the way back.
        announce(ids.length > 1 ? `${ids.length} blocos excluídos · Ctrl+Z desfaz` : 'Bloco excluído · Ctrl+Z desfaz');
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
    [act, setRoot, select, announce],
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
    if (!themeReady) return;
    // A newer edit cancels this one: whatever this request brings back is
    // stale by then and must not overwrite the canvas or the numbers — and
    // the upload itself is aborted, so a slow uplink is not kept busy
    // sending documents nobody will look at.
    let stale = false;
    const controller = new AbortController();
    const body = JSON.stringify({
      doc,
      // Bare: nothing of the theme is drawn, because nothing of it is published.
      chrome: showChrome && !bare,
      // Where the theme's own product sections sit relative to our content.
      productSections: pageType === 'product' && !bare ? (productContentAbove ? 'below' : 'above') : null,
      // What the theme makes a `rem` worth: pasted HTML is rebased on it here
      // and at publish time alike. Absent until the theme arrives (then
      // `themeTick` rebuilds the canvas with it).
      rootPx: themeStyleRef.current?.rootPx,
    });
    // A big document (a pasted landing page) is where people type fastest
    // and where each rebuild of the canvas costs most; it waits a bit longer
    // for the typing to pause.
    const delay = body.length > 30_000 ? 600 : 250;
    const timer = setTimeout(async () => {
      let payload: { fragment?: string; stats?: PreviewStats; findings?: { message: string }[]; error?: string };
      try {
        const response = await fetch(`/api/preview/${data.page.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        payload = await response.json();
        if (!response.ok) payload.stats = undefined;
      } catch {
        if (controller.signal.aborted) return;
        payload = { error: 'Sem resposta do servidor de pré-visualização.' };
      }
      if (stale) return;
      // A refusal (document too large, server down) is reported in the
      // findings list; the editor and the unsaved work stay put.
      if (!payload.stats || typeof payload.fragment !== 'string') {
        setLive((prev) => ({ ...prev, findings: [{ message: payload.error ?? 'Pré-visualização indisponível agora.' }] }));
        return;
      }
      setLive({ stats: payload.stats, findings: payload.findings ?? [] });
      const target = frame.current?.contentDocument;
      if (target) {
        target.open();
        // The theme first, exactly as the storefront loads it: its stylesheets
        // and its settings block, then our compiled page. Same order as the
        // real thing, so the same cascade decides.
        target.write(themeHead(themeStyleRef.current) + payload.fragment);
        target.close();
        // Re-apply the CURRENT selection to the fresh document — read from
        // the ref, since the person may have clicked elsewhere meanwhile.
        const ids = selectionRef.current;
        const primary = ids.length > 0 ? ids[ids.length - 1] : null;
        frame.current?.contentWindow?.postMessage(
          {
            type: 'dvf:selected',
            id: primary,
            ids,
            label: nameOf(primary ? findNode(doc.root, primary) : null),
          },
          '*',
        );
      }
    }, delay);
    return () => {
      stale = true;
      controller.abort();
      clearTimeout(timer);
    };
    // `themeTick` re-renders the canvas once the theme's styling arrives.
  }, [doc, data.page.id, showChrome, pageType, productContentAbove, bare, themeTick, themeReady]);

  // Canvas → editor: clicks, drops and toolbar actions arrive as messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only the canvas may drive the editor — not any window that got a
      // reference to this one.
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message) return;
      if (message.type === 'dvf:select') {
        select(message.id ?? null, message.additive === true);
        // A click in the canvas never reaches this window's listeners.
        setMenu(null);
      }
      if (message.type === 'dvf:move') {
        setRoot(relocateNode(doc.root, message.id, message.targetId, message.position));
      }
      if (message.type === 'dvf:key') {
        if (message.key === 'undo') undo();
        else if (message.key === 'redo') redo();
        else if (message.key === 'escape') setMenu(null);
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
          announce('Bloco excluído · Ctrl+Z desfaz');
        }
      }
      // Right-click inside the canvas: select the block and open the menu at
      // the pointer, translating the iframe's coordinates to the window's.
      if (message.type === 'dvf:context') {
        const rect = frame.current?.getBoundingClientRect();
        select(message.id);
        setMenu({ id: message.id, x: (rect?.left ?? 0) + message.x, y: (rect?.top ?? 0) + message.y });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [doc, setRoot, undo, redo, shortcutAction, select, announce]);

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
  const published = data.liveStoreIds.length > 0;
  // A live product page with no product linked yet has nowhere to be seen.
  const liveOffReason =
    published && data.liveUrls.length === 0
      ? 'Vincule um produto em Configurações da página para ver no ar'
      : 'Disponível depois de publicar';
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

  // Where the next block lands, said before the click: inside a selected
  // container, right after any other selected block, at the end otherwise.
  const insertionNote = !selectedNode
    ? 'Entra no fim da página. Selecione um bloco para inserir perto dele.'
    : CONTAINER_TYPES.has(selectedNode.type) && selectedNode.type !== 'tabs'
      ? `Entra dentro de «${nameOf(selectedNode)}».`
      : `Entra logo depois de «${nameOf(selectedNode)}».`;

  /** Everything the right-click menu can do with one block. */
  const menuNode = menu ? findNode(doc.root, menu.id) : null;
  const menuActions: Array<{ key: string; label: string; icon: IconName; hint?: string; danger?: boolean; run: () => void }> = menuNode
    ? [
        { key: 'up', label: 'Subir', icon: 'arrowUp', run: () => setRoot(moveNode(doc.root, menuNode.id, -1)) },
        { key: 'down', label: 'Descer', icon: 'arrowDown', run: () => setRoot(moveNode(doc.root, menuNode.id, 1)) },
        { key: 'duplicate', label: 'Duplicar', icon: 'duplicate', hint: 'Ctrl+D', run: () => setRoot(duplicateNode(doc.root, menuNode.id)) },
        {
          key: 'hide',
          label: menuNode.hidden ? 'Mostrar na página' : 'Esconder da página',
          icon: menuNode.hidden ? 'eye' : 'eyeOff',
          hint: 'não publica',
          run: () => setRoot(toggleHidden(doc.root, menuNode.id)),
        },
        { key: 'edit', label: 'Editar conteúdo', icon: 'edit', run: () => setTab('geral') },
        { key: 'style', label: 'Editar estilo', icon: 'brush', run: () => setTab('estilo') },
        {
          key: 'delete',
          label: 'Excluir',
          icon: 'trash',
          hint: 'Delete',
          danger: true,
          run: () => {
            setRoot(removeNode(doc.root, menuNode.id));
            select(null);
            announce('Bloco excluído · Ctrl+Z desfaz');
          },
        },
      ]
    : [];

  return (
    <form
      ref={form}
      method="post"
      autoComplete="off"
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
      <input type="hidden" name="productContentAbove" value={productContentAbove ? 'on' : 'off'} />
      <input type="hidden" name="bareLayout" value={bareLayout ? 'on' : 'off'} />

      {/* ---- top bar ------------------------------------------------------ */}
      <header style={topBar}>
        <div style={topLeft}>
          <Link
            to={`/app${shopSearch(location.search)}`}
            className="dv-btn dv-plain dv-icon-btn"
            aria-label="Voltar para páginas"
            title="Voltar para a lista de páginas"
          >
            <Icon name="back" />
          </Link>
          {/* A marca cheia tem 25 losangos e vira poeira a 22 px; aqui vai a
              simplificação de 3×3 — o mesmo desenho, legível pequeno. */}
          <img src="/favicon.svg" alt="" width={22} height={22} style={{ marginLeft: 2 }} />
          <input name="title" defaultValue={data.page.title} style={titleInput} aria-label="Título da página" />
          <span style={published ? pillSuccess : pillNeutral} data-status>
            {published ? 'publicada' : 'rascunho'}
          </span>
        </div>

        <div style={topCenter}>
          <div style={deviceGroup} role="group" aria-label="Largura da pré-visualização">
            {DEVICES.map((d, i) => (
              <button
                key={d.label}
                type="button"
                title={d.label}
                aria-label={d.label}
                aria-pressed={i === device}
                data-device={d.icon}
                onClick={() => setDevice(i)}
                style={i === device ? deviceActive : deviceIdle}
              >
                {deviceIcon(d.icon)}
              </button>
            ))}
          </div>
          <span style={widthReadout} title="Largura da pré-visualização">
            {width === 0 ? 'largura total' : `${width} px`}
          </span>
        </div>

        <div style={topRight}>
          <button
            type="button"
            className="dv-btn dv-plain dv-icon-btn"
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            disabled={history.current.past.length === 0}
            onClick={undo}
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="dv-btn dv-plain dv-icon-btn"
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
            disabled={history.current.future.length === 0}
            onClick={redo}
          >
            <Icon name="redo" />
          </button>
          <span style={topDivider} aria-hidden="true" />
          <button
            type="button"
            className="dv-btn dv-plain"
            title="Abre a página compilada numa aba nova, sem o editor"
            onClick={() => openWithToken(`/preview/${data.page.id}`)}
          >
            <Icon name="eye" />
            Pré-visualizar
          </button>
          {data.liveUrls.length > 0 ? (
            <a href={data.liveUrls[0]} target="_blank" rel="noreferrer" className="dv-btn dv-plain" title="Abre a página publicada na loja">
              <Icon name="external" />
              Ver no ar
            </a>
          ) : (
            // Disabled, not hidden: the person learns the function exists and
            // exactly why it is unavailable right now.
            <span className="dv-btn dv-plain" aria-disabled="true" title={liveOffReason}>
              <Icon name="external" />
              Ver no ar
            </span>
          )}
          <span style={topDivider} aria-hidden="true" />
          {busy ? (
            <button type="button" disabled className="dv-btn dv-primary">
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
              <span style={unsavedNote}>
                <span style={unsavedDot} aria-hidden="true" />
                Alterações não salvas
              </span>
              <button
                type="button"
                className="dv-btn dv-secondary"
                onClick={() => {
                  if (confirmingDiscard) window.location.reload();
                  else setConfirmingDiscard(true);
                }}
                onBlur={() => setConfirmingDiscard(false)}
              >
                {confirmingDiscard ? 'Descartar mesmo?' : 'Descartar'}
              </button>
              <button type="button" className="dv-btn dv-primary" onClick={() => act('save')}>
                Salvar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => act('publish')} className="dv-btn dv-primary">
              Publicar
            </button>
          )}
        </div>
      </header>

      {/* ---- rail: one panel at a time on the left ------------------------ */}
      <nav style={rail} aria-label="Painéis do editor">
        <button
          type="button"
          className="dv-rail-btn"
          data-on={!showSettings && !showHelp ? true : undefined}
          title="Elementos e estrutura da página"
          aria-label="Construir"
          onClick={() => {
            setShowSettings(false);
            setShowHelp(false);
          }}
        >
          <Icon name="elements" size={18} />
          <span className="dv-sr">Construir</span>
        </button>
        <button
          type="button"
          className="dv-rail-btn"
          data-on={showSettings ? true : undefined}
          title="Configurações da página: URL, tipo, produtos vinculados, cabeçalho e rodapé"
          aria-label="Configurações da página"
          onClick={() => {
            setShowSettings(true);
            setShowHelp(false);
          }}
        >
          <Icon name="settings" size={18} />
          <span className="dv-sr">Configurações</span>
        </button>
        <button
          type="button"
          className="dv-rail-btn"
          data-on={showHelp ? true : undefined}
          data-help-toggle
          title="Como usar o editor"
          aria-label="Como usar o editor"
          onClick={() => {
            setShowHelp((v) => !v);
            setShowSettings(false);
          }}
        >
          <Icon name="help" size={18} />
          <span className="dv-sr">Ajuda</span>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="dv-rail-btn"
            data-on={showKeys ? true : undefined}
            title="Atalhos de teclado"
            aria-label="Atalhos de teclado"
            onClick={() => setShowKeys((v) => !v)}
          >
            <Icon name="keyboard" size={18} />
          </button>
          {showKeys ? (
            <div style={keysPanel}>
              <div style={{ ...panelTitle, marginBottom: 8 }}>Atalhos de teclado</div>
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
        </div>
        <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} className="dv-rail-btn" />
      </nav>

      {/* ---- left: structure + elements, or the guide -------------------- */}
      {!showSettings ? (
        <aside style={leftPanel}>
          {showHelp ? (
            <div style={panelScroll} data-help-panel>
              <div style={panelHead}>
                <div style={panelTitle}>Como usar o editor</div>
                <button type="button" className="dv-btn dv-plain dv-icon-btn" aria-label="Fechar" title="Fechar o guia" onClick={() => setShowHelp(false)}>
                  <Icon name="close" />
                </button>
              </div>
              <div style={panelBody}>
                {HELP.map((item) => (
                  <div key={item.title} style={helpRow}>
                    <strong>{item.title}</strong>
                    <span style={{ color: 'var(--dv-ink-2)' }}>{item.text}</span>
                  </div>
                ))}
                <div style={{ ...metaLine, marginTop: 8 }}>
                  Dúvida num botão? Deixe o mouse em cima: todos explicam o que fazem.
                </div>
              </div>
            </div>
          ) : (
            <>
              <section style={treeSection}>
                <div style={panelHead}>
                  <div style={panelTitle}>Estrutura</div>
                  <span style={panelCount}>{countBlocks(doc.root)} {countBlocks(doc.root) === 1 ? 'bloco' : 'blocos'}</span>
                </div>
                <div style={treeScroll}>
                  {doc.root.length === 0 ? (
                    <div style={{ ...metaLine, padding: '4px 8px' }}>Página vazia. Adicione um elemento abaixo.</div>
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
                      onContext={(id, x, y) => {
                        select(id);
                        setMenu({ id, x, y });
                      }}
                    />
                  )}
                </div>
              </section>

              <section style={paletteSection}>
                <div style={panelHead}>
                  <div style={panelTitle}>Elementos</div>
                  <span style={countPill} title="Blocos disponíveis">
                    D&VFly {PALETTE_COUNT}
                  </span>
                </div>
                <div style={searchWrap}>
                  <Icon name="search" style={searchIcon} />
                  <input
                    className="dv-input"
                    style={searchInput}
                    placeholder="Buscar elemento"
                    aria-label="Buscar elemento"
                    value={paletteQuery}
                    onChange={(e) => setPaletteQuery(e.target.value)}
                    data-palette-search
                  />
                </div>
                <div style={paletteScroll}>
                  {PALETTE_GROUPS.map((group) => {
                    const types = group.types.filter((type) => matchesQuery(BLOCK_LABELS[type] ?? type, paletteQuery));
                    if (types.length === 0) return null;
                    return (
                      <div key={group.name} style={{ marginBottom: 10 }}>
                        <div style={paletteGroupLabel}>{group.name}</div>
                        <div style={paletteGrid}>
                          {types.map((type) => (
                            <button
                              key={type}
                              type="button"
                              className="dv-card-btn"
                              data-palette={type}
                              title={`Adicionar ${BLOCK_LABELS[type] ?? type}`}
                              onClick={() => addBlock(type)}
                            >
                              <Icon name={BLOCK_ICONS[type] ?? 'section'} size={18} />
                              <span>{BLOCK_LABELS[type]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {PALETTE_GROUPS.every((g) => g.types.every((t) => !matchesQuery(BLOCK_LABELS[t] ?? t, paletteQuery))) ? (
                    <div style={metaLine}>Nenhum elemento com esse nome.</div>
                  ) : null}
                  <div style={{ ...metaLine, marginTop: 2 }} data-insertion-note>
                    {insertionNote}
                  </div>
                </div>
              </section>
            </>
          )}
        </aside>
      ) : null}

      {/* ---- center: canvas ----------------------------------------------- */}
      <main style={canvas}>
        <div style={crumbBar}>
          {crumbs.length === 0 ? (
            <span style={{ color: 'var(--dv-ink-3)' }}>Nenhum elemento selecionado — clique num bloco para editar</span>
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
        {menu && menuNode ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Ações de ${nameOf(menuNode)}`}
            style={{ ...contextMenu, left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 270) }}
            data-context-menu
            onClick={(event) => event.stopPropagation()}
          >
            <div style={contextTitle}>{nameOf(menuNode)}</div>
            {menuActions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                style={{ ...contextItem, ...(action.danger ? { color: 'var(--dv-danger)' } : {}) }}
                data-menu-action={action.key}
                onClick={() => {
                  action.run();
                  setMenu(null);
                }}
              >
                <Icon name={action.icon} />
                <span>{action.label}</span>
                {action.hint ? <span style={contextHint}>{action.hint}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <div style={statusBar}>
          Total {kb(live.stats.bytes.total)} ·{' '}
          {((live.stats.bytes.total / (pageType === 'product' ? TEMPLATE_LIMIT_BYTES : PAGE_BODY_LIMIT_BYTES)) * 100).toFixed(1)}%
          do teto da Shopify ({pageType === 'product' ? `${kb(TEMPLATE_LIMIT_BYTES)}, seção do tema` : `${kb(PAGE_BODY_LIMIT_BYTES)}, corpo da página`})
          {live.stats.bytes.total > BUDGET_BYTES ? (
            // Shopify's ceiling is not the visitor's: above our own budget the
            // page is heavy for a phone long before Shopify refuses it.
            <span style={{ color: 'var(--dv-warning-ink, #8a6116)' }} data-budget-warning>
              {' '}· pesada para celular: acima de {kb(BUDGET_BYTES)}
            </span>
          ) : null}
          · {live.stats.cssRules} regras de CSS
          {live.stats.rootPx && live.stats.rootPx !== 16 && live.stats.htmlOptimization.remRebased ? (
            // Said only when it changes something: pasted HTML with `rem`, on a
            // theme whose root is not the browser's. Sizes follow the theme.
            <span data-rem-stat>
              {' '}· 1 rem = {live.stats.rootPx} px, como no tema da loja
            </span>
          ) : null}
          {live.stats.images && live.stats.images.total > 0 ? (
            // Counted from the compiled page, blocks and pasted HTML alike.
            <span data-images-stat>
              {' '}· {live.stats.images.total} {live.stats.images.total === 1 ? 'imagem' : 'imagens'},{' '}
              {live.stats.images.responsive} no CDN da Shopify com tamanho por tela
              {live.stats.images.lcp ? ' · a primeira carrega antes de tudo' : ''}
            </span>
          ) : null}
        </div>
      </main>

      {/* ---- right: inspector + publish ----------------------------------- */}
      <aside style={rightPanel}>
        {result && result.message !== 'Salvo.' ? (
          <div style={{ padding: '12px 12px 0' }}>
            <div style={result.ok ? bannerOk : bannerErr} data-result>
              <div style={{ fontWeight: 600 }}>{result.message}</div>
              {('urls' in result ? result.urls : undefined)?.map((url: string) => (
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

        <section style={inspectorSection}>
          {selectedNode ? (
            <>
              {selection.length > 1 ? (
                <div style={multiNote} data-multi-note>
                  <strong>{selection.length} blocos selecionados.</strong> Excluir, Duplicar e
                  Colar estilo valem para todos; os campos abaixo editam o último clicado.
                </div>
              ) : null}
              <div style={inspectorHead}>
                <span style={inspectorIcon}>
                  <Icon name={BLOCK_ICONS[selectedNode.type] ?? 'section'} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={panelTitle}>{BLOCK_LABELS[selectedNode.type] ?? selectedNode.type}</div>
                  {String(selectedNode.props?.name ?? '') ? (
                    <div style={{ ...metaLine, padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(selectedNode.props?.name)}
                    </div>
                  ) : null}
                </div>
              </div>
              {/* Every action, named. Icons alone were the first thing people
                  could not decode; the shortcut rides in the tooltip. */}
              <div style={actionBar} data-actions>
                <button type="button" className="dv-btn dv-plain" style={actionButton} title="Subir uma posição" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, -1))}>
                  <Icon name="arrowUp" />
                  Subir
                </button>
                <button type="button" className="dv-btn dv-plain" style={actionButton} title="Descer uma posição" onClick={() => setRoot(moveNode(doc.root, selectedNode.id, 1))}>
                  <Icon name="arrowDown" />
                  Descer
                </button>
                <button type="button" className="dv-btn dv-plain" style={actionButton} title="Duplicar (Ctrl+D) — vale para todos os selecionados" onClick={() => shortcutAction('duplicate')}>
                  <Icon name="duplicate" />
                  Duplicar
                </button>
                <button
                  type="button"
                  className="dv-btn dv-plain"
                  style={actionButton}
                  title={selectedNode.hidden ? 'Voltar a mostrar este bloco na página' : 'Esconder da página publicada sem apagar'}
                  data-action-hide
                  onClick={() => setRoot(toggleHidden(doc.root, selectedNode.id))}
                >
                  <Icon name={selectedNode.hidden ? 'eye' : 'eyeOff'} />
                  {selectedNode.hidden ? 'Mostrar' : 'Esconder'}
                </button>
                <button
                  type="button"
                  className="dv-btn dv-plain"
                  data-danger
                  style={actionButton}
                  title="Excluir (Delete) — Ctrl+Z desfaz"
                  data-action-delete
                  onClick={() => shortcutAction('delete')}
                >
                  <Icon name="trash" />
                  Excluir
                </button>
              </div>
              <div style={{ ...metaLine, marginBottom: 6 }}>
                Para mover, arraste na Estrutura ou pelo nome na barra do canvas. Botão direito
                num bloco abre este menu.
              </div>
              <div style={tabRow} role="tablist">
                <button type="button" className="dv-tab" role="tab" data-on={tab === 'geral' ? true : undefined} aria-selected={tab === 'geral'} onClick={() => setTab('geral')}>
                  <Icon name="edit" />
                  Geral
                </button>
                <button
                  type="button"
                  className="dv-tab"
                  role="tab"
                  data-on={tab === 'estilo' ? true : undefined}
                  aria-selected={tab === 'estilo'}
                  title="O Estilo é por dispositivo — o ícone mostra qual está sendo editado"
                  onClick={() => setTab('estilo')}
                >
                  <Icon name="brush" />
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
                                aria-label="Duplicar aba"
                                style={{ ...tabItemOp, color: active ? 'var(--dv-invert-ink)' : 'var(--dv-ink-2)' }}
                                onClick={() => setRoot(duplicateNode(doc.root, child.id))}
                              >
                                <Icon name="duplicate" size={14} />
                              </button>
                              <button
                                type="button"
                                title="Excluir aba"
                                aria-label="Excluir aba"
                                style={{ ...tabItemOp, color: active ? 'var(--dv-invert-ink)' : 'var(--dv-danger)' }}
                                onClick={() => {
                                  setRoot(removeNode(doc.root, child.id));
                                  if (active) select(tabsNode.id);
                                }}
                              >
                                <Icon name="trash" size={14} />
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
                          key={selectedNode.id}
                          node={selectedNode}
                          onChange={(patch) => setRoot(updateProps(doc.root, selectedNode.id, patch))}
                        />
                      ) : null}
                    </>
                  ) : (
                    // Keyed by block: the fields of one block never linger
                    // into the next one selected (an uncontrolled textarea
                    // would keep its text).
                    <Inspector
                      key={selectedNode.id}
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
                  themeFonts={themeStyle}
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
              <div style={emptyInspector}>
                <span style={emptyIcon}>
                  <Icon name="elements" size={20} />
                </span>
                <div style={panelTitle}>Nenhum elemento selecionado</div>
                <div style={metaLine}>
                  Clique num bloco no canvas ou na Estrutura para editar o conteúdo e o estilo
                  dele aqui. Para começar uma página, use <strong>Elementos</strong>, à esquerda.
                </div>
              </div>
              {firstVisit ? (
                <div style={{ marginTop: 14 }} data-help-inline>
                  <div style={{ ...panelTitle, marginBottom: 4 }}>Como usar o editor</div>
                  {HELP.map((item) => (
                    <div key={item.title} style={helpRow}>
                      <strong>{item.title}</strong>
                      <span style={{ color: 'var(--dv-ink-2)' }}>{item.text}</span>
                    </div>
                  ))}
                  <button type="button" className="dv-btn dv-secondary" style={{ marginTop: 10, width: '100%' }} onClick={dismissGuide} data-help-dismiss>
                    Entendi — não mostrar de novo
                  </button>
                  <div style={{ ...metaLine, marginTop: 4 }}>O botão de ajuda, no trilho à esquerda, traz este guia de volta.</div>
                </div>
              ) : (
                <button
                  type="button"
                  className="dv-btn dv-secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setShowHelp(true);
                    setShowSettings(false);
                  }}
                  data-help-open
                >
                  <Icon name="help" />
                  Como usar o editor
                </button>
              )}
            </>
          )}
        </section>

        <section style={publishSection}>
          <div style={{ ...panelTitle, marginBottom: 8 }}>Publicar em</div>
          {data.stores.length === 0 ? (
            <div style={metaLine}>
              Nenhuma loja registrada ainda. Abra o app pelo admin da Shopify da loja — ela se
              registra sozinha.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.stores.map((store) => (
                <label key={store.id} style={{ ...storeRow, ...(store.unusable ? { opacity: 0.6 } : {}) }}>
                  <input
                    type="checkbox"
                    name="storeIds"
                    value={store.id}
                    disabled={store.unusable ? true : undefined}
                    checked={publishTo.includes(store.id)}
                    onChange={(event) =>
                      setPublishTo((atual) =>
                        event.target.checked
                          ? [...atual, store.id]
                          : atual.filter((id) => id !== store.id),
                      )
                    }
                  />
                  {store.label}
                  {/* O domínio ao lado do nome: dois nomes iguais (duas lojas
                      na Colômbia) só se distinguem por ele. */}
                  <span style={{ ...metaLine, marginLeft: -2 }}>{store.domain}</span>
                  {store.domain === shop ? <span style={pillNeutral}>esta loja</span> : null}
                  {store.isProduction ? <span style={pillDanger}>produção</span> : null}
                  {data.liveStoreIds.includes(store.id) ? <span style={pillSuccess}>no ar</span> : null}
                  {store.unusable ? <span style={metaLine}>— {store.unusable}</span> : null}
                </label>
              ))}
              {outrasEmProducao.length > 0 ? (
                // `storeRow` embrulha (flexWrap) porque uma linha de loja tem
                // pastilhas; aqui isso jogava a caixa para uma linha só dela.
                <label style={{ ...storeRow, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <input type="checkbox" name="allowProduction" value="on" style={{ marginTop: 2 }} />
                  <span>
                    Confirmo publicar também em{' '}
                    {outrasEmProducao.map((s) => `${s.label} (${s.domain})`).join(', ')} — não é a loja onde
                    estou
                  </span>
                </label>
              ) : null}
            </div>
          )}
          {published && !busy ? (
            <button
              type="button"
              className="dv-btn dv-secondary"
              data-unpublish
              style={{ marginTop: 10, width: '100%' }}
              title="Tira a página do ar em todas as lojas; o conteúdo fica guardado"
              onClick={() => act('unpublish')}
            >
              Despublicar
            </button>
          ) : null}
          {live.findings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {live.findings.map((finding, index) => (
                <div key={index} style={findingLine}>
                  <Icon name="alert" size={14} style={{ marginTop: 2 }} />
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </aside>

      {/* ---- page settings: the left panel, in place of the builder ------- */}
      {showSettings ? (
        <div style={settingsPanel} data-settings-drawer>
          <div style={panelHead}>
            <div style={panelTitle}>Configurações da página</div>
            <button
              type="button"
              className="dv-btn dv-plain dv-icon-btn"
              aria-label="Fechar configurações"
              title="Voltar para elementos e estrutura"
              onClick={() => setShowSettings(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div style={panelBody}>

            <div style={{ ...metaLine, margin: '10px 0 14px' }}>
              O título no topo do editor é o <strong>título da página</strong>: aparece na aba do
              navegador e no Google quando ela é publicada.
            </div>

            <label style={fieldLabel}>
              Tipo de página
              <select
                style={fieldInput}
                data-settings="pageType"
                value={pageType}
                onChange={(e) => setPageType(e.target.value)}
              >
                <option value="regular">Normal — página própria em /pages/</option>
                <option value="product">Produto — modelo aplicado a produtos</option>
              </select>
            </label>

            {pageType === 'product' ? (
              <>
                <label style={fieldLabel}>
                  URL da página
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <span style={{ color: 'var(--dv-ink-3)', fontSize: 13 }}>/products/</span>
                    <input
                      style={{ ...fieldInput, marginTop: 0, color: 'var(--dv-ink-3)' }}
                      data-settings="handle"
                      value="(handle do produto)"
                      disabled
                      title="Uma página de produto não tem URL própria"
                    />
                  </span>
                  <span style={{ ...metaLine, display: 'block' }}>
                    Uma página de produto é vista na URL de cada produto vinculado — a URL é
                    a do produto, não da página.
                  </span>
                </label>

                <div style={{ ...groupLabel, marginTop: 14 }}>Produtos vinculados</div>
                <div style={{ ...metaLine, marginBottom: 8 }}>
                  Os produtos vinculados passam a mostrar esta página no lugar do modelo padrão
                  do tema. Vale por loja: produtos são diferentes em cada uma.
                  {data.deployedStoreIds.length === 0
                    ? ' Aplica na primeira publicação.'
                    : ' Numa loja onde a página está no ar, vincular e desvincular vale na hora.'}
                </div>
                {data.stores.map((store) => (
                  <ProductLinks
                    key={store.id}
                    pageId={data.page.id}
                    store={store}
                    links={data.productLinks.filter((l) => l.storeId === store.id)}
                    live={data.liveStoreIds.includes(store.id)}
                  />
                ))}

                {/* Bare mode: our section alone on the minimal layout. The two
                    settings below it stop mattering then — they stay visible,
                    gray, with the reason, so nobody hunts for them. */}
                <div style={{ ...groupLabel, marginTop: 14 }}>Modo leve</div>
                <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    data-settings="bareLayout"
                    checked={bareLayout}
                    onChange={(e) => setBareLayout(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Só a página, sem o tema (padrão)
                    <span style={{ ...metaLine, display: 'block' }}>
                      Publica num modelo mínimo do D&VFly: sem as seções de produto do tema, sem
                      cabeçalho e rodapé, e sem o CSS e o JS que o tema carrega em toda página. Para
                      landing page que traz tudo o que precisa (imagens, preço, botão de compra). Os
                      apps embutidos da loja (formulário de pedido, pixels) continuam. Desligue só se
                      a página precisa das seções de produto do tema. Vale a partir da próxima
                      publicação.
                    </span>
                  </span>
                </label>

                <div style={{ ...groupLabel, marginTop: 14, opacity: bare ? 0.55 : 1 }}>Posição do conteúdo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: bare ? 0.55 : 1 }} data-content-position>
                  {[
                    { value: false, label: 'Abaixo das seções de produto do tema (imagens, preço, comprar)' },
                    { value: true, label: 'Acima das seções de produto do tema' },
                  ].map((option) => (
                    <label key={String(option.value)} style={{ ...fieldLabel, display: 'flex', gap: 8, marginBottom: 0, cursor: bare ? 'default' : 'pointer' }}>
                      <input
                        type="radio"
                        name="content-position"
                        checked={productContentAbove === option.value}
                        disabled={bare || undefined}
                        onChange={() => setProductContentAbove(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <div style={{ ...metaLine, marginTop: 6 }} data-content-position-note>
                  {bare
                    ? 'No modo leve não há seções do tema na página — a posição não se aplica.'
                    : 'As seções do tema continuam lá — e dá para reordenar ou esconder qualquer uma no editor de temas da Shopify depois de publicar.'}
                </div>
              </>
            ) : (
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
            )}

            <div style={{ ...groupLabel, marginTop: 14, opacity: bare ? 0.55 : 1 }}>Seções do tema</div>
            <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'flex-start', opacity: bare ? 0.55 : 1 }}>
              <input
                type="checkbox"
                data-settings="showChrome"
                checked={showChrome && !bare}
                disabled={bare || undefined}
                onChange={(e) => setShowChrome(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                Mostrar cabeçalho e rodapé do tema
                <span style={{ ...metaLine, display: 'block' }} data-chrome-note>
                  {bare
                    ? 'No modo leve o modelo não tem cabeçalho nem rodapé — desligue o modo leve para escolher.'
                    : pageType === 'product'
                    ? 'Desligado (padrão), só ESTA página de produto fica sem o cabeçalho e o rodapé — a loja continua com eles. (Escondê-los no editor de temas tiraria da loja inteira.) As seções de produto do tema continuam iguais. Vale a partir da próxima publicação.'
                    : 'Desligado (padrão), a página é publicada num modelo próprio do D&VFly, sem o cabeçalho e o rodapé da loja e sem o CSS e o JS que o layout do tema carrega — a página mais leve. Ligue só se a página precisa da navegação da loja. A mudança vale a partir da próxima publicação.'}
                </span>
              </span>
            </label>

            <div style={{ ...groupLabel, marginTop: 14 }}>Nome do modelo</div>
            {pageType === 'product' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={templateName} data-template-name>
                    product.{data.productSuffix}
                  </code>
                  <button
                    type="button"
                    style={opButton}
                    title="Copiar o nome do modelo"
                    aria-label="Copiar o nome do modelo"
                    data-copy-template
                    onClick={() => navigator.clipboard?.writeText(`product.${data.productSuffix}`).catch(() => {})}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </div>
                <div style={{ ...metaLine, marginTop: 4 }}>
                  É com este nome que o modelo aparece no editor de temas da Shopify e na
                  configuração de cada produto, depois de publicado.
                </div>
              </>
            ) : (
              <div style={{ ...metaLine, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {showChrome ? 'padrão do tema' : `page.${SOLO_SUFFIX}`}
              </div>
            )}

            {/* The theme editor is where the merchant hides or reorders the
                theme's sections around this page. It only knows the template
                once it exists on the store — so, before publishing, the link
                is gray with the reason, not missing. */}
            <div style={{ ...groupLabel, marginTop: 14 }}>Editor de temas</div>
            <div style={{ ...metaLine, marginBottom: 6 }}>
              Abre o editor de temas da Shopify já neste modelo, para esconder ou reordenar as
              seções do tema em volta do conteúdo. Cada loja tem o seu.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-theme-editor>
              {data.stores.map((store) => {
                const kind = data.liveKinds[store.id];
                if (!kind) {
                  return (
                    <span
                      key={store.id}
                      className="dv-btn dv-plain"
                      aria-disabled="true"
                      title="Disponível depois de publicar nesta loja"
                      style={{ justifyContent: 'flex-start', paddingLeft: 0 }}
                      data-theme-editor-off={store.id}
                    >
                      <Icon name="external" />
                      {store.label} — disponível depois de publicar
                    </span>
                  );
                }
                const firstProduct = data.productLinks.find((l) => l.storeId === store.id);
                const href =
                  kind === 'product'
                    ? themeEditorUrl(store.domain, `product.${data.productSuffix}`, firstProduct ? `/products/${firstProduct.productHandle}` : undefined)
                    : themeEditorUrl(store.domain, showChrome ? 'page' : `page.${SOLO_SUFFIX}`, `/pages/${data.page.handle}`);
                return (
                  <a
                    key={store.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="dv-btn dv-plain"
                    style={{ justifyContent: 'flex-start', paddingLeft: 0, color: 'var(--dv-link)' }}
                    title="Abre o editor de temas da Shopify numa aba nova, neste modelo"
                    data-theme-editor-link={store.id}
                  >
                    <Icon name="external" />
                    Ir para o editor de temas — {store.label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
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
type ProductHit = { id: string; title: string; handle: string; templateSuffix: string | null; imageUrl: string | null };

/**
 * One store's linked products: the current list, and a search over the
 * store's catalogue to add more. Links are their own submissions (a fetcher),
 * independent of the page document — they never dirty the page.
 */
function ProductLinks({
  pageId,
  store,
  links,
  live,
}: {
  pageId: string;
  store: { id: string; label: string; isProduction: boolean; unusable?: string | null };
  links: Array<{ id: string; productGid: string; productHandle: string; productTitle: string }>;
  live: boolean;
}) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // A slower answer to an older query must not land over the newer one.
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products?storeId=${encodeURIComponent(store.id)}&q=${encodeURIComponent(query)}`);
        const payload = (await response.json()) as { products?: ProductHit[]; error?: string };
        if (stale) return;
        setHits(payload.products ?? []);
        setSearchError(payload.error ?? null);
      } catch {
        if (!stale) setSearchError(`Não consegui buscar produtos em ${store.label}.`);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, open, store.id, store.label]);

  const linked = new Set(links.map((l) => l.productGid));
  const submit = (fields: Record<string, string>) => fetcher.submit(fields, { method: 'post' });
  const busy = fetcher.state !== 'idle';

  return (
    <div style={linksBox} data-product-links={store.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{store.label}</strong>
        {store.isProduction ? <span style={pillDanger}>produção</span> : null}
        <span style={{ ...metaLine, marginLeft: 'auto' }} data-link-count>
          {links.length} produto{links.length === 1 ? '' : 's'}
          {live ? ' · no ar' : ''}
        </span>
      </div>
      {store.unusable ? <div style={{ ...metaLine, marginBottom: 6 }}>Sem acesso: {store.unusable}.</div> : null}

      {links.length === 0 ? (
        <div style={{ ...metaLine, marginBottom: 6 }}>Nenhum produto vinculado nesta loja.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {links.map((link) => (
            <div key={link.id} style={linkRow} data-product-link={link.productGid}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {link.productTitle}
                <span style={{ color: 'var(--dv-ink-3)' }}> · /products/{link.productHandle}</span>
              </span>
              <button
                type="button"
                style={{ ...opButton, color: 'var(--dv-danger)' }}
                title="Desvincular — o produto volta ao modelo padrão do tema"
                aria-label={`Desvincular ${link.productTitle}`}
                disabled={busy}
                data-unlink={link.productGid}
                onClick={() => submit({ intent: 'unlink-product', linkId: link.id })}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <>
          <input
            style={{ ...fieldInput, marginTop: 0 }}
            placeholder="Buscar produto pelo nome…"
            value={query}
            autoFocus
            data-product-search={store.id}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchError ? <div style={{ ...metaLine, color: 'var(--dv-danger)' }}>{searchError}</div> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }} data-product-hits>
            {hits.map((hit) => (
              <div key={hit.id} style={linkRow}>
                {hit.imageUrl ? <img src={hit.imageUrl} alt="" width={22} height={22} style={{ borderRadius: 4, objectFit: 'cover' }} /> : null}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hit.title}>
                  {hit.title}
                </span>
                {linked.has(hit.id) ? (
                  <span style={{ ...metaLine, whiteSpace: 'nowrap' }}>vinculado</span>
                ) : (
                  <button
                    type="button"
                    style={paletteButton}
                    disabled={busy}
                    data-link={hit.id}
                    onClick={() =>
                      submit({
                        intent: 'link-product',
                        storeId: store.id,
                        productGid: hit.id,
                        productHandle: hit.handle,
                        productTitle: hit.title,
                      })
                    }
                  >
                    Vincular
                  </button>
                )}
              </div>
            ))}
            {hits.length === 0 && !searchError ? <div style={metaLine}>Nenhum produto encontrado.</div> : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          style={addItemButton}
          data-link-open={store.id}
          disabled={store.unusable ? true : undefined}
          title={store.unusable ? `Sem acesso: ${store.unusable}` : undefined}
          onClick={() => setOpen(true)}
        >
          + Vincular produto
        </button>
      )}

      {fetcher.data ? (
        <div style={{ ...metaLine, color: fetcher.data.ok ? 'var(--dv-accent-text)' : 'var(--dv-danger)' }} data-link-result>
          {fetcher.data.message}
        </div>
      ) : null}
    </div>
  );
}

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
  onContext,
  parentHidden = false,
}: {
  nodes: DocNode[];
  depth: number;
  selectedIds: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onRelocate: (id: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onToggleHidden: (id: string) => void;
  onContext: (id: string, x: number, y: number) => void;
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
      {nodes.map((node) => {
        const off = Boolean(node.hidden) || parentHidden;
        return (
          <div key={node.id}>
            <button
              type="button"
              className="dv-tree-row"
              data-tree-id={node.id}
              data-tree-selected={selectedIds.includes(node.id) || undefined}
              data-tree-hidden={off || undefined}
              draggable
              title="Clique: selecionar · Ctrl+clique: somar à seleção · Arraste: mover · Botão direito: ações"
              onClick={(event) => onSelect(node.id, event.ctrlKey || event.metaKey)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onContext(node.id, event.clientX, event.clientY);
              }}
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
                paddingLeft: 6 + depth * 14,
                ...(off ? treeRowHidden : {}),
                ...hintStyle(node),
              }}
            >
              <span className="dv-tree-tools" style={treeGrip} aria-hidden="true">
                <Icon name="drag" size={12} />
              </span>
              <span style={treeIcon}>
                <Icon name={BLOCK_ICONS[node.type] ?? 'section'} size={14} />
              </span>
              <span data-tree-label style={{ ...treeLabel, ...(off ? { textDecoration: 'line-through' } : {}) }}>
                {String(node.props?.name ?? '') || (BLOCK_LABELS[node.type] ?? node.type)}
              </span>
              {node.type === 'heading' || node.type === 'text' ? (
                <span style={treeHint}>{String(node.props?.text ?? '').slice(0, 18)}</span>
              ) : null}
              <span
                role="button"
                tabIndex={0}
                className="dv-tree-tools"
                data-eye={node.id}
                title={node.hidden ? 'Mostrar este bloco' : 'Esconder este bloco (não sai na página)'}
                aria-label={node.hidden ? 'Mostrar este bloco' : 'Esconder este bloco'}
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
                <Icon name={node.hidden ? 'eyeOff' : 'eye'} size={14} />
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
                onContext={onContext}
                parentHidden={off}
              />
            ) : null}
          </div>
        );
      })}
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
      return <ImageFields p={p} onChange={onChange} />;
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
      return <HtmlFields p={p} onChange={onChange} />;
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
/** True for an address the browser can be asked to load: absolute, protocol-relative or a site path. */
const carregavel = (src: string) => /^(?:https?:)?\/\//i.test(src) || src.startsWith('/');

/**
 * The image block's fields, plus the two things a fast page needs and nobody
 * types by hand.
 *
 * The real size is measured the moment an address is pasted — the browser
 * loads the picture and reports it — and written into width/height when they
 * are empty. It is what keeps the page from jumping when the image arrives,
 * and what lets the compiler cap the sizes it asks the CDN for. Ten images
 * on the first live page had none, because the fields were manual.
 *
 * "Carregar primeiro" is for an image that sits above the fold but is not
 * the page's first: the first one already loads first on its own.
 */
function ImageFields({
  p,
  onChange,
}: {
  p: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const src = String(p.src ?? '').trim();
  const semTamanho = !p.width || !p.height;
  const [medida, setMedida] = useState<{ src: string; w: number; h: number } | 'erro' | null>(null);
  // The latest onChange, so the fill-in effect never closes over a stale one.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!carregavel(src)) {
      setMedida(null);
      return;
    }
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (vivo) setMedida({ src, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (vivo) setMedida('erro');
    };
    img.src = src;
    return () => {
      vivo = false;
    };
  }, [src]);

  // Fill in what was measured, once, and only into empty fields: a size the
  // author typed is his.
  useEffect(() => {
    if (medida && medida !== 'erro' && medida.src === src && medida.w > 0 && semTamanho) {
      onChangeRef.current({ width: medida.w, height: medida.h });
    }
  }, [medida, src, semTamanho]);

  const medido = medida && medida !== 'erro' && medida.src === src ? medida : null;

  return (
    <>
      <label style={fieldLabel}>
        URL da imagem
        <input style={fieldInput} data-image-src value={String(p.src ?? '')} onChange={(e) => onChange({ src: e.target.value })} />
      </label>
      <label style={fieldLabel}>
        Texto alternativo
        <input style={fieldInput} value={String(p.alt ?? '')} onChange={(e) => onChange({ alt: e.target.value })} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...fieldLabel, flex: 1 }}>
          Largura
          <input
            style={fieldInput}
            type="number"
            data-image-width
            value={Number(p.width ?? 0) || ''}
            onChange={(e) => onChange({ width: Number(e.target.value) || undefined })}
          />
        </label>
        <label style={{ ...fieldLabel, flex: 1 }}>
          Altura
          <input
            style={fieldInput}
            type="number"
            data-image-height
            value={Number(p.height ?? 0) || ''}
            onChange={(e) => onChange({ height: Number(e.target.value) || undefined })}
          />
        </label>
      </div>
      <div style={metaLine} data-image-medida>
        {medida === 'erro'
          ? 'Não consegui carregar essa imagem para medir — confira o endereço.'
          : medido
            ? `Tamanho real: ${medido.w} × ${medido.h}${semTamanho ? '' : ' · preenchido'}`
            : src
              ? 'Medindo…'
              : 'Cole o endereço: a largura e a altura são medidas sozinhas.'}
      </div>
      <label style={{ ...fieldLabel, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          data-image-eager
          checked={p.eager === true}
          onChange={(e) => onChange({ eager: e.target.checked ? true : undefined })}
        />
        Carregar primeiro (aparece sem rolar a página)
      </label>
      <div style={metaLine}>
        A primeira imagem da página já carrega primeiro sozinha. Marque só outra que o visitante vê
        antes de rolar.
      </div>
    </>
  );
}

/**
 * The HTML block's field, plus "Medir imagens": loads every `<img>` in the
 * markup that lacks width/height and writes the real size into that tag.
 *
 * String edits, never a re-serialised document — `DOMParser` would move a
 * leading `<style>` into a head this fragment does not have, and what the
 * author pastes is what gets published. Attributes are added; nothing else
 * changes. And only on request, with the count said before the click.
 */
function HtmlFields({
  p,
  onChange,
}: {
  p: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const html = String(p.html ?? '');
  const [estado, setEstado] = useState<string | null>(null);
  const [medindo, setMedindo] = useState(false);
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const semTamanho = tags.filter((t) => !/\bwidth\s*=/i.test(t) || !/\bheight\s*=/i.test(t));

  const srcDe = (tagText: string) => {
    const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tagText);
    return (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&').trim();
  };

  const medir = async () => {
    setMedindo(true);
    const tamanhos = new Map<string, { w: number; h: number } | null>();
    await Promise.all(
      [...new Set(semTamanho.map(srcDe))].filter(carregavel).map(
        (src) =>
          new Promise<void>((done) => {
            const img = new Image();
            img.onload = () => {
              tamanhos.set(src, img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
              done();
            };
            img.onerror = () => {
              tamanhos.set(src, null);
              done();
            };
            img.src = src;
          }),
      ),
    );
    let ok = 0;
    let falhou = 0;
    const novo = html.replace(/<img\b[^>]*>/gi, (tagText) => {
      if (/\bwidth\s*=/i.test(tagText) && /\bheight\s*=/i.test(tagText)) return tagText;
      const tamanho = tamanhos.get(srcDe(tagText));
      if (!tamanho) {
        falhou++;
        return tagText;
      }
      ok++;
      const fecha = tagText.endsWith('/>') ? 2 : 1;
      return `${tagText.slice(0, -fecha)} width="${tamanho.w}" height="${tamanho.h}"${tagText.slice(-fecha)}`;
    });
    if (ok > 0) onChange({ html: novo });
    setEstado(
      `${ok} imagem(ns) medida(s)` +
        (falhou > 0 ? ` · ${falhou} não carregou (endereço quebrado ou imagem de exemplo)` : ''),
    );
    setMedindo(false);
  };

  return (
    <>
      <label style={{ ...fieldLabel, flex: 1, display: 'flex', flexDirection: 'column' }}>
        Código
        <textarea
          style={{ ...fieldArea, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}
          spellCheck={false}
          value={html}
          onChange={(e) => {
            setEstado(null);
            onChange({ html: e.target.value });
          }}
        />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="dv-btn dv-secondary"
          data-medir-imagens
          disabled={medindo || semTamanho.length === 0 || undefined}
          title="Carrega cada imagem sem largura/altura e escreve o tamanho real na tag"
          onClick={medir}
        >
          {medindo ? 'Medindo…' : 'Medir imagens'}
        </button>
        <span style={metaLine} data-medir-estado>
          {estado ??
            (tags.length === 0
              ? 'Nenhuma imagem no código.'
              : semTamanho.length === 0
                ? `${tags.length} imagem(ns), todas com largura e altura.`
                : `${semTamanho.length} de ${tags.length} imagem(ns) sem largura/altura — a página pula quando elas chegam.`)}
        </span>
      </div>
    </>
  );
}

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
    const SIDE_NAMES = { top: 'Cima', right: 'Direita', bottom: 'Baixo', left: 'Esquerda' };
    const side = (name: 'top' | 'right' | 'bottom' | 'left', short: string) => (
      <label key={name} style={{ ...fieldLabel, flex: 1, marginBottom: 0 }} title={SIDE_NAMES[name]}>
        <span style={{ fontSize: 11.5, color: 'var(--dv-ink-3)' }}>{short}</span>
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
          {side('top', 'Cima')}
          {side('right', 'Dir.')}
          {side('bottom', 'Baixo')}
          {side('left', 'Esq.')}
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

// ---- layout ----------------------------------------------------------------
//
// Top bar over everything; below it, left to right: the icon rail, one panel
// (structure + elements, the guide, or the page settings), the canvas, the
// inspector. The arrangement follows what page builders taught their users;
// every pixel is drawn here, from scratch, in the D&VFly skin.

const shell: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '56px 1fr',
  gridTemplateColumns: '52px 300px 1fr 340px',
  gridTemplateAreas: `"top top top top" "rail left canvas right"`,
  background: 'var(--dv-sfc)',
  fontFamily: FONT_STACK,
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--dv-ink)',
  zIndex: 10,
};

const topBar: React.CSSProperties = {
  gridArea: 'top',
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  gap: 12,
  padding: '0 12px',
  borderBottom: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  minWidth: 0,
};

const topLeft: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
const topCenter: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'center' };
const topRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, justifySelf: 'end' };

const topDivider: React.CSSProperties = {
  width: 1,
  height: 22,
  background: 'var(--dv-edge)',
  margin: '0 4px',
};

const backLink: React.CSSProperties = {};

const titleInput: React.CSSProperties = {
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 14,
  fontWeight: 600,
  minWidth: 120,
  maxWidth: 360,
  width: '100%',
  background: 'transparent',
  color: 'var(--dv-ink)',
};

const deviceGroup: React.CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  background: 'var(--dv-inset2)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 8,
  padding: 2,
};

const deviceBase: React.CSSProperties = {
  width: 32,
  height: 28,
  border: 0,
  background: 'transparent',
  borderRadius: 6,
  color: 'var(--dv-ink-2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const deviceActive: React.CSSProperties = {
  ...deviceBase,
  background: 'var(--dv-sfc)',
  color: 'var(--dv-ink)',
  boxShadow: 'var(--dv-shadow-soft)',
};
const deviceIdle = deviceBase;

const widthReadout: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--dv-ink-3)',
  fontVariantNumeric: 'tabular-nums',
  minWidth: 84,
};

const historyBase: React.CSSProperties = {
  width: 32,
  height: 32,
  border: 0,
  background: 'transparent',
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const historyOn: React.CSSProperties = { ...historyBase, color: 'var(--dv-ink)', cursor: 'pointer' };
const historyOff: React.CSSProperties = { ...historyBase, color: 'var(--dv-ink-4)', cursor: 'default' };

const liveLink: React.CSSProperties = { color: 'var(--dv-link)', textDecoration: 'none', fontSize: 13 };
const liveLinkOff: React.CSSProperties = { color: 'var(--dv-ink-4)', fontSize: 13, cursor: 'default' };
const unpublishLink: React.CSSProperties = {};
const labeledIconButton: React.CSSProperties = {};

const unsavedNote: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  color: 'var(--dv-warn-text)',
  marginRight: 4,
  whiteSpace: 'nowrap',
};

const unsavedDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: 'var(--dv-warn-edge)',
  boxShadow: '0 0 0 2px var(--dv-warn-tint)',
};

const discardButton: React.CSSProperties = {};
const publishButton: React.CSSProperties = {};

// ---- rail + panels -----------------------------------------------------------

const rail: React.CSSProperties = {
  gridArea: 'rail',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '8px 0',
  borderRight: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
};

const leftPanel: React.CSSProperties = {
  gridArea: 'left',
  borderRight: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const rightPanel: React.CSSProperties = {
  gridArea: 'right',
  borderLeft: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  minHeight: 0,
};

const settingsPanel: React.CSSProperties = {
  gridArea: 'left',
  borderRight: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'auto',
};

const panelHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '10px 12px 6px',
  flexShrink: 0,
};

const panelTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--dv-ink)',
  lineHeight: '20px',
};

const panelCount: React.CSSProperties = { fontSize: 12, color: 'var(--dv-ink-3)' };

const panelBody: React.CSSProperties = { padding: '0 12px 12px' };
const panelScroll: React.CSSProperties = { overflow: 'auto', minHeight: 0, flex: 1 };

const treeSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 40%',
  minHeight: 120,
  borderBottom: '1px solid var(--dv-edge)',
};

const treeScroll: React.CSSProperties = { overflow: 'auto', padding: '0 8px 8px', flex: 1, minHeight: 0 };

const paletteSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 60%',
  minHeight: 0,
};

const paletteScroll: React.CSSProperties = { overflow: 'auto', padding: '4px 12px 12px', flex: 1, minHeight: 0 };

const paletteGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
};

const searchWrap: React.CSSProperties = { position: 'relative', padding: '0 12px 8px', flexShrink: 0 };
const searchIcon: React.CSSProperties = {
  position: 'absolute',
  left: 21,
  top: 8,
  color: 'var(--dv-ink-3)',
  pointerEvents: 'none',
};
const searchInput: React.CSSProperties = { paddingLeft: 30 };

const panelSection: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid var(--dv-edge)',
};

const panelLabel: React.CSSProperties = { ...panelTitle, marginBottom: 8 };

const inspectorSection: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid var(--dv-edge)',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

const publishSection: React.CSSProperties = { padding: 12 };

const inspectorHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
  minWidth: 0,
};

const inspectorIcon: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  background: 'var(--dv-inset2)',
  border: '1px solid var(--dv-edge)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--dv-ink-2)',
  flexShrink: 0,
};

const emptyInspector: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 0',
};

const emptyIcon: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'var(--dv-inset2)',
  border: '1px solid var(--dv-edge)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--dv-ink-2)',
  marginBottom: 4,
};

const opButton: React.CSSProperties = {
  width: 26,
  height: 26,
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

// ---- tree --------------------------------------------------------------------

const treeRow: React.CSSProperties = {};
const treeRowSelected: React.CSSProperties = {};
const treeIcon: React.CSSProperties = {
  display: 'inline-flex',
  color: 'var(--dv-ink-3)',
  width: 16,
  justifyContent: 'center',
  flexShrink: 0,
};
const treeGrip: React.CSSProperties = {
  display: 'inline-flex',
  color: 'var(--dv-ink-4)',
  cursor: 'grab',
  width: 12,
  flexShrink: 0,
};
const treeLabel: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const treeHint: React.CSSProperties = {
  color: 'var(--dv-ink-3)',
  fontWeight: 400,
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
  minWidth: 0,
};

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
  flexShrink: 0,
};
const eyeOff: React.CSSProperties = { color: 'var(--dv-ink-4)' };

// ---- inspector pieces ----------------------------------------------------------

const actionBar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
  marginBottom: 8,
  padding: 4,
  border: '1px solid var(--dv-edge)',
  borderRadius: 8,
  background: 'var(--dv-sfc-sub)',
};

const actionButton: React.CSSProperties = { fontSize: 12.5, padding: '3px 7px' };

const contextMenu: React.CSSProperties = {
  position: 'fixed',
  zIndex: 40,
  minWidth: 220,
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 10,
  boxShadow: 'var(--dv-shadow-pop)',
  padding: 4,
  fontSize: 13,
};

const contextTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dv-ink-3)',
  padding: '6px 10px 4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const contextItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  border: 0,
  background: 'transparent',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--dv-ink)',
  fontSize: 13,
};
const contextHint: React.CSSProperties = { fontSize: 11.5, color: 'var(--dv-ink-3)', marginLeft: 'auto' };

const helpPanel: React.CSSProperties = {};

const helpRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 12.5,
  padding: '7px 0',
  borderBottom: '1px solid var(--dv-edge-soft)',
};

/** The six gestures the editor is made of, in the order people need them. */
const HELP = [
  { title: 'Adicionar um bloco', text: 'Clique num card em Elementos. Ele entra dentro do bloco selecionado (se for Seção ou Pilha) ou logo depois dele; sem seleção, no fim da página.' },
  { title: 'Selecionar', text: 'Clique no bloco, no canvas ou na Estrutura. Ctrl+clique soma à seleção para agir em vários de uma vez.' },
  { title: 'Mover', text: 'Arraste a linha na Estrutura (solte em cima de uma Seção para entrar nela) ou arraste pelo nome na barra do canvas. Ou use Subir / Descer no inspetor.' },
  { title: 'Duplicar e excluir', text: 'Duplicar (Ctrl+D) e Excluir (Delete) ficam no inspetor, na barra do canvas e no menu do botão direito. Ctrl+Z desfaz qualquer coisa.' },
  { title: 'Esconder sem apagar', text: 'O olho na Estrutura tira o bloco da página publicada e o mantém aqui para depois.' },
  { title: 'Salvar e publicar', text: 'Salvar guarda uma versão. Publicar coloca a página no ar nas lojas marcadas em "Publicar em". Configurações da página (no trilho à esquerda) define URL, tipo e produtos vinculados.' },
];

const keysPanel: React.CSSProperties = {
  position: 'absolute',
  left: 48,
  bottom: 0,
  zIndex: 30,
  background: 'var(--dv-sfc)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 10,
  boxShadow: 'var(--dv-shadow-pop)',
  padding: 12,
  width: 260,
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
  padding: '4px 10px',
  fontSize: 12.5,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
};
const animOn: React.CSSProperties = {
  ...animOff,
  background: 'var(--dv-invert-bg)',
  borderColor: 'var(--dv-invert-bg)',
  color: 'var(--dv-invert-ink)',
};

const tabItemsBox: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  borderRadius: 8,
  padding: 4,
  marginBottom: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const tabItemRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  borderRadius: 6,
  padding: '2px 2px 2px 6px',
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
  padding: '4px 4px',
  fontSize: 13,
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const tabItemOp: React.CSSProperties = {
  width: 26,
  height: 26,
  border: 0,
  background: 'transparent',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const addItemButton: React.CSSProperties = {
  ...buttonGhost,
  width: '100%',
  marginTop: 2,
};

const multiNote: React.CSSProperties = {
  background: 'var(--dv-info-bg)',
  color: 'var(--dv-info-ink)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12.5,
  marginBottom: 10,
};

const drawerBackdrop: React.CSSProperties = {};
const drawer: React.CSSProperties = {};

const kbdChip: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 11,
  border: '1px solid var(--dv-edge-strong)',
  borderBottomWidth: 2,
  borderRadius: 5,
  padding: '1px 6px',
  background: 'var(--dv-sfc-sub)',
  color: 'var(--dv-ink-2)',
};

const paletteButton: React.CSSProperties = {
  ...buttonGhost,
  padding: '3px 10px',
  fontSize: 12.5,
};

const metaLine: React.CSSProperties = { fontSize: 12.5, color: 'var(--dv-ink-2)', padding: '2px 0', lineHeight: 1.45 };

const linksBox: React.CSSProperties = {
  border: '1px solid var(--dv-edge)',
  borderRadius: 8,
  padding: 10,
  marginBottom: 8,
};

const linkRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12.5,
  padding: '3px 0',
};

const templateName: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12.5,
  background: 'var(--dv-sfc-sub)',
  border: '1px solid var(--dv-edge)',
  borderRadius: 6,
  padding: '3px 8px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const storeRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer',
  flexWrap: 'wrap',
};

const findingLine: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  fontSize: 12.5,
  color: 'var(--dv-warn-text)',
  background: 'var(--dv-warn-tint)',
  border: '1px solid var(--dv-warn-edge)',
  borderRadius: 8,
  padding: '6px 8px',
  marginBottom: 4,
};

const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  borderBottom: '1px solid var(--dv-edge)',
  marginBottom: 12,
};

const tabBase2: React.CSSProperties = {
  flex: 1,
  border: 0,
  background: 'transparent',
  padding: '8px 10px',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--dv-ink-2)',
  cursor: 'pointer',
};
const tabOn: React.CSSProperties = { ...tabBase2, color: 'var(--dv-ink)', boxShadow: 'inset 0 -2px 0 var(--dv-ink)' };
const tabOff = tabBase2;

const bpRow: React.CSSProperties = { display: 'flex', gap: 4, marginBottom: 4 };
const bpBase: React.CSSProperties = {
  flex: 1,
  border: '1px solid var(--dv-edge)',
  background: 'var(--dv-sfc)',
  borderRadius: 6,
  height: 30,
  cursor: 'pointer',
  color: 'var(--dv-ink-2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  fontSize: 12,
};
const bpOn: React.CSSProperties = {
  ...bpBase,
  background: 'var(--dv-invert-bg)',
  borderColor: 'var(--dv-invert-bg)',
  color: 'var(--dv-invert-ink)',
};
const bpOff = bpBase;

const groupLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--dv-ink-2)',
  margin: '14px 0 6px',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--dv-ink)',
  marginBottom: 10,
};

const fieldInput: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  fontSize: 13,
  lineHeight: '20px',
  padding: '5px 10px',
  border: '1px solid var(--dv-edge-input)',
  borderRadius: 8,
  background: 'var(--dv-sfc)',
  color: 'var(--dv-ink)',
  fontFamily: 'inherit',
  fontWeight: 400,
};

const fieldArea: React.CSSProperties = {
  ...fieldInput,
  minHeight: 90,
  resize: 'vertical',
};

// ---- canvas --------------------------------------------------------------------

const canvas: React.CSSProperties = {
  gridArea: 'canvas',
  background: 'var(--dv-canvas-bg)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  position: 'relative',
};

const toastStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 44,
  transform: 'translateX(-50%)',
  background: 'var(--dv-toast-bg)',
  color: 'var(--dv-toast-ink)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 13,
  boxShadow: 'var(--dv-shadow-pop)',
  zIndex: 20,
  whiteSpace: 'nowrap',
};

const countPill: React.CSSProperties = {
  ...pillNeutral,
  fontSize: 11.5,
};

const paletteGroupLabel: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--dv-ink-3)',
  margin: '6px 0 6px',
};

const crumbBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 14px',
  height: 36,
  fontSize: 12.5,
  color: 'var(--dv-ink-2)',
  background: 'var(--dv-sfc)',
  borderBottom: '1px solid var(--dv-edge)',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const crumbButton: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  padding: '2px 4px',
  borderRadius: 4,
  fontSize: 12.5,
  color: 'var(--dv-ink)',
  cursor: 'pointer',
};

const canvasScroll: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '24px 24px 60px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  minHeight: 0,
};

const canvasPage: React.CSSProperties = {
  background: '#fff',
  borderRadius: 4,
  boxShadow: 'var(--dv-shadow-page)',
  minHeight: 600,
  height: '100%',
  display: 'flex',
  transition: 'width .18s ease',
};

const previewFrame: React.CSSProperties = {
  width: '100%',
  minHeight: 600,
  height: '100%',
  border: 0,
  borderRadius: 4,
  background: '#fff',
  display: 'block',
};

const statusBar: React.CSSProperties = {
  height: 30,
  display: 'flex',
  alignItems: 'center',
  padding: '0 14px',
  fontSize: 11.5,
  color: 'var(--dv-ink-3)',
  background: 'var(--dv-sfc)',
  borderTop: '1px solid var(--dv-edge)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
};
