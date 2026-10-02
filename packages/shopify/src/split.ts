/**
 * A/B split ("Teste A | B"): one product URL that sends each visitor to one
 * of several product pages, by weight, and reports every arrival.
 *
 * How it lives on the store — the same machinery a product page uses, so
 * nothing new has to be trusted:
 *
 *   - the ENTRY product (`/products/piadebanho`) is pointed at a template of
 *     ours through `templateSuffix`, exactly as a D&VFly product page is;
 *   - that template binds a layout of ours whose head carries a small inline
 *     script, placed BEFORE `content_for_header` so it runs on the first bytes
 *     of the response, before Shopify's own head (60 KB of scripts) is even
 *     parsed. The visitor never sees the entry page;
 *   - the script picks a variant by weight, remembers it for that browser
 *     (the same person always sees the same version — otherwise the test
 *     measures nothing), reports the arrival to the app and replaces the URL
 *     with the variant's, keeping the query string (utm_*, fbclid) and hash.
 *
 * When the entry URL is itself version A, the entry renders A's own page
 * with the script added to the head of (a copy of) A's layout: a visitor
 * drawn to A just stays — no second page load — and only the others are
 * redirected. When A's template has no layout to carry the script, A is
 * reached through a redirect to `?view=<its template>` instead (see
 * `ensureSplitTemplate`).
 *
 * What this is NOT: cloaking. The choice is a coin weighted by the
 * percentages and nothing else — no user agent, no IP, no referrer, no
 * platform sniffing. A reviewer, a bot and a buyer go through the same coin.
 *
 * Variants are other PRODUCTS of the store (their own handles), so orders can
 * be attributed by product with no tracking at checkout (see orders.ts).
 */

import { ShopifyError, type ShopifyClient } from './client.ts';
import { deleteProductMetafields, setProductTextMetafields } from './products.ts';
import {
  AB_CANONICAL_METAFIELD,
  canonicalAware,
  deleteThemeFiles,
  mainThemeId,
  readThemeFiles,
  stripJsonComments,
  upsertThemeFiles,
} from './templates.ts';

export interface SplitVariant {
  /** Our variant id; what the click report carries. */
  id: string;
  /** The variant product's handle (`piadebanho1`). */
  handle: string;
  /** Relative weight; 0 keeps the variant in the test but sends nobody to it. */
  weight: number;
  /**
   * Template to render the product with, through Shopify's `?view=`. Set for
   * the version that IS the entry URL ("version A"): the entry product points
   * at the split, so its own page is reached as `?view=<its template>` — same
   * URL, its real content, and no loop (with `view` Shopify renders that
   * template, not the split).
   */
  view?: string;
  /**
   * This variant IS the page the script runs on (the entry showing version A
   * itself): a visitor drawn to it stays, with no redirect.
   */
  stay?: boolean;
}

export interface SplitInput {
  testId: string;
  /** Shown in the theme editor. */
  name: string;
  variants: SplitVariant[];
  /** Where the arrival report goes: this app's public origin + path. */
  hitUrl: string;
}

/** The templateSuffix the entry product is pointed at. */
export const splitSuffix = (testId: string) => `dvfly-ab-${testId.toLowerCase()}`;
const splitLayout = (testId: string) => `theme.${splitSuffix(testId)}`;
const splitFiles = (testId: string) => ({
  layout: `layout/${splitLayout(testId)}.liquid`,
  section: `sections/${splitSuffix(testId)}.liquid`,
  template: `templates/product.${splitSuffix(testId)}.json`,
});

/** Shopify product handles: lowercase letters, digits, hyphens (and unicode letters in some stores). */
const HANDLE = /^[\p{Ll}\p{Lo}\p{N}][\p{Ll}\p{Lo}\p{N}_-]*$/u;
const VARIANT_ID = /^[a-z0-9]+$/i;
/** A template suffix, as `?view=` takes it. */
const VIEW = /^[a-z0-9_-]+$/i;

