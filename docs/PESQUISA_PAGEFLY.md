# Pesquisa de mercado: PageFly — base funcional para o D&VFly

> **Documento de pesquisa — Fase 1 do projeto D&VFly.**
> Objetivo: mapear *o que* um page builder maduro para Shopify precisa fazer, usando o
> PageFly como referência de mercado, para definir o escopo funcional do D&VFly.

---

## 0. Metodologia, fontes e limitações

### 0.1 Como esta pesquisa foi feita

A pesquisa teve **duas passadas**:

1. **Passada 1 (ambiente anterior)** — levantamento por busca web sobre fontes públicas. O ambiente
   tinha egresso bloqueado para os domínios do concorrente, então o conteúdo veio de sínteses de
   busca, não de leitura das páginas. Tudo que ficou incerto foi marcado com ⚠️.
2. **Passada 2 (esta revisão)** — **leitura direta das fontes**. Foram baixadas e lidas as 241
   páginas da central de ajuda do PageFly (via os arquivos Markdown que o próprio GitBook expõe,
   mais o índice `llms.txt`), a página do app na Shopify App Store com o filtro de reviews de
   1, 2 e 3 estrelas, a página de preços, as páginas de produto e a documentação oficial da
   Shopify em `shopify.dev`.

Este documento é o resultado da passada 2 aplicada sobre a estrutura da passada 1.

### 0.2 O que foi verificado e o que continua incerto

**Verificado por leitura direta nesta passada:**

| Item | Fonte lida | Resultado |
|---|---|---|
| Catálogo de elementos | Árvore completa de `help.pagefly.io` (241 páginas) | Lista real reconstruída por família — ver 1.3 |
| Tipos de página | `page-settings`, `what-type-of-pages-that-pagefly-support` | 6 tipos confirmados; semântica de produto/coleção corrigida |
| Contagem de integrações | Página "What apps does PageFly integrate with" | **210 apps** listados em 20 categorias |
| Preços e planos | `pagefly.io/pages/pricing` + card da App Store | 5 planos self-serve + 3 tiers enterprise — ver 1.14 |
| Créditos de IA do plano free | Página de preços | **10 créditos/mês** (confirmado) |
| Avaliações e distribuição | Shopify App Store | **4,9 / 5 com 5.899 avaliações**; 95% 5★, 3% 4★, 27 de 3★, 21 de 2★, 70 de 1★ |
| Histórico de versões | `how-to-use-autosave-and-version-history` | **50 salvamentos manuais**; autosaves não entram no histórico |
| Imagem de compartilhamento social | `page-settings` | **É campo nativo** (só para página Regular) — deixa de ser incerteza |
| Comportamento na desinstalação | `what-happens-if-i-uninstall-pagefly` | Exclusão **imediata e irreversível**, sem janela de recuperação |
| Limites técnicos | Páginas de mensagens de erro | Limite de 256 KB por página (Shopify), 20 MB por imagem, 1.000 templates JSON |
| Mecânica de publicação | `json-template-with-pagefly` | Publica como **template JSON**; acima de 1.000, cai para template Liquid |
| Reclamações reais | Reviews de 1★, 2★ e 3★ da App Store (85 textos) | Padrões reescritos na seção 3 |
| APIs da Shopify | `shopify.dev` (Admin GraphQL, temas, extensões, scopes) | Novo Apêndice A |

**Continua incerto — e por quê:**

- **Datas das versões anteriores à 4.20.0.** O PageFly **removeu do ar** as notas de release
  antigas: de todas as URLs no padrão `pagefly.io/blogs/shopify/pagefly-X-Y-0`, apenas a da
  **4.20.0** ainda responde (as da série 3.x retornam 404; as demais redirecionam para o índice
  do blog). O Internet Archive está bloqueado neste ambiente, então as datas herdadas da passada 1
  não puderam ser reconfirmadas na fonte primária. Seguem marcadas com ⚠️ na seção 2.
- **Reviews em G2 e Capterra.** Ambos respondem 403/404 a acesso automatizado (proteção
  anti-bot). Só o Trustpilot foi lido.
- **Contagem exata de templates.** Todas as fontes do próprio PageFly dizem "320+"; não há
  listagem pública que permita contar. Fica como ordem de grandeza declarada pelo fornecedor.
- **Detalhes internos de renderização.** Como o PageFly compila a árvore de blocos para HTML,
  qual o peso real do bundle, se há SSR — nada disso é documentado publicamente. Só se saberia
  instalando o app e inspecionando o output.
- **Se o `write_themes` exige isenção para app privado.** Ver Apêndice A.4 — a documentação da
  Shopify é ambígua nesse ponto específico.

### 0.3 Regras de propriedade intelectual aplicadas a este documento

Este documento descreve **funcionalidades e conceitos** observados publicamente, redigidos com
palavras próprias. Ele **não contém e não deve receber**: código, CSS, HTML, ícones, imagens,
textos de interface, nomes de menus copiados literalmente, ou templates do PageFly.

Regras que valem para todo o projeto D&VFly:

| Permitido | Proibido |
|---|---|
| Replicar **conceitos** (ex.: "editor com painel de blocos") | Copiar código, CSS, JS, ícones ou imagens |
| Implementar **funcionalidades equivalentes** escritas do zero | Copiar templates, layouts ou textos de UI |
| Citar o PageFly **neste documento de pesquisa interno** | Usar nome, logo ou marca "PageFly" dentro do app |
| Criar identidade visual e nomenclatura próprias ("D&VFly") | Imitar identidade visual, tipografia ou paleta do concorrente |

Nenhum nome, marca ou asset do PageFly entra no produto. Este arquivo é documentação interna
de pesquisa competitiva — prática normal e legítima.

---

## 1. Inventário de recursos

> Todo o conteúdo desta seção foi reconstruído a partir da **leitura direta** das 241 páginas da
> central de ajuda do PageFly, da página do app na Shopify App Store e das páginas de produto.

### 1.1 Tipos de página suportados

São **6 tipos de página**, cada um com regra de publicação diferente:

| Tipo | O que é | Como se conecta ao Shopify |
|---|---|---|
| **Regular / Landing** | Página avulsa: Sobre, Contato, FAQ, landing de campanha | Cria uma *Page* no Shopify com URL próprio (`/pages/handle`) |
| **Home** | Substitui a home da loja enquanto estiver publicada | Vira o template da home; ao despublicar, a home do tema volta |
| **Produto** | Layout de página de produto | Template alternativo de produto, atribuído a 1..N produtos |
| **Coleção** | Layout de página de coleção | Template alternativo de coleção, atribuído a 1..N coleções |
| **Blog post** | Layout de artigo | Template alternativo de artigo |
| **Password** | Página de "loja em construção" / captura de e-mail | Template de password page do tema |

