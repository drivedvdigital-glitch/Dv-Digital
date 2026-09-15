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
 *   - Images always carry width, height and lazy loading, because layout shift
 *     is caused by their absence.
 */

import { escapeText, safeUrl, tag } from './html.ts';
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
  baseAttrs: (node: Node) => Record<string, string | undefined>;
  /** Declares that this block needs a runtime module. */
  requireRuntime: (name: RuntimeModule) => void;
  /** Runs author-written markup through the optimization pass. */
  optimizeHtml: (source: string) => string;
}

export type RuntimeModule = 'countdown' | 'reveal';

/**
 * Entrance animations. A closed set, like the style vocabulary: each name maps
 * to a known pre-state, and anything outside the set compiles to nothing.
 *
 * They are progressive enhancement by construction: the markup ships visible,
 * and the `reveal` runtime applies the pre-state and reveals on intersection.
 * No JavaScript → no animation → content still readable.
 */
export const ANIMATIONS = ['fade', 'rise', 'zoom'] as const;

export const ANIMATION_CSS = `.dvf-anim{opacity:0;transition:opacity .6s ease,transform .6s ease}
.dvf-anim[data-dvf-anim="rise"]{transform:translateY(24px)}
.dvf-anim[data-dvf-anim="zoom"]{transform:scale(.94)}
.dvf-anim.dvf-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.dvf-anim{opacity:1;transform:none;transition:none}}`;

type Renderer = (node: Node, ctx: RenderContext) => string;

const prop = <T>(node: Node, name: string, fallback: T): T =>
  (node.props?.[name] as T) ?? fallback;

/** `section` is the outermost structural block: a full-width band. */
const section: Renderer = (node, ctx) =>
  tag('section', ctx.baseAttrs(node), ctx.renderChildren(node.children));

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
  const width = prop<number | undefined>(node, 'width', undefined);
  const height = prop<number | undefined>(node, 'height', undefined);
  const srcset = prop<string | undefined>(node, 'srcset', undefined);

  return tag('img', {
    ...ctx.baseAttrs(node),
    src,
    srcset,
    sizes: srcset ? prop(node, 'sizes', '100vw') : undefined,
    // Empty alt is a deliberate, valid choice for decorative images. It is not
    // the same as a missing alt, and the auditor distinguishes the two.
    alt: escapeText(prop(node, 'alt', '')),
    width,
    height,
    loading: prop(node, 'eager', false) ? undefined : 'lazy',
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
  // No id yet → nothing on the page. An empty player frame would ship bytes
  // for a block the author has not finished configuring.
  if (!id) return '';
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
  return tag('div', ctx.baseAttrs(node), body);
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
  // each element the first time it enters the viewport.
  reveal: `(function(){var els=document.querySelectorAll("[data-dvf-anim]");
els.forEach(function(el){el.classList.add("dvf-anim")});
if(!("IntersectionObserver" in window)){els.forEach(function(el){el.classList.add("dvf-in")});return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){
if(e.isIntersecting){e.target.classList.add("dvf-in");io.unobserve(e.target);}})},{threshold:.15});
els.forEach(function(el){io.observe(el)});})();`,
};
