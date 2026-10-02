# Teste A | B

Uma URL de produto no anúncio que divide os visitantes entre várias versões da página, pela
porcentagem que você escolher, e um relatório de cliques e pedidos de cada versão, dia a dia.

Exemplo: o anúncio aponta para `ofertascolombianas.store/products/piadebanho`. Essa URL é a
**versão A** e também quem distribui: uma parte dos visitantes fica nela e vê a página que ela
já tinha, **sem redirecionamento nenhum**; o resto vai para a **B** (`/products/piadebanho1`),
a **C** (`/products/piadebanho2`) e assim por diante. Depois de mil cliques, o relatório mostra
quantos pedidos cada versão fez, a conversão de cada uma e quanto ainda falta para ter
resposta.

## Como usar

1. **Prepare as versões na Shopify.** A versão A é o próprio produto da URL do anúncio
   (`piadebanho`), com a página que ele já tem. As outras (B, C…) são outros produtos da loja:
   duplique o produto e ligue cada cópia a uma página do D&VFly ou a um modelo do tema.
   Todos precisam estar **ativos**. Cada produto entra em **um teste no ar por vez**: o app
   recusa colocar no ar um teste cuja entrada ou versão já está em outro teste rodando, e diz
   qual.
2. **D&VFly → Teste A | B → Criar teste.** Escolha o produto de entrada: ele entra sozinho
   como versão A (caixa "A própria URL de entrada é a versão A"). Adicione as outras versões
   (até 6 no total) e as porcentagens (ou **Dividir igualmente**). A soma tem que dar 100%.
   Desmarcando a caixa, a URL só distribui e o conteúdo dela não aparece para ninguém.
3. **Colocar no ar.** A partir daí a URL de entrada sorteia: quem cai na A fica nela, o resto é
   levado para a sua versão. **Copiar URL** dá o endereço exato para o anúncio.
4. **Meta de cliques (opcional).** Marque **Parar sozinho numa meta de cliques** e escolha o
   número: quando o teste somar esses cliques (todas as versões juntas, desde o início), ele é
   **pausado sozinho**, igual ao botão Pausar — a URL de entrada volta à página dela, as versões
   voltam ao canonical delas, e todos os números ficam guardados. A tela do teste diz quando
   parou; a lista mostra "Parou na meta de N cliques". Para continuar, aumente a meta (ou
   desligue) e clique em **Voltar a rodar**; com a meta já passada, o botão fica cinza com o
   motivo. A conferência acontece a cada lote de cliques gravado (a cada ~2 s): podem entrar
   alguns cliques além da meta nesse meio-tempo.
5. **Programar o início (opcional).** Marque **Programar o início**, escolha dia e hora (no
   horário da loja) e clique em **Programar início**. Até lá nada muda na loja; no horário o
   teste entra no ar sozinho, com as mesmas conferências do "Colocar no ar" (produtos ativos,
   produto em outro teste, meta de cliques). Se alguma impedir, ele não entra no ar e a tela
   diz por quê. A tela e a lista mostram "Programado"; **Cancelar programação** desfaz. O
   servidor confere a cada 30 s (na Vercel, que dorme entre visitas, o início acontece na
   primeira abertura do app depois do horário).
6. **Resultados.** Hoje, Ontem, 7 dias, 30 dias, Desde o início, ou qualquer período no
   calendário. Os dias são os do fuso da loja.

Para ver a página da versão A sem sorteio e sem contar clique: **Ver a versão A** (abre a URL
com `?dvf_ab=off`, ou com `?view=<modelo dela>` quando a A abre por redirecionamento).

## Situação na loja

Com o teste no ar, o topo da tela confere a loja cada vez que a tela abre e diz, linha a linha,
o que está certo e o que precisa de atenção, com o caminho do conserto:

