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

  // `hidden` is handled by the sheet as an exact-range rule, never here: a
  // cascading display:none would leak "hide on phone" into every wider screen.
  if (style.direction || style.gap !== undefined || style.align || style.justify || style.wrap) {
    push('display', 'flex');
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

  if (style.fontFamily === 'theme-body') push('font-family', 'var(--font-body-family, inherit)');
  else if (style.fontFamily === 'theme-heading') push('font-family', 'var(--font-heading-family, inherit)');
  else push('font-family', style.fontFamily);
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
 * Elements whose size can come from an HTML attribute (`<img width>`,
 * `<svg viewBox>`, `<td width>`) rather than from CSS. A blanket `all:revert`
 * erases those, so they are reset one property at a time instead.
 */
const GEOMETRY_TAGS = 'img,svg,canvas,video,iframe,embed,object,table,thead,tbody,tfoot,tr,td,th,col,colgroup';

/** Everything a theme paints onto those elements — and nothing that sizes them. */
const GEOMETRY_SAFE_RESET = [
  'margin',
  'padding',
  'border',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'background',
  'box-shadow',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'vertical-align',
  'object-fit',
  'display',
  'float',
  'opacity',
  'filter',
  'color',
  'font',
  'letter-spacing',
  'line-height',
  'text-align',
]
  .map((property) => `${property}:revert`)
  .join(';');

/**
 * Collects styles across the page and hands back deduplicated class names.
 */
export class StyleSheet {
  /** declaration-block -> class name, per breakpoint. */
  private classes = new Map<string, string>();
  private rules = new Map<Breakpoint, Rule[]>();
  /**
   * Exact-range visibility rules, kept apart from the cascade: `hidden` at a
   * breakpoint means "hidden in that breakpoint's device range", full stop.
   */
  private hiddenAt = new Set<Breakpoint>();
  /** How many nodes asked for each class. Only used for the dedupe report. */
  private uses = new Map<string, number>();

  /**
   * Interns one declaration set at one breakpoint and returns its class name.
   * Identical sets collapse onto the same class, which is where the output
   * savings come from.
   */
  private intern(bp: Breakpoint, decls: string[]): string {
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
    return name;
  }

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
      if (props.hidden === true) {
        // One shared class per breakpoint: every node hidden on "tablet"
        // rides the same rule.
        this.hiddenAt.add(bp);
        names.push(`${CLASS_PREFIX}-hide-${bp}`);
      }
      const decls = declarations(props);
      if (decls.length === 0) continue;
      names.push(this.intern(bp, decls));
    }
    return names;
  }

  /**
   * Takes already-written CSS declarations — the ones lifted out of an author's
   * inline `style` attribute — and folds them into the same deduplicated pool
   * the block styles use. Hand-written HTML therefore benefits from the same
   * collapsing: twenty identically-styled elements emit one rule.
   */
  adopt(decls: string[]): string {
    return this.intern('base', decls);
  }

  /**
   * Emits the stylesheet. `base` rules first, then each breakpoint in ascending
   * min-width order, so the cascade reads top to bottom exactly as authored.
   *
   * `hasRaw` says whether the page carries pasted HTML; the isolation rules
   * that protect it cost ~700 bytes and have nothing to do on a page built
   * only from blocks.
   */
  toCss(tokens?: Record<string, string>, hasRaw = false): string {
    const chunks: string[] = [];

    if (tokens && Object.keys(tokens).length > 0) {
      const vars = Object.entries(tokens)
        .map(([name, value]) => `--${CLASS_PREFIX}-${name}:${value}`)
        .join(';');
      chunks.push(`.${CLASS_PREFIX}-page{${vars}}`);
    }

    // Our own reset, scoped to our own subtree so the theme is untouched — and
    // stopping at the edge of pasted HTML, which is the author's to style.
    // `:where()` keeps everything here at one class of specificity (0,1,0).
    const raw = `[data-${CLASS_PREFIX}-raw]`;
    const ours = `:where(:not(${raw} *))`;
    chunks.push(
      `.${CLASS_PREFIX}-page,.${CLASS_PREFIX}-page :where(*)${ours},.${CLASS_PREFIX}-page :where(*)${ours}::before,.${CLASS_PREFIX}-page :where(*)${ours}::after{box-sizing:border-box}`,
      `.${CLASS_PREFIX}-page :where(img)${ours}{max-width:100%;height:auto}`,
    );

    // Pasted HTML is the author's territory, and the theme is not invited.
    //
    // Measured on the store on 16/09: the same landing page rendered 1474
    // computed-style differences from the author's own file. The theme's
    // `h1{letter-spacing}` reached in, its `.price` collided with a class of
    // the same name, and its `body{letter-spacing;line-height}` was inherited
    // by everything. These rules carry exactly one class of specificity: enough
    // to beat the theme (element and single-class rules, which load earlier),
    // never enough to beat the author's own CSS, which is scoped with
    // `.dvf-page` in front of it and is emitted after this sheet.
    if (hasRaw) {
      chunks.push(
        `:where(${raw}){letter-spacing:normal;word-spacing:normal;line-height:normal;text-transform:none;font-style:normal;font-weight:400;font-size:medium}`,
        // `all:revert` is the whole reset in one declaration — but it also
        // reverts presentation attributes, and `<img width>`, `<svg viewBox>`
        // and `<td width>` are exactly that: the icons collapse to nothing and
        // images lose the aspect ratio that keeps the page from jumping. Those
        // elements get the same treatment property by property, geometry left
        // untouched.
        `${raw} :where(*):where(:not(${GEOMETRY_TAGS},svg *)){all:revert}`,
        `${raw} :where(${GEOMETRY_TAGS},svg *){${GEOMETRY_SAFE_RESET}}`,
      );
    }

    for (const bp of BREAKPOINT_ORDER) {
      const bucket = this.rules.get(bp);
      if (!bucket || bucket.length === 0) continue;
      const body = bucket
        .map((rule) => `${rule.selector}{${rule.declarations.join(';')}}`)
        .join('');
      const min = BREAKPOINTS[bp];
      chunks.push(min === null ? body : `@media(min-width:${min}px){${body}}`);
    }

    // Visibility rules last, each fenced to its breakpoint's exact device
    // range, so "hide on phone" ends at 767px instead of cascading upward.
    for (const bp of BREAKPOINT_ORDER) {
      if (!this.hiddenAt.has(bp)) continue;
      const index = BREAKPOINT_ORDER.indexOf(bp);
      const min = BREAKPOINTS[bp];
      const next = BREAKPOINT_ORDER[index + 1];
      const max = next ? (BREAKPOINTS[next] as number) - 1 : null;
      const conditions = [
        min === null ? null : `(min-width:${min}px)`,
        max === null ? null : `(max-width:${max}px)`,
      ].filter(Boolean);
      const rule = `.${CLASS_PREFIX}-hide-${bp}{display:none!important}`;
      chunks.push(`@media ${conditions.join(' and ')}{${rule}}`);
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
