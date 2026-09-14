# D&VFly

Construtor visual de páginas para Shopify. App privado, lojas próprias.

## Rodar

Precisa de [Node 22.6+](https://nodejs.org) e [git](https://git-scm.com). Na raiz deste
repositório:

```sh
npm run setup
npm run dev
```

Abre `http://localhost:5173`.

O `setup` instala as dependências dos três pacotes, cria o `app/.env` e prepara o banco local. Pode
rodar de novo à vontade — ele não apaga nada.

⚠️ **Os comandos são na raiz, não dentro de `app/`.** O motivo está em [`app/README.md`](app/README.md).

## O que tem aqui

| Pasta | O quê |
|---|---|
| [`app/`](app/) | A tela: lista de páginas, editor e publicação multi-loja |
| [`packages/compiler/`](packages/compiler/) | Transforma blocos — e HTML escrito à mão — em HTML + CSS com escopo e sem duplicação |
| [`packages/shopify/`](packages/shopify/) | Cliente da Admin API e o deploy para várias lojas |
| [`docs/`](docs/) | Pesquisa, arquitetura, fluxos de uso |
| [`brand/`](brand/) | O logo, gerado por código |

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — as decisões e os sete invariantes
- [`docs/PESQUISA_PAGEFLY.md`](docs/PESQUISA_PAGEFLY.md) — pesquisa competitiva
- [`docs/UX_FLUXOS.md`](docs/UX_FLUXOS.md) — desenho de interação
- [`docs/USO_REAL.md`](docs/USO_REAL.md) — como a ferramenta concorrente é usada de verdade hoje
- [`docs/PROGRESSO.md`](docs/PROGRESSO.md) — o que já está feito

## Testes

```sh
npm test
```
