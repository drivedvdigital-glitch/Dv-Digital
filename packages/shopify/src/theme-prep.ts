/**
 * Preparing another theme for D&VFly before the merchant publishes it.
 *
 * Every file D&VFly writes lives in the store's MAIN theme, and products and
 * pages point at them by `templateSuffix`. Publish another theme and those
 * suffixes name templates the new theme does not have: Shopify quietly falls
 * back to the default product page, and a landing page an ad is sending
 * people to is gone (07/10: the Colombia store moving from a copy of Shrine
 * to the original). So, before the switch, the files are carried over.
 *
 * What is carried, per template a product or page points at:
 *
 *   - D&VFly's own files are COPIED byte for byte from the source theme
 *     (the published one): the page sections, bare templates, the per-page
 *     layouts. Recompiling is not an option — settings and the compiler may
 *     have moved since the page was published, and the source theme is the
 *     exact snapshot of what visitors see today.
 *   - What D&VFly derives FROM a theme is rebuilt against the target: the
 *     "no header and footer" layout (from the target's own theme.liquid) and
 *     the product templates that keep the theme's product sections (composed
 *     on the target's product.json when a section they use does not exist
 *     there).
 *   - A | B tests that are live are rewritten by the same function that put
 *     them live (`ensureSplitTemplate`), aimed at the target theme.
 *
 * Nothing here touches products, pages, metafields or the source theme:
 * only files of the target. A template's layout always goes first and alone
 * (Shopify checks it against the files the theme already has).
 */

import { ShopifyError, type ShopifyClient } from './client.ts';
import { SOLO_SUFFIX } from './constants.ts';
import { ensureSplitTemplate, splitSuffix, type SplitPlan } from './split.ts';
import {
  canonicalAware,
  chromelessLayout,
  composeProductTemplate,
  LAYOUT,
  LAYOUT_FILE,
  PRODUCT_LAYOUT,
  PRODUCT_LAYOUT_FILE,
  readThemeFiles,
  readThemeFilesDated,
  SOLO_LAYOUT,
  stripJsonComments,
  upsertThemeFiles,
} from './templates.ts';

export type TemplateResource = 'product' | 'page';

/** An alternate template the store's products or pages point at, with who points at it. */
export interface TemplateUse {
  resource: TemplateResource;
  suffix: string;
  /** Titles of the products or pages using it (the screen names them). */
  titles: string[];
}

type ThemeFile = { filename: string; body: { type: 'TEXT'; value: string } };
const file = (filename: string, value: string): ThemeFile => ({ filename, body: { type: 'TEXT', value } });

/** Ours: every suffix D&VFly hands out starts like this. */
export const isOurSuffix = (suffix: string) => /^dvfly-/i.test(suffix);

/**
 * Every alternate template the store uses, from the products and pages
 * themselves (all of them, any status): the truth of what visitors can reach.
 */
