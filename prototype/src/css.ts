/**
 * CSS emission.
 *
 * Two things matter here, and they are the reason the output stays small:
 *
 *   1. Only rules for blocks actually present on the page are emitted. There is
 *      no global stylesheet carrying every block the builder can produce.
 *   2. Identical declaration sets collapse into one class. A repeater with
 *      twelve identically-styled items emits one rule, not twelve — which is
 *      what makes a generic repeater cheaper than twelve rigid blocks rather
 *      than more expensive.
 *
 * Every class is prefixed and hashed, so nothing here can collide with the
 * theme's stylesheet or with another app's.
 */

import {
  BREAKPOINTS,
  BREAKPOINT_ORDER,
  type Breakpoint,
  type BoxSides,
  type Length,
  type ResponsiveStyle,
  type StyleProps,
} from './schema.ts';

export const CLASS_PREFIX = 'dvf';

function len(value: Length | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

function sides(box: BoxSides | undefined): string | undefined {
  if (!box) return undefined;
  // Omitted sides resolve to 0 only within a shorthand that was explicitly set.
  const top = len(box.top) ?? '0';
  const right = len(box.right) ?? '0';
  const bottom = len(box.bottom) ?? '0';
  const left = len(box.left) ?? '0';
  return `${top} ${right} ${bottom} ${left}`;
}

const FLEX_ALIGN: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const FLEX_JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

/**
 * Translates the closed style vocabulary into CSS declarations.
 *
 * Returns declarations in a stable order so that two equal style objects always
 * produce byte-identical output, which is what makes hashing them reliable.
 */
export function declarations(style: StyleProps): string[] {
  const out: string[] = [];
  const push = (prop: string, value: string | undefined) => {
    if (value !== undefined) out.push(`${prop}:${value}`);
  };

  if (style.hidden === true) push('display', 'none');
  else if (style.hidden === false) push('display', 'flex');

  if (style.direction || style.gap !== undefined || style.align || style.justify || style.wrap) {
    if (style.hidden !== true) push('display', 'flex');
  }
  push('flex-direction', style.direction);
  push('gap', len(style.gap));
  push('align-items', style.align && FLEX_ALIGN[style.align]);
  push('justify-content', style.justify && FLEX_JUSTIFY[style.justify]);
  if (style.wrap !== undefined) push('flex-wrap', style.wrap ? 'wrap' : 'nowrap');

  push('padding', sides(style.padding));
  push('margin', sides(style.margin));

  if (style.width === 'fill') push('width', '100%');
  else if (style.width === 'hug') push('width', 'fit-content');
  else push('width', len(style.width));
  push('max-width', len(style.maxWidth));
  push('min-height', len(style.minHeight));

  push('background', style.background);
  push('color', style.color);
  push('border-radius', len(style.radius));
  if (style.borderWidth !== undefined) {
    push('border', `${len(style.borderWidth)} solid ${style.borderColor ?? 'currentColor'}`);
  }

  push('font-size', len(style.fontSize));
  push('font-weight', style.fontWeight === undefined ? undefined : String(style.fontWeight));
  push('line-height', style.lineHeight === undefined ? undefined : String(style.lineHeight));
  push('letter-spacing', len(style.letterSpacing));
  push('text-align', style.textAlign);

  return out;
}

/**
 * FNV-1a. Not cryptographic, and does not need to be: it only has to spread
 * declaration strings across class names deterministically.
 */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

interface Rule {
  selector: string;
  declarations: string[];
}

/**
 * Collects styles across the page and hands back deduplicated class names.
 */
export class StyleSheet {
  /** declaration-block -> class name, per breakpoint. */
  private classes = new Map<string, string>();
  private rules = new Map<Breakpoint, Rule[]>();
  /** How many nodes asked for each class. Only used for the dedupe report. */
  private uses = new Map<string, number>();

  /**
   * Registers a node's responsive style and returns the classes it needs.
   * A node with no visual style gets no class at all — no empty rules, no
   * placeholder markup.
   */
  register(style: ResponsiveStyle | undefined): string[] {
    if (!style) return [];
    const names: string[] = [];

    for (const bp of BREAKPOINT_ORDER) {
      const props = style[bp];
      if (!props) continue;
      const decls = declarations(props);
      if (decls.length === 0) continue;

      const key = `${bp}|${decls.join(';')}`;
      let name = this.classes.get(key);
      if (!name) {
        name = `${CLASS_PREFIX}-${bp === 'base' ? '' : bp + '-'}${hash(key)}`;
        this.classes.set(key, name);
        const bucket = this.rules.get(bp) ?? [];
        bucket.push({ selector: `.${name}`, declarations: decls });
        this.rules.set(bp, bucket);
      }
      this.uses.set(name, (this.uses.get(name) ?? 0) + 1);
      names.push(name);
    }
    return names;
  }

  /**
   * Emits the stylesheet. `base` rules first, then each breakpoint in ascending
   * min-width order, so the cascade reads top to bottom exactly as authored.
   */
  toCss(tokens?: Record<string, string>): string {
    const chunks: string[] = [];

    if (tokens && Object.keys(tokens).length > 0) {
      const vars = Object.entries(tokens)
        .map(([name, value]) => `--${CLASS_PREFIX}-${name}:${value}`)
        .join(';');
      chunks.push(`.${CLASS_PREFIX}-page{${vars}}`);
    }

    // A single reset, scoped to our own subtree so the theme is untouched.
    chunks.push(
      `.${CLASS_PREFIX}-page *,.${CLASS_PREFIX}-page *::before,.${CLASS_PREFIX}-page *::after{box-sizing:border-box}`,
      `.${CLASS_PREFIX}-page img{max-width:100%;height:auto}`,
    );

    for (const bp of BREAKPOINT_ORDER) {
      const bucket = this.rules.get(bp);
      if (!bucket || bucket.length === 0) continue;
      const body = bucket
        .map((rule) => `${rule.selector}{${rule.declarations.join(';')}}`)
        .join('');
      const min = BREAKPOINTS[bp];
      chunks.push(min === null ? body : `@media(min-width:${min}px){${body}}`);
    }

    return chunks.join('\n');
  }

  /** Report used to show that deduplication is actually doing work. */
  stats(): { rules: number; registrations: number } {
    let registrations = 0;
    for (const count of this.uses.values()) registrations += count;
    return { rules: this.classes.size, registrations };
  }
}