/** Refuses anything that could break out of the script or the Liquid around it. */
export function validateSplit(input: SplitInput): void {
  if (!VARIANT_ID.test(input.testId)) throw new ShopifyError('Identificador do teste inválido.');
  if (input.variants.length < 2) throw new ShopifyError('Um teste precisa de pelo menos 2 versões.');
  for (const v of input.variants) {
    if (!VARIANT_ID.test(v.id)) throw new ShopifyError(`Identificador de versão inválido: ${v.id}`);
    if (!HANDLE.test(v.handle)) throw new ShopifyError(`Endereço de produto inválido: ${v.handle}`);
    if (v.view !== undefined && !VIEW.test(v.view)) throw new ShopifyError(`Modelo inválido para ${v.handle}: ${v.view}`);
    if (v.stay && v.view !== undefined) throw new ShopifyError(`A versão ${v.handle} não pode ficar na página e redirecionar.`);
    if (!Number.isInteger(v.weight) || v.weight < 0 || v.weight > 100) {
      throw new ShopifyError(`Peso inválido para ${v.handle}: ${v.weight}`);
    }
  }
  if (input.variants.filter((v) => v.stay).length > 1) throw new ShopifyError('Só uma versão pode ser a própria página de entrada.');
  if (!input.variants.some((v) => v.weight > 0)) {
    throw new ShopifyError('Pelo menos uma versão precisa receber visitantes (peso maior que 0).');
  }
  let url: URL;
  try {
    url = new URL(input.hitUrl);
  } catch {
    throw new ShopifyError(`Endereço de contagem inválido: ${input.hitUrl}`);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ShopifyError('O endereço de contagem precisa ser https (a loja é https; o navegador recusaria).');
  }
}

/** JSON safe inside `<script>` and inside `{% raw %}`: no `<`, no `{%`. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\{%/g, '{\\u0025');

/**
 * The script the entry page runs. Plain ES5 on purpose: it runs on every
 * phone that reaches the store, before anything else, and has no second
 * chance.
 *
 * A visitor drawn to the variant that IS this page (`stay`) is counted and
 * left alone. Anyone else is counted and sent on, with the page hidden while
 * the next one loads — otherwise the entry's own page could paint for a
 * moment under a visitor who is about to see another. The page shows again
 * after 3 s if the next one never comes.
 *
 * Counted are ARRIVALS from outside the store: a reload, a back/forward, or
 * a link inside the store to the entry is not one. Otherwise the version
 * that stays on the entry would be counted again on every reload of its
 * page — and the others, whose pages carry no script, never — and its
 * conversion would read lower than it is.
 *
 * Never a loop: a visitor already on `?view=<the template>` of the version
 * drawn is where that version lives; if this script runs there anyway (the
 * template is gone, so Shopify renders the product's own), it stops.
 */
export function splitScript(input: SplitInput): string {
  validateSplit(input);
  const config = {
    t: input.testId,
    e: input.hitUrl,
    v: input.variants.map((v) => ({
      i: v.id,
      h: v.handle,
      w: v.weight,
      ...(v.view ? { q: v.view } : {}),
      ...(v.stay ? { s: 1 } : {}),
    })),
  };
  return `<script>(function(){
var C=${scriptJson(config)};
try{if(/[?&]dvf_ab=off(&|$)/.test(location.search)||window.top!==window.self)return;}catch(e){return;}
var k='dvf_ab_'+C.t,id=null,p=null,f=0,i,t=0,r;
try{id=localStorage.getItem(k);}catch(e){}
for(i=0;i<C.v.length;i++){if(C.v[i].i===id&&C.v[i].w>0)p=C.v[i];}
if(!p){for(i=0;i<C.v.length;i++)t+=C.v[i].w;r=Math.random()*t;
for(i=0;i<C.v.length;i++){if(C.v[i].w>0){p=C.v[i];r-=C.v[i].w;if(r<0)break;}}
f=1;try{localStorage.setItem(k,p.i);}catch(e){}}
var b=JSON.stringify({t:C.t,v:p.i,f:f}),n='',o=false;
try{var g=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];n=g?g.type:['','reload','back_forward'][performance.navigation.type]||'';}catch(e){}
try{o=document.referrer.indexOf(location.protocol+'//'+location.host+'/')===0;}catch(e){}
if(n!=='reload'&&n!=='back_forward'&&!o){try{if(!(navigator.sendBeacon&&navigator.sendBeacon(C.e,b)))fetch(C.e,{method:'POST',body:b,keepalive:true,mode:'no-cors',credentials:'omit'});}catch(e){}}
if(p.s)return;
if(p.q&&new RegExp('[?&]view='+p.q+'(&|$)').test(location.search))return;
try{var d=document.documentElement;d.style.visibility='hidden';setTimeout(function(){d.style.visibility='';},3000);}catch(e){}
var s=location.search;if(p.q)s=(s?s+'&':'?')+'view='+p.q;
location.replace(location.pathname.replace(/\\/products\\/[^\\/]*\\/?$/,'')+'/products/'+p.h+s+location.hash);
})();</script>`;
}

