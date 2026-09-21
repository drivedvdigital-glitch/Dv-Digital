/**
 * O nome de uma loja: só a regra, sem banco.
 *
 * Duas lojas PODEM se chamar a mesma coisa — as duas da Colômbia se chamam
 * "Côlombia". O que não pode é uma loja ficar sem nome nenhum: seria uma
 * caixa de seleção em branco no "Publicar em".
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STORE_LABEL_MAX, storeLabelFrom } from '../app/lib/shared.ts';

const DOM = '49e257-b3.myshopify.com';

test('o nome digitado é o nome', () => {
  assert.equal(storeLabelFrom('Côlombia', DOM), 'Côlombia');
  assert.equal(storeLabelFrom('Hungria', 'magyarorszag.myshopify.com'), 'Hungria');
});

test('espaço das pontas e do meio não vira nome', () => {
  assert.equal(storeLabelFrom('  Côlombia  ', DOM), 'Côlombia');
  assert.equal(storeLabelFrom('Côlombia   White', DOM), 'Côlombia White');
  assert.equal(storeLabelFrom('\tHungria\n', 'x.myshopify.com'), 'Hungria');
});

test('vazio volta a ser o domínio — loja sem nome é caixa sem alvo', () => {
  assert.equal(storeLabelFrom('', DOM), '49e257-b3');
  assert.equal(storeLabelFrom('     ', DOM), '49e257-b3');
  assert.equal(storeLabelFrom('', 'LOJA.MyShopify.com'), 'LOJA');
  // Domínio que não é da Shopify fica inteiro: melhor esquisito que vazio.
  assert.equal(storeLabelFrom('', 'loja.exemplo.com'), 'loja.exemplo.com');
});

test('nome comprido é cortado, e o corte não deixa espaço solto no fim', () => {
  const longo = 'a'.repeat(200);
  assert.equal(storeLabelFrom(longo, DOM).length, STORE_LABEL_MAX);
  const cortaNoEspaco = `${'b'.repeat(STORE_LABEL_MAX - 1)} cauda`;
  assert.equal(storeLabelFrom(cortaNoEspaco, DOM), 'b'.repeat(STORE_LABEL_MAX - 1));
});

test('dois nomes iguais são permitidos — quem desempata é o domínio', () => {
  // A regra não tem opinião sobre repetição: as duas lojas da Colômbia se
  // chamam igual de propósito, e as telas mostram o domínio embaixo.
  assert.equal(storeLabelFrom('Côlombia', '49e257-b3.myshopify.com'), 'Côlombia');
  assert.equal(storeLabelFrom('Côlombia', '01xmv2-7m.myshopify.com'), 'Côlombia');
});
