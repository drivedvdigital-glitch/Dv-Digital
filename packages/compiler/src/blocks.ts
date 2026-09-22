/**
 * Block compilers.
 *
 * Each block is a pure function from a node to markup. Three rules hold across
 * all of them, and they are the difference between a builder page and a real
 * page:
 *
 *   - Correct semantics by default. A link is `<a href>`, a button is
 *     `<button>`, a heading is a real heading at the level the author chose.
 *   - No JavaScript unless the behaviour genuinely needs it. The accordion is
 *     `<details>/<summary>`, so it ships zero bytes of script.
 *   - Images are lazy except the first one on the page, which is the LCP
 *     candidate and gets fetched first; CDN images are served at the width
 *     the screen needs (see `images.ts`). Dimensions come from the document —
 *     the editor measures them — because their absence is what causes layout
 *     shift.
 */

import { escapeText, safeUrl, tag } from './html.ts';
import { responsiveImage, type ImageClaim, type ImageRole } from './images.ts';
import type { Node } from './schema.ts';

export interface RenderContext {
  /** Compiles child nodes. Injected so blocks never import the compiler. */
  renderChildren: (children: Node[] | undefined) => string;
  /** Classes already resolved for this node by the stylesheet. */
  classAttr: (node: Node, extra?: string) => string | undefined;
  /**
   * Class plus, in editor builds only, the node's id as a data attribute — the
   * hook the canvas uses to map a click back to a node. Published output never
   * carries it (I3: minimal footprint).
   */
  baseAttrs: (node: Node, extraClass?: string) => Record<string, string | undefined>;
  /**
   * True for a top-level section that is not the first thing on the page —
   * the ones whose rendering can wait until they are scrolled to.
   */
  belowFold: (node: Node) => boolean;
  /** Declares that this block needs a runtime module. */
  requireRuntime: (name: RuntimeModule) => void;
  /**
   * Editor-only placeholder for a block that is missing required content.
   * `route` names the exact field that fixes it ("Geral → Link do vídeo").
   * Returns '' in published builds, so an unconfigured block ships nothing.
   */
  hint: (node: Node, route: string) => string;
  /** Runs author-written markup through the optimization pass. */
  optimizeHtml: (source: string) => string;
  /**
   * Registers an image in page order and says what it is to the page: the
   * hero (the LCP candidate, fetched before anything else), something before
   * the hero (a logo, a badge — above the fold, so never lazy) or something
   * after it (lazy). Decided across blocks, because "the first big image on
   * the page" is a page-level fact that no single block can know.
   */
  claimImage: (image: ImageClaim) => { role: ImageRole };
}

export type RuntimeModule = 'countdown' | 'reveal' | 'tabs' | 'contact';

/** Contact form structure. Field visuals inherit the page/theme typography. */
export const FORM_CSS = `.dvf-form{display:flex;flex-direction:column;gap:12px;max-width:560px;text-align:left}
.dvf-form-field{display:flex;flex-direction:column;gap:4px;font-size:14px}
.dvf-form-field input,.dvf-form-field textarea{border:1px solid #c9c9c9;border-radius:8px;padding:10px 12px;font:inherit;background:#fff;width:100%;box-sizing:border-box}
.dvf-form-submit{align-self:flex-start;border:0;border-radius:8px;padding:10px 20px;cursor:pointer;background:#17201c;color:#fff;font:inherit}
.dvf-form-success{background:#eafaf0;border:1px solid #b6ecd0;color:#0a6b38;border-radius:8px;padding:10px 12px}`;

/**
 * Entrance animations. A closed set, like the style vocabulary: each name maps
 * to a known pre-state, and anything outside the set compiles to nothing.
 *
 * They are progressive enhancement by construction: the markup ships visible,
 * and the `reveal` runtime applies the pre-state and reveals on intersection.
 * No JavaScript → no animation → content still readable.
 */
export const ANIMATIONS = ['fade', 'rise', 'zoom'] as const;

/**
 * Tabs base styles. The active tab is a FULL color inversion — instantly
 * readable, never a subtle border. Emitted only when a tabs block exists.
 */
export const TABS_CSS = `.dvf-tabs-list{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px;padding:0}
.dvf-tab-btn{border:1px solid #d0d0d0;background:#fff;color:#17201c;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit;font-size:14px}
.dvf-tab-btn[aria-selected="true"]{background:#17201c;color:#fff;border-color:#17201c}
[data-dvf-tab-panel][hidden]{display:none}`;

