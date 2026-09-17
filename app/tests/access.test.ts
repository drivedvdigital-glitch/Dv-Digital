/**
 * The lock, tested where it decides: the key comparison and the brake on
 * guessing. Both are pure (`app/lib/access.ts`), so this runs without a
 * database, a server or a Shopify token.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AttemptLimiter, keyMatches, waitLabel } from '../app/lib/access.ts';

test('a chave certa entra, qualquer outra não', () => {
  assert.equal(keyMatches('abelha-42', 'abelha-42'), true);
  assert.equal(keyMatches('abelha-43', 'abelha-42'), false);
  assert.equal(keyMatches('abelha', 'abelha-42'), false, 'prefixo não vale');
  assert.equal(keyMatches('ABELHA-42', 'abelha-42'), false, 'maiúscula é outra chave');
  assert.equal(keyMatches('', 'abelha-42'), false);
  assert.equal(keyMatches(' abelha-42', 'abelha-42'), false, 'espaço faz parte da chave');
});

test('sem chave configurada nada casa — nem a string vazia', () => {
  // Importa porque o portão só liga quando há chave: se ela some do ambiente,
  // o comparador não pode virar uma porta aberta.
  assert.equal(keyMatches('', ''), false);
  assert.equal(keyMatches('qualquer', ''), false);
});

test('chave longa e com acento funciona byte a byte', () => {
  const chave = 'coração-da-máquina-🔒-com-64-caracteres-ou-mais-para-garantir';
  assert.equal(keyMatches(chave, chave), true);
  assert.equal(keyMatches(`${chave} `, chave), false);
});

test('cinco erros param a loja, e a pausa acaba sozinha', () => {
  const limiter = new AttemptLimiter(5, 60_000);
  const loja = 'teste.myshopify.com';
  let agora = 1_000_000;

  for (let i = 1; i <= 4; i++) {
    assert.equal(limiter.fail(loja, agora), 0, `erro ${i} ainda não bloqueia`);
    assert.equal(limiter.triesLeft(loja), 5 - i);
  }

  const espera = limiter.fail(loja, agora);
  assert.equal(espera, 60_000, 'o quinto erro bloqueia');
  assert.equal(limiter.blockedFor(loja, agora), 60_000);
  assert.equal(limiter.blockedFor(loja, agora + 59_000), 1_000);

  agora += 60_001;
  assert.equal(limiter.blockedFor(loja, agora), 0, 'a pausa termina');
  assert.equal(limiter.triesLeft(loja), 5, 'e a contagem volta do zero');
});

test('o bloqueio é por loja: uma errando não trava a outra', () => {
  const limiter = new AttemptLimiter(2, 30_000);
  const agora = 500;
  limiter.fail('a.myshopify.com', agora);
  limiter.fail('a.myshopify.com', agora);
  assert.ok(limiter.blockedFor('a.myshopify.com', agora) > 0);
  assert.equal(limiter.blockedFor('b.myshopify.com', agora), 0);
});

test('acertar limpa o que ficou de erros anteriores', () => {
  const limiter = new AttemptLimiter(3, 10_000);
  limiter.fail('loja.myshopify.com', 0);
  limiter.fail('loja.myshopify.com', 0);
  limiter.clear('loja.myshopify.com');
  assert.equal(limiter.triesLeft('loja.myshopify.com'), 3);
  assert.equal(limiter.blockedFor('loja.myshopify.com', 0), 0);
});

test('a espera é dita em português, arredondada para cima', () => {
  assert.equal(waitLabel(1), '1 segundo');
  assert.equal(waitLabel(2_400), '3 segundos');
  assert.equal(waitLabel(59_000), '59 segundos');
  assert.equal(waitLabel(60_000), '1 minuto');
  assert.equal(waitLabel(4 * 60_000 + 1), '5 minutos');
});
