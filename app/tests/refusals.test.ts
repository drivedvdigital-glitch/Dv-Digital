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

import { secretSignsToken, signSessionToken, unverifiedNumber } from '../../packages/shopify/src/session.ts';
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
  assert.deepEqual(keyVerdict(APP, CERTA, AGORA), { assina: null, loja: null, minutos: null, testados: 0 });
});

test('depois de uma recusa, o veredito separa a chave certa da errada', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, AGORA);
  const bom = keyVerdict(APP, CERTA, AGORA + 60_000);
  assert.equal(bom.assina, true);
  assert.equal(bom.loja, 'loja.myshopify.com');
  assert.equal(bom.minutos, 1, 'quantos minutos faz, para saber que é a recusa certa');
  assert.equal(keyVerdict(APP, ERRADA, AGORA + 60_000).assina, false);
});

test('cada app responde pelo token dele', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja-a.myshopify.com', CERTA), APP, AGORA);
  rememberRefusal(tokenDe('bbbb2222', 'loja-b.myshopify.com', ERRADA), 'bbbb2222', AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, true);
  assert.equal(keyVerdict('bbbb2222', ERRADA, AGORA).assina, true);
  assert.equal(keyVerdict('bbbb2222', CERTA, AGORA).assina, false);
});

test('a recusa nova entra AO LADO da anterior — ela não apaga a prova boa', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', ERRADA), APP, AGORA);
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, AGORA + 1000);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 2000).assina, true, 'a lembrança velha não decide');
  assert.equal(keyVerdict(APP, CERTA, AGORA + 2000).testados, 2, 'as duas continuam guardadas');
});

test('a lembrança expira, e expirada vira "não sei"', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 29 * 60_000).assina, true);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 31 * 60_000).assina, null);
});

test('token sem aud não é lembrado — não haveria contra o que testá-lo', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), '', AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, null);
});

test('cada app guarda um punhado, não uma pilha sem fim', () => {
  forgetRefusals();
  for (let i = 0; i < 40; i++) {
    // Tokens distintos do MESMO app: é o que uma enxurrada produziria.
    rememberRefusal(tokenDe(APP, `loja-${i}.myshopify.com`, ERRADA), APP, AGORA + i);
  }
  assert.ok(keyVerdict(APP, ERRADA, AGORA + 40).testados <= 8, 'o anel tem teto');
});

// --- o que a revisão adversarial encontrou --------------------------------

test('token forjado não apaga a prova boa: positivo é inforjável', () => {
  // O ataque: alguém manda tokens com `aud` de um app real e assinatura de
  // lixo, para que a chave CERTA passe a ser julgada contra o token dele.
  // Com um slot só, a prova boa era substituída e a chave certa lia "errada".
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', CERTA), APP, AGORA);
  for (let i = 0; i < 5; i++) {
    rememberRefusal(tokenDe(APP, `falsa-${i}.myshopify.com`, 'assinatura-de-lixo'), APP, AGORA + i + 1);
  }
  const v = keyVerdict(APP, CERTA, AGORA + 10);
  assert.equal(v.assina, true, 'a chave certa continua sendo reconhecida');
  assert.equal(v.loja, 'loja.myshopify.com', 'e o veredito nomeia a loja de verdade');
  assert.ok(v.testados > 1, 'dizendo quantos tokens foram testados');
});

test('ninguém consegue forjar um CERTA sem a chave', () => {
  forgetRefusals();
  rememberRefusal(tokenDe(APP, 'loja.myshopify.com', 'chave-do-atacante'), APP, AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, false, 'a chave certa não assina o token dele');
  assert.equal(keyVerdict(APP, 'chave-do-atacante', AGORA).assina, true, 'só quem tem a chave dele');
});

test('token sem cara de recém-assinado pela Shopify não é guardado', () => {
  forgetRefusals();
  const velho = signSessionToken(
    { iss: 'https://loja.myshopify.com/admin', dest: 'https://loja.myshopify.com', aud: APP, exp: 1 },
    CERTA,
  );
  rememberRefusal(velho, APP, AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, null, 'exp de outra era');

  const semLoja = signSessionToken(
    { iss: 'https://exemplo.com/admin', dest: 'https://exemplo.com', aud: APP, exp: Math.floor(AGORA / 1000) + 60 },
    CERTA,
  );
  rememberRefusal(semLoja, APP, AGORA);
  assert.equal(keyVerdict(APP, CERTA, AGORA).assina, null, 'dest que não é myshopify');

  assert.equal(unverifiedNumber(velho, 'exp'), 1, 'o exp é lido sem verificar nada');
  assert.equal(unverifiedNumber('lixo', 'exp'), null);
});

test('o mesmo token repetido não ocupa dois lugares', () => {
  forgetRefusals();
  const token = tokenDe(APP, 'loja.myshopify.com', CERTA);
  rememberRefusal(token, APP, AGORA);
  rememberRefusal(token, APP, AGORA + 1000);
  assert.equal(keyVerdict(APP, CERTA, AGORA + 1000).testados, 1);
});
