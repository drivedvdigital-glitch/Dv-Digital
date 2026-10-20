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
  /**
   * Files the page needs that the target lacks and that are not D&VFly's —
   * the snippets its Liquid includes, a split's version-A copy — copied from
   * the source because the page does not work without them. Written with
   * `files`, only when missing.
   */
  extra: ThemeFile[];
  /**
   * Files built FROM the target (the no-header layout, a product template
   * that keeps the theme's sections): the target's own copy is the truth once
   * it exists — the merchant may have arranged it in that theme's editor — so
   * they are written when missing and never compared byte for byte.
   */
  derived: string[];
  /** The template composed on the target's own product page, tried when Shopify refuses the arrangement carried over. */
  fallback: ThemeFile | null;
  /** Nothing to carry: only the target has this template (a page published there after the switch). */
  done: boolean;
  /** Why it cannot be carried; nothing is written when there is one. */
  problem: string | null;
  /** What the merchant should know (written anyway). */
  notes: string[];
  /** Files the target must have that are not ours to write (the theme's own layout). */
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
 * The theme files a section's own Liquid needs: snippets it includes or
 * renders, sections it renders. Only the Liquid regions count — everything
 * between `{% raw %}` and `{% endraw %}` is the page's HTML, printed as text.
 */
export function liquidDependencies(section: string): string[] {
  const liquid = section.replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g, '');
  const out = new Set<string>();
  for (const m of liquid.matchAll(/\{%-?\s*(include|render|section)\s+['"]([\w.-]+)['"]/g)) {
    out.add(m[1] === 'section' ? `sections/${m[2]}.liquid` : `snippets/${m[2]}.liquid`);
  }
  return [...out];
}

/** The templates a split's script sends version A (or any version) to by `?view=`, from its configuration. */
export function splitViews(layout: string): string[] {
  return [...new Set([...layout.matchAll(/"q":"([\w-]+)"/g)].map((m) => m[1]))];
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
  const plan: TemplatePlan = {
    sourceThemeId,
    layout: null,
    files: [],
    extra: [],
    derived: [],
    fallback: null,
    done: false,
    problem: null,
    notes: [],
    requires: [],
  };
  const name = templateFile(resource, suffix);
  const [[sourceText], [targetText]] = await Promise.all([
    readThemeFiles(client, sourceThemeId, [name]),
    readThemeFiles(client, targetThemeId, [name]),
  ]);
  if (sourceText === null) {
    if (targetText !== null) {
      // Published straight into the target (after the switch): nothing to carry.
      plan.done = true;
      plan.notes.push('só existe no tema de destino: nada a levar');
      return plan;
    }
    plan.problem = `o modelo ${name} não existe em nenhum dos dois temas — publique a página de novo no D&VFly`;
    return plan;
  }
  const template = parseJson(sourceText);
  if (!template) {
    plan.problem = `o modelo ${name} do tema de origem não pôde ser lido`;
    return plan;
  }
  const layout = template.layout;
  const sections = (template.sections ?? {}) as Record<string, { type?: unknown }>;
  const types = [...new Set(Object.values(sections).map((s) => String(s?.type ?? '')).filter(Boolean))];
  const ours = types.filter((t) => /^dvfly-/i.test(t));
  const theirs = types.filter((t) => !/^dvfly-/i.test(t) && !t.startsWith('shopify://'));

  // Our sections: copied as they are (one the target already has and the
  // source lost is the target's — nothing to copy).
  const ourNames = ours.map((t) => `sections/${t}.liquid`);
  const [ourTexts, ourThere] = await Promise.all([
    readThemeFiles(client, sourceThemeId, ourNames),
    readThemeFiles(client, targetThemeId, ourNames),
  ]);
  const lost = ourNames.filter((_, i) => ourTexts[i] === null && ourThere[i] === null);
  if (lost.length > 0) {
    plan.problem = `a seção ${lost.join(', ')} não existe em nenhum dos dois temas — publique a página de novo no D&VFly`;
    return plan;
  }
  ourNames.forEach((n, i) => {
    if (ourTexts[i] !== null) plan.files.push(file(n, ourTexts[i]!));
  });

  // What our sections' Liquid needs from the theme (`{% include 'gtm-roteador' %}`).
  const deps = [...new Set(ourTexts.flatMap((t) => (t ? liquidDependencies(t) : [])))];
  if (deps.length > 0) {
    const [there, from] = await Promise.all([readThemeFiles(client, targetThemeId, deps), readThemeFiles(client, sourceThemeId, deps)]);
    deps.forEach((dep, i) => {
      if (there[i] !== null) return;
      if (from[i] === null) {
        plan.problem = `o Liquid da página usa ${dep}, que não existe em nenhum dos dois temas`;
        return;
      }
      plan.extra.push(file(dep, from[i]!));
      plan.notes.push(`${dep} não existia no tema de destino: copiado do tema de origem, porque a página usa`);
    });
    if (plan.problem) return plan;
  }

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
      plan.derived.push(PRODUCT_LAYOUT_FILE);
    } else if (/^theme\.dvfly-/i.test(layout)) {
      const layoutName = `layout/${layout}.liquid`;
      const [[own], [ownThere]] = await Promise.all([
        readThemeFiles(client, sourceThemeId, [layoutName]),
        readThemeFiles(client, targetThemeId, [layoutName]),
      ]);
      if (own === null && ownThere === null) {
        plan.problem = `o layout ${layoutName} não existe em nenhum dos dois temas — publique a página de novo no D&VFly`;
        return plan;
      }
      if (own !== null) plan.layout = file(layoutName, canonicalAware(own).text);
      // A split's layout sends visitors to `?view=<template>`: those must come too.
      const views = splitViews(own ?? ownThere ?? '').map((v) => [`templates/product.${v}.json`, `templates/product.${v}.liquid`]);
      for (const [json, liquid] of views) {
        const [[jThere, lThere], [jFrom, lFrom]] = await Promise.all([
          readThemeFiles(client, targetThemeId, [json, liquid]),
          readThemeFiles(client, sourceThemeId, [json, liquid]),
        ]);
        if (jThere !== null || lThere !== null) continue;
        if (jFrom !== null) plan.extra.push(file(json, jFrom));
        else if (lFrom !== null) plan.extra.push(file(liquid, lFrom));
        else {
          plan.problem = `o teste manda visitantes para ${json}, que não existe em nenhum dos dois temas — regrave ou pause o teste`;
          return plan;
        }
      }
    } else {
      plan.requires.push(`layout/${layout}.liquid`);
    }
  }

  // The template.
  const ownProductPage = resource === 'product' && /^dvfly-(?!ab-)/i.test(suffix) && ours.length > 0;
  const keepsThemeSections = theirs.length > 0;
  if (ownProductPage && keepsThemeSections) {
    // A product page that keeps the theme's product sections: composed on
    // the target, like publishing does. The base is the target's own copy
    // when it has one (arranged in that theme's editor), else the source's
    // arrangement when every section it uses exists in the target, else the
    // target's product page.
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
    const base = targetText ?? (absent.length > 0 ? null : sourceText);
    if (absent.length > 0 && targetText === null) {
      const what = absent.length === 1 ? `a seção ${absent[0]} não existe` : `as seções ${absent.join(', ')} não existem`;
      plan.notes.push(
        `${what} no tema de destino: a página usa a página de produto dele em volta do conteúdo do D&VFly, e o que foi ajustado no editor de tema para ela não veio`,
      );
    }
    try {
      plan.files.push(file(name, composeProductTemplate(targetProduct, input, base)));
      if (base !== null) plan.fallback = file(name, composeProductTemplate(targetProduct, input, null));
      plan.derived.push(name);
    } catch (error) {
      plan.problem = error instanceof ShopifyError ? error.message : String(error);
      return plan;
    }
  } else {
    if (absent.length > 0) {
      plan.problem =
        absent.length === 1
          ? `a seção ${absent[0]} que o modelo usa não existe no tema de destino`
          : `as seções ${absent.join(', ')} que o modelo usa não existem no tema de destino`;
      return plan;
    }
    plan.files.push(file(name, sourceText));
  }
  return plan;
}