**Correção em relação à passada 1:** a documentação descreve páginas de produto e coleção em
**dois modos de uso**, não um só — ou o conteúdo do builder é **anexado** ao conteúdo nativo do
Shopify (o padrão descrito: "adiciona mais conteúdo abaixo do conteúdo do Shopify"), ou
**substitui** por completo a página padrão. Quem decide é a composição do template JSON: as
seções nativas do tema podem ser mostradas, escondidas ou movidas acima/abaixo do bloco do
builder. Isso muda o desenho: não é "substituir a página", é "compor com o tema".

**Page Assignment.** Páginas de produto e coleção funcionam como **templates**. A atribuição tem
dois modos:

- **Todos os produtos / todas as coleções** — o template vale para a loja inteira.
- **Produtos / coleções específicos** — seleção múltipla manual.

E os elementos de comércio operam em dois modos de origem de dados:

- **Auto** — o elemento puxa os dados do produto/coleção do contexto da página.
- **Custom** — o elemento é fixado em um produto específico (útil para cross-sell numa landing).

Esse par Auto/Custom é uma abstração boa e vale replicar como conceito no D&VFly.

**Theme's Sections.** Em cada página dá para mostrar/esconder o header e o footer do tema e
escolher quais seções do tema aparecem. Em páginas de blog post, o controle é mais fino
(info do post, tags, imagem destacada, formulário de comentários).

### 1.2 Estrutura e sistema de layout

Aqui está a **descoberta arquitetural mais importante da seção 1**: o PageFly tem **dois motores
de layout coexistindo**, e o novo abandonou o modelo de linha/coluna.

| Motor | Estrutura | Disponibilidade |
|---|---|---|
| **Editor Legacy** | Seção → Linha → Coluna → Elemento | Modelo histórico |
| **Editor "Gen 2"** (a partir da versão 4.23.0) | Flex Section → Flex Block → Elemento, sem linha/coluna; elementos vão direto na página | Exclusivo dos planos pagos por slot (PAYG) |

O Gen 2 troca o grid de colunas por um modelo **flexbox explícito**: cada container tem direção
(horizontal/vertical), gap horizontal e vertical, `align-items`, `justify-content` e inversão de
ordem por breakpoint. Largura e altura passam a ter três modos — *preencher o container*,
*ajustar ao conteúdo* e *valor fixo* — com min/max. É, em essência, o modelo do Figma trazido
para dentro do builder.

> **Leitura para o D&VFly:** não nasça com linha/coluna. O concorrente líder gastou uma versão
> maior para sair desse modelo, e o preço foi alto: migrar páginas antigas entre os dois motores
> é uma das reclamações recorrentes (ver 3.2). Nascer flex é de graça; migrar depois, não.

Demais elementos de estrutura confirmados:

- **Page Outline / Page Content** — painel de árvore navegável, com mover/excluir/duplicar.
- **Breadcrumb de seleção** no topo do canvas, mostrando o caminho do elemento na árvore.
- Seções full-width vs. contidas (largura máxima de container).
- Seções fixas (*sticky*).
- Drag & drop com reordenação, duplicar, excluir, **copiar/colar estilos** (só entre elementos do
  mesmo tipo) e salvar seção para reúso.

### 1.3 Biblioteca de elementos/blocos — catálogo real

Esta é a lista **completa** dos elementos que têm página própria na documentação, por família.
A passada 1 marcava esta lista como possivelmente incompleta; agora ela é a árvore real.

#### a) Containers (6)
Layout · Slideshow · Popup · Tabs · Accordion · **Content List**

> O **Content List** é o elemento mais inteligente do conjunto: um repetidor genérico com número
> ilimitado de itens, layout em grade ou carrossel, e **estilo sincronizado** — você formata um
> item e todos seguem, mas o conteúdo de cada um é independente. Um primitivo que gera dezenas de
> blocos de UI (depoimentos, benefícios, comparativos, logos). É o conceito de maior retorno
> sobre esforço do catálogo inteiro.

#### b) Básicos (7)
Heading · Paragraph · Button · List · Icon · Divider · **HTML/Liquid**

> Note o que **não** existe como elemento próprio: não há "Spacer" nem "Rich text" separados —
> espaçamento é propriedade de estilo, e o texto rico está no Paragraph. Simplificação que vale
> copiar.

#### c) Mídia (6)
Image · **Image Comparison** (comparador antes/depois com divisória arrastável) ·
YouTube · Vimeo · HTML5 Video · SoundCloud

> Correção da passada 1: **não existe elemento "Image Gallery"** — galeria se monta com Content
> List ou Slideshow. E o Image Comparison, que não estava mapeado, é um elemento de conversão
> típico de nicho (antes/depois) com custo de implementação baixo.

#### d) Social (4)
Instagram feed · Facebook like & share · Facebook feed · Twitter/X feed

#### e) Avançados (6)
QR code · Table · Countdown · Google Map · Progress · Mailchimp form

#### f) Elementos Shopify (comércio) — 28 elementos em 5 grupos

| Grupo | Elementos |
|---|---|
| **Custom Content** (1) | App blocks — insere blocos de apps de terceiros que suportam app block do OS 2.0; só em temas OS 2.0 e **um por página** |
| **Produto** (14) | Product list · Product details · Product media · Product title · **Product vendor** · Product price · Product description · Product variant · Product quantity · Add to cart · Product view details · Product metafield · **Dynamic checkout button** · **Stock indicator** · **Sticky bar** · Product variant metafield |
| **Coleção** (6) | Collection title · Collection image · Collection list · Collection view details · Collection details · Collection description |
| **Formulário** (7) | Customer form + field + button · Contact form + field + button · **Search form** |
| **Blog** (6) | Blog post list · Blog post details · Blog post image · Blog post title · Blog post content · Blog post meta |

Elementos que a passada 1 não tinha mapeado e que merecem atenção: **Dynamic checkout button**
(botão de pagamento expresso — Shop Pay, PayPal, Apple Pay), **Stock indicator** (escassez de
estoque), **Sticky bar** (barra fixa de compra que acompanha a rolagem) e **Search form**.

#### g) Universal Elements — a ideia mais elegante do catálogo

Não é um elemento; é uma **propriedade do modelo de dados**. Qualquer elemento compatível tem no
painel um seletor de "tipo" que o **converte** em outro: um Heading vira Product Title, um Product
Title vira Collection Title, e assim por diante — conteúdo estático vira conteúdo dinâmico com um
clique, preservando o que faz sentido preservar.