/**
 * Sections below the first one skip layout and paint until they are about to
 * scroll into view (`content-visibility: auto`). On a long page that is where
 * most of the rendering cost sits, and none of it is needed for the first
 * paint or the first tap. The placeholder height keeps the scrollbar sane
 * before a section is rendered; `auto` remembers the real size after it is.
 * Emitted only when a page has such a section. (web.dev, "content-visibility".)
 */
export const BELOW_FOLD_CLASS = 'dvf-below';
export const BELOW_FOLD_CSS = `.${BELOW_FOLD_CLASS}{content-visibility:auto;contain-intrinsic-size:auto 600px}`;

// The pre-state is applied WITHOUT a transition and the entrance WITH one:
// the pre-state lands by script on content that is off screen (often inside
// a section the browser has not rendered yet, see BELOW_FOLD_CSS), and a
// transition pending there would resume the moment the section renders —
// a visible dip to transparent right as it scrolls in. Jumping to the
// pre-state instantly has no witness; only the entrance is seen.
export const ANIMATION_CSS = `.dvf-anim{opacity:0}
.dvf-anim[data-dvf-anim="rise"]{transform:translateY(24px)}
.dvf-anim[data-dvf-anim="zoom"]{transform:scale(.94)}
.dvf-anim.dvf-in{opacity:1;transform:none;transition:opacity .6s ease,transform .6s ease}
@media (prefers-reduced-motion:reduce){.dvf-anim{opacity:1;transform:none;transition:none}}`;

type Renderer = (node: Node, ctx: RenderContext) => string;

const prop = <T>(node: Node, name: string, fallback: T): T =>
  (node.props?.[name] as T) ?? fallback;

/** `section` is the outermost structural block: a full-width band. */
const section: Renderer = (node, ctx) =>
  tag(
    'section',
    ctx.baseAttrs(node, ctx.belowFold(node) ? BELOW_FOLD_CLASS : undefined),
    ctx.renderChildren(node.children),
  );

/** `stack` is the only layout primitive. Flex, both directions, nothing else. */
const stack: Renderer = (node, ctx) =>
  tag('div', ctx.baseAttrs(node), ctx.renderChildren(node.children));

const heading: Renderer = (node, ctx) => {
  const level = Math.min(Math.max(prop(node, 'level', 2), 1), 6);
  return tag(
    `h${level}`,
    ctx.baseAttrs(node),
    escapeText(prop(node, 'text', '')),
  );
};

const text: Renderer = (node, ctx) =>
  tag('p', ctx.baseAttrs(node), escapeText(prop(node, 'text', '')));

const image: Renderer = (node, ctx) => {
  const src = prop<string>(node, 'src', '');
  // A src-less <img> paints a broken-image glyph on the live page; better to
  // ship nothing and let the editor point at the field that fixes it.
  if (!src.trim()) return ctx.hint(node, 'Imagem — informe o endereço em Geral → URL da imagem');
  const width = prop<number | undefined>(node, 'width', undefined);
  const height = prop<number | undefined>(node, 'height', undefined);
  const authorSizes = prop<string | undefined>(node, 'sizes', undefined);
  // The author's own srcset wins; otherwise a CDN image gets one built for it.
  const authorSrcset = prop<string | undefined>(node, 'srcset', undefined);
  const responsive = authorSrcset ? null : responsiveImage(src, { width, sizes: authorSizes });
  const finalSrc = responsive?.src ?? src;
  const srcset = authorSrcset ?? responsive?.srcset;
  const sizes = srcset ? (authorSizes ?? responsive?.sizes ?? '100vw') : undefined;

  // The page's first big image is the LCP candidate: fetched first, never
  // lazy. Whatever comes before it (a logo) is above the fold too, so not
  // lazy either. `eager` lets the author say so about any other one.
  const { role } = ctx.claimImage({ src: finalSrc, srcset, sizes, width });
  const eager = role !== 'after-hero' || prop(node, 'eager', false);

  return tag('img', {
    ...ctx.baseAttrs(node),
    src: finalSrc,
    srcset,
    sizes,
    // Empty alt is a deliberate, valid choice for decorative images. It is not
    // the same as a missing alt, and the auditor distinguishes the two.
    alt: escapeText(prop(node, 'alt', '')),
    width,
    height,
    loading: eager ? undefined : 'lazy',
    fetchpriority: role === 'hero' ? 'high' : undefined,
    decoding: 'async',
  });
};

