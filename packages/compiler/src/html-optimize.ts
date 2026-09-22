/**
 * The HTML optimization pass.
 *
 * This exists because of what the screen recording showed (see docs/USO_REAL.md):
 * the real work happens inside a hand-written HTML block, not by dragging blocks
 * from a library. That created a problem for the whole thesis — if HTML goes in
 * raw and comes out raw, the compiler optimizes nothing and the performance
 * advantage evaporates.
 *
 * The resolution: the compiler becomes an *optimizer*. The author's HTML stays
 * the source of truth, and this pass improves it at publish time without asking
 * anyone to change how they work:
 *
 *   - inline `style` attributes are LEFT ALONE (see below)
 *     stylesheet, so twenty identically-styled elements cost one rule
 *   - `<style>` blocks are scoped to our subtree so they cannot leak into the
 *     theme, and the theme cannot reach in
 *   - images get `loading`, `decoding`, and are flagged when they lack the
 *     dimensions that prevent layout shift
 *   - semantic problems are reported rather than silently shipped
 *
 * Everything here is conservative. When the pass cannot understand something it
 * leaves it alone and says so, because a builder that quietly rewrites the
 * author's markup is worse than one that does nothing.
 */

import { parse, type HTMLElement as ParsedElement } from 'node-html-parser';

import type { StyleSheet } from './css.ts';
import type { Finding } from './audit.ts';
import {
  isHeroCandidate,
  placeholderHost,
  responsiveImage,
  type ImageClaim,
  type ImageRole,
  type LcpImage,
} from './images.ts';

export interface OptimizeOptions {
  /** Shared stylesheet. Kept in the options so a future pass can dedupe against it. */
  sheet: StyleSheet;
  /** Class that scopes the page subtree. Used to contain `<style>` blocks. */
  scope: string;
  /**
   * Images above the fold should not be lazy. The author marks them by adding
   * `data-dvf-eager`; we never guess, because guessing wrong costs LCP.
   */
  eagerAttribute?: string;
  /**
   * The page's decision about each image, in document order (see
   * `RenderContext.claimImage`). "The hero" is a page-level fact — with two
   * HTML blocks each would otherwise crown its own — so the compiler passes
   * its own function in. Absent, this block is the whole page.
   */
  claimImage?: (image: ImageClaim) => { role: ImageRole };
  /**
   * What a `rem` is worth when the author's CSS does not say: the store
   * theme's root (`themeRootPx`), or the browser's 16px. See `authorRootPx`.
   */
  rootPx?: number;
}

export interface OptimizeResult {
  html: string;
  findings: Finding[];
  stats: {
    /**
     * Inline `style` attributes found in the author's HTML and kept verbatim.
     * They are counted, never moved: see the note in `optimizeHtml`.
     */
    inlineStylesKept: number;
    styleBlocksScoped: number;
    imagesTouched: number;
    /** Every `<img>` seen, so the compiler can keep counting across blocks. */
    imagesFound: number;
    /** CDN images that left with a `srcset` built for them. */
    imagesResponsive: number;
    /** The page's first image, when it is in this block — the LCP candidate. */
    firstImage: LcpImage | null;
    scriptsFound: number;
    /**
     * `rem` lengths resolved to the pixels they meant in the author's file.
     * The one rewrite this pass makes to the author's own values, and the
     * reason is in `rebaseRem`.
     */
    remRebased: number;
    /**
     * Heading levels found, in document order. Reported as data rather than as
     * findings because "exactly one H1" is a property of the page, not of one
     * block — a page with three HTML blocks must not be scolded three times.
     */
    headingLevels: number[];
    /**
     * Links and buttons found. Same reasoning as headings: "the page has a call
     * to action" is a page-level question, and only the compiler sees the whole
     * page.
     */
    interactiveElements: number;
  };
}

/** What `1rem` means in a page that declares nothing: the browser default. */
export const DEFAULT_ROOT_PX = 16;