> **Para o D&VFly isto é uma decisão de modelagem, não uma feature.** Se um bloco for
> `{ tipo, fonte-de-dados, conteúdo, estilos }` em vez de trinta tipos rígidos, a conversão sai
> de graça e a biblioteca encolhe. Vale desenhar assim desde o início. (Requer o Gen 2 e plano
> pago no PageFly — para nós é só uma escolha de esquema.)

#### h) Elementos de terceiros
Aba dedicada que expõe os elementos injetados por apps integrados. Ver 1.12 para a contagem real.

**Campos de formulário suportados:** e-mail, texto de linha única, texto multilinha, escolha única
(radio), checkbox, dropdown, número, data, hora. O envio vai para o e-mail da loja configurado em
Settings → Store details, com mensagens de sucesso/erro e redirect pós-envio configuráveis.

### 1.4 Seções, seções salvas e templates

| Recurso | Descrição |
|---|---|
| **Premade sections** | Biblioteca de seções prontas, organizada em 15+ categorias (promoção, frete grátis, guia de presentes etc.), arrastáveis dentro da página |
| **Saved sections** | Seção salva e reusada em outras páginas, com **sincronização automática**: alterar o original altera todos os usos |
| **Seção no Theme Editor** | Seções publicadas aparecem no editor de tema do Shopify e podem ser inseridas em qualquer template OS 2.0 |
| **Templates de página** | "320+" templates e seções, filtráveis por tipo de página e por nicho/campanha — número declarado pelo fornecedor, sem listagem pública para conferir |
| **Export / import** | Páginas e seções exportam em formato proprietário `.pagefly` (zip quando em lote). **Imagens não são exportadas** e só importam em lojas que também tenham o app |

A ponte com o **Theme Editor do Shopify** continua sendo o recurso estrategicamente mais
importante desta subseção: permite usar o builder para *pedaços* de páginas nativas sem
substituir o template inteiro.

> O export `.pagefly` merece destaque negativo: é portabilidade **entre lojas que usam o mesmo
> app**, não portabilidade de verdade. Não sai HTML, não saem imagens. Ver 3.4.

### 1.5 Controles de estilo

No editor Gen 2 os parâmetros estão em 8 grupos: **Size, Layout, Overall, Spacing, Typography,
Background, Border, Effects e Advanced**.

| Categoria | Controles |
|---|---|
| **Size** | Largura e altura em três modos (preencher container / ajustar ao conteúdo / fixo), com min e max |
| **Layout** (containers) | Largura do conteúdo, direção, ordem invertida, gap horizontal e vertical, `align-items`, `justify-content` |
| **Spacing** | Margin e padding por lado, por breakpoint |
| **Typography** | 6 famílias predefinidas (editáveis nos estilos globais) + gerenciador de fontes; tamanho, alinhamento, estilo, e mais parâmetros no "More settings". Fontes vêm do tema Shopify, do Google Fonts ou de upload próprio |
| **Background** | Cor sólida, **gradiente com até 10 color stops** (linear/radial), imagem de fundo, overlay |
| **Border** | Estilo, largura, cor e raio |
| **Effects** | Opacidade e sombra (offset H/V, blur, cor) — **apenas box-shadow**, não há text-shadow |
| **Advanced** | CSS customizado **por elemento** |
| **Visibilidade** | Esconder/mostrar elemento por breakpoint (aba General) |
| **Global styles** | 6 esquemas de cor e 6 tipografias predefinidas, aplicáveis a Containers, Heading, Body text, Icon, Media, Button, Divider e Fields. Valores globais entram no editor como valores computados |

**Breakpoints reais** (do seletor de dispositivo do editor, com o tamanho de canvas
configurável dentro de cada faixa):

| Faixa | Largura |
|---|---|
| All devices (desktop) | 1200 px ou mais |
| Laptop | 1025–1199 px |
| Tablet | 768–1024 px |
| Mobile | 767 px ou menos |

**Correções:** não há `text-shadow`; a passada 1 citava "box-shadow e text-shadow". E o CSS
customizado existe em **dois níveis** — por elemento (grupo Advanced) e por página (editor de
código), o que é mais granular do que estava mapeado.

### 1.6 Interações e animações

- Animação de entrada e no hover (aba General de cada elemento).
- Parallax em imagens de fundo de seção.
- Popup/modal como elemento container.
- Sticky sections e **Sticky bar** de produto.
- Countdown.
- **Click Action** — ação de clique configurável por elemento: ir para um link, rolar até uma
  seção, abrir um popup, abrir e-mail ou telefone. É um recurso transversal (qualquer elemento
  vira gatilho) e não estava mapeado na passada 1.

> Comparativos independentes continuam apontando as animações como o ponto fraco frente a
> concorrentes. É brecha, não referência.

### 1.7 Experiência do editor

- Editor em tela cheia: canvas central, barra vertical à esquerda, inspector à direita.
- A barra vertical tem 9 entradas: conteúdo da página, elementos, elementos de terceiros,
  templates, page assignment, configurações da página, histórico de versões, código customizado,
  chat de suporte.
- Seletor de dispositivo + **tamanho de canvas ajustável** dentro de cada faixa.
- **Theme styling** ligável/desligável: o editor carrega o CSS do tema para o preview bater com
  o site — com a ressalva documentada de que em alguns temas isso gera tela em branco e precisa
  ser desligado (sintoma direto do problema de isolamento de CSS; ver 3.3).
- **Auto Backup** — ao reabrir o editor, oferece restaurar alterações não salvas.
- **Version History** — guarda os **50 salvamentos manuais** mais recentes; autosaves **não**
  entram no histórico. Permite pré-visualizar antes de restaurar, com confirmação. *(⚠️ resolvido:
  o número e a regra estão confirmados na documentação.)*
- **Trash** — lixeira de páginas e seções excluídas.
- **Image Manager / Media Manager** — biblioteca própria, com acesso à biblioteca de imagens
  gratuitas do Shopify.
- Gerenciador de fontes com upload de fontes próprias.
- **Swatches customizados** para variantes de produto.
- Busca de parâmetros dentro do inspector (digitar "cor" e ver onde aparece).
- Botão de documentação contextual por elemento.
- **Indicador de edição simultânea** — avisa quando a mesma página está aberta em várias abas ou
  por várias pessoas, para evitar sobrescrita.
