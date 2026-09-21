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
import { placeholderHost, responsiveImage, type LcpImage } from './images.ts';

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
   * Images the page already emitted before this block, in document order.
   * "The first image on the page" is a page-level fact — with two HTML blocks
   * each would otherwise crown its own hero — so the compiler passes it in.
   */
  imageOffset?: number;
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
const DEFAULT_ROOT_PX = 16;

/**
 * Reads what the author's own markup says a `rem` is worth.
 *
 * A standalone page that writes `html{font-size:62.5%}` means `2rem` = 20px;
 * one that says nothing means 16px. We need this because the value cannot be
 * preserved on the storefront (see `rebaseRem`): the theme owns `<html>`.
 */
export function authorRootPx(css: string): number {
  let px = DEFAULT_ROOT_PX;
  const rules = /(?:^|[{}；;])\s*(?::root|html)\s*\{([^}]*)\}/gi;
  for (const rule of css.matchAll(rules)) {
    const match = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(rule[1]);
    if (!match) continue;
    const value = match[1].trim();
    const number = parseFloat(value);
    if (!Number.isFinite(number)) continue;
    if (value.endsWith('%')) px = (DEFAULT_ROOT_PX * number) / 100;
    else if (value.endsWith('px')) px = number;
    else if (value.endsWith('em')) px = DEFAULT_ROOT_PX * number; // rem and em are the same at the root
    else if (value.endsWith('pt')) px = (number * 96) / 72;
  }
  return px;
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

    const prelude = css.slice(i, braceAt).trim();
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
  const rootPx = authorRootPx(styleBlocks.map((style) => style.innerHTML).join('\n'));

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
  for (const style of styleBlocks) {
    const rebased = rebaseRem(style.innerHTML, rootPx);
    stats.remRebased += rebased.count;
    style.set_content(scopeCss(rebased.css, scope));
    stats.styleBlocksScoped++;
  }

  // --- 3. Images: the LCP one first, the rest lazy, CDN ones sized ---------
  const images = root.querySelectorAll('img');
  stats.imagesFound = images.length;
  images.forEach((img, index) => {
    let touched = false;
    // First on the PAGE, not in this block: the offset carries what came before.
    const first = (options.imageOffset ?? 0) + index === 0;
    const src = img.getAttribute('src') ?? '';

    // A CDN image the author did not size himself gets served at the width
    // the screen needs. His `width=` attribute (when present) caps it; his
    // own `srcset` is respected untouched.
    if (src && !img.hasAttribute('srcset')) {
      const declared = Number(img.getAttribute('width')) || undefined;
      const responsive = responsiveImage(src, { width: declared, sizes: img.getAttribute('sizes') ?? undefined });
      if (responsive) {
        img.setAttribute('src', responsive.src);
        img.setAttribute('srcset', responsive.srcset);
        img.setAttribute('sizes', responsive.sizes);
        stats.imagesResponsive++;
        touched = true;
      }
    }

    if (!img.hasAttribute('loading')) {
      // The author marks above-the-fold images explicitly. Absent that, only
      // the first image on the page is treated as the hero and left eager.
      const eager = img.hasAttribute(eagerAttribute) || first;
      if (!eager) {
        img.setAttribute('loading', 'lazy');
        touched = true;
      }
    }
    if (first && !img.hasAttribute('fetchpriority')) {
      img.setAttribute('fetchpriority', 'high');
      touched = true;
    }
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
      touched = true;
    }
    if (touched) stats.imagesTouched++;
    if (first && img.getAttribute('src')) {
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