/**
 * Reads what the author's own markup says a `rem` is worth.
 *
 * A standalone page that writes `html{font-size:62.5%}` means `2rem` = 20px;
 * one that says nothing means `fallback` — the browser's 16px, or, when the
 * compiler knows it, the root of the store's theme (see `themeRootPx`). We
 * need this because the value cannot be preserved on the storefront (see
 * `rebaseRem`): the theme owns `<html>`.
 */
export function authorRootPx(css: string, fallback = DEFAULT_ROOT_PX): number {
  const declared = rootFontSizePx(css, {});
  return declared ?? fallback;
}

/**
 * The root font-size a store's theme sets, read from its stylesheets: what a
 * `rem` was worth on every page the merchant ever previewed a pasted landing
 * page in. Dawn writes `html{font-size:calc(var(--font-body-scale) * 62.5%)}`
 * with the variable in the settings block, so the variables of every source
 * are collected first. No declaration → the browser default.
 *
 * Why this is the fallback for pasted HTML (22/09): the same landing page
 * rendered 1.6× larger on our minimal layout than on the theme it was
 * designed in — the h1 at 60.8px instead of 38px, the price and the buy
 * button pushed below the first screen of a phone. The author's `3.8rem`
 * meant 38px there, and "there" is where the page was approved.
 */
export function themeRootPx(sources: string[]): number {
  const vars: Record<string, string> = {};
  for (const source of sources) {
    for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) vars[match[1]] = match[2].trim();
  }
  for (const source of sources) {
    const px = rootFontSizePx(source, vars);
    if (px !== null) return px;
  }
  return DEFAULT_ROOT_PX;
}

/** The last `html`/`:root` font-size in `css`, in px, or null when there is none it can read. */
function rootFontSizePx(css: string, vars: Record<string, string>): number | null {
  let px: number | null = null;
  // A lookbehind, not a consumed group: the `}` closing one rule is also what
  // the next rule needs to see before its selector.
  const rules = /(?<=(?:^|[{};])\s*)(?::root|html)(?:\s*,\s*(?::root|html|body))*\s*\{([^}]*)\}/gi;
  for (const rule of css.matchAll(rules)) {
    const match = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(rule[1]);
    if (!match) continue;
    const value = lengthPx(match[1].trim(), vars);
    if (value !== null) px = value;
  }
  return px;
}

/** `62.5%`, `10px`, `0.625em`, `8pt`, `var(--x)` or `calc(var(--x) * 62.5%)` as root px; null otherwise. */
function lengthPx(raw: string, vars: Record<string, string>, depth = 0): number | null {
  const value = raw.trim().toLowerCase();
  if (depth > 4) return null;
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable) return variable[1] in vars ? lengthPx(vars[variable[1]], vars, depth + 1) : null;
  const calc = /^calc\(\s*(.+?)\s*\*\s*(.+?)\s*\)$/.exec(value);
  if (calc) {
    const [left, right] = [calc[1], calc[2]].map((part) => factor(part, vars, depth + 1));
    // One factor is the length, the other a plain number (a scale).
    const length = [calc[1], calc[2]].find((part) => /[a-z%]$/.test(part.trim()) || part.trim().startsWith('var('));
    if (left === null || right === null || !length) return null;
    return left * right;
  }
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return null;
  if (value.endsWith('%')) return (DEFAULT_ROOT_PX * number) / 100;
  if (value.endsWith('px')) return number;
  if (value.endsWith('em')) return DEFAULT_ROOT_PX * number; // rem and em are the same at the root
  if (value.endsWith('pt')) return (number * 96) / 72;
  return null;
}

/** A calc() factor: a length (in root px), a variable, or a unitless number. */
function factor(raw: string, vars: Record<string, string>, depth: number): number | null {
  const value = raw.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  const variable = /^var\((--[\w-]+)\)$/.exec(value);
  if (variable) return variable[1] in vars ? factor(vars[variable[1]], vars, depth + 1) : null;
  return lengthPx(value, vars, depth);
}

