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

import { BLOCKS, RUNTIME, type RenderContext, type RuntimeModule } from './blocks.ts';
import { CLASS_PREFIX, StyleSheet } from './css.ts';
import { tag } from './html.ts';
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
  };
}

export interface CompileOptions {
  /** Skip validation when the document is known-good (e.g. inside a loop). */
  skipValidation?: boolean;
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
  let nodes = 0;

  const ctx: RenderContext = {
    renderChildren: (children) => (children ?? []).map(render).join(''),
    classAttr: (node, extra) => {
      const names = sheet.register(node.style);
      if (extra) names.push(extra);
      return names.length > 0 ? names.join(' ') : undefined;
    },
    requireRuntime: (name) => {
      runtimes.add(name);
    },
  };

  function render(node: Node): string {
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
  const html = tag('div', { class: `${CLASS_PREFIX}-page` }, body);
  const css = sheet.toCss(doc.tokens);

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
    },
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