/** First variant that receives visitors: where a browser without JavaScript goes. */
function fallbackHref(input: SplitInput): string {
  const v = input.variants.find((x) => x.weight > 0) ?? input.variants[0];
  return `/products/${v.handle}${v.view ? `?view=${v.view}` : ''}`;
}

/** The entry page's layout: the redirect before Shopify's head, the tags Shopify requires after it. */
export function splitLayoutLiquid(input: SplitInput): string {
  const script = splitScript(input);
  const fallback = fallbackHref(input);
  return `{%- comment -%} Generated by D&VFly for A/B test ${input.testId}: sends each visitor to one variant. Rewritten whenever the test changes. {%- endcomment -%}
<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page_title }}</title>
  {% raw %}${script}<noscript><meta http-equiv="refresh" content="0;url=${fallback}"></noscript>{% endraw %}
  {{ content_for_header }}
</head>
<body style="margin:0">
  {{ content_for_layout }}
</body>
</html>
`;
}

/** What shows if the script never runs: a plain link to the first variant. */
export function splitSectionLiquid(input: SplitInput): string {
  const href = fallbackHref(input);
  const name = Array.from(`D&VFly · A|B · ${input.name.trim()}`).slice(0, 25).join('').trimEnd();
  const schema = { name, settings: [], enabled_on: { templates: ['product'] }, limit: 1 };
  return [
    `{%- comment -%} Generated by D&VFly for A/B test ${input.testId}. {%- endcomment -%}`,
    `<p style="font:16px/1.5 system-ui,sans-serif;text-align:center;padding:48px 16px"><a href="${href}">Continuar</a></p>`,
    '{% schema %}',
    JSON.stringify(schema),
    '{% endschema %}',
    '',
  ].join('\n');
}

export function splitTemplateJson(testId: string): string {
  return JSON.stringify(
    {
      layout: splitLayout(testId),
      sections: { dvfly: { type: splitSuffix(testId), settings: {} } },
      order: ['dvfly'],
    },
    null,
    2,
  );
}

/**
 * What a wrapped layout gets in its head: the script, and — only when nobody
 * stays on this page — the no-JavaScript way out to the first variant.
 */
function splitHeadBlock(input: SplitInput): string {
  const script = splitScript(input);
  const staysHere = input.variants.some((v) => v.stay && v.weight > 0);
  const noscript = staysHere ? '' : `<noscript><meta http-equiv="refresh" content="0;url=${fallbackHref(input)}"></noscript>`;
  return `{%- comment -%} D&VFly: A/B test ${input.testId} — picks this visitor's version before the page loads. {%- endcomment -%}\n{% raw %}${script}${noscript}{% endraw %}`;
}

const CONTENT_FOR_HEADER = /\{\{-?\s*content_for_header\s*-?\}\}/;

/**
 * A layout with the split's head block added as early as it can go: right
 * after `<meta charset>` (the charset must stay in the first bytes), else
 * right after `<head>`, and in any case BEFORE `content_for_header` — Shopify
 * sends everything above that tag first, while it still renders the rest.
 * Null when the layout has no `content_for_header` (not a page layout).
 */
export function wrapLayout(layout: string, block: string): string | null {
  const header = layout.search(CONTENT_FOR_HEADER);
  if (header < 0) return null;
  const before = layout.slice(0, header);
  const charset = /<meta\b[^>]*\bcharset\b[^>]*>/i.exec(before);
  const head = /<head\b[^>]*>/i.exec(before);
  const at = charset ? charset.index + charset[0].length : head ? head.index + head[0].length : header;
  return `${layout.slice(0, at)}\n${block}\n${layout.slice(at)}`;
}