- Preview e "ver ao vivo" antes/depois de publicar.
- Editor de código da página: **só CSS e JavaScript** — HTML não entra por ali (para HTML existe
  o elemento HTML/Liquid).
- **FlyMate** — assistente de IA dentro do editor, em beta, que cria, modifica, navega e ensina
  por prompt.

### 1.8 Publicação e versionamento

- Publicar / despublicar por página, com estados de rascunho e publicado.
- **Todas as páginas são publicadas como template JSON**, tanto em temas OS 1.0 quanto OS 2.0.
  O limite da Shopify é de **1.000 templates JSON por tema**; a partir do 1.001º, o PageFly passa
  a publicar como template **Liquid**, e nesse modo o merchant perde a capacidade de reordenar ou
  esconder seções do tema em volta do conteúdo.
- O app depende de uma **Theme App Extension** ("theme extension") que precisa estar ativada nos
  App embeds do tema. Publicar uma página ativa a extensão automaticamente; **trocar de tema
  exige reativar**.
- Além da extensão, o app cria arquivos Liquid próprios no tema e insere código no `theme.liquid`
  e uma chave `pagefly` no `locales/en.default.json` — a documentação de desinstalação lista tudo
  isso como limpeza manual a ser feita pelo merchant. *(É a confirmação documental da reclamação
  de "sujeira no tema"; ver 3.3.)*
- Versionamento com restauração (ver 1.7).
- **Não há agendamento de publicação de página.** ⚠️ *(Não encontrado em nenhuma página da
  documentação. O único agendamento que existe é o de **início de teste A/B**. Como a própria
  API da Shopify oferece `publishDate` em `pageCreate`/`pageUpdate` — ver Apêndice A.1 — isto é
  uma lacuna barata de preencher no D&VFly.)*

### 1.9 SEO

- Título SEO, meta description e handle de URL por página.
- Validação de comprimento recomendado para título e meta description.
- **Social Sharing Image** — campo nativo de imagem de compartilhamento, **exclusivo das páginas
  Regular** e só ativo depois de publicar. *(⚠️ resolvido: existe, mas com essa restrição.)*
- Publicação direta no menu de navegação do Shopify.
- **AEO (Answer Engine Optimization)** — módulo novo, focado em páginas de produto, que pontua de
  0 a 100 o quanto a página é legível por assistentes de IA e aplica duas correções de um clique:
  injetar **JSON-LD de Product** (com detecção de schema duplicado do tema ou de outro app) e
  gerar uma **seção de Q&A com FAQ structured data**.
- Integração com apps de SEO de terceiros e com tradutores (Weglot, Langify, T-Lab), além de um
  **AI Translator** próprio.

### 1.10 Analytics, heatmap e A/B testing — o "CRO Center"

Tudo isto vive numa área própria do app chamada **CRO Center**, com três estágios: *Analyze*,
*Optimize* e os testes. O rastreamento é feito pelo sistema de tracking do próprio Shopify —
o argumento de venda é "não precisa conectar Google Analytics".

**Métricas rastreadas:** pageviews, sessões, visitantes únicos, tempo médio de engajamento, taxa
de rejeição, taxa de sessão engajada, taxa de adição ao carrinho, taxa de visualização de produto,
taxa de clique no checkout dinâmico, taxa de envio de formulário, taxa de conversão, vendas
brutas, pedidos, taxa de visualização de post e de coleção. Há ainda **Custom Tracking IDs**:
nomear um elemento qualquer e medir cliques nele.

**Seis níveis de dashboard:** Geral → Template de página → Página → Métrica, mais Section Insights
e Sales Funnel.

| Recurso | Descrição |
|---|---|
| **Section Insights** | Métricas por seção da página, com **engagement score de 0 a 10** derivado de taxa de clique (benchmark 2%), taxa de clique em CTA (benchmark 5%) e tempo médio de permanência (benchmark 5 s) |
| **Sales Funnel** | Sessões → Add to cart → Checkout → Compra, com taxa de conversão e abandono entre etapas, mais cards de vendas brutas, pedidos, ticket médio e receita por sessão |
| **Heatmaps** | Mapa de cliques e profundidade de rolagem **por seção** (5 faixas: topo, 25%, meio, 75%, completo), filtrável por dispositivo, com overlay sobre o canvas do editor. Rastreamento desligado por padrão, ligado por página |
| **A/B Experiments** | Control (A) vs. Variant (B), com % do tráfego que entra no teste e split entre versões; métrica-alvo escolhível (add to cart, visualização de produto, evento próprio); **probabilidade de vitória desejada** configurável (recomendado 95%); pausa automática ao encontrar vencedor; agendamento de início. Estatística bayesiana |
| **AI Analytics Co-pilot** | Assistente que responde perguntas sobre os dados em linguagem natural e **detecta anomalias** (variação >30% em menos de 7 dias, quebra de padrão sazonal, divergência mobile vs. desktop) |
| **GA4** | Conexão opcional com Google Analytics 4 |

Restrições relevantes: heatmaps e funil são **só de planos pagos**; uma página pode ter variantes
de mercado **ou** um teste A/B, nunca os dois; páginas de password não podem ser testadas.

### 1.11 Recursos de IA (2024–2026)

O modelo é de **créditos mensais por plano**, de 10 (Free) a 800 (Power).

| Recurso | O que faz | Custo em créditos |
|---|---|---|
| **FlyMate** | Assistente no editor: gera páginas/seções/elementos por prompt, modifica estilo e conteúdo do que está selecionado, navega pela interface e responde dúvidas. Em beta | — |
| **MagicFly** | Converte uma **imagem** em design editável | — |
| **AI Smart Pages** | Gera página de vendas inteira e personaliza por localização, tipo de cliente (novo/recorrente/logado), origem de tráfego e políticas da loja. Em beta, gratuito durante o período | grátis no beta |
| **AI Section Generator** | Gera uma seção completa a partir de prompt | consome créditos |
| **Page Checkup** | Auditoria com **Health Score de 0 a 100**. Faz duas varreduras numa passada: *estrutural* (existe hero? tem headline e CTA? há exatamente um H1 e ele está no topo? os headings pulam nível? as imagens têm alt? há prova social, FAQ, preço e caminho de compra? há placeholders?) e *visual* (uma IA olha um print da página como um visitante veria: a oferta é legível, o CTA se destaca, os depoimentos parecem reais, há hierarquia visual). Devolve uma lista priorizada com correções de um clique | **rodar é grátis**; cada correção custa 5 créditos; otimizar imagens é sempre grátis |
| **AEO** | Ver 1.9 | check grátis; correções consomem |
| **AI Translator** | Tradução do conteúdo da página | consome créditos |
| **Market localization** | Variantes da página por **Shopify Market** (região), com publicação independente por variante e fallback para a versão base. Só no plano Optimize ou acima; só em páginas Regular por enquanto; não funciona em seções | — |
| **Conector MCP** | Expõe o PageFly como servidor **MCP** em `apps.pagefly.io/mcp`, permitindo que Claude, ChatGPT ou outro cliente MCP liste páginas, busque templates, leia resultados de auditoria, construa a página seção a seção e publique | — |