const button: Renderer = (node, ctx) => {
  const label = escapeText(prop(node, 'label', ''));
  const href = safeUrl(prop(node, 'href', ''));
  // A navigating control is a link; a non-navigating one is a button. Rendering
  // a link as a <div> with a click handler is what breaks middle-click, "copy
  // link address", keyboard focus and crawling all at once.
  if (href) {
    return tag(
      'a',
      {
        ...ctx.baseAttrs(node),
        href,
        rel: prop(node, 'external', false) ? 'noopener noreferrer' : undefined,
        target: prop(node, 'external', false) ? '_blank' : undefined,
      },
      label,
    );
  }
  return tag('button', { ...ctx.baseAttrs(node), type: 'button' }, label);
};

const divider: Renderer = (node, ctx) => tag('hr', ctx.baseAttrs(node));

/**
 * A plain list: one item per line of `text`. Real <ul>/<ol> markup — a stack
 * of paragraphs with bullet characters would break screen readers and lose
 * the browser's own list styling.
 */
const list: Renderer = (node, ctx) => {
  const lines = String(prop(node, 'text', ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const body = lines.map((line) => tag('li', {}, escapeText(line))).join('');
  return tag(prop(node, 'ordered', false) ? 'ol' : 'ul', ctx.baseAttrs(node), body);
};

/**
 * YouTube embed. Only the 11-character video id survives into the output —
 * whatever URL shape the author pastes, nothing else from it is emitted —
 * and the privacy-enhanced host keeps the page from setting cookies before
 * the visitor presses play.
 */
export function youtubeId(raw: string): string | null {
  const value = raw.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  const match =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(
      value,
    );
  return match ? match[1] : null;
}

const youtube: Renderer = (node, ctx) => {
  const id = youtubeId(String(prop(node, 'url', '')));
  // No id yet → nothing on the published page; the editor shows the way.
  if (!id) return ctx.hint(node, 'Vídeo do YouTube — cole o link em Geral → Link do vídeo');
  return tag('iframe', {
    ...ctx.baseAttrs(node),
    src: `https://www.youtube-nocookie.com/embed/${id}`,
    title: escapeText(prop(node, 'title', 'Vídeo')),
    loading: 'lazy',
    allowfullscreen: '',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    style: 'aspect-ratio:16/9;width:100%;border:0',
  });
};

/**
 * Accordion. `<details>` gives open/close, keyboard support and find-in-page
 * for free. A JavaScript accordion gives none of those and costs bytes.
 */
const accordion: Renderer = (node, ctx) => {
  const items = prop<Array<{ title?: string; body?: string }>>(node, 'items', []);
  const body = items
    .map((item) =>
      tag(
        'details',
        { class: `${'dvf'}-accordion-item` },
        tag('summary', {}, escapeText(item.title ?? '')) +
          tag('div', {}, escapeText(item.body ?? '')),
      ),
    )
    .join('');
  return tag('div', ctx.baseAttrs(node), body);
};

/**
 * Repeater: one subtree, rendered once per data row.
 *
 * This is the block that earns its place. Testimonials, benefit cards,
 * comparison rows and logo walls are all this block with different data, and
 * because every repetition reuses the same styles, the stylesheet does not grow
 * with the number of rows.
 */
const repeater: Renderer = (node, ctx) => {
  const rows = prop<Array<Record<string, unknown>>>(node, 'rows', []);
  const template = node.children ?? [];

  const body = rows
    .map((row) => {
      // Bind the row into the template by substituting {{field}} placeholders.
      const bound = template.map((child) => bindNode(child, row));
      return ctx.renderChildren(bound);
    })
    .join('');

  return tag('div', ctx.baseAttrs(node), body);
};

/**
 * Replaces `{{field}}` placeholders in a subtree's string props with row data.
 * Ids are suffixed so the rendered tree keeps unique ids, but the *style* stays
 * shared — that is the whole point.
 */
function bindNode(node: Node, row: Record<string, unknown>): Node {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props ?? {})) {
    props[key] =
      typeof value === 'string'
        ? value.replace(/\{\{(\w+)\}\}/g, (_, field) => String(row[field] ?? ''))
        : value;
  }
  return {
    ...node,
    props,
    children: node.children?.map((child) => bindNode(child, row)),
  };
}

/**
 * Countdown is the one block here that cannot work without script, so it is the
 * one block that declares a runtime module. Nothing else ships JavaScript.
 */