/** A `rem` length, ignoring matches that are part of a longer identifier. */
const REM_VALUE = /(?<![\w.#%-])(-?(?:\d+\.?\d*|\.\d+))rem\b/g;

const px = (value: number): string => `${Number(value.toFixed(4))}px`;

/**
 * Converts `rem` lengths into the pixels they meant in the author's own file.
 *
 * `rem` is resolved against `<html>`, and on the storefront `<html>` belongs to
 * the theme: the store measured on 16/09 sets `font-size:62.5%`, so every
 * `5.2rem` the author wrote came out at 52px instead of 83.2px — the whole page
 * rendered at 62.5% of its design. There is no CSS that re-roots `rem` for a
 * subtree, so the only way to publish the size the author designed is to
 * resolve it here, while we still know what it was worth.
 *
 * At-rule preludes are left alone on purpose: `@media (min-width:48rem)` is
 * always measured against the initial 16px, in both places, so it is already
 * right.
 */
export function rebaseRem(css: string, rootPx: number): { css: string; count: number } {
  let out = '';
  let buffer = '';
  let count = 0;
  let i = 0;

  /** Index just past the string that starts at `from`. */
  const endOfString = (from: number): number => {
    const quote = css[from];
    let j = from + 1;
    while (j < css.length && css[j] !== quote) j += css[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, css.length);
  };

  const flush = () => {
    out += buffer.replace(REM_VALUE, (_, number) => {
      count++;
      return px(parseFloat(number) * rootPx);
    });
    buffer = '';
  };
  const copy = (end: number) => {
    flush();
    out += css.slice(i, end);
    i = end;
  };

  while (i < css.length) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      copy(close === -1 ? css.length : close + 2);
      continue;
    }
    if (char === '"' || char === "'") {
      copy(endOfString(i));
      continue;
    }
    if (char === '@') {
      // The prelude, up to and including the `{` that opens the block or the
      // `;` that ends the at-rule — and neither can be inside a string or a
      // function: `@import url('…css2?family=X;wght@0,600')` has both.
      let j = i + 1;
      let depth = 0;
      while (j < css.length) {
        const c = css[j];
        if (c === '"' || c === "'") {
          j = endOfString(j);
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (depth === 0 && (c === '{' || c === ';')) {
          j++;
          break;
        }
        j++;
      }
      copy(Math.min(j, css.length));
      continue;
    }
    if (css.startsWith('url(', i)) {
      let j = i + 4;
      while (j < css.length && css[j] !== ')') j = css[j] === '"' || css[j] === "'" ? endOfString(j) : j + 1;
      copy(Math.min(j + 1, css.length));
      continue;
    }
    buffer += char;
    i++;
  }
  flush();
  return { css: out, count };
}

/** Splits a `style` attribute into declarations, dropping empty fragments. */
function parseInlineStyle(value: string): string[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes(':'))
    .map((part) => {
      const index = part.indexOf(':');
      const prop = part.slice(0, index).trim();
      const val = part.slice(index + 1).trim();
      return `${prop}:${val}`;
    });
}

/**
 * Prefixes every selector in a stylesheet with the page scope.
 *
 * This is the part that keeps the author's CSS from fighting the theme — the
 * exact failure the competitor patches by telling merchants to paste snippets
 * from a video description.
 *
 * At-rules are handled by recursing into the ones that wrap rules (`@media`,
 * `@supports`, `@container`) and passing through the ones that do not
 * (`@keyframes`, `@font-face`, `@import`), whose contents must not be prefixed.
 */