> Duas coisas para o D&VFly. Primeira: o **Page Checkup é o recurso mais copiável do conjunto** —
> boa parte dos checks estruturais (um H1, hierarquia de headings, alt text, presença de CTA,
> placeholders não preenchidos) é **análise estática da árvore de blocos**, sem IA nenhuma, e o
> D&VFly já terá essa árvore. Dá para entregar 70% do valor com 5% do esforço. Segunda: expor o
> builder por MCP é barato quando a API interna já existe, e transforma "montar página" em algo
> que se pede por conversa.

### 1.12 Integrações

A contagem real, obtida somando a listagem oficial por categoria: **210 apps integrados em 20
categorias**. *(⚠️ resolvido — a passada 1 registrava "130+", número que o próprio PageFly ainda
usa na descrição da App Store enquanto o card de preços do mesmo app diz "200+".)*

| Categoria | Apps |
|---|---|
| Upsell e cross-sell | 58 |
| Reviews e avaliações | 31 |
| Informações de produto | 21 |
| Selos e badges | 18 |
| E-mail marketing | 16 |
| Imagem e mídia | 13 |
| Agendamento, assinaturas, push | 7 cada |
| Rastreio de pedido, campos de upload | 6 cada |
| Fidelidade | 4 |
| Afiliados, presentes, internacionalização | 3 cada |
| Entrega/retirada, sustentabilidade | 2 cada |
| Publicidade, suporte, SMS | 1 cada |

O mecanismo é sempre o mesmo: o app de terceiro expõe um snippet ou um app block e o PageFly o
embrulha como elemento arrastável. Para apps que suportam **app block do OS 2.0**, existe ainda
o elemento genérico "App blocks", que evita integração dedicada — mas exige publicar a página e
escolher o app dentro do Theme Editor, e só pode ser usado **uma vez por página**.

> **Para o D&VFly:** 210 integrações dedicadas é catálogo de fornecedor de software, não requisito
> de loja própria. Um bloco HTML/Liquid bem feito mais o app block genérico cobrem o que a nossa
> loja de fato usa.

### 1.13 Performance — o que é declarado e o que a documentação entrega

Declarado: lazy loading de imagens (configurável por imagem desde a 4.13), "content loading"
lazy em vídeos e widgets sociais (4.15), otimização de código do elemento Tabs para reduzir
layout shift (4.15), script auxiliar entregue via Theme App Extension.

O que a leitura direta revelou e vale registrar:

- A página oficial sobre velocidade afirma textualmente que **"o PageFly não impacta o PageSpeed
  da sua loja"** e direciona o merchant a otimizar imagens, revisar apps instalados e falar com o
  desenvolvedor do tema. Um review de 3★ chama esse artigo de "muito defensivo" depois de medir
  23 no Lighthouse num formulário de contato feito com o template básico do próprio app.
- A documentação de erro **"Page Size Limit"** revela o teto real: a página não pode passar de
  **256 KB**, limite da Shopify, e o erro "ocorre quando a página excede o limite por ter elementos
  aninhados demais". A orientação é **remover elementos**. Ou seja: existe um teto de complexidade
  estrutural, e ele é atingível.
- Há também **limite de "um por página"** para certos elementos (documentado genericamente),
  limite de 20 MB por imagem e o já citado limite de 1.000 templates JSON por tema.

> **Esta é a maior oportunidade do projeto, e agora está documentada pela própria fonte.** Um
> teto de 256 KB por template só é um problema para quem serializa a árvore inteira dentro do
> template. Se o D&VFly compilar para HTML estático enxuto, com CSS crítico escopado e JS sob
> demanda, o mesmo teto vira folga confortável.

### 1.14 Cart Drawer — superfície que a passada 1 não tinha mapeado

O PageFly ganhou um **construtor de gaveta de carrinho** que substitui a do tema. É uma superfície
separada do page builder, com biblioteca própria de componentes e fluxo próprio de publicação.

| Grupo | Componentes |
|---|---|
| **Fundacionais** (sempre presentes) | Cabeçalho da gaveta, itens do carrinho, subtotal, botão de checkout, estado vazio |
| **Aumentar valor do pedido** | **Reward Ladder** (barra de progresso para frete grátis / brinde / desconto, até 3 níveis, medidos por valor ou quantidade), **Bundle Offers** (combo com desconto), recomendações no carrinho, embrulho para presente, proteção de envio |
| **Confiança** | Selos de pagamento, segurança e devolução |
| **Urgência** | Countdown |
| **Remover barreiras** | Campo de cupom, nota do pedido, mensagem de "bem-vindo de volta" |
| **Promoção** | Anúncio |

O detalhe tecnicamente relevante: **Reward Ladder e Bundle Offers criam descontos reais**, rodando
como **Shopify Functions**, e por isso exigem scopes adicionais
(`read/write_cart_transforms` e `read/write_discounts`). A documentação alerta em destaque que a
barra de progresso **renderiza corretamente mesmo sem as permissões concedidas** — o cliente vê
"gaste mais R$ 12 para frete grátis" e nada acontece no checkout. É um modo de falha silencioso
que vale evitar por desenho.

Requisitos: tema com suporte a app embeds, ativação manual do app embed no editor de tema, e —
em temas fora da lista de compatibilidade — uma opção de "forçar substituição da gaveta do tema".

### 1.15 Modelo comercial e limites (contexto, não requisito)

Preços confirmados na página oficial de preços. Há **duas tabelas diferentes em circulação**: o
card da Shopify App Store mostra apenas Free / Builder / Accelerate / Enterprise, enquanto a
página de preços mostra cinco planos self-serve. Os valores abaixo são os da página de preços.

| Plano | Preço/mês | Slots publicados | Créditos de IA | Módulos de CRO |
|---|---|---|---|---|
| **Free** | US$ 0 | 1 | 10 | dashboard analytics |
| **Builder** | US$ 24 | 5 | 80 | dashboard analytics |
| **Optimize** | US$ 39 | 20 | 140 | + funil, Page Checkup, AI Translator, A/B testing |
| **Accelerate** | US$ 99 | ilimitado | 400 | + heatmap, section performance |
| **Power** | US$ 199 | ilimitado | 800 | + AI SmartSeller (anunciado) |

