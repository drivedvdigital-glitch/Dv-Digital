/**
 * Authenticated Admin API client, one per store.
 *
 * Uses the client credentials grant, which exists for apps acting only on
 * stores in your own organization — our case exactly. With it there is no
 * long-lived token sitting in the Shopify admin: the client asks for a
 * short-lived one and refreshes it before it expires.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
 *
 * That grant is also what makes the multi-store workflow simple (see
 * docs/ARQUITETURA.md section 2.5): one process can hold credentials for N
 * stores and publish to all of them, with no OAuth and no session storage.
 */

export const DEFAULT_API_VERSION = '2026-07';

export interface StoreCredentials {
  /** Full myshopify domain, e.g. `my-store.myshopify.com`. */
  domain: string;
  /**
   * An offline access token obtained when the store installed the app (token
   * exchange). When present it is used as is; the client credentials below
   * are then only needed for stores of the app's own organization.
   */
  accessToken?: string | null;
  clientId: string;
  clientSecret: string;
  apiVersion?: string;
}

export interface GraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

/**
 * Thrown for anything that prevented a request from producing a usable answer.
 * Carries the pieces a caller needs to decide what to do rather than a string
 * they would have to parse.
 */
export interface ShopifyErrorDetail {
  status?: number;
  /** Top-level GraphQL errors, i.e. the query itself was rejected. */
  errors?: GraphQLError[];
  /** Mutation userErrors, i.e. the query ran and the operation was refused. */
  userErrors?: unknown[];
  body?: string;
}

export class ShopifyError extends Error {
  readonly detail: ShopifyErrorDetail;

  constructor(message: string, detail: ShopifyErrorDetail = {}) {
    super(message);
    this.name = 'ShopifyError';
    this.detail = detail;
  }

  /** True when Shopify refused on permissions rather than on the input. */
  get isAccessDenied(): boolean {
    const haystack = JSON.stringify(this.detail.errors ?? this.detail.body ?? '');
    return /access denied|not approved|exemption|protected|unauthorized/i.test(haystack);
  }

  /** True when the operation named a resource the store no longer has. */
  get isNotFound(): boolean {
    const haystack = JSON.stringify(this.detail.userErrors ?? this.detail.errors ?? this.detail.body ?? '');
    return /not found|does not exist|NOT_FOUND|não existe/i.test(haystack);
  }
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/** Retries after a throttle. Three is enough to ride out a burst, not an outage. */
const MAX_RETRIES = 3;

interface CostExtensions {
  cost?: {
    requestedQueryCost?: number;
    throttleStatus?: { currentlyAvailable?: number; restoreRate?: number };
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After in seconds when Shopify sends it; otherwise 1s, 2s, 4s. */
function retryAfterMs(header: string | null, attempt: number): number {
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 10) * 1000;
  return 1000 * 2 ** attempt;
}

/** Time for the bucket to refill what the query needs, or the same backoff. */
function throttleWaitMs(extensions: CostExtensions | undefined, attempt: number): number {
  const cost = extensions?.cost;
  const need = (cost?.requestedQueryCost ?? 0) - (cost?.throttleStatus?.currentlyAvailable ?? 0);
  const rate = cost?.throttleStatus?.restoreRate ?? 0;
  if (need > 0 && rate > 0) return Math.min(Math.ceil((need / rate) * 1000) + 100, 10_000);
  return 1000 * 2 ** attempt;
}

export class ShopifyClient {
  private token: CachedToken | null = null;
  private inFlight: Promise<string> | null = null;
  private readonly credentials: StoreCredentials;
  readonly apiVersion: string;

  constructor(credentials: StoreCredentials) {
    this.credentials = credentials;
    this.apiVersion = credentials.apiVersion ?? DEFAULT_API_VERSION;
  }

  get domain(): string {
    return this.credentials.domain;
  }

  /**
   * Returns a valid access token, fetching one if needed.
   *
   * Concurrent callers share a single in-flight request: publishing to a store
   * fires several queries at once, and without this each would mint its own
   * token.
   */
  async accessToken(): Promise<string> {
    // An installed store's offline token never expires on its own.
    if (this.credentials.accessToken) return this.credentials.accessToken;
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    if (!this.credentials.clientId || !this.credentials.clientSecret) {
      throw new ShopifyError(
        `Sem credencial para ${this.domain}: a loja não instalou o app e o ambiente não tem client id/secret.`,
      );
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.requestToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async requestToken(): Promise<string> {
    const { domain, clientId, clientSecret } = this.credentials;
    const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new ShopifyError(
        `Não foi possível obter token para ${domain} (HTTP ${response.status})`,
        { status: response.status, body: body.slice(0, 500) },
      );
    }

    let parsed: { access_token?: string; expires_in?: number };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ShopifyError(`Resposta de token ilegível de ${domain}`, { body: body.slice(0, 200) });
    }
    if (!parsed.access_token) {
      throw new ShopifyError(`Resposta de token sem access_token`, { body: body.slice(0, 200) });
    }

    // Refresh a minute early, so a token never expires mid-request.
    const lifetime = (parsed.expires_in ?? 3600) * 1000;
    this.token = {
      value: parsed.access_token,
      expiresAt: Date.now() + Math.max(lifetime - 60_000, 30_000),
    };
    return this.token.value;
  }