export async function templateUses(client: ShopifyClient): Promise<TemplateUse[]> {
  const uses = new Map<string, TemplateUse>();
  for (const resource of ['product', 'page'] as const) {
    const field = resource === 'product' ? 'products' : 'pages';
    let after: string | null = null;
    for (let guard = 0; guard < 200; guard++) {
      const data: Record<string, { nodes: Array<{ title: string; templateSuffix: string | null }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> =
        await client.graphql(
          `query DvflyTemplateUses($after: String) {
             ${field}(first: 250, after: $after) {
               nodes { title templateSuffix }
               pageInfo { hasNextPage endCursor }
             }
           }`,
          { after },
        );
      const page = data[field];
      for (const node of page.nodes) {
        const suffix = node.templateSuffix?.trim();
        if (!suffix) continue;
        const key = `${resource}:${suffix}`;
        const use = uses.get(key) ?? { resource, suffix, titles: [] };
        use.titles.push(node.title);
        uses.set(key, use);
      }
      if (!page.pageInfo.hasNextPage) break;
      after = page.pageInfo.endCursor;
    }
  }
  return [...uses.values()];
}

/** Which templates exist in a theme, for a list of uses (`.json` or `.liquid`). */
export async function missingTemplates(client: ShopifyClient, themeId: string, uses: TemplateUse[]): Promise<TemplateUse[]> {
  const names = uses.flatMap((u) => [`templates/${u.resource}.${u.suffix}.json`, `templates/${u.resource}.${u.suffix}.liquid`]);
  const found = await readThemeFiles(client, themeId, names);
  return uses.filter((_, i) => found[2 * i] === null && found[2 * i + 1] === null);
}

// ---- one template: plan, write, verify ---------------------------------------

export interface TemplatePlan {
  /** Where the copies came from (dates are compared against it when completing a published theme). */
  sourceThemeId: string;
  /** Written first and alone: the layout the template names, when it is ours. */
  layout: ThemeFile | null;
  /** Sections, then the template, in one call. */
  files: ThemeFile[];
  /** Why it cannot be carried; nothing is written when there is one. */
  problem: string | null;
  /** What the merchant should know (written anyway). */
  notes: string[];
  /** Files the target must have that are not ours to write (the theme's own layout, its sections). */
  requires: string[];
}

const templateFile = (resource: TemplateResource, suffix: string) => `templates/${resource}.${suffix}.json`;

/** The theme's own layout is always there; any other one must exist in the target. */
const THEME_LAYOUT = 'theme';

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripJsonComments(text));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * What the target theme needs for products or pages pointing at
 * `<resource>.<suffix>` to render as they do today. Reads the source (the
 * snapshot) and the target's own files it derives from; writes nothing.
 */
export async function planTemplate(
  client: ShopifyClient,
  sourceThemeId: string,
  targetThemeId: string,
  resource: TemplateResource,
  suffix: string,
): Promise<TemplatePlan> {
  const plan: TemplatePlan = { sourceThemeId, layout: null, files: [], problem: null, notes: [], requires: [] };
  const name = templateFile(resource, suffix);
  const [sourceText] = await readThemeFiles(client, sourceThemeId, [name]);
  if (sourceText === null) {
    plan.problem = `o modelo ${name} não existe nem no tema publicado hoje — publique a página de novo no D&VFly`;
    return plan;
  }
  const template = parseJson(sourceText);
  if (!template) {
    plan.problem = `o modelo ${name} do tema publicado não pôde ser lido`;
    return plan;
  }
  const layout = template.layout;
  const sections = (template.sections ?? {}) as Record<string, { type?: unknown }>;
  const types = [...new Set(Object.values(sections).map((s) => String(s?.type ?? '')).filter(Boolean))];
  const ours = types.filter((t) => /^dvfly-/i.test(t));
  const theirs = types.filter((t) => !/^dvfly-/i.test(t) && !t.startsWith('shopify://'));

  // Our sections: copied as they are.
  const ourTexts = await readThemeFiles(client, sourceThemeId, ours.map((t) => `sections/${t}.liquid`));
  const lost = ours.filter((_, i) => ourTexts[i] === null);
  if (lost.length > 0) {
    plan.problem = `a seção ${lost.map((t) => `sections/${t}.liquid`).join(', ')} não existe no tema publicado — publique a página de novo no D&VFly`;
    return plan;
  }
  plan.files.push(...ours.map((t, i) => file(`sections/${t}.liquid`, ourTexts[i]!)));

  // The theme's sections the template uses, in the target.
  const [targetProduct, targetLayout, ...theirTexts] = await readThemeFiles(client, targetThemeId, [
    'templates/product.json',
    'layout/theme.liquid',
    ...theirs.map((t) => `sections/${t}.liquid`),
  ]);
  const absent = theirs.filter((_, i) => theirTexts[i] === null);

  // The layout.
  if (typeof layout === 'string' && layout !== THEME_LAYOUT) {
    if (layout === SOLO_LAYOUT) {
      plan.layout = file(LAYOUT_FILE, LAYOUT);
    } else if (layout === PRODUCT_LAYOUT) {
      // Derived from the theme: the TARGET's layout without header and footer.
      plan.layout = file(PRODUCT_LAYOUT_FILE, chromelessLayout(targetLayout));
    } else if (/^theme\.dvfly-/i.test(layout)) {
      const [own] = await readThemeFiles(client, sourceThemeId, [`layout/${layout}.liquid`]);
      if (own === null) {
        plan.problem = `o layout layout/${layout}.liquid não existe no tema publicado — publique a página de novo no D&VFly`;
        return plan;
      }
      plan.layout = file(`layout/${layout}.liquid`, canonicalAware(own).text);
    } else {
      plan.requires.push(`layout/${layout}.liquid`);
    }
  }

  // The template.
  const ownProductPage = resource === 'product' && /^dvfly-(?!ab-)/i.test(suffix) && ours.length > 0;
  const keepsThemeSections = theirs.length > 0;
  if (ownProductPage && keepsThemeSections) {
    // A product page that keeps the theme's product sections: composed on
    // the target. The merchant's arrangement (from the theme editor) comes
    // along when every section it uses exists in the target theme; when one
    // does not, the target's own product page is the base.
    const pageId = ours[0].replace(/^dvfly-p-/i, '');
    const order = Array.isArray(template.order) ? (template.order as string[]) : [];
    const input = {
      pageId,
      title: '',
      fragment: '',
      bare: false,
      chrome: layout !== PRODUCT_LAYOUT,
      contentAbove: order[0] === 'dvfly',
    };
    if (absent.length > 0) {
      const what = absent.length === 1 ? `a seção ${absent[0]} não existe` : `as seções ${absent.join(', ')} não existem`;
      plan.notes.push(
        `${what} no tema novo: a página usa a página de produto do tema novo em volta do conteúdo do D&VFly, e o que foi ajustado no editor de tema para ela não veio`,
      );
    }
    try {
      plan.files.push(file(name, composeProductTemplate(targetProduct, input, absent.length > 0 ? null : sourceText)));
    } catch (error) {
      plan.problem = error instanceof ShopifyError ? error.message : String(error);
      return plan;
    }
  } else {
    if (absent.length > 0) {
      plan.problem =
        absent.length === 1
          ? `a seção ${absent[0]} que o modelo usa não existe no tema novo`
          : `as seções ${absent.join(', ')} que o modelo usa não existem no tema novo`;
      return plan;
    }
    plan.files.push(file(name, sourceText));
  }
  return plan;
}