Acima disso há três tiers "PageFly Enterprise": Scale US$ 299, Dominate US$ 499 (até 3 lojas) e
Empire US$ 999, vendidos por atendimento e acesso a engenharia, não por funcionalidade.

Regras do modelo:

- Um **slot** = uma página **ou** seção publicada; todos os tipos de página contam igual.
- Para fazer downgrade é preciso **despublicar** até caber no limite do plano de destino.
- Todos os planos são mensais; **não há opção anual**.
- Há também venda de pacotes avulsos de crédito e, nos planos Builder e Optimize, slots extras.
- O modelo antigo (Silver/Gold/Platinum) foi descontinuado, e a migração é **de mão única**.

> **Relevância para o D&VFly:** nenhuma, e isso é a vantagem. Como app privado da sua loja, não
> existe slot, plano, crédito nem limite. Some uma classe inteira de código (billing, contagem de
> slots, gates por plano) e uma fonte constante de atrito com o usuário — que, como mostra a seção
> 3, é exatamente onde boa parte das avaliações negativas se concentra.
---

## 2. Linha do tempo das atualizações relevantes

⚠️ Datas parciais; algumas versões não têm data pública confirmada. A leitura importante é a
**direção da evolução**, não o calendário exato.

### Fase "fundação" (até 2022)

| Versão | O que trouxe |
|---|---|
| 1.2.0 | Suporte a novos tipos de página |
| 2.3.0 | Controle ampliado sobre página de produto; revisão de UI |
| 3.0 | Reescrita da plataforma ("built for the tomorrow of eCommerce") |
| 3.8.0 / 3.9.0 | **Integração com Online Store 2.0**, imagens 3D, grande lote de novos elementos |
| 3.15.0 | Sistema de espaçamento reformulado; mais temas suportados; integrações |
| 3.16.0 | Novo elemento; integrações; melhorias de UX/UI |

### 2022–2023: seções globais, preço e integrações

| Versão | Data | O que trouxe |
|---|---|---|
| 3.18.0 / 3.19.0 | — | **Global Sections** (publicar seção e inserir no Theme Editor), mídia 3D de produto, novo modelo de preços |
| 3.20.0 | — | Novas configurações de estilo; integrações; UX/UI |
| 3.24.0 | — | Melhorias no **Page Outline**; novos planos; integrações |
| 3.25.0 | — | Melhorias no processo de **publicação** e em imagens; unificação dos campos de formulário; página despublicada permanece na lista do Shopify |
| 3.27.0 | 2023 | Melhorias de mídia de produto; integrações; atualizações de **analytics** |
| 3.29.0 | 23/02/2023 | Integrações AiTrillion, Recurpay, Track123 |
| 3.30.0 | 09/03/2023 | Atualização in-app; integrações Minta e Enorm |

### 2024: maturidade do editor e da arquitetura

| Versão | Data | O que trouxe |
|---|---|---|
| 4.0 | 2024 | Nova geração do editor; alinhamento completo com Online Store 2.0 |
| 4.2.0 | — | Vários recursos via integrações de terceiros |
| 4.6.0 | — | Admin migrado para **Shopify Polaris v12**; melhorias de UX |
| 4.10.0 | — | 6 novas integrações |
| 4.13.0 | 09/07/2024 | Unificação de "Add elements" + "Add Shopify elements" em um único painel **Elements**; **global styles agora responsivos**; nova UI do histórico de versões |
| 4.14.0 | 08/2024 | Popover e melhorias de elementos; **script auxiliar migrado para Theme App Extension**, ativável dentro do app |
| 4.18.0 | 10/2024 | Color picker melhorado; sincronização de estilos entre itens de Content List; global styles |

### 2025–2026: virada para CRO e IA

| Versão / marco | Data | O que trouxe |
|---|---|---|
| 4.19.0 | 06/01/2025 | Reescrita de parte do código do editor; copy-paste preservando estilo; **integração com as fontes do tema Shopify**; performance |
| 4.20.0 | 20/01/2025 | Reformulação da UI do editor desktop e mobile |
| Ciclo IA/CRO | 2025–2026 | **AI Section Generator**, **AI Smart Pages** (com personalização por localização/tipo de cliente/origem de tráfego), **Page Checkup** (auditoria com nota e correções priorizadas), **A/B Experiments** (bayesiano), **heatmaps** de clique e rolagem, **funnel analytics**, dashboard de analytics, section performance |

**Leitura estratégica da timeline:**

1. **2021–2022** — corrida por elementos e integrações (largura de catálogo).
2. **2023** — arrumação de arquitetura: seções globais, publicação, OS 2.0.
3. **2024** — qualidade de editor e dívida técnica: responsivo nos global styles, Theme App
   Extension, Polaris, performance.
4. **2025–2026** — o builder vira commodity; o valor migra para **CRO** (A/B, heatmap, funil) e
   **IA generativa**.

Para o D&VFly isso significa: não gaste a Fase 3 perseguindo catálogo de elementos. O diferencial
defensável está em **performance do output** e em **medir e melhorar conversão**.

---

## 3. Principais reclamações dos usuários → oportunidades para o D&VFly

Contexto: o PageFly tem ⚠️ ~4,9/5 com ~6.000 avaliações na App Store (≈95% cinco estrelas). As
reclamações abaixo são de minoria, mas são **consistentes** e apontam exatamente onde um builder
próprio ganha.

### 3.1 Código inchado e lentidão

**O que dizem:** templates pesados contribuem para *code bloat*; "código sujo que deixa o site
lento e atrapalha o SEO"; páginas ficam lentas com muitas imagens, widgets de terceiros ou
seções complexas. A própria empresa vende "otimização de velocidade" como serviço do plano top.

**Oportunidade D&VFly (a mais importante do projeto):**
- Gerar **HTML semântico estático** no publish, não uma árvore renderizada por JS em runtime.
- **CSS crítico por página**, escopado e minificado — só as regras dos blocos usados, nada de
  folha global de 300 KB.
- **Zero JavaScript por padrão**. JS só é emitido para blocos que realmente precisam (accordion,
  countdown, carrossel, add-to-cart Ajax), carregado como módulo pequeno e adiado.
- `loading="lazy"` + `srcset` + dimensões explícitas em toda imagem (mata CLS).
- Meta de performance como requisito de aceite, não como aspiração: **LCP < 2,5 s, CLS < 0,1,
  INP < 200 ms** em 4G simulado.