| Linha | O que observa | O que fazer |
|---|---|---|
| Página que não abre | Produto da entrada ou de uma versão apagado, em Rascunho ou Arquivado (a Shopify devolve página de erro). | Ativar o produto, ou pôr a versão em 0%. **Colocar no ar / Aplicar mudanças recusa** enquanto uma versão que recebe gente não abriria — antes de gravar qualquer coisa. |
| Sem endereço na loja | A Shopify não deu o endereço do produto na loja. Isso acontece fora do canal Loja virtual **e também em toda loja com senha** (equipe da Shopify, community.shopify.dev, tópico 32775). | Se a loja não tem senha, publicar o produto no canal Loja virtual. É aviso, não trava. |
| Endereço mudou | Alguém renomeou o produto no admin depois que o teste foi gravado. | **Regravar na loja**. |
| Último clique | Quando chegou o último clique. Mais de 1 hora sem clique fica em destaque. | Abrir a URL de entrada num celular: se troca de página e o número não sobe, a contagem não chega ao app. |
| Meta | Com meta de cliques ligada: quantos já foram e quantos faltam. | — |
| Contagem em outro endereço | O teste foi gravado por outro endereço do app (um túnel antigo, por exemplo) e manda os cliques para lá. | **Regravar na loja**. |
| Última gravação falhou | "Aplicar mudanças" ou "Regravar" não chegou à loja (a Shopify recusou ou caiu no meio). A loja segue com a gravação anterior (as porcentagens de antes), e a linha diz o erro. | **Regravar na loja** tenta de novo. |
| Cópia da A desatualizada | O modelo ou o layout da A foi mudado (no editor de tema) depois que o teste copiou. Quem cai na A ainda vê a cópia antiga. | **Regravar na loja** refaz a cópia. |
| Versão A | Se abre direto na URL de entrada ou por redirecionamento (e por quê). | — |
| Canonical | Quais versões apontam para a entrada. Versão no layout do tema não vira aviso: fica com o canonical dela por desenho (abaixo). | Só aparece aviso quando há o que consertar. |
| 30 dias no ar | O Google pede que teste não fique rodando indefinidamente. Aparece também na lista de testes. | Decidir e usar **Encerrar com a vencedora**. |

**Regravar na loja** grava o teste de novo com os endereços e a contagem de agora (as
porcentagens não mudam). Com mudanças na tela ainda não aplicadas, ele fica cinza com o motivo
escrito ao lado: o caminho é **Aplicar mudanças na loja**, que grava as duas coisas.

## Quanto falta para ter resposta

Abaixo do veredito, uma estimativa: quantos cliques a mais (somando todas as versões) até dar
para dizer, com 95% de confiança, se a líder é mesmo melhor que a versão mais próxima — e em
quantos dias, no ritmo dos últimos 7 dias.

- Conta o **teste inteiro**, desde o início (a caixa diz a data), não o período escolhido no
  calendário — por isso pode discordar do veredito do período na tela.
- O ritmo é o dos últimos 7 dias **com o teste no ar**: horas pausadas não puxam a média para
  baixo. Teste pausado não tem ritmo, e a estimativa diz só quantos cliques faltam.
- Os cliques futuros são divididos pelas porcentagens de agora: uma versão em 0% não recebe mais
  ninguém, e a caixa diz que ela não vai alcançar a resposta.
- **"Pequena demais para aparecer"**: a diferença entre as duas é menor que 20% da conversão da
  líder e levaria mais de 60 dias. As versões vendem quase igual: vale encerrar com qualquer uma
  e testar algo mais diferente (oferta, preço, título).
- **"O que falta é tráfego"**: a diferença é grande, mas o teste recebe poucos cliques. Mais
  verba no anúncio, ou menos versões, encurta a espera.
- Antes do 3º pedido do teste não há estimativa (seria chute). Enquanto não há duas versões
  com cliques, a caixa diz isso (aí o que falta é clique contado, não venda). Com mais pedidos que cliques numa
  versão (pedidos por outro caminho, como um anúncio para a página direta), não há conta que
  valha, e a caixa diz por quê.
- É uma estimativa feita com as conversões medidas até agora, que mudam conforme os pedidos
  chegam. Conta: duas proporções, 95% de confiança e 80% de chance de enxergar a diferença se
  ela for real, com o mesmo mínimo de pedidos que o veredito exige.

## Encerrar com a vencedora

Quando uma versão ganhou, o cartão **Encerrar com a vencedora** (na tela do teste) para o teste
e deixa a vencedora na URL do anúncio:

- **Vencedora é outro produto** (ex.: C = `/products/cinta-led-2`): os dois produtos **trocam de
  endereço**. A C passa a responder em `/products/cinta-led`, a URL do anúncio, e o produto de
  entrada vai para `/products/cinta-led-2`. Cada produto leva junto a página, o preço, as
  variações, as avaliações e os pedidos dele: o que muda é qual produto atende em qual endereço.
  A tela mostra a troca antes do clique e pede confirmação.
- **Vencedora é a própria entrada (A)**: o teste só para, e a URL volta a mostrar a página dela.

**Desfazer troca** devolve cada produto ao endereço de antes e deixa o teste pausado.

Cuidados:
- Anúncio ou link que apontava para o endereço antigo da vencedora (`/products/cinta-led-2`)
  passa a abrir o produto de entrada.
- A Shopify não cria redirecionamento nessa troca, de propósito: o endereço antigo de cada um
  passa a ser do outro.