const countdown: Renderer = (node, ctx) => {
  ctx.requireRuntime('countdown');
  const deadline = prop<string>(node, 'deadline', '');
  return tag(
    'div',
    {
      ...ctx.baseAttrs(node),
      'data-dvf-countdown': deadline,
      // Server-rendered fallback so the block is not blank before hydration.
      role: 'timer',
    },
    escapeText(prop(node, 'fallback', '')),
  );
};

/**
 * Tabs: a container whose `tab` children each contribute one button in the
 * tablist and one panel. Real ARIA roles; only the first panel ships visible
 * (a no-JS visitor still reads the first tab's content). The header and the
 * content stay separately selectable in the editor: the button carries the
 * tab node's id via data-dvf-tab-for, the panel via the normal id stamp.
 */
const tabs: Renderer = (node, ctx) => {
  const items = (node.children ?? []).filter((child) => child.type === 'tab' && !child.hidden);
  if (items.length === 0) {
    return ctx.hint(node, 'Abas — adicione itens em Geral → Itens de abas');
  }

  const rendered = items.map((item, index) => {
    const attrs = ctx.baseAttrs(item);
    const anchor = String(item.props?.anchor ?? '').trim();
    const inEditor = 'data-dvf-id' in attrs;
    const button = tag(
      'button',
      {
        class: 'dvf-tab-btn',
        'data-dvf-tab-btn': '',
        type: 'button',
        role: 'tab',
        'aria-selected': index === 0 ? 'true' : 'false',
        id: anchor || undefined,
        'data-dvf-anchor': anchor || undefined,
        // Editor-only: lets the canvas map a tab button back to its node.
        'data-dvf-tab-for': inEditor ? item.id : undefined,
      },
      escapeText(String(item.props?.title ?? '')),
    );
    const panel = tag(
      'div',
      {
        ...attrs,
        role: 'tabpanel',
        'data-dvf-tab-panel': '',
        ...(index === 0 ? {} : { hidden: '' }),
      },
      ctx.renderChildren(item.children),
    );
    return { button, panel };
  });
  const buttons = rendered.map((r) => r.button).join('');
  const panels = rendered.map((r) => r.panel).join('');

  ctx.requireRuntime('tabs');
  return tag(
    'div',
    { ...ctx.baseAttrs(node), 'data-dvf-tabs': '' },
    tag('div', { class: 'dvf-tabs-list', role: 'tablist' }, buttons) + panels,
  );
};

/** A tab outside a tabs container renders as a plain group — never crashes. */
const tab: Renderer = (node, ctx) => tag('div', ctx.baseAttrs(node), ctx.renderChildren(node.children));

/**
 * Contact form: a configured widget, not loose form pieces (a deliberate
 * departure from the reference's compositional model — see report 09; our
 * audience wants a working form, not an assembly kit).
 *
 * Posts to the storefront's native `/contact` endpoint with the standard
 * `contact[...]` field names, so submissions land in the store's own inbox
 * and notification settings — no backend of ours involved (the storefront
 * must never depend on our server). The success message reveals itself when
 * Shopify redirects back with `contact_posted=true`.
 */
const contact: Renderer = (node, ctx) => {
  ctx.requireRuntime('contact');
  const attrs = ctx.baseAttrs(node);
  attrs.class = attrs.class ? `dvf-form ${attrs.class}` : 'dvf-form';

  const field = (label: string, control: string) =>
    tag('label', { class: 'dvf-form-field' }, tag('span', {}, label) + control);

  const body =
    tag('input', { type: 'hidden', name: 'form_type', value: 'contact' }) +
    tag('input', { type: 'hidden', name: 'utf8', value: '✓' }) +
    tag(
      'div',
      { class: 'dvf-form-success', 'data-dvf-form-success': '', hidden: '' },
      escapeText(prop(node, 'success', 'Mensagem enviada! Vamos te responder em breve.')),
    ) +
    (prop(node, 'askName', true)
      ? field('Nome', tag('input', { type: 'text', name: 'contact[name]', autocomplete: 'name' }))
      : '') +
    field(
      'E-mail',
      tag('input', { type: 'email', name: 'contact[email]', required: '', autocomplete: 'email' }),
    ) +
    (prop(node, 'askPhone', false)
      ? field('Telefone', tag('input', { type: 'tel', name: 'contact[phone]', autocomplete: 'tel' }))
      : '') +
    field('Mensagem', tag('textarea', { name: 'contact[body]', required: '', rows: '5' }, '')) +
    tag(
      'button',
      { type: 'submit', class: 'dvf-form-submit' },
      escapeText(prop(node, 'buttonLabel', 'Enviar')),
    );

  return tag(
    'form',
    { ...attrs, method: 'post', action: `/contact#f${node.id}`, id: `f${node.id}`, 'accept-charset': 'UTF-8' },
    body,
  );
};