### 3.2 Lock-in: as páginas não sobrevivem sem o app

**O que dizem:** as páginas são construídas sobre a infraestrutura do app e "não se sustentam
sozinhas"; ao desinstalar, os dados são apagados permanentemente (com janela de ~24 h) e há
relatos de site quebrado depois da remoção; a desinstalação não limpa todos os vestígios.

**Oportunidade D&VFly:**
- **Export estático**: botão que gera HTML + CSS limpos da página, coláveis direto no tema.
- O conteúdo publicado vive no Shopify (campo `body_html` da Page, ou seção/template do tema),
  não só no banco do app. Se o app sumir, a página continua de pé.
- Rotina de desinstalação que limpa o que injetou, documentada.

### 3.3 Modelo de slots e preço

**O que dizem:** pagar por página publicada é caro ao escalar; "ilimitado" só no plano mais caro;
para fazer downgrade é preciso despublicar páginas.

**Oportunidade D&VFly:** app privado — **sem slots, sem planos, sem billing**. Some uma classe
inteira de código e de frustração.

### 3.4 Suporte e confiabilidade

**O que dizem:** demora em problemas sérios; tickets passando por vários atendentes com
respostas desconexas; relatos de perder acesso às próprias páginas; conflito com outros apps
quebrando home e página de produto.

**Oportunidade D&VFly:**
- **Histórico de versões generoso** e restauração em um clique — seu seguro contra qualquer erro.
- **Preview antes de publicar**, sempre.
- Isolamento de CSS por página (escopo por classe/prefixo próprio) para não colidir com o tema
  nem com outros apps.

### 3.5 Limites de customização e curva de aprendizado

**O que dizem:** usuários batem em paredes de customização; animações limitadas frente a
concorrentes; controle fino exige cair no editor de código.

**Oportunidade D&VFly:**
- Escape hatch de primeira classe: bloco de HTML/Liquid e CSS por página, sem fricção.
- Menos blocos, porém mais **componíveis** (um repetidor genérico bem feito > 30 blocos rígidos).

### 3.6 Dependência do app para editar

**O que dizem:** por não gerar seções Liquid nativas, o conteúdo não é editável no Theme Editor
do Shopify sem o app.

**Oportunidade D&VFly:** para seções, gerar uma **seção Liquid real** com `schema`, para que o
conteúdo continue editável no Theme Editor. Recurso P1 de alto valor e baixo custo relativo.

---

## 4. Tabela de priorização: recurso → prioridade

**Critério de corte**
- **P0 — essencial:** sem isso o D&VFly não é um page builder utilizável. É o escopo da Fase 3 (MVP).
- **P1 — importante:** entrega valor competitivo real; entra logo depois do MVP (Fase 4).
- **P2 — depois:** desejável, nicho, ou dependente de escala/IA. Backlog.

### 4.1 Fundação e gestão de páginas

| Recurso | Prioridade |
|---|---|
| CRUD de páginas (listar, criar, renomear, duplicar, excluir) | **P0** |
| Tipo de página: Regular/Landing | **P0** |
| Tipo de página: Home | **P1** |
| Tipo de página: Produto (template alternativo) | **P1** |
| Tipo de página: Coleção (template alternativo) | **P1** |
| Tipo de página: Blog post | **P2** |
| Tipo de página: Password | **P2** |
| Page Assignment (atribuir template a N produtos/coleções) | **P1** |
| Modo Auto vs. Custom nos elementos de produto | **P1** |
| Busca e filtro na lista de páginas | **P2** |

### 4.2 Editor

| Recurso | Prioridade |
|---|---|
| Editor em tela cheia com canvas + painel de blocos + painel de estilos | **P0** |
| Drag & drop, reordenar, duplicar, excluir elemento | **P0** |
| Hierarquia Seção → Linha → Coluna → Elemento | **P0** |
| Preview desktop / tablet / mobile | **P0** |
| Undo / redo | **P0** |
| Autosave / recuperação de rascunho | **P0** |
| Painel de estrutura (árvore da página) | **P1** |
| Copiar/colar elementos entre páginas | **P1** |
| Atalhos de teclado | **P2** |
| Edição inline de texto direto no canvas | **P1** |
| Interface em **pt-BR** | **P0** |

### 4.3 Biblioteca de blocos

| Bloco | Prioridade |
|---|---|
| Hero (imagem/vídeo de fundo + título + CTA) | **P0** |
| Texto rico | **P0** |
| Imagem | **P0** |
| Botão CTA | **P0** |
| Divisor / Espaçador | **P0** |
| Galeria de imagens | **P0** |
| Depoimentos | **P0** |
| Tabela comparativa | **P0** |
| FAQ (accordion) | **P0** |
| Countdown | **P0** |
| Formulário de contato | **P0** |
| Vídeo (YouTube / Vimeo / HTML5) | **P0** |
| Ícones de confiança / selos | **P0** |
| Seção de produto (imagem, preço, variantes, Add to Cart via Ajax) | **P0** |
| Repetidor genérico (estilo "content list") | **P1** |
| Bloco HTML/Liquid customizado | **P0** |
| Tabs / abas | **P1** |
| Slideshow / carrossel | **P1** |
| Lista de produtos (coleção) | **P1** |
| Lista de coleções | **P1** |
| Popup / modal | **P1** |
| Barra de progresso / meta | **P2** |
| Google Map | **P2** |
| Instagram / feeds sociais | **P2** |
| Tabela genérica | **P2** |
| QR code | **P2** |
| Áudio / SoundCloud | **P2** |
| Mídia 3D de produto | **P2** |

### 4.4 Estilo e responsividade

| Recurso | Prioridade |
|---|---|
| Espaçamento (margin/padding por lado) por breakpoint | **P0** |
| Tipografia (família, tamanho, peso, altura de linha, cor) por breakpoint | **P0** |
| Cores de texto e fundo | **P0** |
| Imagem de fundo + overlay | **P0** |
| Bordas e raio | **P0** |
| Alinhamento e largura (full-width vs. contida) | **P0** |
| Esconder elemento por breakpoint | **P0** |
| Sombra | **P1** |
| Estilos globais / tokens de marca (cores, fontes, botões) | **P1** |
| Herança em cascata entre breakpoints | **P1** |
| CSS customizado por página | **P1** |
| Sticky (seção/elemento) | **P1** |
| Animação de entrada e hover | **P1** |
| Gradientes | **P2** |
| Parallax | **P2** |
| Posicionamento absoluto / z-index | **P2** |