export function scopeCss(rawCss: string, scope: string): string {
  // Comments go first, whole. Left in, a comment sitting before a selector is
  // read as part of the selector list: split on its commas, each piece
  // prefixed with the scope — and a `{` inside one throws the brace counter
  // off for the rest of the sheet. Seen on 21/09 with a pasted landing page
  // whose comments had commas. Comments carry no styling; dropping them is
  // the one rewrite here that cannot change what the visitor sees.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let i = 0;

  const readBlock = (start: number): { body: string; end: number } => {
    let depth = 0;
    let j = start;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') {
        depth--;
        if (depth === 0) return { body: css.slice(start + 1, j), end: j + 1 };
      }
    }
    return { body: css.slice(start + 1), end: css.length };
  };

  while (i < css.length) {
    const braceAt = css.indexOf('{', i);
    if (braceAt === -1) {
      // Trailing at-rule without a block, e.g. `@import url(...);`
      const rest = css.slice(i).trim();
      if (rest) out.push(rest);
      break;
    }

    // A blockless at-rule before this block (`@import url(x);.a{…}`) is
    // not part of the prelude: left in, the prelude started with `@` and
    // the rule after it went out unscoped.
    const raw = css.slice(i, braceAt);
    const lead = raw.slice(0, raw.lastIndexOf(';') + 1).trim();
    if (lead) out.push(lead);
    const prelude = raw.slice(raw.lastIndexOf(';') + 1).trim();
    const { body, end } = readBlock(braceAt);

    if (prelude.startsWith('@')) {
      const name = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
      if (name === 'media' || name === 'supports' || name === 'container' || name === 'layer') {
        out.push(`${prelude}{${scopeCss(body, scope)}}`);
      } else {
        // keyframes, font-face, page, property: contents are not selectors.
        out.push(`${prelude}{${body}}`);
      }
    } else if (prelude.length === 0) {
      out.push(`{${body}}`);
    } else {
      const scoped = prelude
        .split(',')
        .map((sel) => sel.trim())
        .filter(Boolean)
        .map((sel) => {
          // `:root` and `html`/`body` inside a fragment mean "the page", and the
          // page is our subtree. Rewriting them keeps custom properties working
          // without letting the author restyle the merchant's whole storefront.
          if (/^(:root|html|body)\b/i.test(sel)) {
            return sel.replace(/^(:root|html|body)/i, `.${scope}`);
          }
          return `.${scope} ${sel}`;
        })
        .join(',');
      out.push(`${scoped}{${body}}`);
    }
    i = end;
  }

  return out.join('');
}

// --- Motion cost: CSS that keeps a phone's main thread busy ---------------

/** Properties whose animation makes the browser lay the page out again. */
const LAYOUT_PROP =
  /^(?:width|height|(?:min|max)-(?:width|height)|top|right|bottom|left|inset(?:-[a-z-]+)?|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|border(?:-[a-z]+)?-width|gap|row-gap|column-gap|font-size|font-weight|line-height|letter-spacing|flex(?:-[a-z]+)?|grid-[a-z-]+)$/;
/** Properties whose animation repaints the element (and its neighbours) every frame. */
const PAINT_PROP =
  /^(?:background(?:-[a-z]+)?|border(?:-[a-z-]+)?|outline(?:-[a-z]+)?|box-shadow|text-shadow|color|clip-path|fill|stroke(?:-[a-z]+)?|mask(?:-[a-z]+)?)$/;
/** Words of an `animation` / `transition` shorthand that are never a name. */
const MOTION_KEYWORDS = new Set([
  'none', 'all', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end',
  'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards', 'both', 'running', 'paused',
  'initial', 'inherit', 'unset', 'revert',
]);
const IDENT = /^-?[a-z_][\w-]*$/i;

/** The `prelude{body}` blocks of a sheet, in order; blockless at-rules (`@import …;`) are skipped. */
function* cssBlocks(css: string): Generator<{ prelude: string; body: string }> {
  for (let i = 0; i < css.length; ) {
    const open = css.indexOf('{', i);
    if (open === -1) return;
    let depth = 0;
    let close = css.length;
    for (let j = open; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) { close = j; break; }
    }
    const prelude = css.slice(i, open).trim();
    yield { prelude: prelude.slice(prelude.lastIndexOf(';') + 1).trim(), body: css.slice(open + 1, close) };
    i = close + 1;
  }
}

/**
 * Comma split that skips commas inside parentheses: `a 1s cubic-bezier(.2,1,.3,1), b 2s`
 * is two parts. (`f(a, g(b))` splits wrong, and its fragments fail `IDENT`: no finding.)
 */
