/**
 * The compiler: `Doc -> { html, css, js }`.
 *
 * This function is the single rendering path for the whole product. The editor
 * canvas renders its output and the publisher writes its output. There is no
 * second implementation to drift away from the first, which is the structural
 * answer to "the editor does not match the live page".
 *
 * It is pure: same document in, byte-identical output out. That is what lets a
 * published page be frozen — the page is the output, not a reference to a
 * runtime that keeps changing underneath it.
 */

import type { Finding } from './audit.ts';
import {
  ANIMATION_CSS,
  ANIMATIONS,
  BLOCKS,
  RUNTIME,
  type RenderContext,
  type RuntimeModule,
} from './blocks.ts';
import { CLASS_PREFIX, StyleSheet } from './css.ts';
import { tag } from './html.ts';
import { optimizeHtml } from './html-optimize.ts';
import { validate, type Doc, type Node } from './schema.ts';

export interface CompileResult {
  html: string;
  css: string;
  js: string;
  stats: {
    nodes: number;
    /** Distinct CSS rules emitted. */
    cssRules: number;
    /** How many times a node asked for a rule. The gap is the saving. */
    styleRegistrations: number;
    runtimeModules: RuntimeModule[];
    bytes: { html: number; css: number; js: number; total: number };
    /** Work done by the HTML optimization pass, when any block used it. */
    htmlOptimization: {
      inlineStylesHoisted: number;
      styleBlocksScoped: number;
      imagesTouched: number;
      scriptsFound: number;
    };
  };
  /** Problems found in author-written HTML while compiling. */
  findings: Finding[];
}

export interface CompileOptions {
  /** Skip validation when the document is known-good (e.g. inside a loop). */
  skipValidation?: boolean;
  /**
   * Editor builds only: stamp each block's root element with `data-dvf-id` so
   * the canvas can map a click back to its node. Never used for publishing —
   * the published page carries no editor residue (I3).
   */
  nodeIds?: boolean;
  /**
   * Editor builds only: unconfigured blocks (an image without a source, a
   * video without a link) render a placeholder naming the exact field that
   * fixes them. Published output still emits nothing for those blocks.
   */
  editorHints?: boolean;
}