/** How the entry shows version A: on its own page ("stay") or through `?view=` ("view"). */
export type EntryMode = 'stay' | 'view';

export interface SplitPlan extends SplitInput {
  /**
   * The variant that is the entry URL itself (version A), and the template
   * its page had before the test (null: the theme's default product template).
   */
  entry?: { variantId: string; template: string | null };
}

/** Liquid in A's layout that decides by the template's NAME, which on the entry is ours. */
const TEMPLATE_NAME_BRANCH = /\btemplate\.suffix\b|\btemplate\s*(?:==|!=)\s*['"]product\./;

/** Removes what the split added to a layout copy, to compare it with the original. */
const unwrap = (copy: string) =>
  copy
    .replace(/^\{%- comment -%\} Generated by D&VFly for A\/B test [^\n]*\n/, '')
    .replace(/\n\{%- comment -%\} D&VFly: A\/B test [\s\S]*?\{% endraw %\}\n/, '');

/** A's template as the theme has it: its own, or the default when its own is gone. */
async function readEntryTemplate(client: ShopifyClient, themeId: string, template: string | null) {
  const own = template ? `templates/product.${template}` : 'templates/product';
  const [json, liquid] = await readThemeFiles(client, themeId, [`${own}.json`, `${own}.liquid`]);
  if (json !== null || liquid !== null || !template) return { base: own, json, liquid, missing: false };
  // A product whose template is gone renders the default one: so does A.
  const [defJson, defLiquid] = await readThemeFiles(client, themeId, ['templates/product.json', 'templates/product.liquid']);
  return { base: 'templates/product', json: defJson, liquid: defLiquid, missing: true };
}

/**
 * Tries the entry-as-A page: the entry's own template, bound to a copy of its
 * layout that carries the split. Writes nothing and says why when it cannot.
 */
async function wrapEntry(
  client: ShopifyClient,
  themeId: string,
  plan: SplitPlan & { entry: NonNullable<SplitPlan['entry']> },
): Promise<{ ok: boolean; note: string | null; templateFound: boolean }> {
  const files = splitFiles(plan.testId);
  const own = plan.entry.template ? `templates/product.${plan.entry.template}` : 'templates/product';
  const found = await readEntryTemplate(client, themeId, plan.entry.template);
  const gone = found.missing ? `o modelo da versão A (${own}) não existe mais no tema, e a Shopify mostra o modelo padrão de produto no lugar` : null;
  const refuse = (why: string) => ({ ok: false, note: gone ? `${gone}; e ${why}` : why, templateFound: !found.missing });
  if (found.json === null) {
    return refuse(found.liquid === null ? 'o tema não tem modelo de produto' : `o modelo da versão A é do tipo antigo (${found.base}.liquid)`);
  }
  let template: Record<string, unknown>;
  try {
    template = JSON.parse(stripJsonComments(found.json));
    if (!template || typeof template !== 'object' || Array.isArray(template)) throw new Error('not an object');
  } catch {
    return refuse(`o modelo da versão A (${found.base}.json) não pôde ser lido`);
  }
  const layoutName = template.layout === undefined ? 'theme' : template.layout;
  if (typeof layoutName !== 'string' || !/^[\w.-]+$/.test(layoutName)) return refuse('o modelo da versão A não usa layout');
  const [layout, current] = await readThemeFiles(client, themeId, [`layout/${layoutName}.liquid`, files.layout]);
  if (layout === null) return refuse(`o layout da versão A (layout/${layoutName}.liquid) não existe no tema`);
  if (TEMPLATE_NAME_BRANCH.test(layout)) {
    return refuse(`o layout da versão A (layout/${layoutName}.liquid) decide o que mostrar pelo nome do modelo, e na URL de entrada o nome seria outro`);
  }
  const input: SplitInput = {
    ...plan,
    variants: plan.variants.map(({ view: _view, stay: _stay, ...v }) => (v.id === plan.entry.variantId ? { ...v, stay: true } : v)),
  };
  const wrapped = wrapLayout(layout, splitHeadBlock(input));
  if (!wrapped) return refuse(`o layout da versão A (layout/${layoutName}.liquid) não tem o {{ content_for_header }} da Shopify`);
  const header =
    `{%- comment -%} Generated by D&VFly for A/B test ${plan.testId}: layout/${layoutName}.liquid with the test's script in its head. ` +
    'Rewritten whenever the test changes; edit the original, not this copy. {%- endcomment -%}\n';
  const notice =
    `/* D&VFly: copia de ${found.base}.json para o Teste A | B ${plan.testId}, regravada pelo app. ` +
    'Edite o original; o que for editado aqui some na proxima gravacao do teste. */\n';
  const layoutFile = { filename: files.layout, body: { type: 'TEXT', value: header + wrapped } };
  const templateFile = {
    filename: files.template,
    body: { type: 'TEXT', value: notice + JSON.stringify({ ...template, layout: splitLayout(plan.testId) }, null, 2) },
  };
  // Shopify checks a template's `layout` against the files the theme already
  // has, so a first write goes layout first, alone. A rewrite goes template
  // first: under the previous layout every visitor is still sent somewhere
  // sensible, while the new layout over the previous template could leave
  // version A's visitors on a page that is not hers.
  const order = current === null ? [layoutFile, templateFile] : [templateFile, layoutFile];
  for (const file of order) await upsertThemeFiles(client, themeId, [file]);
  return { ok: true, note: gone, templateFound: !found.missing };
}

/**
 * Writes the split into the main theme. Idempotent; rewritten on every change
 * of weights or variants, and whenever version A's page changes.
 *
 * With an entry that is version A, the entry renders A's page itself (a copy
 * of A's template on a copy of A's layout with the script in its head): no
 * redirect for A. When that cannot be done — A's template is a vintage
 * `.liquid` one, or has no layout — A is reached through `?view=` and the
 * entry is a redirect-only page, as when the entry is not a version at all.
 */
export async function ensureSplitTemplate(
  client: ShopifyClient,
  plan: SplitPlan,
): Promise<{ suffix: string; mode: EntryMode | null; note: string | null }> {
  validateSplit(plan);
  const files = splitFiles(plan.testId);
  const themeId = await mainThemeId(client);
  let input: SplitInput = plan;
  let mode: EntryMode | null = null;
  let note: string | null = null;
  if (plan.entry) {
    const wrap = await wrapEntry(client, themeId, { ...plan, entry: plan.entry });
    if (wrap.ok) return { suffix: splitSuffix(plan.testId), mode: 'stay', note: wrap.note };
    // A's page through `?view=`: its template — never one that is gone, or
    // Shopify would render the split again — or a copy of the default.
    const view = plan.entry.template && wrap.templateFound ? plan.entry.template : await ensureEntryCopy(client, plan.testId);
    input = { ...plan, variants: plan.variants.map((v) => (v.id === plan.entry!.variantId ? { ...v, view } : v)) };
    mode = 'view';
    note = wrap.note;
  }
  await upsertThemeFiles(client, themeId, [{ filename: files.layout, body: { type: 'TEXT', value: splitLayoutLiquid(input) } }]);
  await upsertThemeFiles(client, themeId, [
    { filename: files.section, body: { type: 'TEXT', value: splitSectionLiquid(input) } },
    { filename: files.template, body: { type: 'TEXT', value: splitTemplateJson(plan.testId) } },
  ]);
  return { suffix: splitSuffix(plan.testId), mode, note };
}

/**
 * Whether version A's page on the entry (the COPIES) still matches A's
 * template and layout in the theme. An edit made in the theme editor to the
 * originals reaches the copies only when the test is written again; until
 * then the entry shows the old A while the other versions show their edits.
 * Null when there is nothing to compare (not on its own page, files gone).
 */
export async function entryCopyChanged(client: ShopifyClient, testId: string, template: string | null): Promise<boolean | null> {
  const themeId = await mainThemeId(client);
  const files = splitFiles(testId);
  const [copyJson, copyLayout] = await readThemeFiles(client, themeId, [files.template, files.layout]);
  const found = await readEntryTemplate(client, themeId, template);
  if (copyJson === null || copyLayout === null || found.json === null) return null;
  try {
    const { layout: originalLayout, ...original } = JSON.parse(stripJsonComments(found.json));
    const { layout: _ours, ...copy } = JSON.parse(stripJsonComments(copyJson));
    if (JSON.stringify(original) !== JSON.stringify(copy)) return true;
    const name = originalLayout === undefined ? 'theme' : originalLayout;
    if (typeof name !== 'string') return null;
    const [layout] = await readThemeFiles(client, themeId, [`layout/${name}.liquid`]);
    if (layout === null) return null;
    return unwrap(copyLayout) !== layout;
  } catch {
    return null;
  }
}

/** The template suffix of the copy of the theme's default product template (see below). */
export const entryCopySuffix = (testId: string) => `${splitSuffix(testId)}-a`;

/**
 * When the entry product used the theme's DEFAULT product template, there is
 * no suffix to put in `?view=` (the default has none). A copy of it, under a
 * name of ours, gives version A its page back. Rewritten on every go-live, so
 * an edit to the theme's product page reaches it then.
 */
export async function ensureEntryCopy(client: ShopifyClient, testId: string): Promise<string> {
  const themeId = await mainThemeId(client);
  const [json, liquid] = await readThemeFiles(client, themeId, ['templates/product.json', 'templates/product.liquid']);
  const suffix = entryCopySuffix(testId);
  if (json !== null) {
    const body = JSON.stringify(JSON.parse(stripJsonComments(json)), null, 2);
    await upsertThemeFiles(client, themeId, [{ filename: `templates/product.${suffix}.json`, body: { type: 'TEXT', value: body } }]);
  } else if (liquid !== null) {
    await upsertThemeFiles(client, themeId, [{ filename: `templates/product.${suffix}.liquid`, body: { type: 'TEXT', value: liquid } }]);
  } else {
    throw new ShopifyError(`O tema de ${client.domain} não tem modelo de produto padrão para a versão A copiar.`);
  }
  return suffix;
}

/** Takes the split's files out of the main theme (the template first: it names the layout). */
export async function removeSplitTemplate(client: ShopifyClient, testId: string): Promise<void> {
  const files = splitFiles(testId);
  const themeId = await mainThemeId(client);
  const copy = entryCopySuffix(testId);
  await deleteThemeFiles(client, themeId, [
    files.template,
    files.section,
    `templates/product.${copy}.json`,
    `templates/product.${copy}.liquid`,
  ]);
  await deleteThemeFiles(client, themeId, [files.layout]);
}

// ---- canonical of the variants ----------------------------------------------

/**
 * Where a variant's canonical points while the test is live: "ok" — the
 * entry URL; "theme" — its page renders on a layout of the THEME's, which
 * the app does not edit, so the canonical stays Shopify's own (the page's
 * URL); "none" — its layout has no canonical tag at all; "unset" — the
 * product does not carry the entry (yet): applying the test again fixes it.
 */
export type CanonicalState = 'ok' | 'theme' | 'none' | 'unset';

/** What the canonical check needs to know about a variant product. */
export interface CanonicalProduct {
  id: string;
  templateSuffix: string | null;
  /** The `dvfly.ab_entry` it carries now (null: none). */
  abEntry?: string | null;
}

/** The layout a product template renders with (null: none, or unreadable). */
function templateLayout(json: string | null, liquid: string | null): string | null {
  if (json !== null) {
    try {
      const layout = JSON.parse(stripJsonComments(json)).layout;
      if (layout === undefined) return 'theme';
      return typeof layout === 'string' ? layout : null;
    } catch {
      return null;
    }
  }
  if (liquid !== null) {
    const tag = /\{%-?\s*layout\s+(?:['"]([^'"]+)['"]|none)\s*-?%\}/.exec(liquid);
    return tag ? (tag[1] ?? null) : 'theme';
  }
  return null;
}

const isOurLayout = (layout: string | null): layout is string => !!layout && layout.startsWith('theme.dvfly');

/**
 * Which layout each product renders with, and the text of the D&VFly ones
 * among them — two reads of the theme whatever the number of products.
 */
async function variantLayouts(client: ShopifyClient, themeId: string, products: CanonicalProduct[]) {
  const base = (p: CanonicalProduct) => (p.templateSuffix ? `templates/product.${p.templateSuffix}` : 'templates/product');
  const bases = [...new Set(products.map(base))];
  const templates = await readThemeFiles(client, themeId, bases.flatMap((b) => [`${b}.json`, `${b}.liquid`]));
  const layoutOfBase = new Map(bases.map((b, i) => [b, templateLayout(templates[2 * i], templates[2 * i + 1])]));
  const layoutOf = new Map(products.map((p) => [p.id, layoutOfBase.get(base(p)) ?? null]));
  const ours = [...new Set([...layoutOf.values()].filter(isOurLayout))];
  const texts = ours.length > 0 ? await readThemeFiles(client, themeId, ours.map((l) => `layout/${l}.liquid`)) : [];
  return { layoutOf, layoutText: new Map(ours.map((l, i) => [l, texts[i]])) };
}

/** Reads, without changing anything, where each variant's canonical points now. */
export async function inspectVariantCanonicals(
  client: ShopifyClient,
  entryHandle: string,
  products: CanonicalProduct[],
): Promise<Map<string, CanonicalState>> {
  const states = new Map<string, CanonicalState>();
  if (products.length === 0) return states;
  const { layoutOf, layoutText } = await variantLayouts(client, await mainThemeId(client), products);
  for (const p of products) {
    const layout = layoutOf.get(p.id) ?? null;
    if (!isOurLayout(layout)) {
      states.set(p.id, 'theme');
      continue;
    }
    const text = layoutText.get(layout) ?? null;
    const aware = text === null ? null : canonicalAware(text);
    if (!aware?.found) states.set(p.id, 'none');
    else if (aware.text !== text || p.abEntry !== entryHandle) states.set(p.id, 'unset');
    else states.set(p.id, 'ok');
  }
  return states;
}

/**
 * Points the canonical of each variant page at the entry URL, for the length
 * of the test: the variant products get `dvfly.ab_entry` (the entry's handle)
 * and every D&VFly layout they render with is made to read it (layouts
 * written before this existed are patched in place; new ones are born that
 * way). The theme's own layouts are not edited — a variant on one keeps
 * Shopify's canonical, and the screen says so.
 */
export async function pointVariantCanonicals(
  client: ShopifyClient,
  entryHandle: string,
  products: CanonicalProduct[],
): Promise<Map<string, CanonicalState>> {
  const states = new Map<string, CanonicalState>();
  if (products.length === 0) return states;
  if (!HANDLE.test(entryHandle)) throw new ShopifyError(`Endereço de entrada inválido: ${entryHandle}`);
  const themeId = await mainThemeId(client);
  const { layoutOf, layoutText } = await variantLayouts(client, themeId, products);
  const found = new Map<string, boolean>();
  for (const [layout, text] of layoutText) {
    const aware = text === null ? null : canonicalAware(text);
    if (aware && aware.text !== text) {
      await upsertThemeFiles(client, themeId, [{ filename: `layout/${layout}.liquid`, body: { type: 'TEXT', value: aware.text } }]);
    }
    found.set(layout, !!aware?.found);
  }
  await setProductTextMetafields(
    client,
    AB_CANONICAL_METAFIELD.namespace,
    AB_CANONICAL_METAFIELD.key,
    products.map((p) => ({ productId: p.id, value: entryHandle })),
  );
  for (const p of products) {
    const layout = layoutOf.get(p.id) ?? null;
    states.set(p.id, !isOurLayout(layout) ? 'theme' : found.get(layout) ? 'ok' : 'none');
  }
  return states;
}

/** Gives the products back their own canonical (the test stopped, or they left it). */
export async function releaseVariantCanonicals(client: ShopifyClient, productIds: string[]): Promise<void> {
  await deleteProductMetafields(client, AB_CANONICAL_METAFIELD.namespace, AB_CANONICAL_METAFIELD.key, productIds);
}