- Se alguém mudou o endereço de um dos dois produtos no admin da Shopify, a troca é recusada
  antes de qualquer mudança, e o teste continua como estava.
- Se a troca falhar no meio, o app desfaz o que já fez. Se nem desfazer funcionar, a mensagem
  diz quais endereços conferir no admin.

## O que cada número quer dizer

| Coluna | De onde vem |
|---|---|
| Cliques | Cada **chegada de fora** pela URL de entrada (anúncio, link, busca). Recarregar a página, o botão voltar e a navegação dentro da loja não contam de novo: se contassem, a A (que é a página onde se recarrega) ganharia cliques a mais e pareceria converter menos. |
| Visitantes únicos | Navegadores que caíram na versão pela primeira vez. A mesma pessoa volta para a mesma versão. |
| Parte real | Que fração dos cliques foi de fato para a versão (confere com o configurado). |
| Pedidos | Pedidos que contêm o produto da versão, não cancelados, não de teste, feitos **com o teste no ar** (antes do início e durante pausas não contam: nessas horas a URL de entrada mostrava só a página dela). |
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
- **Robôs e o PageSpeed passam pelo mesmo sorteio que qualquer pessoa** e só ficam fora da contagem.
  O sorteio usa só a porcentagem: nunca user agent, IP, país ou plataforma. Mostrar uma coisa
  para o revisor e outra para o comprador seria cloaking, e não é isso que esta função faz.
- **Navegador com JavaScript desligado** fica na versão A quando a entrada é a A; senão vai
  para a primeira versão com porcentagem acima de 0 (sem sorteio e sem contagem).
