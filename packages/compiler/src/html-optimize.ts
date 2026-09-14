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
 *   - inline `style` attributes are hoisted into the scoped, deduplicated
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

export interface OptimizeOptions {
  /** Shared stylesheet, so hoisted rules deduplicate against block styles too. */
  sheet: StyleSheet;
  /** Class that scopes the page subtree. Used to contain `<style>` blocks. */
  scope: string;
  /**
   * Images above the fold should not be lazy. The author marks them by adding
   * `data-dvf-eager`; we never guess, because guessing wrong costs LCP.
   */
  eagerAttribute?: string;
}

export interface OptimizeResult {
  html: string;
  findings: Finding[];
  stats: {
    inlineStylesHoisted: number;
    styleBlocksScoped: number;
    imagesTouched: number;
    scriptsFound: number;
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
export function scopeCss(css: string, scope: string): string {
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
  const { sheet, scope, eagerAttribute = 'data-dvf-eager' } = options;
  const findings: Finding[] = [];
  const stats = {
    inlineStylesHoisted: 0,
    styleBlocksScoped: 0,
    imagesTouched: 0,
    scriptsFound: 0,
    headingLevels: [] as number[],
    interactiveElements: 0,
  };

  const root = parse(source, {
    comment: false,
    // Keep whitespace: in prose-heavy advertorial markup it is meaningful.
    blockTextElements: { script: true, style: true, pre: true, textarea: true },
  });

  // --- 1. Hoist inline styles into the shared, deduplicated stylesheet -------
  for (const element of root.querySelectorAll('[style]')) {
    const raw = element.getAttribute('style') ?? '';
    const declarations = parseInlineStyle(raw);
    if (declarations.length === 0) {
      element.removeAttribute('style');
      continue;
    }
    const className = sheet.adopt(declarations);
    element.removeAttribute('style');
    const existing = element.getAttribute('class');
    element.setAttribute('class', existing ? `${existing} ${className}` : className);
    stats.inlineStylesHoisted++;
  }

  // --- 2. Scope <style> blocks so neither side can reach the other ----------
  for (const style of root.querySelectorAll('style')) {
    const scoped = scopeCss(style.innerHTML, scope);
    style.set_content(scoped);
    stats.styleBlocksScoped++;
  }

  // --- 3. Images: lazy, async, and honest reporting about dimensions --------
  const images = root.querySelectorAll('img');
  images.forEach((img, index) => {
    let touched = false;

    if (!img.hasAttribute('loading')) {
      // The author marks above-the-fold images explicitly. Absent that, only the
      // very first image is treated as likely-hero and left eager.
      const eager = img.hasAttribute(eagerAttribute) || index === 0;
      if (!eager) {
        img.setAttribute('loading', 'lazy');
        touched = true;
      }
    }
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
      touched = true;
    }
    if (touched) stats.imagesTouched++;

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
