/**
 * Two Shopify apps on one server: which credentials a token belongs to.
 *
 * The rule that matters is the security one — picking by `aud` decides only
 * WHICH secret the signature is checked against, never whether the token is
 * good. A token minted for app A must not pass as app B, and a token signed
 * with a secret nobody has must not pass at all.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  credentialsFor,
  signSessionToken,
  verifySessionToken,
  SessionTokenError,
} from '../../packages/shopify/src/session.ts';
import { tokenRefusalMessage } from '../app/lib/token-refusal.ts';

const APP_A = { clientId: 'aaaa1111', clientSecret: 'segredo-do-app-a' };
const APP_B = { clientId: 'bbbb2222', clientSecret: 'segredo-do-app-b' };
const APPS = [APP_A, APP_B];

const tokenFor = (app: { clientId: string; clientSecret: string }, shop: string, signWith = app.clientSecret) => {
  const now = Math.floor(Date.now() / 1000);
  return signSessionToken(
    {
      iss: `https://${shop}/admin`,
      dest: `https://${shop}`,
      aud: app.clientId,
      sub: '1',
      nbf: now - 5,
      iat: now - 5,
      jti: 'teste',
      sid: 's',
      exp: now + 300,
    },
    signWith,
  );
};

test('cada token encontra o app dele pelo aud', () => {
  assert.equal(credentialsFor(tokenFor(APP_A, 'loja-a.myshopify.com'), APPS)?.clientId, APP_A.clientId);
  assert.equal(credentialsFor(tokenFor(APP_B, 'loja-b.myshopify.com'), APPS)?.clientId, APP_B.clientId);
});

test('token de um app que este servidor não atende não acha credencial nenhuma', () => {
  const estranho = tokenFor({ clientId: 'cccc3333', clientSecret: 'segredo-de-outro' }, 'loja-x.myshopify.com');
  assert.equal(credentialsFor(estranho, APPS), null);
});

test('com um app só, é ele que responde — e a verificação é que recusa o aud errado', () => {
  const doOutro = tokenFor(APP_B, 'loja-b.myshopify.com');
  assert.equal(credentialsFor(doOutro, [APP_A])?.clientId, APP_A.clientId);
  assert.throws(() => verifySessionToken(doOutro, APP_A), (e: unknown) => e instanceof SessionTokenError);
});

test('escolher pelo aud não deixa passar assinatura forjada', () => {
  // Diz ser do app B (para ser conferido com o secret do B) mas foi assinado
  // com outra chave: é o ataque que a escolha por aud poderia abrir.
  const forjado = tokenFor(APP_B, 'loja-b.myshopify.com', 'secret-que-o-atacante-inventou');
  const escolhido = credentialsFor(forjado, APPS);
  assert.equal(escolhido?.clientId, APP_B.clientId, 'a escolha é pelo que o token diz');
  assert.throws(
    () => verifySessionToken(forjado, escolhido!),
    (e: unknown) => e instanceof SessionTokenError && e.reason === 'assinatura',
  );
});

test('o token do app A não é aceito com o secret do app B', () => {
  const doA = tokenFor(APP_A, 'loja-a.myshopify.com');
  assert.throws(
    () => verifySessionToken(doA, APP_B),
    (e: unknown) => e instanceof SessionTokenError && e.reason === 'assinatura',
  );
});

test('lixo no lugar do token não escolhe app nenhum', () => {
  for (const ruim of ['', 'nada', 'a.b', 'a.b.c.d', 'x.y.z']) {
    assert.equal(credentialsFor(ruim, APPS), null, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test('sem app configurado não há credencial', () => {
  assert.equal(credentialsFor(tokenFor(APP_A, 'loja-a.myshopify.com'), []), null);
});

test('a recusa por assinatura nomeia o app e manda girar o secret', () => {
  const texto = tokenRefusalMessage('assinatura', APP_B.clientId);
  assert.match(texto, /assinatura não confere/);
  assert.match(texto, new RegExp(APP_B.clientId), 'sem o Client ID não dá para saber QUAL secret trocar');
  assert.match(texto, /adicionar-app/, 'a tela tem que apontar a rota exata do conserto');
});

test('a recusa por aud não pede troca de secret — pede o app que falta', () => {
  const texto = tokenRefusalMessage('aud', null);
  assert.match(texto, /não conhece/);
  assert.match(texto, /adicionar-app/);
  assert.doesNotMatch(texto, /girad/, 'mandar girar o secret aqui manda caçar o erro errado');
});

test('motivo sem conserto conhecido sai como está, sem inventar diagnóstico', () => {
  assert.equal(tokenRefusalMessage('formato', null), 'ID token recusado (formato).');
  assert.match(tokenRefusalMessage('expirado', null), /Recarregue a página/);
});
