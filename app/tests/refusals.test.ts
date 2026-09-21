/**
 * Provar uma chave contra um token que a Shopify assinou.
 *
 * A regra que importa: o veredito tem TRÊS respostas, não duas. "não tenho
 * token para testar" não é "a chave está errada" — são consertos diferentes, e
 * confundi-los manda procurar no lugar errado, que é o defeito que este
 * mecanismo existe para acabar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { secretSignsToken, signSessionToken } from '../../packages/shopify/src/session.ts';
import { forgetRefusals, keyVerdict, rememberRefusal } from '../app/lib/refusals.server.ts';

const APP = 'aaaa1111';
const CERTA = 'a-chave-que-a-shopify-usou';
const ERRADA = 'a-chave-do-app-de-nome-parecido';
const AGORA = 1_700_000_000_000;

const tokenDe = (aud: string, shop: string, chave: string) =>
  signSessionToken(
    {
      iss: `https://${shop}/admin`,
      dest: `https://${shop}`,
      aud,
      sub: '1',
      nbf: Math.floor(AGORA / 1000) - 5,
      exp: Math.floor(AGORA / 1000) + 60,
    },
    chave,
  );

test('a chave certa assina; a do app parecido não', () => {
  const token = tokenDe(APP, 'loja.myshopify.com', CERTA);
  assert.equal(secretSignsToken(token, CERTA), true);
  assert.equal(secretSignsToken(token, ERRADA), false);
});

test('a assinatura é julgada mesmo com o token já expirado', () => {
  // É o caso real: quando alguém cola a chave, o token que falhou tem minutos.
  const token = tokenDe(APP, 'loja.myshopify.com', CERTA);
  const umDiaDepois = AGORA + 24 * 3600 * 1000;
  assert.equal(secretSignsToken(token, CERTA), true, 'expirar não muda quem assinou');
  assert.equal(keyVerdict(APP, CERTA, umDiaDepois).assina, null, 'mas a lembrança some');
});

test('lixo no lugar do token não passa por chave nenhuma', () => {
  for (const ruim of ['', 'nada', 'a.b', 'a.b.c.d']) {
    assert.equal(secretSignsToken(ruim, CERTA), false, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test('sem recusa lembrada o veredito é "não sei", não "errada"', () => {
  forgetRefusals();
  assert.deepEqual(keyVerdict(APP, CERTA, AGORA), { assina: null, loja: null, minutos: null });
});

test('depois de uma recusa, o veredito separa a chave certa da errada', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, 'loja.myshopify.com', AGORA);
  const bom = keyVerdict(APP, CERTA, AGORA + 60_000);
  assert.equal(bom.assina, true);
  assert.equal(bom.loja, 'loja.myshopify.com');
  assert.equal(bom.minutos, 1, 'quantos minutos faz, para saber que é a recusa certa');
  assert.equal(keyVerdict(APP, ERRADA, AGORA + 60_000).assina, false);
});

test('cada app responde pelo token dele', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja-a.myshopify.com', CERTA), APP, 'loja-a.myshopify.com', AGORA);
  rememberRefusal(tokenDe('bbbb2222', 'loja-b.myshopify.com', ERRADA), 'bbbb2222', 'loja-b.myshopify.com', AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, true);
  assert.equal(keyVerdict('bbbb2222', ERRADA, AGORA).assina, true);
  assert.equal(keyVerdict('bbbb2222', CERTA, AGORA).assina, false);
});

test('a recusa mais nova de um app substitui a anterior', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', ERRADA), APP, 'loja.myshopify.com', AGORA);
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, 'loja.myshopify.com', AGORA + 1000);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 2000).assina, true, 'a lembrança velha não decide');
});

test('a lembrança expira, e expirada vira "não sei"', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, 'loja.myshopify.com', AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 29 * 60_000).assina, true);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 31 * 60_000).assina, null);
});

test('token sem aud não é lembrado — não haveria contra o que testá-lo', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), null, null, AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, null);
});

test('a memória não cresce sem limite', () => {
  forgetRefusals();
  for (let i = 0; i < 40; i++) {
    rememberRefusal(tokenDe(`app${i}`, 'loja.myshopify.com', CERTA), `app${i}`, null, AGORA + i);
  }
  // Os mais novos continuam respondendo; os mais velhos foram esquecidos.
  assert.equal(keyVerdict('app39', CERTA, AGORA + 40).assina, true);
  assert.equal(keyVerdict('app0', CERTA, AGORA + 40).assina, null);
});
