# Teste A | B

Uma URL de produto no anúncio que divide os visitantes entre várias versões da página, pela
porcentagem que você escolher, e um relatório de cliques e pedidos de cada versão, dia a dia.

Exemplo: o anúncio aponta para `ofertascolombianas.store/products/piadebanho`. Essa URL é a
**versão A** e também quem distribui: uma parte dos visitantes fica nela e vê a página que ela
já tinha; o resto vai para a **B** (`/products/piadebanho1`), a **C** (`/products/piadebanho2`)
e assim por diante. Depois de mil cliques, o relatório mostra quantos pedidos cada versão fez e
a conversão de cada uma.

## Como usar

1. **Prepare as versões na Shopify.** A versão A é o próprio produto da URL do anúncio
   (`piadebanho`), com a página que ele já tem. As outras (B, C…) são outros produtos da loja:
   duplique o produto e ligue cada cópia a uma página do D&VFly ou a um modelo do tema.
   Todos precisam estar **ativos**.
2. **D&VFly → Teste A | B → Criar teste.** Escolha o produto de entrada: ele entra sozinho
   como versão A (caixa "A própria URL de entrada é a versão A"). Adicione as outras versões
   (até 6 no total) e as porcentagens (ou **Dividir igualmente**). A soma tem que dar 100%.
   Desmarcando a caixa, a URL só distribui e o conteúdo dela não aparece para ninguém.
3. **Colocar no ar.** A partir daí a URL de entrada redireciona. **Copiar URL** dá o endereço
   exato para o anúncio.
4. **Resultados.** Hoje, Ontem, 7 dias, 30 dias, Desde o início, ou qualquer período no
   calendário. Os dias são os do fuso da loja.

Para ver a página da versão A sem sorteio e sem contar clique: **Ver a versão A** (abre a URL
com `?view=<modelo dela>`).

## O que cada número quer dizer

| Coluna | De onde vem |
|---|---|
| Cliques | Cada visita pela URL de entrada, contada no momento do redirecionamento. |
| Visitantes únicos | Navegadores que caíram na versão pela primeira vez. A mesma pessoa volta para a mesma versão. |
| Parte real | Que fração dos cliques foi de fato para a versão (confere com o configurado). |
| Pedidos | Pedidos que contêm o produto da versão, não cancelados, não de teste, feitos depois do início do teste. |
| Conversão | Pedidos ÷ cliques. |
| Faturamento | Soma do total desses pedidos. |
| Cancelados | Pedidos cancelados com o produto da versão (fora da coluna Pedidos). |

**Vencedor.** O relatório só diz "vencedora" quando a diferença passa de 95% de confiança E há
pedidos suficientes para o cálculo valer (uns 5 pedidos esperados por versão). Antes disso ele
diz quem está na frente e que a diferença ainda cabe no acaso. Com poucos pedidos, uma versão
"ganha" por sorte — a mesma lição das notas do PageSpeed que oscilavam sozinhas.

## Limites, ditos com a origem

- **Pedidos são por produto, não por visita.** Um pedido de `piadebanho2` conta para a versão B
  mesmo que a pessoa tenha chegado por outro anúncio ou pelo endereço direto. Por isso cada
  versão deve ser um produto exclusivo do teste. A vantagem: funciona com formulário COD (que
  cria o pedido sem passar pelo carrinho), onde um rastreio no checkout não pegaria nada.
- **60 dias de pedidos** (limite da Shopify para o escopo `read_orders`).
- **Robôs e o PageSpeed são redirecionados como qualquer pessoa** e só ficam fora da contagem.
  O sorteio usa só a porcentagem: nunca user agent, IP, país ou plataforma. Mostrar uma coisa
  para o revisor e outra para o comprador seria cloaking, e não é isso que esta função faz.
- **Navegador com JavaScript desligado** vai para a primeira versão com porcentagem acima de 0
  (sem sorteio e sem contagem).
- **Bloqueador de anúncios** pode impedir a contagem do clique (o redirecionamento acontece
  igual). O número de cliques é um piso, não um teto.

## Antes do primeiro teste (uma vez por app)

O relatório lê pedidos, e isso pede duas coisas da Shopify, em **cada** app (o principal e os
das outras lojas — `shopify.app.toml`, `shopify.app.colombia.toml`, `shopify.app.snevy.toml`):

1. **O escopo `read_orders`** — já está nos três arquivos. Publicar:
   `npx shopify app deploy --config <nome>` e **lançar** (Release) a versão no Dev Dashboard.
   Na próxima abertura do app, o admin da loja pede a aprovação da permissão nova.
2. **Acesso a dados protegidos de clientes** — Dev Dashboard → o app → **API access** →
   **Protected customer data access** → preencher (nível 1 basta: o relatório não lê nome,
   e-mail, telefone nem endereço).

Sem as duas, o teste roda e conta cliques normalmente, e o relatório diz, no lugar dos pedidos,
exatamente qual das duas falta.

## Como funciona por dentro

- **Versão A = a própria URL.** O produto de entrada passa a apontar para o teste, então a
  página dele é alcançada pelo recurso `?view=` da Shopify, que escolhe outro modelo do mesmo
  produto: quem cai na A fica em `/products/piadebanho?view=<modelo que ela tinha>` — mesma URL,
  conteúdo dela, e sem laço (com `view`, a Shopify mostra aquele modelo, não o do teste). Se a
  entrada usava o modelo padrão do tema (que não tem nome para pôr no `view`), o app grava uma
  cópia dele (`product.dvfly-ab-<teste>-a`), refeita a cada vez que o teste entra no ar.
- **Publicar uma página do D&VFly no produto de entrada** com o teste no ar não tira o produto
  do teste: o modelo da página é gravado e passa a ser o que a versão A mostra (e o que volta
  ao pausar). O aviso da publicação diz isso.
- O produto de entrada passa a usar um modelo do D&VFly (`product.dvfly-ab-<teste>`), ligado a
  um layout próprio cujo `<head>` tem um script de ~1 KB **antes** do `content_for_header` da
  Shopify. Ele roda nos primeiros bytes da resposta, sorteia (ou relembra) a versão, avisa o
  app (`POST /ab/hit`, via `sendBeacon`) e troca a URL com `location.replace`, mantendo a query
  (`utm_*`, `fbclid`) e o prefixo de idioma/mercado (`/es-co/…`). O visitante nunca vê a
  entrada, e o botão "voltar" não volta para ela.
- **Pausar** devolve ao produto de entrada o modelo que ele tinha antes (se ninguém o trocou
  nesse meio-tempo). **Excluir** faz o mesmo e tira os três arquivos do tema.
- Os pedidos vêm de uma cópia leve na base do app (id, datas, total e produtos — nenhum dado de
  cliente), sincronizada por `updated_at` a cada abertura do relatório, porque a busca de
  pedidos da Shopify não filtra por produto.

Código: `packages/shopify/src/split.ts` (script e arquivos do tema),
`packages/shopify/src/orders.ts` (pedidos), `app/app/lib/ab.ts` (dias, pesos, veredito),
`app/app/lib/ab.server.ts` (no ar, pausa, contagem, relatório), telas em
`app/app/routes/app.testes.*`, contagem em `app/app/routes/ab.hit.tsx`.