export interface ItemOutcome {
  status: 'pronto' | 'falhou';
  /** Files written. */
  written: string[];
  problem: string | null;
  notes: string[];
}

/**
 * Of the plan's files, the ones a theme that is ALREADY published still
 * needs: missing there, or older there than in the source. The second case
 * is a page republished in D&VFly between preparing the theme and publishing
 * it — that publish went to the theme that was live then. A file written in
 * the published theme after that is newer and stays; a file DERIVED from the
 * target is the target's once it exists. Without dates from Shopify, an
 * existing file is never overwritten.
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
    else if (plan.derived.includes(name)) return;
    else if (from?.updatedAt && target.updatedAt && Date.parse(from.updatedAt) > Date.parse(target.updatedAt)) out.add(name);
  });
  return out;
}

/**
 * Writes a plan into the target. Preparing a theme nobody sees yet, the
 * source is the truth: its copies overwrite (what is derived from the target
 * is written only when missing). `completing`: the target is the theme
 * already published — only what is missing there or older there than in the
 * source is written (see `behind`).
 */
export async function writePlan(
  client: ShopifyClient,
  targetThemeId: string,
  plan: TemplatePlan,
  options: { completing?: boolean } = {},
): Promise<ItemOutcome> {
  if (plan.problem) return { status: 'falhou', written: [], problem: plan.problem, notes: plan.notes };
  if (plan.done) return { status: 'pronto', written: [], problem: null, notes: plan.notes };
  if (plan.requires.length > 0) {
    const present = await readThemeFiles(client, targetThemeId, plan.requires);
    const missing = plan.requires.filter((_, i) => present[i] === null);
    if (missing.length > 0) {
      return { status: 'falhou', written: [], problem: `o tema de destino não tem ${missing.join(', ')}`, notes: plan.notes };
    }
  }
  const all = [...(plan.layout ? [plan.layout] : []), ...plan.files];
  const needed = options.completing
    ? await behind(client, targetThemeId, plan, all.map((f) => f.filename))
    : await (async () => {
        // Preparing: copies always; derived files only where the target has none yet.
        const derived = all.filter((f) => plan.derived.includes(f.filename)).map((f) => f.filename);
        const present = await readThemeFiles(client, targetThemeId, derived);
        const keep = new Set(derived.filter((_, i) => present[i] !== null));
        return new Set(all.map((f) => f.filename).filter((n) => !keep.has(n)));
      })();
  const layout = plan.layout && needed.has(plan.layout.filename) ? plan.layout : null;
  let files = [...plan.extra, ...plan.files.filter((f) => needed.has(f.filename))];
  const notes = [...plan.notes];
  try {
    if (layout) await upsertThemeFiles(client, targetThemeId, [layout]);
    if (files.length > 0) {
      try {
        await upsertThemeFiles(client, targetThemeId, files);
      } catch (error) {
        // The arrangement carried over uses blocks or settings the target's
        // sections do not define: the target's own product page instead.
        const fallback = plan.fallback;
        if (!fallback || !files.some((f) => f.filename === fallback.filename)) throw error;
        files = files.map((f) => (f.filename === fallback.filename ? fallback : f));
        await upsertThemeFiles(client, targetThemeId, files);
        notes.push(
          'a Shopify recusou o arranjo de seções que veio do tema de origem (blocos que o tema de destino não tem): a página usa a página de produto dele em volta do conteúdo do D&VFly',
        );
      }
    }
  } catch (error) {
    return { status: 'falhou', written: [], problem: errorText(error), notes };
  }
  return {
    status: 'pronto',
    written: [...(layout ? [layout.filename] : []), ...files.map((f) => f.filename)],
    problem: null,
    notes,
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
  if (plan.done) return { status: 'pronto', detail: null };
  const all = [...(plan.layout ? [plan.layout] : []), ...plan.files];
  const names = [...all.map((f) => f.filename), ...plan.extra.map((f) => f.filename), ...plan.requires];
  const texts = await readThemeFiles(client, targetThemeId, names);
  const missing = names.filter((_, i) => texts[i] === null);
  if (missing.length > 0) return { status: 'falta', detail: `falta no tema: ${missing.join(', ')}` };
  if (options.completing) {
    const older = [...(await behind(client, targetThemeId, plan, all.map((f) => f.filename)))];
    if (older.length > 0) {
      return { status: 'desatualizado', detail: `mais antigo aqui do que no tema de origem: ${older.join(', ')} — clique em Completar` };
    }
    return { status: 'pronto', detail: null };
  }
  const stale = all
    .filter((f, i) => !plan.derived.includes(f.filename) && !sameContent(f.filename, f.body.value, texts[i]!))
    .map((f) => f.filename);
  if (stale.length > 0) {
    return { status: 'desatualizado', detail: `diferente do tema de origem: ${stale.join(', ')} — prepare de novo` };
  }
  return { status: 'pronto', detail: null };
}

// ---- A | B tests -----------------------------------------------------------------

/** Version A's own template, when it has one, is in the theme (`.json` or `.liquid`). */
async function hasProductTemplate(client: ShopifyClient, themeId: string, suffix: string): Promise<boolean> {
  const [json, liquid] = await readThemeFiles(client, themeId, [`templates/product.${suffix}.json`, `templates/product.${suffix}.liquid`]);
  return json !== null || liquid !== null;
}

/**
 * Writes a live test's split into the target theme, as going live does. A
 * version A whose own template the target lacks is refused: the split would
 * quietly fall back to the theme's default product page, and half the ad's
 * visitors would see it.
 */
export async function prepareSplit(
  client: ShopifyClient,
  targetThemeId: string,
  plan: SplitPlan,
): Promise<ItemOutcome & { mode: string | null; note: string | null }> {
  const a = plan.entry?.template ?? null;
  if (a && !(await hasProductTemplate(client, targetThemeId, a))) {
    const why = isOurSuffix(a)
      ? 'a página dela está nesta lista: prepare de novo depois que ela ficar pronta'
      : 'esse modelo não é do D&VFly — crie-o no tema de destino ou troque a versão A antes de publicar';
    return {
      status: 'falhou',
      written: [],
      problem: `a versão A usa o modelo «${a}», que o tema de destino não tem: ela mostraria a página padrão de produto (${why})`,
      notes: [],
      mode: null,
      note: null,
    };
  }
  try {
    const result = await ensureSplitTemplate(client, plan, { themeId: targetThemeId });
    const notes = result.note ? [result.note] : [];
    if (result.mode === 'view' && plan.entry) {
      notes.push('neste tema a versão A abre pela URL ?view= (não dá para mostrá-la direto na URL de entrada)');
    }
    return {
      status: 'pronto',
      written: [`templates/product.${result.suffix}.json`],
      problem: null,
      notes,
      mode: result.mode,
      note: result.note,
    };
  } catch (error) {
    return { status: 'falhou', written: [], problem: errorText(error), notes: [], mode: null, note: null };
  }
}

/** The split's template, its layout, its sections, and every template its script sends visitors to exist in the target. */
export async function checkSplit(
  client: ShopifyClient,
  targetThemeId: string,
  testId: string,
  entryTemplate: string | null = null,
): Promise<ItemCheck> {
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
  const views = new Set(typeof template.layout === 'string' ? splitViews(texts[0] ?? '') : []);
  if (entryTemplate) views.add(entryTemplate);
  for (const view of views) {
    if (!(await hasProductTemplate(client, targetThemeId, view))) missing.push(`templates/product.${view}.json`);
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