### 4.5 Publicação, versionamento e performance

| Recurso | Prioridade |
|---|---|
| Publicar / despublicar página | **P0** |
| Publicação via Admin GraphQL API (Pages) | **P0** |
| Preview da página antes de publicar | **P0** |
| Histórico de versões com restaurar | **P0** |
| **CSS enxuto e escopado por página** | **P0** |
| **Lazy-load de imagens + srcset + dimensões explícitas** | **P0** |
| **Zero JS por padrão; JS só sob demanda do bloco** | **P0** |
| Publicação como template de tema (produto/coleção) | **P1** |
| Seções salvas / reutilizáveis | **P1** |
| Seção global com sincronização automática | **P1** |
| Gerar **seção Liquid nativa** editável no Theme Editor | **P1** |
| Export estático de HTML+CSS (anti-lock-in) | **P1** |
| Orçamento de performance verificado no build (LCP/CLS/INP) | **P1** |
| Agendamento de publicação | **P2** |
| Diff visual entre versões | **P2** |

### 4.6 SEO

| Recurso | Prioridade |
|---|---|
| Título SEO, meta description, handle de URL | **P0** |
| Imagem Open Graph / Twitter card | **P0** |
| Validação de comprimento de título e descrição | **P1** |
| Alt text obrigatório/sugerido em imagens | **P1** |
| Heading hierarchy check (um H1, hierarquia correta) | **P1** |
| JSON-LD (Product, FAQPage, BreadcrumbList) | **P1** |
| Canonical customizável | **P2** |
| `noindex` por página | **P2** |

### 4.7 Templates

| Recurso | Prioridade |
|---|---|
| 5+ templates de landing de conversão criados do zero | **P0** |
| Criar página a partir de template | **P0** |
| Salvar página própria como template | **P1** |
| Biblioteca de seções prontas | **P1** |
| Templates por nicho/campanha | **P2** |

### 4.8 Analytics e CRO

| Recurso | Prioridade |
|---|---|
| Contagem de visualizações por página | **P1** |
| Conversão e receita por página | **P1** |
| A/B test (Control vs. Variant com divisão de tráfego) | **P1** |
| Heatmap de clique e rolagem | **P2** |
| Funnel analytics | **P2** |
| Desempenho por seção | **P2** |

### 4.9 Integrações e IA

| Recurso | Prioridade |
|---|---|
| Bloco HTML/Liquid (cobre 90% das integrações sem código dedicado) | **P0** |
| Bloco de reviews (Judge.me / Loox — o que a loja usar) | **P1** |
| Formulário → Klaviyo / e-mail da loja | **P1** |
| Geração de seção por IA a partir de prompt | **P2** |
| Auditoria de página por IA (SEO/copy/conversão) | **P2** |
| Geração de copy por IA | **P2** |
| Multi-idioma | **P2** |

### 4.10 Resumo da priorização

| Prioridade | Nº de itens | Onde entra |
|---|---|---|
| **P0** | 43 | Fase 3 — MVP |
| **P1** | 37 | Fase 4 |
| **P2** | 26 | Backlog |

---

## 5. Conclusões que orientam a Fase 2 (Arquitetura)

1. **O diferencial do D&VFly é o output, não o catálogo.** O mercado já resolveu "muitos blocos".
   Ninguém resolveu "página de builder que carrega como página de tema". Publicar HTML estático +
   CSS crítico escopado + JS sob demanda é a decisão arquitetural mais importante do projeto.

2. **O editor deve produzir um documento de dados, não HTML.** Guardar uma árvore JSON de blocos
   e compilá-la para HTML/CSS no publish separa edição de renderização — e é o que permite
   otimizar o output, versionar barato e exportar estático depois.

3. **Um repetidor genérico vale por dez blocos.** Depoimentos, comparativos, cards de benefício,
   logos, FAQ — tudo é a mesma estrutura com estilos sincronizados. Investir nesse primitivo
   reduz drasticamente o tamanho da biblioteca.

4. **Caminho de publicação em duas trilhas:** (a) páginas avulsas via Admin GraphQL API
   (`pageCreate`/`pageUpdate`); (b) produto/coleção/home via template alternativo do tema
   (JSON template + seção Liquid do app). Isso precisa ser desenhado na Fase 2, incluindo os
   scopes necessários (`write_products`, `write_themes`, `write_content`/Online Store pages,
   `read_themes`) — a serem confirmados em `shopify.dev` antes de fechar o `shopify.app.toml`.

5. **Anti-lock-in como feature.** Export estático e conteúdo que sobrevive ao app não são
   generosidade: são a resposta direta à reclamação nº 2 dos usuários do concorrente, e custam
   pouco quando a arquitetura já compila para HTML estático.

6. **A/B test e analytics são P1, não P0 — mas o modelo de dados precisa nascer preparado.**
   Se `Page` já tiver o conceito de variante desde o início, o A/B test da Fase 4 é uma feature
   de UI, não uma migração dolorosa.

---

## 6. Fontes consultadas

Documentação e material oficial do PageFly:
- Central de ajuda: `help.pagefly.io` — estrutura de página e elementos, criação de páginas e
  seções, configurações de página, otimização, integrações, preços e billing, últimas atualizações
- Blog de releases: `pagefly.io/blogs/shopify` — notas das versões 1.2.0, 2.3.0, 3.0, 3.8/3.9,
  3.15, 3.16, 3.18/3.19, 3.20, 3.24, 3.25, 3.27, 3.29, 3.30, 4.2, 4.6, 4.10, 4.13, 4.14, 4.18,
  4.19, 4.20
- Páginas de produto: `pagefly.io` — templates, A/B testing, heatmap, AI page builder, pricing
- Listagem na Shopify App Store: `apps.shopify.com/pagefly` (descrição, planos, reviews)

Avaliações e análises independentes:
- Shopify App Store — reviews (incl. filtros de 1 e 2 estrelas)
- Trustpilot — `trustpilot.com/review/pagefly.io`
- G2, Capterra, GetApp — fichas de produto e reviews
- Comparativos de agências e concorrentes: ATTN Agency, Avada, ecomm.design, dodropshipping,
  Supdropshipping, Minea, EComposer, GemPages, Liquiflow, ShopDigest
- Shopify Community — tópicos sobre uso de PageFly com temas e outros apps

> Reitero a limitação da seção 0.2: as fontes acima foram consultadas **via busca web**, não por
> leitura direta das páginas, devido ao bloqueio de egresso do ambiente. Números exatos devem ser
> reconfirmados antes de qualquer uso externo deste documento.
