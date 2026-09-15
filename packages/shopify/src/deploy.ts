/**
 * Publishing one page to many stores.
 *
 * This is the operation the business actually performs: build once, validate on
 * the test store, then push to the production stores (docs/ARQUITETURA.md 2.5).
 * The competitor's answer to the same need is exporting a proprietary file and
 * importing it store by store; here it is one call.
 *
 * Two rules shape the design:
 *
 *   - **Stores are independent.** One store failing must not stop the others,
 *     and the result has to say exactly which succeeded and which did not.
 *   - **Publishing twice is not publishing two pages.** Every store is upserted
 *     by handle, so re-running a deploy updates rather than duplicates.
 */

import { ShopifyClient, ShopifyError, type StoreCredentials } from './client.ts';
import { upsertPage, type PageInput, type ShopifyPage } from './pages.ts';
import { ensureSoloTemplate } from './templates.ts';

export interface Store extends StoreCredentials {
  /** Human label for reports, e.g. "Colômbia". */
  label: string;
  /**
   * Marks a live storefront. Deploys that include a production store require an
   * explicit opt-in, so "publish everywhere" is never one careless click away.
   */
  isProduction?: boolean;
}

export interface DeployTarget {
  store: Store;
  ok: boolean;
  created?: boolean;
  page?: ShopifyPage;
  error?: string;
  /** Set when the failure was Shopify refusing access rather than bad input. */
  accessDenied?: boolean;
  durationMs: number;
}

export interface DeployResult {
  handle: string;
  targets: DeployTarget[];
  get succeeded(): DeployTarget[];
  get failed(): DeployTarget[];
}

export interface DeployOptions {
  /** Required before any store marked `isProduction` is touched. */
  allowProduction?: boolean;
  /** Publish live. Defaults to false: a deploy lands as a draft unless asked. */
  publish?: boolean;
  /** ISO 8601. Shopify reveals the page at this moment. */
  publishDate?: string;
  /** Requests in flight at once. Small on purpose; these are write operations. */
  concurrency?: number;
  /**
   * Write the D&VFly chrome-less template into each store's main theme before
   * upserting. Set when the page's templateSuffix points at it — the suffix
   * without the files would 404 the storefront.
   */
  bindSoloTemplate?: boolean;
}

export class ProductionNotAllowedError extends Error {
  readonly stores: Store[];

  constructor(stores: Store[]) {
    super(
      `Este deploy inclui loja(s) de produção (${stores.map((s) => s.label).join(', ')}). ` +
        'Passe allowProduction: true para confirmar.',
    );
    this.name = 'ProductionNotAllowedError';
    this.stores = stores;
  }
}

/**
 * Publishes the same compiled page to every listed store.
 *
 * `page.body` is the compiled fragment; the same bytes go to every store, which
 * is what makes the stores consistent by construction rather than by discipline.
 */
export async function deployPage(
  stores: Store[],
  page: PageInput & { handle: string },
  options: DeployOptions = {},
): Promise<DeployResult> {
  const { allowProduction = false, publish = false, publishDate, concurrency = 3 } = options;

  const production = stores.filter((store) => store.isProduction);
  if (production.length > 0 && !allowProduction) {
    throw new ProductionNotAllowedError(production);
  }

  const input: PageInput & { handle: string } = {
    ...page,
    isPublished: publish,
    ...(publishDate ? { publishDate } : {}),
  };

  const targets: DeployTarget[] = [];
  const queue = [...stores];

  const worker = async (): Promise<void> => {
    for (let store = queue.shift(); store; store = queue.shift()) {
      const startedAt = Date.now();
      try {
        const client = new ShopifyClient(store);
        if (options.bindSoloTemplate) await ensureSoloTemplate(client);
        const { page: published, created } = await upsertPage(client, input);
        targets.push({
          store,
          ok: true,
          created,
          page: published,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        targets.push({
          store,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          accessDenied: error instanceof ShopifyError ? error.isAccessDenied : false,
          durationMs: Date.now() - startedAt,
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, stores.length) }, () => worker()),
  );

  // Report in the order the caller listed the stores, not the order they finished.
  const order = new Map(stores.map((store, index) => [store.domain, index]));
  targets.sort((a, b) => (order.get(a.store.domain) ?? 0) - (order.get(b.store.domain) ?? 0));

  const result: DeployResult = {
    handle: page.handle,
    targets,
    get succeeded() {
      return targets.filter((t) => t.ok);
    },
    get failed() {
      return targets.filter((t) => !t.ok);
    },
  };
  return result;
}

/** One-line-per-store summary, for a CLI or a log. */
export function formatDeployResult(result: DeployResult): string {
  const lines = result.targets.map((target) => {
    const mark = target.ok ? '✓' : '✗';
    const detail = target.ok
      ? `${target.created ? 'criada' : 'atualizada'} · ${target.page?.handle} · ${
          target.page?.isPublished ? 'publicada' : 'rascunho'
        }`
      : target.error;
    return `  ${mark} ${target.store.label.padEnd(16)} ${detail} (${target.durationMs}ms)`;
  });
  const ok = result.succeeded.length;
  lines.push(`\n  ${ok}/${result.targets.length} loja(s) com sucesso.`);
  return lines.join('\n');
}