  /**
   * Runs a GraphQL operation. Throws on transport failure or top-level errors;
   * `userErrors` are left for the caller, since only it knows which ones are
   * expected.
   *
   * Shopify meters requests with a leaky bucket (100 points/s restored on a
   * standard plan; a mutation costs 10). A bulk deploy across stores can drain
   * it, and the answer is then an HTTP 429 or a 200 carrying a `THROTTLED`
   * error. Both are retried here, waiting what the response says (Retry-After,
   * or the cost the bucket still needs to refill) — bounded, so a store that is
   * really down fails within seconds instead of hanging.
   * https://shopify.dev/docs/api/usage/limits
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let lastThrottle: ShopifyError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const token = await this.accessToken();
      const response = await fetch(
        `https://${this.domain}/admin/api/${this.apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          body: JSON.stringify({ query, variables }),
        },
      );

      const body = await response.text();
      this.checkServedVersion(response.headers.get('x-shopify-api-version'));

      if (response.status === 429) {
        lastThrottle = new ShopifyError(`Shopify limitou as requisições em ${this.domain} (HTTP 429)`, {
          status: 429,
          body: body.slice(0, 500),
        });
        await sleep(retryAfterMs(response.headers.get('retry-after'), attempt));
        continue;
      }
      if (!response.ok) {
        throw new ShopifyError(`GraphQL HTTP ${response.status} em ${this.domain}`, {
          status: response.status,
          body: body.slice(0, 500),
        });
      }

      let parsed: { data?: T; errors?: GraphQLError[]; extensions?: CostExtensions };
      try {
        parsed = JSON.parse(body);
      } catch {
        // A 200 that is not JSON is a bot challenge or an outage page, never a
        // GraphQL answer — surfaced as ours, with the start of the body.
        throw new ShopifyError(`Resposta ilegível do GraphQL em ${this.domain}`, {
          status: response.status,
          body: body.slice(0, 200),
        });
      }

      if (parsed.errors?.length) {
        if (parsed.errors.some((e) => e.extensions?.code === 'THROTTLED')) {
          lastThrottle = new ShopifyError(`Shopify limitou as requisições em ${this.domain} (THROTTLED)`, {
            errors: parsed.errors,
          });
          await sleep(throttleWaitMs(parsed.extensions, attempt));
          continue;
        }
        throw new ShopifyError(
          `GraphQL recusou a consulta em ${this.domain}: ${parsed.errors.map((e) => e.message).join('; ')}`,
          { errors: parsed.errors },
        );
      }
      if (!parsed.data) {
        throw new ShopifyError(`GraphQL sem dados em ${this.domain}`, { body: body.slice(0, 200) });
      }
      return parsed.data;
    }
    throw lastThrottle ?? new ShopifyError(`GraphQL não respondeu em ${this.domain}`);
  }

  private versionWarned = false;

  /**
   * Shopify "falls forward": a request for a retired version is answered by
   * the oldest supported one, and the only sign is this header. Said once per
   * client, loudly, because silently running on a different API version is how
   * a mutation's shape changes under your feet.
   */
  private checkServedVersion(served: string | null): void {
    if (!served || served === this.apiVersion || this.versionWarned) return;
    this.versionWarned = true;
    console.warn(
      `[dvfly] ${this.domain} respondeu com a versão de API ${served}, não ${this.apiVersion} — ` +
        'a versão pedida não existe mais; atualize SHOPIFY_API_VERSION.',
    );
  }

  /** Cheap call that proves the credentials work and names the store. */
  async shopName(): Promise<string> {
    const data = await this.graphql<{ shop: { name: string } }>('{ shop { name } }');
    return data.shop.name;
  }
}

/** Renders a mutation's userErrors into one readable line. */
export function formatUserErrors(userErrors: unknown): string {
  if (!Array.isArray(userErrors) || userErrors.length === 0) return '';
  return userErrors
    .map((e: Record<string, unknown>) => {
      const where = e.field ?? e.filename ?? e.code ?? '';
      return where ? `${String(where)}: ${String(e.message)}` : String(e.message);
    })
    .join('; ');
}