const splitTop = (value: string): string[] =>
  value.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);

/** `[prop, value]` pairs of a rule body. Custom properties stay out; `!important` is dropped. */
function declarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    const prop = part.slice(0, at).trim().toLowerCase();
    if (at === -1 || !/^-?[a-z][a-z-]*$/.test(prop)) continue;
    out.push([prop, part.slice(at + 1).replace(/!important/i, '').trim().toLowerCase()]);
  }
  return out;
}

/**
 * Reports CSS that keeps the phone's main thread busy: keyframes and
 * transitions on properties that force layout or paint on every frame, blur
 * and backdrop filters, and `will-change` sprayed over the sheet. Shopify's
 * theme performance guide and web.dev say the same thing — animate
 * `transform` and `opacity`, which the compositor runs off the main thread.
 * Reported, never rewritten: a `width` animation turned into `scaleX` does
 * not look the same, and that call is the author's.
 */
export function auditMotion(rawCss: string): Finding[] {
  // Analysis only, so the sheet can be simplified: comments go, string
  // contents are emptied, and a `;` or `{` inside `content:"…"` or
  // `url("…")` can no longer split a declaration or a block.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  const frames = new Map<string, Set<string>>(); // keyframes name → every property its frames touch
  const uses = new Map<string, { infinite: boolean; where: string }>(); // keyframes name → the rule that plays it
  const transitions: string[] = [];
  const effects: string[] = [];
  let willChange = 0;
  let reducedMotion = false;

  const rule = (selector: string, body: string): void => {
    const where = splitTop(selector)[0]?.split(/\s+/).pop() ?? selector;
    const names: string[] = [];
    let infinite = false;
    for (const [prop, value] of declarations(body)) {
      if (prop === 'animation' || prop === 'animation-name') {
        for (const part of splitTop(value)) {
          const tokens = part.split(/\s+/);
          const name = tokens.find((t) => IDENT.test(t) && !MOTION_KEYWORDS.has(t));
          if (name) names.push(name);
          if (tokens.includes('infinite')) infinite = true;
        }
      } else if (prop === 'animation-iteration-count') {
        if (/\binfinite\b/.test(value)) infinite = true;
      } else if (prop === 'transition' || prop === 'transition-property') {
        const slow = splitTop(value)
          .map((part) => part.split(/\s+/).find((t) => t === 'all' || (IDENT.test(t) && !MOTION_KEYWORDS.has(t))) ?? '')
          // Layout only: a 200ms `color` hover is a normal idiom, and paint
          // that stops when the finger lifts is not worth a line of noise.
          .filter((p) => p === 'all' || LAYOUT_PROP.test(p));
        if (slow.length) transitions.push(`${where} (${slow.join(', ')})`);
      } else if (prop.endsWith('backdrop-filter')) {
        if (value !== 'none') effects.push(`${where}: backdrop-filter`);
      } else if (prop.endsWith('filter')) {
        const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(value);
        if (blur && Number(blur[1]) > 10) effects.push(`${where}: filter blur(${blur[1]}px)`);
      } else if (prop === 'will-change' && value !== 'auto') {
        willChange++;
      }
    }
    for (const name of names) {
      const seen = uses.get(name);
      uses.set(name, { infinite: infinite || Boolean(seen?.infinite), where: seen?.where ?? where });
    }
  };
  const scan = (sheet: string): void => {
    for (const { prelude, body } of cssBlocks(sheet)) {
      if (!prelude.startsWith('@')) { rule(prelude, body); continue; }
      const kind = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
      if (/^(?:-\w+-)?keyframes$/.test(kind)) {
        const name = prelude.split(/\s+/)[1] ?? '';
        const props = frames.get(name) ?? new Set<string>();
        for (const frame of cssBlocks(body)) for (const [prop] of declarations(frame.body)) props.add(prop);
        frames.set(name, props);
      } else if (kind === 'media' || kind === 'supports' || kind === 'container' || kind === 'layer') {
        // Either form counts: `no-preference` around the animation and
        // `reduce` switching it off both mean the author thought of it.
        if (/prefers-reduced-motion/i.test(prelude)) reducedMotion = true;
        scan(body);
      }
    }
  };
  scan(css);

  const findings: Finding[] = [];
  for (const [name, use] of uses) {
    const props = [...(frames.get(name) ?? [])];
    const layout = props.filter((p) => LAYOUT_PROP.test(p));
    const paint = props.filter((p) => PAINT_PROP.test(p));
    if (layout.length + paint.length === 0) continue; // transform/opacity only: the compositor's job
    findings.push({
      severity: 'warning',
      code: 'html/animation-repaints',
      message:
        `A animação «${name}» (em ${use.where}) anima ${[...layout, ...paint].join(', ')}: ` +
        `${layout.length ? 'recalcula o layout' : 'repinta a área'} a cada quadro, na thread principal do celular` +
        (use.infinite ? ', durante a visita inteira (infinite)' : '') +
        '. Anime só transform e opacity; para um brilho pulsante, anime a opacidade de uma camada com a sombra já pintada.' +
        (use.infinite && !reducedMotion
          ? ' Não há @media (prefers-reduced-motion: reduce) desligando a animação para quem pediu menos movimento no aparelho.'
          : ''),
    });
  }
  if (transitions.length > 0) {
    findings.push({
      severity: 'info',
      code: 'html/animation-repaints',
      message:
        `Transição em propriedade que recalcula o layout: ${transitions.join('; ')}. ` +
        'Enquanto ela corre, cada quadro passa pela thread principal — prefira transform e opacity ' +
        '(largura → transform: scaleX; "all" → só as propriedades que mudam).',
    });
  }
  if (willChange > 5) effects.push(`will-change em ${willChange} regras`);
  if (effects.length > 0) {
    findings.push({
      severity: 'info',
      code: 'html/expensive-effects',
      message:
        `Efeito caro para o celular: ${effects.join('; ')}. Desfoque e backdrop-filter repintam a área inteira a cada rolagem; ` +
        'will-change em muitos elementos reserva memória de GPU que o celular não tem.',
    });
  }
  return findings;
}

