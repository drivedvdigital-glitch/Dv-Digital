/**
 * Static page audit.
 *
 * The research on the market leader found that most of what is sold as an
 * "AI page checkup" is structural analysis: exactly one H1, headings that do
 * not skip levels, images with alt text, a call to action present, placeholder
 * copy left unfilled. None of that needs a model — it needs the block tree,
 * which we already have in memory at publish time.
 *
 * This module is that claim, made concrete. It is under 150 lines and runs in
 * microseconds.
 */

import { walk, type Doc, type Node } from './schema.ts';
import { safeUrl } from './html.ts';
import { placeholderHost } from './images.ts';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  nodeId?: string;
}

/** Copy that a template shipped with and nobody replaced. */
const PLACEHOLDER = /^(lorem ipsum|texto de exemplo|seu t[íi]tulo aqui|placeholder)/i;

export function audit(doc: Doc): Finding[] {
  const findings: Finding[] = [];
  const nodes = [...walk(doc.root)];

  auditHeadings(nodes, findings);
  auditImages(nodes, findings);
  auditActions(nodes, findings);
  auditPlaceholders(nodes, findings);

  return findings;
}

/**
 * Page-level checks live in the compiler, not here, because only the compiler
 * sees inside author-written HTML blocks. `audit` covers what is visible in the
 * block tree alone; anything that asks "does *the page* have ..." needs both.
 */

function auditHeadings(nodes: Node[], findings: Finding[]): void {
  const headings = nodes
    .filter((node) => node.type === 'heading')
    .map((node) => ({ node, level: Number(node.props?.level ?? 2) }));

  // Skipped levels break outline navigation for screen readers.
  let previous = 0;
  for (const { node, level } of headings) {
    if (previous > 0 && level > previous + 1) {
      findings.push({
        severity: 'warning',
        code: 'heading/skipped-level',
        message: `Hierarquia de títulos pula de H${previous} para H${level}.`,
        nodeId: node.id,
      });
    }
    previous = level;
  }
}

function auditImages(nodes: Node[], findings: Finding[]): void {
  for (const node of nodes) {
    if (node.type !== 'image') continue;
    const props = node.props ?? {};

    // An explicitly empty alt is a valid decision for decorative images.
    // A missing one is an omission. The distinction matters, so keep it.
    if (!('alt' in props)) {
      findings.push({
        severity: 'error',
        code: 'image/missing-alt',
        message:
          'Imagem sem texto alternativo. Use alt="" apenas se ela for puramente decorativa.',
        nodeId: node.id,
      });
    }

    // A sample-picture service in the URL means the template's example image
    // was never replaced. Found on a live page: eight of ten images, host
    // dark, every phone waiting for pictures that would never come.
    const sample = placeholderHost(String(props.src ?? ''));
    if (sample) {
      findings.push({
        severity: 'error',
        code: 'image/placeholder',
        message: `Imagem de exemplo (${sample}) — troque pela imagem real em Geral → URL da imagem antes de publicar.`,
        nodeId: node.id,
      });
    }

    if (!props.width || !props.height) {
      findings.push({
        severity: 'warning',
        code: 'image/missing-dimensions',
        message:
          'Imagem sem largura e altura declaradas — é a principal causa de layout shift (CLS).',
        nodeId: node.id,
      });
    }
  }
}

function auditActions(nodes: Node[], findings: Finding[]): void {
  const buttons = nodes.filter((node) => node.type === 'button');

  for (const node of buttons) {
    const label = String(node.props?.label ?? '').trim();
    if (!label) {
      findings.push({
        severity: 'error',
        code: 'cta/empty-label',
        message: 'Botão sem texto.',
        nodeId: node.id,
      });
    }
    const href = node.props?.href;
    if (href && !safeUrl(href)) {
      findings.push({
        severity: 'error',
        code: 'cta/unsafe-href',
        message: `Destino de link não permitido: "${String(href)}".`,
        nodeId: node.id,
      });
    }
  }
}

function auditPlaceholders(nodes: Node[], findings: Finding[]): void {
  for (const node of nodes) {
    for (const key of ['text', 'label', 'title']) {
      const value = node.props?.[key];
      if (typeof value === 'string' && PLACEHOLDER.test(value.trim())) {
        findings.push({
          severity: 'warning',
          code: 'content/placeholder',
          message: 'Texto de exemplo não substituído.',
          nodeId: node.id,
        });
      }
    }
  }
}

/**
 * A 0-100 score, weighted by severity. Deliberately simple and explainable:
 * a merchant should be able to see why the number moved.
 */
export function score(findings: Finding[]): number {
  const weights: Record<Severity, number> = { error: 12, warning: 5, info: 1 };
  const penalty = findings.reduce((sum, f) => sum + weights[f.severity], 0);
  return Math.max(0, 100 - penalty);
}