export interface ItemOutcome {
  status: 'pronto' | 'falhou';
  /** Files written (or, in "only missing" mode, found already there). */
  written: string[];
  problem: string | null;
  notes: string[];
}

/**
 * Of the plan's files, the ones a theme that is ALREADY published still
 * needs: missing there, or older there than in the source. The second case
 * is a page republished in D&VFly between preparing the theme and publishing
 * it — that publish went to the theme that was live then. A file written in
 * the published theme after that is newer and stays. Without dates from
 * Shopify, an existing file is never overwritten.
 */
async function behind(client: ShopifyClient, targetThemeId: string, plan: TemplatePlan, names: string[]): Promise<Set<string>> {
  const [there, source] = await Promise.all([
    readThemeFilesDated(client, targetThemeId, names),
    readThemeFilesDated(client, plan.sourceThemeId, names),
  ]);
  const out = new Set<string>();
  names.forEach((name, i) => {
    const target = there[i];
    const from = source[i];
    if (!target) out.add(name);
    else if (from?.updatedAt && target.updatedAt && Date.parse(from.updatedAt) > Date.parse(target.updatedAt)) out.add(name);
  });
  return out;
}

/**
 * Writes a plan into the target. `completing`: the target is the theme
 * already published — only what is missing there or older there than in the
 * source is written (see `behind`); everything else is overwritten as a copy
 * (the target is not live, and the source is the truth).
 */
