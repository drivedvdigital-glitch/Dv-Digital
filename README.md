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

### Se aparecer "Instalação duplicada do React"

```sh
npm run fix:duplicados
npm run setup
```

Acontece uma vez só, em quem instalou o projeto antes dele virar workspace: fica um
`app/node_modules` velho com uma segunda cópia do React, e o app quebra com
`Cannot read properties of null (reading 'useContext')`. O `npm run dev` se recusa a subir nesse
estado em vez de deixar você descobrir pelo erro.

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
- [`docs/INSTALACAO.md`](docs/INSTALACAO.md) — instalar o app numa loja (Dev Dashboard, `shopify.app.toml`, hospedagem)
- [`docs/CONFIGURACAO_E_MECANISMOS.md`](docs/CONFIGURACAO_E_MECANISMOS.md) — auditoria código × plataforma × concorrente, plano P0/P1/P2, variáveis de ambiente
- [`docs/MODELOS_DE_TEMA.md`](docs/MODELOS_DE_TEMA.md) — páginas de produto como templates do tema
- [`docs/DESEMPENHO.md`](docs/DESEMPENHO.md) — o que toda página faz por padrão para ser leve, o que o editor avisa, o que é da Shopify
- [`docs/videos/`](docs/videos/) — o que cada gravação da referência ensinou
- [`docs/PROGRESSO.md`](docs/PROGRESSO.md) — o que já está feito, incluindo o que falhou

## Testes

```sh
npm test
```