export function optimizeHtml(source: string, options: OptimizeOptions): OptimizeResult {
  const { scope, eagerAttribute = 'data-dvf-eager' } = options;
  const findings: Finding[] = [];
  const stats = {
    inlineStylesKept: 0,
    styleBlocksScoped: 0,
    imagesTouched: 0,
    imagesFound: 0,
    imagesResponsive: 0,
    firstImage: null as LcpImage | null,
    scriptsFound: 0,
    remRebased: 0,
    headingLevels: [] as number[],
    interactiveElements: 0,
  };

  const root = parse(source, {
    comment: false,
    // Keep whitespace: in prose-heavy advertorial markup it is meaningful.
    blockTextElements: { script: true, style: true, pre: true, textarea: true },
  });

  // What a `rem` was worth in the author's file. Read before anything is
  // rewritten, because scoping turns his `html{...}` into `.dvf-page{...}`.
  const styleBlocks = root.querySelectorAll('style');
  const rootPx = authorRootPx(styleBlocks.map((style) => style.innerHTML).join('\n'), options.rootPx);

  // --- 1. Inline styles stay exactly where the author put them -------------
  //
  // They used to be hoisted into the shared stylesheet, which saved bytes and
  // silently restyled the page: a `style="margin:16px 0"` beats every rule in
  // the cascade, but the class it became (specificity 0,1,0) loses to the
  // author's own `#lp .price` — and to the theme. A landing page pasted here
  // on 16/09 came out with images at full width and margins gone, and it was
  // this pass. What the author pastes is what gets published.
  //
  // The single exception is the `rem`, and it exists to keep that promise
  // rather than to break it: see `rebaseRem`.
  for (const element of root.querySelectorAll('[style]')) {
    const raw = element.getAttribute('style') ?? '';
    if (parseInlineStyle(raw).length === 0) {
      element.removeAttribute('style');
      continue;
    }
    const rebased = rebaseRem(raw, rootPx);
    if (rebased.count > 0) {
      element.setAttribute('style', rebased.css);
      stats.remRebased += rebased.count;
    }
    stats.inlineStylesKept++;
  }

  // --- 2. Scope <style> blocks so neither side can reach the other ----------
  const authorCss: string[] = [];
  for (const style of styleBlocks) {
    const rebased = rebaseRem(style.innerHTML, rootPx);
    stats.remRebased += rebased.count;
    authorCss.push(rebased.css);
    style.set_content(scopeCss(rebased.css, scope));
    stats.styleBlocksScoped++;
  }

  // --- 3. Images: the LCP one first, the rest lazy, CDN ones sized ---------
  const images = root.querySelectorAll('img');
  stats.imagesFound = images.length;
  // Standing alone (tests, the CLI), this block is the page: the first image
  // big enough is the hero.
  let localHero = false;
  const claim =
    options.claimImage ??
    ((image: ImageClaim): { role: ImageRole } => {
      if (localHero) return { role: 'after-hero' };
      if (!isHeroCandidate(image)) return { role: 'before-hero' };
      localHero = true;
      return { role: 'hero' };
    });
  images.forEach((img) => {
    let touched = false;
    const src = img.getAttribute('src') ?? '';
    const declared = Number(img.getAttribute('width')) || undefined;

    // A CDN image the author did not size himself gets served at the width
    // the screen needs. His `width=` attribute (when present) caps it; his
    // own `srcset` is respected untouched.
    if (src && !img.hasAttribute('srcset')) {
      const responsive = responsiveImage(src, { width: declared, sizes: img.getAttribute('sizes') ?? undefined });
      if (responsive) {
        img.setAttribute('src', responsive.src);
        img.setAttribute('srcset', responsive.srcset);
        img.setAttribute('sizes', responsive.sizes);
        stats.imagesResponsive++;
        touched = true;
      }
    }

    // Decided for the PAGE, not for this block: the hero is the first big
    // image anywhere on it, and what precedes the hero is above the fold.
    const { role } = claim({
      src: img.getAttribute('src') ?? '',
      srcset: img.getAttribute('srcset') ?? undefined,
      sizes: img.getAttribute('sizes') ?? undefined,
      width: declared,
    });
    const hero = role === 'hero';

    if (!img.hasAttribute('loading')) {
      // The author marks above-the-fold images explicitly; absent that, the
      // hero and everything before it stay eager, the rest waits.
      const eager = img.hasAttribute(eagerAttribute) || role !== 'after-hero';
      if (!eager) {
        img.setAttribute('loading', 'lazy');
        touched = true;
      }
    }
    if (hero && !img.hasAttribute('fetchpriority')) {
      img.setAttribute('fetchpriority', 'high');
      touched = true;
    }
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
      touched = true;
    }
    if (touched) stats.imagesTouched++;
    if (hero && img.getAttribute('src')) {
      stats.firstImage = {
        src: img.getAttribute('src')!,
        srcset: img.getAttribute('srcset') ?? undefined,
        sizes: img.getAttribute('sizes') ?? undefined,
      };
    }

    const sample = placeholderHost(src);
    if (sample) {
      findings.push({
        severity: 'error',
        code: 'html/image-placeholder',
        message:
          `Imagem de exemplo no HTML (${sample}) — troque pela imagem real antes de publicar. ` +
          'Esses serviços somem ou ficam lentos, e o visitante espera por uma imagem que não vem.',
      });
    }

    if (!img.hasAttribute('width') || !img.hasAttribute('height')) {
      findings.push({
        severity: 'warning',
        code: 'html/image-missing-dimensions',
        message: `Imagem sem width/height no HTML (${describe(img)}) — é a principal causa de layout shift.`,
      });
    }
    if (!img.hasAttribute('alt')) {
      findings.push({
        severity: 'error',
        code: 'html/image-missing-alt',
        message: `Imagem sem alt no HTML (${describe(img)}). Use alt="" se for decorativa.`,
      });
    }
  });

  // --- 4. Report, never rewrite: things the author must decide on ----------
  const scripts = root.querySelectorAll('script');
  stats.scriptsFound = scripts.length;
  if (scripts.length > 0) {
    findings.push({
      severity: 'info',
      code: 'html/contains-script',
      message: `O HTML traz ${scripts.length} script(s). Eles são publicados como estão e contam no orçamento da página.`,
    });
  }

  // Render-blocking resources. A stylesheet `<link>` in the page body holds
  // the paint of everything after it until the file arrives; on 4G that is
  // seconds of blank screen below the point where it sits. Same for a
  // synchronous external script, which also halts the parser. Both have a
  // one-line fix the author owns, so this is a warning with the fix in it —
  // never a rewrite, since the order scripts run in is the author's contract.
  // (web.dev "optimize LCP": element render delay; Shopify's performance
  // guide: render-blocking scripts, async CSS pattern.)
  for (const link of root.querySelectorAll('link[rel~="stylesheet"]')) {
    // The `<noscript>` copy of the pattern only exists for visitors without
    // JS; with JS it is inert and blocks nothing.
    if (link.closest('noscript')) continue;
    const media = (link.getAttribute('media') ?? '').trim().toLowerCase();
    const deferred = media !== '' && media !== 'all' && media !== 'screen';
    if (deferred) continue;
    findings.push({
      severity: 'warning',
      code: 'html/blocking-stylesheet',
      message:
        `Folha de estilo que trava a pintura da página (${describe(link)}). ` +
        `Carregue sem travar: media="print" onload="this.media='all'" na tag, e uma cópia dentro de <noscript>.`,
    });
  }
  for (const style of styleBlocks) {
    if (!/@import\b/.test(style.innerHTML)) continue;
    findings.push({
      severity: 'warning',
      code: 'html/blocking-stylesheet',
      message:
        'Um @import dentro de <style> trava a pintura até o arquivo importado chegar. ' +
        `Troque por <link rel="stylesheet" media="print" onload="this.media='all'"> com uma cópia em <noscript>.`,
    });
  }
  // Motion that costs the phone its main thread: see `auditMotion`. All the
  // blocks at once, because a keyframes in one is played by a rule in another.
  findings.push(...auditMotion(authorCss.join('\n')));

  for (const script of scripts) {
    if (!script.getAttribute('src')) continue;
    if (script.hasAttribute('async') || script.hasAttribute('defer')) continue;
    if ((script.getAttribute('type') ?? '').trim().toLowerCase() === 'module') continue;
    findings.push({
      severity: 'warning',
      code: 'html/blocking-script',
      message:
        `Script externo que segura a leitura da página (${describe(script)}). ` +
        'Acrescente defer (ou async, se ele não depende de nada) para ele carregar sem travar o resto.',
    });
  }

  for (const node of root.querySelectorAll('[onclick]')) {
    findings.push({
      severity: 'warning',
      code: 'html/click-handler-instead-of-link',
      message:
        `<${node.rawTagName}> usa onclick para navegar (${describe(node)}). ` +
        'Um link de verdade (<a href>) permite abrir em nova aba, copiar o endereço e ser rastreado por buscadores.',
    });
  }

  for (const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    stats.headingLevels.push(Number(heading.rawTagName.slice(1)));
  }

  // A div wired up with onclick counts here too: it is a bad call to action,
  // but it is a call to action, and it is already reported as bad above.
  stats.interactiveElements =
    root.querySelectorAll('a[href],button,[onclick]').length;

  return { html: root.toString(), findings, stats };
}

/** A short, safe identifier for an element, for use in messages. */
function describe(element: ParsedElement): string {
  const id = element.getAttribute('id');
  if (id) return `#${id}`;
  const src = element.getAttribute('src') ?? element.getAttribute('href');
  if (src) return src.length > 48 ? src.slice(0, 45) + '…' : src;
  const cls = element.getAttribute('class');
  if (cls) return `.${cls.split(/\s+/)[0]}`;
  return `<${element.rawTagName}>`;
}
