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
 * What this is NOT: cloaking. The choice is a coin weighted by the
 * percentages and nothing else — no user agent, no IP, no referrer, no
 * platform sniffing. A reviewer, a bot and a buyer go through the same coin.
 *
 * Variants are other PRODUCTS of the store (their own handles), so orders can
 * be attributed by product with no tracking at checkout (see orders.ts).
 */

import { ShopifyError, type ShopifyClient } from './client.ts';
import { deleteThemeFiles, mainThemeId, readThemeFiles, stripJsonComments, upsertThemeFiles } from './templates.ts';

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
    if (!Number.isInteger(v.weight) || v.weight < 0 || v.weight > 100) {
      throw new ShopifyError(`Peso inválido para ${v.handle}: ${v.weight}`);
    }
  }
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
 */
export function splitScript(input: SplitInput): string {
  validateSplit(input);
  const config = {
    t: input.testId,
    e: input.hitUrl,
    v: input.variants.map((v) => ({ i: v.id, h: v.handle, w: v.weight, ...(v.view ? { q: v.view } : {}) })),
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
var b=JSON.stringify({t:C.t,v:p.i,f:f});
try{if(!(navigator.sendBeacon&&navigator.sendBeacon(C.e,b)))fetch(C.e,{method:'POST',body:b,keepalive:true,mode:'no-cors',credentials:'omit'});}catch(e){}
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
 * Writes the split's layout, section and template into the main theme.
 * Idempotent; rewrites on every change of weights or variants. The layout goes
 * first and alone — Shopify validates a template's `layout` against files
 * already in the theme.
 */
export async function ensureSplitTemplate(client: ShopifyClient, input: SplitInput): Promise<{ suffix: string }> {
  const files = splitFiles(input.testId);
  const layout = splitLayoutLiquid(input);
  const themeId = await mainThemeId(client);
  await upsertThemeFiles(client, themeId, [{ filename: files.layout, body: { type: 'TEXT', value: layout } }]);
  await upsertThemeFiles(client, themeId, [
    { filename: files.section, body: { type: 'TEXT', value: splitSectionLiquid(input) } },
    { filename: files.template, body: { type: 'TEXT', value: splitTemplateJson(input.testId) } },
  ]);
  return { suffix: splitSuffix(input.testId) };
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