export async function writePlan(
  client: ShopifyClient,
  targetThemeId: string,
  plan: TemplatePlan,
  options: { completing?: boolean } = {},
): Promise<ItemOutcome> {
  if (plan.problem) return { status: 'falhou', written: [], problem: plan.problem, notes: plan.notes };
  if (plan.requires.length > 0) {
    const present = await readThemeFiles(client, targetThemeId, plan.requires);
    const missing = plan.requires.filter((_, i) => present[i] === null);
    if (missing.length > 0) {
      return { status: 'falhou', written: [], problem: `o tema novo não tem ${missing.join(', ')}`, notes: plan.notes };
    }
  }
  let layout = plan.layout;
  let files = plan.files;
  if (options.completing) {
    const all = [...(layout ? [layout] : []), ...files];
    const needed = await behind(client, targetThemeId, plan, all.map((f) => f.filename));
    layout = layout && needed.has(layout.filename) ? layout : null;
    files = files.filter((f) => needed.has(f.filename));
  }
  try {
    if (layout) await upsertThemeFiles(client, targetThemeId, [layout]);
    if (files.length > 0) await upsertThemeFiles(client, targetThemeId, files);
  } catch (error) {
    return { status: 'falhou', written: [], problem: errorText(error), notes: plan.notes };
  }
  return {
    status: 'pronto',
    written: [...(plan.layout ? [plan.layout.filename] : []), ...plan.files.map((f) => f.filename)],
    problem: null,
    notes: plan.notes,
  };
}

export interface ItemCheck {
  /** pronto: everything there and current; falta: something missing; desatualizado: there, but not what the source has now. */
  status: 'pronto' | 'falta' | 'desatualizado' | 'falhou';
  detail: string | null;
}

/** JSON compared as data (the theme editor reformats and adds a notice); Liquid as text. */
function sameContent(filename: string, a: string, b: string): boolean {
  if (filename.endsWith('.json')) {
    const [x, y] = [parseJson(a), parseJson(b)];
    if (x && y) return JSON.stringify(x) === JSON.stringify(y);
  }
  return a.trim() === b.trim();
}

/**
 * Reads the plan's files back from the target. `completing` (the target is
 * already published): what counts is that nothing is missing or older there.
 */
export async function checkPlan(
  client: ShopifyClient,
  targetThemeId: string,
  plan: TemplatePlan,
  options: { completing?: boolean } = {},
): Promise<ItemCheck> {
  if (plan.problem) return { status: 'falhou', detail: plan.problem };
  const all = [...(plan.layout ? [plan.layout] : []), ...plan.files];
  const names = [...all.map((f) => f.filename), ...plan.requires];
  const texts = await readThemeFiles(client, targetThemeId, names);
  const missing = names.filter((_, i) => texts[i] === null);
  if (missing.length > 0) return { status: 'falta', detail: `falta no tema: ${missing.join(', ')}` };
  if (options.completing) {
    const older = [...(await behind(client, targetThemeId, plan, all.map((f) => f.filename)))];
    if (older.length > 0) {
      return { status: 'desatualizado', detail: `mais antigo aqui do que em «origem»: ${older.join(', ')} — clique em Completar` };
    }
    return { status: 'pronto', detail: null };
  }
  const stale = all.filter((f, i) => !sameContent(f.filename, f.body.value, texts[i]!)).map((f) => f.filename);
  if (stale.length > 0) {
    return { status: 'desatualizado', detail: `diferente do tema publicado hoje: ${stale.join(', ')} — prepare de novo` };
  }
  return { status: 'pronto', detail: null };
}

// ---- A | B tests -----------------------------------------------------------------

/** Writes a live test's split into the target theme, as going live does. */
export async function prepareSplit(
  client: ShopifyClient,
  targetThemeId: string,
  plan: SplitPlan,
): Promise<ItemOutcome & { mode: string | null }> {
  try {
    const result = await ensureSplitTemplate(client, plan, { themeId: targetThemeId });
    const notes = result.note ? [result.note] : [];
    if (result.mode === 'view' && plan.entry) {
      notes.push('a versão A abre pela URL ?view= neste tema (não dá para mostrá-la direto na URL de entrada)');
    }
    return { status: 'pronto', written: [`templates/product.${result.suffix}.json`], problem: null, notes, mode: result.mode };
  } catch (error) {
    return { status: 'falhou', written: [], problem: errorText(error), notes: [], mode: null };
  }
}

