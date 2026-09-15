import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { ShopifyError } from '../src/client.ts';
import {
  exchangeToken,
  SessionTokenError,
  signSessionToken,
  verifySessionToken,
  verifyWebhookHmac,
} from '../src/session.ts';

const credentials = { clientId: 'app-id', clientSecret: 'shpss_secret' };
const now = 1_800_000_000_000;
const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: 'https://loja.myshopify.com/admin',
  dest: 'https://loja.myshopify.com',
  aud: 'app-id',
  sub: '42',
  exp: now / 1000 + 60,
  nbf: now / 1000 - 1,
  iat: now / 1000 - 1,
  jti: 'j1',
  sid: 's1',
  ...overrides,
});

describe('verifySessionToken', () => {
  it('accepts a token Shopify would sign and reads the shop from dest', () => {
    const token = signSessionToken(claims(), credentials.clientSecret);
    const session = verifySessionToken(token, credentials, now);
    assert.equal(session.shop, 'loja.myshopify.com');
    assert.equal(session.userId, '42');
    assert.equal(session.sid, 's1');
  });

  const reject = (label: string, token: string, reason: string) =>
    it(`rejects ${label}`, () => {
      assert.throws(
        () => verifySessionToken(token, credentials, now),
        (error: unknown) => error instanceof SessionTokenError && error.reason === reason,
      );
    });

  reject('a wrong signature', signSessionToken(claims(), 'other-secret'), 'assinatura');
  reject('an expired token', signSessionToken(claims({ exp: now / 1000 - 30 }), credentials.clientSecret), 'expirado');
  reject('a token from the future', signSessionToken(claims({ nbf: now / 1000 + 120 }), credentials.clientSecret), 'ainda não válido');
  reject('another app (aud)', signSessionToken(claims({ aud: 'someone-else' }), credentials.clientSecret), 'aud');
  reject('iss and dest on different shops', signSessionToken(claims({ iss: 'https://outra.myshopify.com/admin' }), credentials.clientSecret), 'iss');
  reject('a dest that is not a myshopify domain', signSessionToken(claims({ dest: 'https://evil.example', iss: 'https://evil.example/admin' }), credentials.clientSecret), 'dest');
  reject('garbage', 'not.a.jwt', 'formato');
  reject('a body that is not an object', signSessionToken(null as unknown as Record<string, unknown>, credentials.clientSecret), 'formato');

  it('tolerates a few seconds of clock skew', () => {
    const token = signSessionToken(claims({ exp: now / 1000 - 5 }), credentials.clientSecret);
    assert.equal(verifySessionToken(token, credentials, now).shop, 'loja.myshopify.com');
  });
});

describe('exchangeToken', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('posts the token-exchange grant and returns the offline token', async () => {
    let seen: { url: string; body: Record<string, string> } | null = null;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ access_token: 'shpat_x', scope: 'write_content,write_themes' }), { status: 200 });
    }) as typeof fetch;
    const token = await exchangeToken('loja.myshopify.com', 'id.token.here', credentials);
    assert.equal(token.accessToken, 'shpat_x');
    assert.equal(token.scope, 'write_content,write_themes');
    assert.equal(seen!.url, 'https://loja.myshopify.com/admin/oauth/access_token');
    assert.equal(seen!.body.grant_type, 'urn:ietf:params:oauth:grant-type:token-exchange');
    assert.equal(seen!.body.subject_token, 'id.token.here');
    assert.equal(seen!.body.subject_token_type, 'urn:ietf:params:oauth:token-type:id_token');
    assert.equal(seen!.body.requested_token_type, 'urn:shopify:params:oauth:token-type:offline-access-token');
    assert.equal(seen!.body.client_secret, 'shpss_secret');
  });

  it('turns a refusal into a ShopifyError carrying the status', async () => {
    globalThis.fetch = (async () => new Response('{"error":"invalid_subject_token"}', { status: 400 })) as typeof fetch;
    await assert.rejects(
      () => exchangeToken('loja.myshopify.com', 'bad', credentials),
      (error: unknown) => error instanceof ShopifyError && error.detail.status === 400,
    );
  });
});

describe('verifyWebhookHmac', () => {
  const body = '{"shop_domain":"loja.myshopify.com"}';
  const good = createHmac('sha256', credentials.clientSecret).update(body).digest('base64');

  it('accepts the signature Shopify would send over the raw body', () => {
    assert.equal(verifyWebhookHmac(body, good, credentials.clientSecret), true);
  });

  it('rejects a tampered body, a missing header and the wrong secret', () => {
    assert.equal(verifyWebhookHmac(body + ' ', good, credentials.clientSecret), false);
    assert.equal(verifyWebhookHmac(body, null, credentials.clientSecret), false);
    assert.equal(verifyWebhookHmac(body, good, 'other'), false);
  });
});
