# Protótipo — compilador do D&VFly

Spike da Fase 2. Existe para **provar ou derrubar** a tese central do projeto antes de a gente
investir na Fase 3:

> Se o editor produzir um documento de dados e um compilador puro transformar esse documento em
> HTML + CSS estáticos, a página resultante carrega como página de tema — e não como página de
> builder.

Não é o produto. É o menor código possível que responde à pergunta.

## Rodar

Precisa de Node 22.6+ e **nenhuma dependência instalada** — o Node 22 remove os tipos do
TypeScript sozinho.

```sh
cd prototype
node --experimental-strip-types bin/build.ts     # compila e mede
node --experimental-strip-types --test "test/*.test.ts"   # invariantes
```

## O que o protótipo demonstra

Números da landing de exemplo em `fixtures/landing.json` — uma página real e completa: hero,
6 cards de benefício, 12 depoimentos, oferta com contador e FAQ de 8 itens.

| Medida | Resultado |
|---|---|
| Nós na árvore | 78 |
| HTML | 7,1 KB |
| CSS | 2,6 KB |
| JS | 0,3 KB (só o contador pediu) |
| **Total** | **10,1 KB** |
| Teto de template da Shopify | 256 KB — **usando 3,9%** |
| Regras CSS distintas | 32 para 107 pedidos de estilo (**3,3× de reúso**) |
| Tempo de compilação | ~5 ms |

Os dois números que importam:

- **3,9% do teto.** O concorrente documenta que páginas com muitos elementos aninhados estouram
  os 256 KB e orienta o lojista a *remover elementos*. Compilando para HTML estático, uma landing
  completa usa um vigésimo quinto do limite.
- **3,3× de reúso de CSS.** Doze depoimentos com estilo idêntico emitem **uma** regra, não doze.
  É a prova de que um repetidor genérico é mais barato que blocos rígidos, e não mais caro.

## Como está organizado

```
src/schema.ts    O documento de blocos. É o contrato entre editor e compilador.
src/css.ts       Vocabulário fechado de estilo -> CSS escopado e deduplicado por hash.
src/html.ts      Emissão e escape de HTML.
src/blocks.ts    Um compilador por bloco. 11 blocos.
src/compile.ts   A função pura Doc -> { html, css, js }.
src/audit.ts     Auditoria estática da árvore (o "page checkup" sem IA).
bin/build.ts     Compila um fixture e imprime o relatório acima.
bin/shopify-probe.ts  Sonda de permissões contra uma loja real (ver abaixo).
test/            18 testes que travam os invariantes da arquitetura.
```

## Invariantes travados por teste

Cada teste corresponde a uma promessa do `docs/ARQUITETURA.md`. Se um fica vermelho, uma promessa
quebrou:

- O compilador é **puro** — mesmo documento entra, bytes idênticos saem.
- **Zero JS** a menos que um bloco peça. O accordion é `<details>/<summary>` e não custa um byte.
- Link é `<a href>`, botão sem destino é `<button>`. Nunca uma `<div>` com handler de clique.
- Destinos de link perigosos (`javascript:`) são descartados, não emitidos.
- Texto do autor é escapado.
- Imagem sempre com `width`, `height` e `loading="lazy"` — salvo quando marcada como `eager`.
- Toda classe é prefixada, então o tema não colide com a gente nem a gente com ele.
- Breakpoints saem como `min-width`, mobile-first, com o base sempre antes das sobreposições.
- Bloco desconhecido **falha alto** em vez de publicar um buraco na página.

## `bin/shopify-probe.ts` — a sondagem que só você pode rodar

Responde a pergunta em aberto do Apêndice A.4 da pesquisa: a documentação da Shopify se contradiz
sobre se um app privado precisa de isenção para escrever arquivos de tema.

```sh
SHOP=sua-loja.myshopify.com ADMIN_TOKEN=shpat_... \
  node --experimental-strip-types bin/shopify-probe.ts
```

O token sai de **Configurações → Apps e canais de venda → Desenvolver apps**, com os scopes
`write_content`, `read_themes`, `write_themes`, `write_products`.

Ele testa `pageCreate`/`pageDelete` (a trilha do MVP) e `themeFilesUpsert`/`themeFilesDelete`
(a trilha de produto/coleção).

Regras de segurança que o script segue, porque roda numa loja de verdade:

- **Nunca escreve no tema publicado.** Se só existir o tema ao vivo, ele pula o teste e avisa.
- A página que cria é **rascunho**, nunca publicada.
- Apaga tudo que criou antes de sair.

## O que o protótipo deliberadamente **não** faz

Para ninguém confundir spike com produto:

- Não tem editor. A árvore vem de um arquivo JSON escrito à mão.
- Não fala com a Shopify no `build.ts` — só o `shopify-probe.ts` faz rede.
- Não tem persistência, versionamento, autenticação nem multi-página.
- Tem 11 blocos, não os 56 itens P0 da pesquisa.
- O `repeater` liga dados por substituição de `{{campo}}`, que é ingênuo de propósito — o produto
  vai precisar de um modelo de binding de verdade.
