/**
 * D&VFly block document schema.
 *
 * This is the heart of the architecture: the editor edits this document and
 * nothing else, and the compiler turns it into HTML + CSS. Keeping the editor
 * and the publisher on opposite sides of a plain data structure is what makes
 * "what you see is what gets published" enforceable rather than aspirational.
 *
 * Two rules constrain everything here:
 *
 *   1. Styles are a closed vocabulary, not arbitrary CSS. A closed vocabulary
 *      can be validated, deduplicated and budgeted. Arbitrary CSS cannot.
 *   2. A node never carries rendered markup. Markup is always derived.
 */

/** Document format version. Bumping this is how old pages keep rendering. */
export const DOC_VERSION = 1;

/**
 * Breakpoints, mobile-first.
 *
 * `base` applies at every width; the others are `min-width` overrides that
 * carry only what differs. This is the whole answer to "responsive means
 * building the page three times": there is one design and two override sets.
 */
export const BREAKPOINTS = {
  base: null,
  md: 768,
  lg: 1200,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export const BREAKPOINT_ORDER: Breakpoint[] = ['base', 'md', 'lg'];

/** A CSS length. Numbers are pixels; strings must carry their own unit. */
export type Length = number | string;

/** Per-side box values. Omitted sides inherit from the cascade, not from 0. */
export interface BoxSides {
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
}

/**
 * The closed style vocabulary.
 *
 * Everything a merchant can change about a block's appearance lives here. If a
 * property is not in this list, the compiler cannot emit it — which is exactly
 * what keeps the stylesheet small and the output predictable.
 */
export interface StyleProps {
  // Flex layout. Only meaningful on container blocks.
  direction?: 'row' | 'column';
  gap?: Length;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;

  // Box model.
  padding?: BoxSides;
  margin?: BoxSides;
  width?: 'fill' | 'hug' | Length;
  maxWidth?: Length;
  minHeight?: Length;

  // Paint.
  background?: string;
  color?: string;
  radius?: Length;
  borderWidth?: Length;
  borderColor?: string;

  // Type.
  fontSize?: Length;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: Length;
  textAlign?: 'left' | 'center' | 'right';

  // Visibility. Per-breakpoint, which is how a block hides on mobile only.
  hidden?: boolean;
}

/** A style set: the base plus whatever each breakpoint overrides. */
export type ResponsiveStyle = Partial<Record<Breakpoint, StyleProps>>;

export type BlockType =
  | 'section'
  | 'stack'
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'accordion'
  | 'repeater'
  | 'countdown'
  | 'html';

export interface Node {
  id: string;
  type: BlockType;
  /** Block-specific content. Never contains markup except in `html` blocks. */
  props?: Record<string, unknown>;
  style?: ResponsiveStyle;
  children?: Node[];
  /**
   * Switched off by the tree panel's eye toggle. A hidden node stays in the
   * document (the work is not lost) but the compiler emits nothing for it —
   * not `display:none`, nothing: hidden content must not ship to visitors.
   */
  hidden?: boolean;
}

export interface Doc {
  version: number;
  /** Brand tokens. Emitted once as custom properties on the page root. */
  tokens?: Record<string, string>;
  /** Top-level nodes. Conventionally sections, but not enforced. */
  root: Node[];
}

/**
 * Walks the tree depth-first, parents before children.
 */
export function* walk(nodes: Node[]): Generator<Node> {
  for (const node of nodes) {
    yield node;
    if (node.children) yield* walk(node.children);
  }
}

/**
 * Structural validation. Deliberately shallow: this catches documents that
 * would crash the compiler, not documents that are merely ugly. Page-quality
 * checks (one H1, alt text, heading order) are a separate concern — see
 * `audit.ts`.
 */
export function validate(doc: Doc): string[] {
  const errors: string[] = [];
  if (doc.version !== DOC_VERSION) {
    errors.push(`unsupported document version: ${doc.version}`);
  }
  const seen = new Set<string>();
  for (const node of walk(doc.root)) {
    if (!node.id) errors.push(`node of type "${node.type}" has no id`);
    else if (seen.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    seen.add(node.id);

    for (const bp of Object.keys(node.style ?? {})) {
      if (!(bp in BREAKPOINTS)) {
        errors.push(`node ${node.id}: unknown breakpoint "${bp}"`);
      }
    }
  }
  return errors;
}