/** The split's template, its layout and its sections exist in the target. */
export async function checkSplit(client: ShopifyClient, targetThemeId: string, testId: string): Promise<ItemCheck> {
  const name = `templates/product.${splitSuffix(testId)}.json`;
  const [text] = await readThemeFiles(client, targetThemeId, [name]);
  if (text === null) return { status: 'falta', detail: `falta no tema: ${name}` };
  const template = parseJson(text);
  if (!template) return { status: 'falhou', detail: `${name} não pôde ser lido` };
  const needs: string[] = [];
  if (typeof template.layout === 'string') needs.push(`layout/${template.layout}.liquid`);
  for (const s of Object.values((template.sections ?? {}) as Record<string, { type?: unknown }>)) {
    const type = String(s?.type ?? '');
    if (type && !type.startsWith('shopify://')) needs.push(`sections/${type}.liquid`);
  }
  const texts = await readThemeFiles(client, targetThemeId, needs);
  const missing = needs.filter((_, i) => texts[i] === null);
  // Version A through `?view=`: the template that name points at must exist too.
  const layoutText = typeof template.layout === 'string' ? (texts[0] ?? '') : '';
  for (const view of new Set([...layoutText.matchAll(/view=([\w-]+)/g)].map((m) => m[1]))) {
    const [json, liquid] = await readThemeFiles(client, targetThemeId, [`templates/product.${view}.json`, `templates/product.${view}.liquid`]);
    if (json === null && liquid === null) missing.push(`templates/product.${view}.json`);
  }
  if (missing.length > 0) return { status: 'falta', detail: `falta no tema: ${missing.join(', ')}` };
  return { status: 'pronto', detail: null };
}

// ---- app embeds --------------------------------------------------------------------

export interface AppEmbed {
  /** The block id inside settings_data.json. */
  id: string;
  /** `shopify://apps/<app>/blocks/<block>/<uuid>`. */
  type: string;
  /** The app's handle, from the type (`easysell-cod-form`, `pagefly-ai-page-builder`). */
  app: string;
  enabled: boolean;
}

/** The settings object the theme uses now (a preset name or the object itself). */
function currentSettings(data: Record<string, unknown>): Record<string, unknown> | null {
  const current = data.current;
  if (current && typeof current === 'object' && !Array.isArray(current)) return current as Record<string, unknown>;
  if (typeof current === 'string') {
    const preset = (data.presets as Record<string, unknown> | undefined)?.[current];
    if (preset && typeof preset === 'object') return preset as Record<string, unknown>;
  }
  return null;
}

/** The app embeds a theme has, on or off (they are stored per theme). */
export async function appEmbeds(client: ShopifyClient, themeId: string): Promise<AppEmbed[]> {
  const [text] = await readThemeFiles(client, themeId, ['config/settings_data.json']);
  const data = text ? parseJson(text) : null;
  const settings = data ? currentSettings(data) : null;
  const blocks = (settings?.blocks ?? {}) as Record<string, { type?: unknown; disabled?: unknown }>;
  return Object.entries(blocks)
    .filter(([, b]) => typeof b?.type === 'string' && (b.type as string).startsWith('shopify://apps/'))
    .map(([id, b]) => {
      const type = b.type as string;
      return { id, type, app: type.split('/')[3] ?? type, enabled: b.disabled !== true };
    });
}

/**
 * Switches off the embeds of one app in one theme — the theme editor's
 * "App embeds" toggle, written to `config/settings_data.json`. Read right
 * before the write, so a change saved in the editor meanwhile is kept.
 * Returns how many were switched off.
 */
export async function disableAppEmbeds(client: ShopifyClient, themeId: string, app: string): Promise<number> {
  const [text] = await readThemeFiles(client, themeId, ['config/settings_data.json']);
  const data = text ? parseJson(text) : null;
  const settings = data ? currentSettings(data) : null;
  if (!data || !settings) throw new ShopifyError('As configurações do tema (config/settings_data.json) não puderam ser lidas.');
  let changed = 0;
  for (const block of Object.values((settings.blocks ?? {}) as Record<string, { type?: unknown; disabled?: unknown }>)) {
    if (typeof block?.type === 'string' && block.type.split('/')[3] === app && block.disabled !== true) {
      block.disabled = true;
      changed++;
    }
  }
  if (changed > 0) await upsertThemeFiles(client, themeId, [file('config/settings_data.json', JSON.stringify(data, null, 2))]);
  return changed;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { SOLO_SUFFIX };