export function compile(doc: Doc, options: CompileOptions = {}): CompileResult {
  if (!options.skipValidation) {
    const errors = validate(doc);
    if (errors.length > 0) {
      throw new Error(`invalid document:\n  ${errors.join('\n  ')}`);
    }
  }

  const sheet = new StyleSheet();
  const runtimes = new Set<RuntimeModule>();
  const findings: Finding[] = [];
  const htmlOptimization = {
    inlineStylesHoisted: 0,
    styleBlocksScoped: 0,
    imagesTouched: 0,
    scriptsFound: 0,
  };
  /** Contributions from author HTML, for the page-level checks below. */
  const htmlHeadings: number[] = [];
  let htmlInteractive = 0;
  let nodes = 0;

  const ctx: RenderContext = {
    renderChildren: (children) => (children ?? []).map(render).join(''),
    classAttr: (node, extra) => {
      const names = sheet.register(node.style);
      if (extra) names.push(extra);
      return names.length > 0 ? names.join(' ') : undefined;
    },
    baseAttrs: (node) => {
      // Entrance animation is available to every block, so it lives here
      // rather than in each renderer. Unknown names compile to nothing.
      const animation = String(node.props?.animation ?? '');
      const animated = (ANIMATIONS as readonly string[]).includes(animation);
      if (animated) runtimes.add('reveal');
      return {
        class: ctx.classAttr(node),
        ...(animated ? { 'data-dvf-anim': animation } : {}),
        ...(options.nodeIds ? { 'data-dvf-id': node.id } : {}),
      };
    },
    requireRuntime: (name) => {
      runtimes.add(name);
    },
    hint: (node, route) => {
      if (!options.editorHints) return '';
      return tag(
        'div',
        {
          ...ctx.baseAttrs(node),
          'data-dvf-hint': '',
          style:
            'border:1.5px dashed #d9a514;background:#fdf6e3;color:#8a6116;' +
            'padding:18px 16px;border-radius:8px;font:13px/1.5 -apple-system,system-ui,sans-serif;text-align:center',
        },
        route,
      );
    },
    optimizeHtml: (source) => {
      const result = optimizeHtml(source, { sheet, scope: `${CLASS_PREFIX}-page` });
      findings.push(...result.findings);
      htmlOptimization.inlineStylesHoisted += result.stats.inlineStylesHoisted;
      htmlOptimization.styleBlocksScoped += result.stats.styleBlocksScoped;
      htmlOptimization.imagesTouched += result.stats.imagesTouched;
      htmlOptimization.scriptsFound += result.stats.scriptsFound;
      htmlHeadings.push(...result.stats.headingLevels);
      htmlInteractive += result.stats.interactiveElements;
      return result.html;
    },
  };

  function render(node: Node): string {
    // The eye toggle: a hidden node (and its whole subtree) simply does not
    // exist in the output. CSS hiding would still ship the bytes and the
    // content to every visitor; omission is the only honest "hidden".
    if (node.hidden) return '';
    nodes++;
    const renderer = BLOCKS[node.type];
    if (!renderer) {
      // An unknown block means a document from a newer schema. Skipping it
      // silently would publish a page with a hole in it, so fail loudly.
      throw new Error(`unknown block type "${node.type}" (node ${node.id})`);
    }
    return renderer(node, ctx);
  }

  const body = doc.root.map(render).join('');

  // Page-level checks run once, over everything. They live here rather than in
  // `audit` because this is the only place that sees both the block tree and
  // the inside of author-written HTML.
  // Hidden subtrees are excluded: they are not on the page, so they must not
  // satisfy (or trigger) any page-level check.
  const allNodes: Node[] = [];
  const collectVisible = (list: Node[]) => {
    for (const node of list) {
      if (node.hidden) continue;
      allNodes.push(node);
      if (node.children) collectVisible(node.children);
    }
  };
  collectVisible(doc.root);
  const blockHeadings = allNodes
    .filter((node) => node.type === 'heading')
    .map((node) => Number(node.props?.level ?? 2));
  const allHeadings = [...blockHeadings, ...htmlHeadings];
  const h1Count = allHeadings.filter((level) => level === 1).length;

  if (allHeadings.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'page/no-heading',
      message: 'A página não tem nenhum título.',
    });
  } else if (h1Count === 0) {
    findings.push({
      severity: 'error',
      code: 'page/no-h1',
      message: 'A página tem títulos, mas nenhum H1. Todo documento precisa de um título principal.',
    });
  } else if (h1Count > 1) {
    findings.push({
      severity: 'error',
      code: 'page/multiple-h1',
      message: `A página tem ${h1Count} H1. Rebaixe os secundários para H2.`,
    });
  }

  const interactive =
    allNodes.filter((node) => node.type === 'button').length + htmlInteractive;
  if (interactive === 0) {
    findings.push({
      severity: 'warning',
      code: 'page/no-cta',
      message: 'A página não tem nenhuma chamada para ação.',
    });
  }
  const html = tag('div', { class: `${CLASS_PREFIX}-page` }, body);
  // Animation CSS ships only when at least one block animates.
  const css = sheet.toCss(doc.tokens) + (runtimes.has('reveal') ? '\n' + ANIMATION_CSS : '');

  const modules = [...runtimes].sort();
  const js = modules.map((name) => RUNTIME[name]).join('\n');

  const sheetStats = sheet.stats();
  const bytes = {
    html: Buffer.byteLength(html, 'utf8'),
    css: Buffer.byteLength(css, 'utf8'),
    js: Buffer.byteLength(js, 'utf8'),
    total: 0,
  };
  bytes.total = bytes.html + bytes.css + bytes.js;

  return {
    html,
    css,
    js,
    stats: {
      nodes,
      cssRules: sheetStats.rules,
      styleRegistrations: sheetStats.registrations,
      runtimeModules: modules,
      bytes,
      htmlOptimization,
    },
    findings,
  };
}

/**
 * Assembles the compiled parts into a single fragment suitable for a theme
 * section or a Page `body` field.
 *
 * The stylesheet is inlined rather than linked: it is small, page-specific, and
 * an extra request costs more than the bytes do. The script tag is emitted only
 * if a block actually asked for one, and it is deferred as a module.
 */
export function toFragment(result: CompileResult): string {
  const parts = [`<style>${result.css}</style>`, result.html];
  if (result.js) parts.push(`<script type="module">${result.js}</script>`);
  return parts.join('\n');
}
