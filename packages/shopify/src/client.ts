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
}

interface CachedToken {
  value: string;
  expiresAt: number;
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
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
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
   */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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
    if (!response.ok) {
      throw new ShopifyError(`GraphQL HTTP ${response.status} em ${this.domain}`, {
        status: response.status,
        body: body.slice(0, 500),
      });
    }

    const parsed = JSON.parse(body) as { data?: T; errors?: GraphQLError[] };
    if (parsed.errors?.length) {
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