- **Canonical só nos layouts do D&VFly.** O D&VFly não edita os arquivos do tema. Uma versão
  cuja página usa o layout do tema (modelo do tema, ou página do D&VFly com "Só a página, sem o
  tema" desligado) continua com o canonical apontando para ela mesma; a Situação na loja não
  acusa isso (não é defeito), só lista as versões que apontam para a entrada.
- **Bloqueador de anúncios** pode impedir a contagem do clique (o redirecionamento acontece
  igual). O número de cliques é um piso, não um teto.
- **Atualizar o servidor na VM Windows perde até 2 s de cliques.** O Windows para o app sem
  aviso (não existe o "desligue com calma" do Linux), e os cliques que estavam esperando o
  próximo lote vão embora. No Docker e na Vercel não perde nada. Acontece só na hora de
  publicar uma versão nova, e é mais um motivo para o número de cliques ser um piso.

## Antes do primeiro teste (uma vez por app)

O relatório lê pedidos, e isso pede duas coisas da Shopify, em **cada** app (o principal e os
das outras lojas — `shopify.app.toml`, `shopify.app.colombia.toml`, `shopify.app.snevy.toml`).
Cada app mora numa organização da Shopify; o `PUBLICAR-APPS-SHOPIFY.cmd` pede o login da conta
certa quando a logada não é membro dela ("You are not a member of the requested organization").

1. **O escopo `read_orders`** — já está nos três arquivos. Publicar: duplo clique em
   **`PUBLICAR-APPS-SHOPIFY.cmd`** (roda o `shopify app deploy` dos três apps em sequência e
   mostra o resumo de cada um), e conferir no Dev Dashboard que a versão nova ficou ativa.
2. **Aprovar a permissão nova em cada loja** — abrir o D&VFly no admin da loja e aprovar quando
   a Shopify pedir; ou, no Dev Dashboard do app, **Instalar app** e confirmar.

**Não há formulário de "dados protegidos de clientes" a preencher.** Ele existe para app
público; app custom instalado na loja da própria organização já tem esse acesso, e por isso o
painel novo da Shopify nem mostra a opção (confirmado pela equipe da Shopify em 02/10:
community.shopify.dev, tópico 35445).

Sem os dois passos, o teste roda e conta cliques normalmente, e o relatório diz, no lugar dos
pedidos, o que falta.

## Como funciona por dentro

- **Versão A = a própria URL, sem redirecionamento.** O produto de entrada passa a usar um
  modelo do D&VFly (`product.dvfly-ab-<teste>`) que é **uma cópia do modelo da A** (o que ela
  tinha antes do teste, ou o padrão do tema), ligado a **uma cópia do layout da A** com um
  script de ~1 KB no `<head>`: logo depois do `<meta charset>` e antes do `content_for_header`
  da Shopify. A Shopify manda tudo o que vem antes desse marcador primeiro, enquanto ainda
  monta o resto da página. O script sorteia (ou relembra) a versão e avisa o app
  (`POST /ab/hit`, via `sendBeacon`):
  - **sorteou a A**: não faz mais nada. A página já é a da A, sem segundo carregamento;
  - **sorteou outra**: esconde a página (para a A não piscar na tela de quem vai para a B) e
    troca a URL com `location.replace`, mantendo a query (`utm_*`, `fbclid`) e o prefixo de
    idioma/mercado (`/es-co/…`). O botão "voltar" não volta para a entrada. Se a página nova
    não chegar em 3 s, a da entrada aparece de novo.
- **Quando a A não comporta o script**, ela abre pelo caminho antigo: a entrada vira uma
  página só de redirecionar, e a A é alcançada pelo `?view=<modelo dela>` da Shopify. Isso
  acontece com modelo de produto do tipo antigo (`.liquid`), modelo sem layout, layout sem
  `content_for_header`, ou layout que decide o que mostrar pelo **nome do modelo**
  (`template.suffix`): na cópia o nome é outro, e a A apareceria diferente. O motivo fica
  gravado e aparece na mensagem e na linha "Versão A". Se a A usava o modelo padrão do tema,
  que não tem nome para pôr no `view`, o app grava uma cópia dele (`product.dvfly-ab-<teste>-a`).
- **Modelo da A apagado do tema**: a Shopify mostra o produto com o modelo padrão, e a cópia
  também passa a ser do padrão (a mensagem diz). Mesmo se algo escapar disso, o script nunca
  redireciona a A para ela mesma.
- Cada cópia começa com um comentário dizendo de onde veio, para quem abrir o editor de código
  do tema.
- **As cópias são refeitas** sempre que o teste é gravado: ao colocar no ar, aplicar mudanças,
  regravar, **e ao publicar uma página do D&VFly no produto de entrada** com o teste no ar. Essa
  publicação não tira o produto do teste: a página passa a ser o que a versão A mostra (e o que
  volta ao pausar), e o aviso da publicação diz isso. Mudança feita **no editor de tema** no
  modelo ou no layout da A só chega à cópia em **Regravar na loja**; a Situação na loja avisa
  quando um dos dois mudou.
- **Canonical das versões.** Enquanto o teste roda, cada versão (menos a A) leva o metafield
  `dvfly.ab_entry` com o handle da entrada. Os layouts do D&VFly escrevem o canonical assim:
  com o metafield, apontam para `/products/<entrada>` (domínio e prefixo de mercado tirados do
  próprio canonical da Shopify); sem ele, é o canonical de sempre. Layouts do D&VFly gravados
  antes disso são corrigidos no lugar quando o teste entra no ar. Pausar, encerrar, excluir ou
  tirar a versão do teste remove o metafield — só dos produtos deste teste (o de outro teste no
  ar fica como está). Se a Shopify recusar a remoção, **Excluir** não exclui nada e pede um
  segundo clique, para nenhuma versão ficar com o canonical apontando para um teste que não
  existe mais. É a regra do Google para teste A/B ("Minimize A/B
  testing impact in Google Search": canonical das URLs alternativas para a original, e não
  `noindex`).
- **Contagem em lote.** Os cliques são somados na memória e gravados a cada 2 s, uma escrita
  por versão e hora. O relatório e a lista gravam o que está pendente antes de ler. Ao desligar
  o servidor (nova versão subindo), o pendente é gravado antes de sair. Medido no sandbox
  (4 CPUs, Postgres): de ~1.000 para ~1.800 cliques por segundo, com 24.300 de 24.300 gravados.
  Na Vercel (serverless) cada clique é gravado na hora, porque a instância pode congelar antes
  do lote (`DVFLY_AB_GRAVAR_NA_HORA=on` faz o mesmo em qualquer servidor).
- **Pausar** devolve ao produto de entrada o modelo que ele tinha antes (se ninguém o trocou
  nesse meio-tempo) e às versões o canonical delas. **Excluir** faz o mesmo e tira os arquivos
  do teste do tema.
- Os pedidos vêm de uma cópia leve na base do app (id, datas, total e produtos — nenhum dado de
  cliente), sincronizada por `updated_at` a cada abertura do relatório, porque a busca de
  pedidos da Shopify não filtra por produto.

Código: `packages/shopify/src/split.ts` (script, arquivos do tema, canonical das versões),
`packages/shopify/src/orders.ts` (pedidos), `app/app/lib/ab.ts` (dias, pesos, veredito, estimativa),
`app/app/lib/ab.server.ts` (no ar, pausa, contagem, relatório, situação na loja), telas em
`app/app/routes/app.testes.*`, contagem em `app/app/routes/ab.hit.tsx`.