/**
 * Author-written HTML.
 *
 * Deliberately unescaped — that is what it is for. It is the merchant's own
 * markup on their own store, and every builder needs one door that leads
 * straight out.
 *
 * This is not a rarely-used escape hatch in practice: the screen recording in
 * docs/USO_REAL.md shows an entire landing page living in one of these. So the
 * markup goes through the optimization pass on the way out, which hoists inline
 * styles into the shared stylesheet, scopes any `<style>` block, and fixes up
 * images. Set `raw: true` on the node to publish the markup untouched.
 */
const html: Renderer = (node, ctx) => {
  const source = prop<string>(node, 'html', '');
  const body = prop(node, 'raw', false) ? source : ctx.optimizeHtml(source);
  // `data-dvf-raw` marks the author's own territory: our reset steps back
  // inside it (see Sheet.toCss), so the pasted page renders as pasted.
  return tag('div', { ...ctx.baseAttrs(node), 'data-dvf-raw': '' }, body);
};

export const BLOCKS: Record<string, Renderer> = {
  section,
  stack,
  heading,
  text,
  image,
  button,
  divider,
  list,
  youtube,
  tabs,
  tab,
  contact,
  accordion,
  repeater,
  countdown,
  html,
};

/**
 * Runtime modules, inlined only when a block on the page asked for one.
 * Kept deliberately tiny: if a "small module" grows past a few hundred bytes it
 * stops being cheaper than not having the feature.
 */
export const RUNTIME: Record<RuntimeModule, string> = {
  countdown: `document.querySelectorAll("[data-dvf-countdown]").forEach(function(el){
var end=new Date(el.dataset.dvfCountdown).getTime();
function t(){var d=end-Date.now();if(d<0)d=0;
var s=Math.floor(d/1e3),m=Math.floor(s/60),h=Math.floor(m/60),y=Math.floor(h/24);
el.textContent=y+"d "+(h%24)+"h "+(m%60)+"m "+(s%60)+"s";
if(d>0)setTimeout(t,1e3);}
t();});`,
  // Applies the animation pre-state only once JS is known to run, then reveals
  // each element the first time it enters the viewport. What is ALREADY on
  // screen when the script runs is left alone: hiding it (opacity 0) and
  // fading it in would delay the first paint of the hero — and the browser
  // does not count an invisible element as the LCP, so the metric moves to
  // whatever paints later. Animating what the visitor is already looking at
  // buys nothing; the animation is for what scrolls into view.
  reveal: `(function(){var els=document.querySelectorAll("[data-dvf-anim]"),h=innerHeight,io;
els=[].filter.call(els,function(el){var r=el.getBoundingClientRect();return r.bottom<=0||r.top>=h});
if(!("IntersectionObserver" in window))return;
els.forEach(function(el){el.classList.add("dvf-anim")});
io=new IntersectionObserver(function(es){es.forEach(function(e){
if(e.isIntersecting){e.target.classList.add("dvf-in");io.unobserve(e.target);}})},{threshold:.15});
els.forEach(function(el){io.observe(el)});})();`,
  // Tab switching + anchor deep-link: #<anchor> in the URL opens that tab.
  tabs: `document.querySelectorAll("[data-dvf-tabs]").forEach(function(root){
var btns=root.querySelectorAll("[data-dvf-tab-btn]");
var panels=root.querySelectorAll("[data-dvf-tab-panel]");
function activate(i){
btns.forEach(function(b,j){b.setAttribute("aria-selected",j===i?"true":"false")});
panels.forEach(function(p,j){if(j===i)p.removeAttribute("hidden");else p.setAttribute("hidden","")});}
btns.forEach(function(b,i){b.addEventListener("click",function(){activate(i)})});
var h=decodeURIComponent(location.hash.slice(1));
if(h)btns.forEach(function(b,i){if(b.getAttribute("data-dvf-anchor")===h)activate(i)});});`,
  // Reveals the success message after Shopify redirects back from /contact.
  contact: `if(/(^|[?&])contact_posted=true/.test(location.search)){
document.querySelectorAll("[data-dvf-form-success]").forEach(function(el){
el.removeAttribute("hidden");el.scrollIntoView({block:"center"});});}`,
};
