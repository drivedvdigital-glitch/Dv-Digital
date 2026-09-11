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

### 2.0 Nota de fonte — leia antes da tabela

Esta seção tem um problema de fonte que a leitura direta **não resolveu, mas esclareceu**:

**O PageFly tirou do ar o histórico de releases.** As notas de versão eram publicadas como posts
no blog, no padrão `pagefly.io/blogs/shopify/pagefly-X-Y-0`. Testando uma por uma: as da série 3.x
retornam **404**; as da série 4.x até a 4.19.0 **redirecionam para o índice do blog** (o post não
existe mais); **só a 4.20.0 continua no ar**, e é a única cuja data pôde ser lida na fonte
primária. O sitemap do blog lista apenas essa. O Internet Archive está bloqueado neste ambiente,
então não houve como recuperar as datas antigas.

**E o PageFly parou de publicar release notes.** Não existe post para nenhuma versão acima da
4.20.0 (testadas 4.21 a 4.30 e 5.0/5.1, todas 404), nem página de changelog, nem tag de release
notes. Desde 2025 o que existe é: blocos **"Version Update"** espalhados dentro dos artigos da
central de ajuda, e páginas de produto descrevendo recursos sem versão associada.

Consequência prática: **as datas abaixo da 4.20.0 continuam marcadas com ⚠️** — são as da passada
1, não reconfirmadas. Já **o conteúdo** de cada versão pôde ser confirmado e ampliado, porque os
artigos da documentação dizem o que cada versão mudou. De 2025 em diante a tabela deixa de ser
"versão → data" e passa a ser "versão → o que mudou", que é o que de fato interessa.

### 2.1 Fase "fundação" (até 2022) — ⚠️ datas não reconfirmadas

| Versão | O que trouxe |
|---|---|
| 1.2.0 | Suporte a novos tipos de página |
| 2.3.0 | Controle ampliado sobre página de produto; revisão de UI |
| 2.9.0 | Novos planos de preço; page analytics (a página de preços atual ainda aponta para esse post como referência do modelo antigo) |
| 3.0 | Reescrita da plataforma |
| 3.8.0 / 3.9.0 | **Integração com Online Store 2.0**, mídia 3D de produto, grande lote de novos elementos |
| 3.15.0 | Sistema de espaçamento reformulado; mais temas suportados |
| 3.16.0 | Novo elemento; integrações; melhorias de UX/UI |

### 2.2 2022–2023: seções globais, preço e integrações — ⚠️ datas não reconfirmadas

| Versão | Data | O que trouxe |
|---|---|---|
| 3.18.0 / 3.19.0 | ⚠️ | **Global Sections** (publicar seção e inserir no Theme Editor), mídia 3D de produto, novo modelo de preços |
| 3.20.0 | ⚠️ | Novas configurações de estilo; integrações |
| 3.24.0 | ⚠️ | Melhorias no **Page Outline**; novos planos |
| 3.25.0 | ⚠️ | Melhorias na **publicação** e em imagens; unificação dos campos de formulário; página despublicada permanece na lista do Shopify |
| 3.27.0 | ⚠️ 2023 | Mídia de produto; atualizações de **analytics** |
| 3.29.0 | ⚠️ 23/02/2023 | Integrações AiTrillion, Recurpay, Track123 |
| 3.30.0 | ⚠️ 09/03/2023 | Integrações Minta e Enorm |

### 2.3 2024: maturidade do editor e da arquitetura

Aqui a leitura da documentação **acrescentou versões que a passada 1 não tinha** (4.11, 4.12, 4.15,
4.16) e detalhou as que tinha.

| Versão | Data | O que trouxe |
|---|---|---|
| 4.0 | ⚠️ 2024 | Nova geração do editor; alinhamento com Online Store 2.0 |
| 4.2.0 | ⚠️ | Recursos via integrações de terceiros |
| 4.6.0 | ⚠️ | Admin migrado para **Shopify Polaris v12** |
| 4.10.0 | ⚠️ | 6 novas integrações |
| 4.11.0 | — | Ajustes de elementos (citada em várias páginas de elemento) |
| **4.12.0** | **28/05/2024** | O elemento **App blocks** passa a funcionar tanto em seções salvas quanto em páginas (antes, só num dos dois) — data confirmada na documentação |
| 4.13.0 | ⚠️ 09/07/2024 | Unificação de "Add elements" + "Add Shopify elements" num painel **Elements**; **global styles responsivos**; nova UI do histórico de versões; **lazy loading migra para a aba General de cada imagem** |
| 4.14.0 | ⚠️ 08/2024 | Popover; **script auxiliar migrado para Theme App Extension** |
| **4.15.0** | — | **Media Manager** reformulado, com acesso à biblioteca gratuita de imagens do Shopify; setting **"Content Loading"** (lazy/standard) em Vimeo e nos elementos do Facebook; **código do elemento Tabs otimizado para reduzir layout shift** |
| **4.16.0** | — | Aba de estilo reorganizada em 8 grupos; chegam os grupos **Size** e **Layout** (largura/altura em modo preencher/ajustar/fixo, direção, gaps, alinhamento) — é a preparação do terreno para o Gen 2 |
| 4.18.0 | ⚠️ 10/2024 | **Gradient Color Picker** (até 10 color stops, linear e radial), exclusivo dos planos PAYG; sincronização de estilos entre itens de Content List; estilos globais ganham containers e campos de formulário |

### 2.4 2025–2026: Gen 2, CRO e IA

| Versão / marco | Data | O que trouxe |
|---|---|---|
| 4.19.0 | ⚠️ 06/01/2025 | Reescrita de parte do editor; copy-paste preservando estilo; integração com as fontes do tema Shopify |
| **4.20.0** | **20/01/2025** ✅ | Reformulação da UI do editor desktop e mobile. **Última versão com nota de release pública** — data confirmada na fonte |
| **4.23.0** | — | **Editor Gen 2**: flex sections e flex blocks, sem estrutura de linha/coluna; o merchant escolhe entre Gen 2 e Legacy ao criar a página. Vários elementos mudam de comportamento (o Button perde "enable full width" e ganha parâmetros de Size; o X/Twitter perde as configurações de Display). **Exclusivo do modelo de preço por slot (PAYG)**. É a mudança arquitetural mais profunda do período |
| Ciclo CRO | 2025–2026 | **CRO Center** como área própria: dashboard de analytics em 6 níveis, **Section Insights** com engagement score, **Sales Funnel**, **Heatmaps** por seção com overlay no editor, **A/B Experiments** bayesianos com agendamento e pausa automática, **AI Analytics Co-pilot** com detecção de anomalia, conexão GA4 |
| Ciclo IA | 2025–2026 | **FlyMate** (assistente no editor, beta), **MagicFly** (imagem → design editável), **AI Smart Pages** (beta, gratuito), **AI Section Generator**, **Page Checkup** com Health Score 0–100 e correções de um clique, **AI Translator** |
| Ciclo "agentic" | 2026 | **AEO Optimizer** (JSON-LD de Product + Q&A com FAQ schema, score 0–100 de legibilidade por IA), **conector MCP** listado no diretório do Claude, presença no Sidekick do Shopify |
| **Cart Drawer** | 2026, beta | Construtor de gaveta de carrinho com Reward Ladder e Bundle Offers rodando como **Shopify Functions** |
| **Market localization** | 2026 | Variantes de página por Shopify Market, com publicação independente por mercado (plano Optimize+) |
| **Novo modelo de preço** | 2026 | Migração do modelo puramente por slot para 5 planos diferenciados por **módulos de CRO e créditos de IA** |

### 2.5 Leitura estratégica da timeline

1. **2021–2022 — corrida por catálogo.** Largura de elementos e integrações.
2. **2023 — arrumação de arquitetura.** Seções globais, publicação, OS 2.0.
3. **2024 — dívida técnica e qualidade de editor.** Responsivo nos estilos globais, Theme App
   Extension, Polaris, lazy loading por imagem, otimização de layout shift. Repare que as
   melhorias de performance de 2024 são **pontuais** (um elemento, um tipo de mídia por vez) —
   não houve reescrita do motor de renderização.
4. **2024–2025 — troca do motor de layout.** As versões 4.16 e 4.23 juntas trocam grid de colunas
   por flexbox. Foi caro: parte das reclamações de 2025–2026 é exatamente sobre a migração.
5. **2025–2026 — o builder vira commodity.** O valor migra para **CRO** (A/B, heatmap, funil,
   section insights) e **IA generativa**, e depois para **agentic** (AEO, MCP). O próprio
   posicionamento público mudou: o site não se apresenta mais como "page builder", e sim como
   "AI page builder e plataforma de CRO".
6. **2026 — expansão lateral.** Cart Drawer e localização por mercado mostram que o produto está
   saindo do escopo "páginas" para "superfícies de conversão da loja".

**O que isso significa para o D&VFly:**

- **Não persiga catálogo de elementos.** Está resolvido pelo mercado e não diferencia ninguém.
- **Nasça flex.** O concorrente líder gastou duas versões maiores e a paciência da base para sair
  do modelo linha/coluna. Começar do lado certo é o único momento em que isso é grátis.
- **O diferencial defensável é o output.** Performance real do HTML gerado, não recursos de CRO
  — que dependem de volume de tráfego que uma loja própria pode não ter.
- **Analytics e A/B são P1 com modelo de dados P0.** Se `Page` já nascer com o conceito de
  variante, o A/B test depois é UI, não migração.
---

## 3. Principais reclamações dos usuários → oportunidades para o D&VFly

> **Esta é a seção mais estratégica do documento.** Cada reclamação recorrente do líder de
> mercado é um requisito do D&VFly disfarçado de queixa alheia.

### 3.0 Base e método

Números verificados na Shopify App Store:

| | |
|---|---|
| Nota geral | **4,9 / 5** |
| Total de avaliações | **5.899** |
| 5 estrelas | 95% (≈5.600) |
| 4 estrelas | 3% (201) |
| 3 estrelas | 27 avaliações |
| 2 estrelas | 21 avaliações |
| 1 estrela | 70 avaliações |

No Trustpilot: **4,6 / 5 com 553 avaliações**, 99% delas de 5 estrelas — perfil típico de base
coletada ativamente pelo fornecedor. G2 e Capterra não puderam ser lidos (bloqueio anti-bot).

Foram lidos os **textos completos das avaliações de 1, 2 e 3 estrelas** (85 depoimentos, excluídas
as respostas do fornecedor). A leitura muda o quadro em relação à passada 1: a minoria negativa é
**muito** minoritária, mas é **notavelmente consistente**, e — o mais relevante — vem
desproporcionalmente de **clientes antigos e de lojas grandes**, não de quem desistiu no primeiro
dia. Há reviews de 1★ de contas com "mais de 4 anos usando o app" e de lojas com mais de 100
páginas publicadas. Isso importa: são falhas que aparecem **com escala e com o tempo**, exatamente
o tipo de problema que não se descobre num teste rápido.

Abaixo, os padrões em ordem de frequência e de gravidade. Cada um vem com a leitura de causa
provável — porque é a causa, não o sintoma, que o D&VFly precisa não repetir.

### 3.1 O editor não bate com a página publicada

**O padrão mais citado e o mais danoso.** "Divergências constantes entre o editor e a página
ao vivo." "O que eu desenho no app não reflete o que é publicado." Cores que o editor mostra
brancas e saem cinzas. Espaçamentos e fontes diferentes no mobile. Header, footer e barra de
anúncio aparecendo na landing **mesmo com os toggles desligados** — com o suporte respondendo com
trechos de CSS para colar manualmente, página por página.

**Causa provável:** o editor renderiza a árvore num ambiente próprio e o storefront renderiza
noutro, dentro do CSS do tema. São dois motores de renderização que precisam concordar, e não
concordam. O próprio produto admite o problema ao oferecer um botão de "theme styling" no editor
— e ao documentar que, em alguns temas, ligá-lo produz **tela em branco** e a orientação é
desligar.

**Oportunidade D&VFly — é uma decisão de arquitetura, não um bug a caçar:**
- **Um motor de renderização só.** O editor deve renderizar exatamente o mesmo HTML/CSS que o
  publish emite. Se o compilador for uma função pura `árvore → HTML + CSS`, o preview é o produto
  dessa função dentro de um iframe com o CSS do tema real carregado. Não existe "divergência"
  quando não existem dois caminhos.
- **Isolamento explícito de CSS**, com prefixo/escopo próprio e sem herança acidental do tema.
  O que o tema deve influenciar (tokens de marca) é escolha declarada, não acidente de cascata.
- **Preview no contexto real do tema**, sempre, antes de publicar.

### 3.2 Atualizações do app quebram páginas que já estavam prontas

**O segundo padrão mais citado, e o de maior custo emocional.** "Você monta tudo perfeito, aí eles
atualizam o app e todos os sites começam a ficar diferentes — espaçamentos, paddings, coisas que
funcionavam param." "Ajustei esse botão cinco vezes; toda vez que eles atualizam algo, ele muda."
"Eles forçaram um release no meio de uma construção de página, sem aviso, e o trabalho foi
perdido." Há também o caso específico da **migração forçada de editor**: "a atualização obrigatória
mudou todas as minhas páginas e não há como voltar ao editor antigo; sou obrigado a reformatar
tudo".

**Causa provável:** as páginas guardam **referências** ao runtime do app (classes, componentes,
comportamentos padrão) em vez de guardarem o resultado. Quando o runtime muda, a página muda
junto. É a mesma raiz do problema 3.1, vista no eixo do tempo em vez do eixo do ambiente.

**Oportunidade D&VFly — o antídoto é publicar resultado, não referência:**
- **O publish congela o output.** O HTML e o CSS de uma página publicada não mudam porque o
  builder mudou. Uma página só muda quando alguém a edita e republica.
- **Versionar o compilador junto com a página.** Cada versão publicada guarda com qual versão do
  compilador foi gerada; atualizar o builder não reescreve nada retroativamente.
- **Histórico de versões generoso e restauração em um clique** — o seguro contra qualquer erro,
  nosso ou do usuário. O concorrente guarda 50 salvamentos manuais; num app privado, sem custo de
  escala, dá para guardar bem mais e ainda oferecer **diff visual** entre versões.
- **Nunca migrar o usuário à força.** Se um dia houver v2 do modelo de blocos, páginas v1 seguem
  renderizando com o compilador v1.

### 3.3 O app suja o tema, e a sujeira escala

Relatos concretos e verificáveis: "depois de uma atualização de tema, o app fez **mais de 100
alterações não autorizadas** na loja (confirmado pelo suporte do Shopify)"; "instalou código
global no site mesmo eu tendo só uma página de teste"; "o sistema tem um problema de duplicação —
se você faz backup do tema, ele pode duplicar toda página criada com ele; **acabamos com mais de
3.000 páginas duplicadas**"; "sobraram tantos arquivos mesmo depois de desinstalar".

**Isto não é só percepção — está na documentação do próprio fornecedor.** O guia oficial de
desinstalação instrui o merchant a, manualmente: procurar "pagefly" no editor de código e
**apagar os arquivos Liquid**, abrir o `theme.liquid` e **apagar o código do app**, abrir
`locales/en.default.json` e **apagar um bloco de tradução inteiro**, e reverter `product.liquid`,
`collection.liquid` e `index.liquid` para versões anteriores. Ou seja: o app escreve em arquivos
centrais do tema, e a remoção automática não cobre tudo.

**Oportunidade D&VFly:**
- **Escrever o mínimo possível no tema, e saber exatamente o que escreveu.** Manter um inventário
  explícito de cada arquivo e cada bloco inserido — o que permite uma remoção completa e auditável.
- **Preferir Theme App Extension** (app embed/app block) ao invés de editar arquivos do tema
  sempre que a funcionalidade couber lá; ver Apêndice A.3 e A.4.
- **Nada de código global enquanto não houver página publicada.** Se não há conteúdo do builder na
  loja, o storefront não deve carregar um único byte nosso.
- **Rotina de desinstalação que de fato limpa**, documentada e testável.
- Cuidado explícito com **backup/duplicação de tema**: a lógica de mapeamento página↔template
  precisa ser idempotente e tolerar cópias do tema sem se multiplicar.

### 3.4 Lock-in: as páginas não sobrevivem ao app

Confirmado pela documentação e pelos relatos. Na desinstalação, **tudo é apagado imediatamente e
de forma irreversível** — páginas, seções, analytics, testes A/B, swatches, fontes enviadas,
estilos globais, templates salvos e até a lixeira — sem período de carência e sem backup do lado
do fornecedor. *(Correção da passada 1: não existe a "janela de ~24 h" que estava registrada.)*

O relato mais duro é o de escopo: "eles avisam que a desinstalação apaga o que você criou, mas não
avisam que a limpeza leva **qualquer página da qual eles já tiveram registro** — mesmo as que eu
reconstruí nativamente depois. Exportamos tudo antes, mas o formato não serve para nada além do
próprio app. Estamos reconstruindo 100+ páginas."

E o export confirma: sai em formato proprietário `.pagefly`, **sem as imagens**, importável apenas
em outra loja que também tenha o app.

**Oportunidade D&VFly — anti-lock-in como recurso, não como generosidade:**
- **Export estático de HTML + CSS** por página, colável direto no tema. Quando a arquitetura já
  compila para HTML estático, isso custa quase nada.
- **O conteúdo publicado vive no Shopify**, não só no banco do app. Se o app sumir, a página
  continua de pé.
- **Export do documento de blocos em JSON aberto e documentado** — o nosso formato, mas legível e
  reimportável sem depender de ninguém.
- **Nunca apagar o que não criamos.** O inventário da 3.3 serve também aqui: a desinstalação só
  toca no que está registrado como nosso.

### 3.5 Instabilidade e indisponibilidade

"O app trava constantemente e dá erros internos de servidor. **Pelo menos uma vez por mês
perdemos o acesso ao console por meio dia ou mais.**" "A home e algumas páginas de produto pararam
de carregar em certas versões de iPhone — terceira vez este ano." "O editor trava a cada poucos
minutos; o suporte disse que minha página está perto do limite de tamanho (não acima dele)."

Esse último é revelador: casa exatamente com o limite de **256 KB por página** documentado na
seção 1.13. O editor degrada **antes** do teto, e o conselho oficial é remover elementos.

**Oportunidade D&VFly:**
- O app privado tem uma vantagem estrutural: **a loja não depende do nosso servidor para servir a
  página**. Se o publish gera HTML que vive no tema do Shopify, nosso app pode estar fora do ar
  sem que nenhum cliente perceba. Isso precisa ser um princípio, não um acaso — **nada do
  storefront pode depender de uma chamada em tempo real ao nosso backend**.
- **Orçamento de tamanho por página verificado no build**, com aviso no editor bem antes do teto,
  mostrando o peso real do output compilado.
- Editor que aguenta páginas longas: virtualização da árvore e do canvas, não renderização ingênua.

### 3.6 Suporte: rápido em responder, caro em resolver

É o tema mais frequente em absoluto nas notas 2 e 3 — e curiosamente também o mais elogiado nas
de 5. O padrão nas negativas: muitos atendentes por ticket ("quatro agentes diferentes em três
dias, cada um com uma resposta"), necessidade de reexplicar o problema do zero a cada troca,
fuso horário, resposta em forma de "cole este CSS" em vez de correção do produto, e — o mais
grave — **o suporte pedindo acesso de colaborador e editando o tema diretamente**, às vezes
quebrando a loja, às vezes publicando página inacabada no ar fora do horário comercial do cliente.

**Oportunidade D&VFly:** num app privado não há suporte — o que significa que **o produto tem de
se explicar sozinho e ser reversível**. Concretamente:
- Histórico de versões e restauração em um clique (ver 3.2) é o substituto do suporte.
- **Publicar é sempre um ato explícito e reversível**, nunca um efeito colateral.
- Mensagens de erro que dizem o que fazer, não códigos.

### 3.7 Performance e SEO do output

"Código sujo que deixa o site lento e atrapalha o SEO." "Montei um formulário de contato simples
com o template base deles e o Lighthouse deu **23**. Quando você vai no site procurar como
acelerar, o artigo é muito defensivo, culpando tudo menos eles." "Falta a funcionalidade básica de
escolher só a imagem principal do produto — ele puxa as imagens de todas as variantes, o que
derruba a velocidade." "Minha loja sumiu do Google depois que instalei."

E de fato, como registrado em 1.13, a página oficial sobre velocidade afirma que **o app não
impacta o PageSpeed da loja** e encaminha o merchant a otimizar imagens e revisar outros apps.

**Oportunidade D&VFly — este é o núcleo do projeto:**
- **Gerar HTML semântico estático no publish**, não uma árvore renderizada por JS em runtime.
- **CSS crítico por página**, escopado e minificado — só as regras dos blocos usados.
- **Zero JavaScript por padrão.** JS só para blocos que realmente precisam (accordion, countdown,
  carrossel, add-to-cart Ajax), como módulo pequeno e adiado.
- `loading="lazy"` + `srcset` + dimensões explícitas em toda imagem (mata CLS).
- Puxar **só as mídias necessárias** do produto, com seleção explícita.
- **Metas de performance como critério de aceite, não como aspiração:** LCP < 2,5 s, CLS < 0,1,
  INP < 200 ms em 4G simulado, medidos no build.

### 3.8 Responsividade dá trabalho dobrado

"As edições não se aplicam entre as visualizações (desktop, mobile, tablet), é super frustrante."
"Não há jeito fácil de fazer a versão mobile de um design desktop: se você tem imagem paisagem no
desktop e retrato no mobile, precisa criar dois designs — e nenhum dos dois fica otimizado para
tablet, então é um terceiro."

**Causa provável:** a cascata entre breakpoints não é herdada de forma previsível; cada faixa vira
um design paralelo em vez de um conjunto de sobreposições sobre uma base.

**Oportunidade D&VFly:**
- **Cascata explícita e visível.** Um valor definido no desktop vale para baixo até alguém
  sobrescrevê-lo; a UI mostra claramente se o valor daquele campo é **herdado** ou **próprio**, e
  permite limpar a sobreposição com um clique.
- **Mobile-first de verdade** nos blocos padrão: empilhar sozinho, imagem com `art direction` via
  `<picture>` quando o usuário fornecer duas imagens, sem exigir dois layouts.

### 3.9 Modelo de slots e preço

"Pagar por página publicada fica caro ao escalar." "Seções salvas contam no total da assinatura —
é uma tentativa idiota de aumentar a receita." "Para usar um layout no blog eu tenho que pagar um
slot por post, ou 50 dólares por mês a mais." "Ao fazer downgrade, os recursos premium
desaparecem imediatamente." "Não dá para usar as mesmas funções numa loja de desenvolvimento — é
prática comum construir e testar antes de subir para produção; outros builders permitem."

**Oportunidade D&VFly:** app privado — **sem slots, sem planos, sem billing, sem gate**. Some uma
classe inteira de código e de frustração. E, de quebra: **funciona igual na loja de
desenvolvimento**, porque não há nada a liberar.

### 3.10 Curva de aprendizado e limites de customização

"Completamente desenhado para desenvolvedores." "A barra lateral direita parece um painel de
nave espacial: preciso navegar entre seção, linha, coluna para ajustar **um** parâmetro." "Isto
não é drag and drop." Pedidos recorrentes: arrastar livre de verdade, sobreposição de camadas,
lógica de interface parecida com a do Figma.

Há também limitações funcionais pontuais e reveladoras: **links de produto na lista de coleção não
são links HTML de verdade** — são handlers de clique, então não dá para copiar o endereço, nem
abrir em nova aba com ctrl+clique, o que é ruim de usabilidade e de SEO. E preços com desconto do
Shopify não aparecem corretamente na página do builder.

**Oportunidade D&VFly:**
- **Menos blocos, mais componíveis.** Um repetidor genérico bem feito vale mais que trinta blocos
  rígidos.
- **Escape hatch de primeira classe:** bloco HTML/Liquid e CSS por página e por elemento, sem
  fricção — mas como complemento, não como a única saída.
- **HTML correto por padrão.** Link é `<a href>`. Botão é `<button>`. Isso não é detalhe: é SEO,
  acessibilidade e a diferença entre uma página de builder e uma página de verdade.
- Interface enxuta: o inspector mostra o que é relevante para o elemento selecionado, com busca de
  parâmetro — e a navegação pela árvore não deveria ser pré-requisito para mudar uma cor.

### 3.11 Dependência do app para editar

Por não gerar seções Liquid nativas, o conteúdo não é editável no Theme Editor do Shopify sem o
app — e, como visto em 3.4, some junto com ele.

**Oportunidade D&VFly:** para seções, gerar uma **seção Liquid real com `schema`**, de modo que
o conteúdo continue editável no editor de tema do Shopify mesmo sem o nosso app aberto. É um
recurso P1 de alto valor e custo relativo baixo, e é a resposta estrutural a 3.4 e 3.11 ao mesmo
tempo.

### 3.12 Resumo: os cinco compromissos que saem desta seção

1. **Um motor de renderização só** — o que o editor mostra é o que o publish emite (3.1).
2. **O publish congela o output** — atualizar o builder nunca altera página publicada (3.2).
3. **Pegada mínima e auditável no tema** — inventário do que escrevemos, remoção completa (3.3, 3.4).
4. **O conteúdo sobrevive ao app** — HTML no tema, export estático, JSON aberto (3.4, 3.11).
5. **Performance é critério de aceite** — orçamento verificado no build, não promessa (3.7).
---

## 4. Tabela de priorização: recurso → prioridade

**Critério de corte**
- **P0 — essencial:** sem isso o D&VFly não é um page builder utilizável. É o escopo da Fase 3 (MVP).
- **P1 — importante:** entrega valor competitivo real; entra logo depois do MVP (Fase 4).
- **P2 — depois:** desejável, nicho, ou dependente de escala/IA. Backlog.

**Mudanças desta revisão.** A leitura direta revelou recursos que não estavam mapeados e mudou a
prioridade de alguns que estavam. As linhas marcadas com **🆕** são novas; as com **↕** mudaram de
prioridade, com a justificativa na própria linha.

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
| 🆕 Page Assignment em modo "todos os produtos / todas as coleções" | **P1** |
| Modo Auto vs. Custom nos elementos de produto | **P1** |
| 🆕 Compor com o tema: mostrar/esconder header, footer e seções do tema por página | **P1** |
| 🆕 Lixeira com restauração (excluir página nunca é destrutivo de imediato) | **P1** |
| Busca e filtro na lista de páginas | **P2** |

### 4.2 Editor

| Recurso | Prioridade |
|---|---|
| Editor em tela cheia com canvas + painel de blocos + painel de estilos | **P0** |
| 🆕 **Modelo de layout flex desde o início** (sem linha/coluna) — ver 2.5 | **P0** |
| Drag & drop, reordenar, duplicar, excluir elemento | **P0** |
| Hierarquia Seção → Bloco → Elemento | **P0** |
| Preview desktop / tablet / mobile | **P0** |
| Undo / redo | **P0** |
| Autosave / recuperação de rascunho | **P0** |
| 🆕 **Preview renderizado pelo mesmo compilador do publish**, dentro do CSS do tema — resposta direta a 3.1 | **P0** |
| Painel de estrutura (árvore da página) | **P1** |
| Copiar/colar elementos entre páginas | **P1** |
| 🆕 Copiar/colar **estilos** entre elementos do mesmo tipo | **P1** |
| 🆕 Breadcrumb de seleção (caminho do elemento na árvore) | **P1** |
| 🆕 Click Action por elemento (link, rolar até seção, abrir popup, e-mail, telefone) | **P1** |
| 🆕 Gerenciador de mídia próprio (upload, reúso, biblioteca) | **P1** |
| ↕ Edição inline de texto direto no canvas | **P0** *(era P1 — é o gesto mais frequente do editor; deixar para depois torna o MVP desagradável de usar)* |
| 🆕 Busca de parâmetro dentro do inspector | **P2** |
| 🆕 Aviso de edição simultânea (mesma página aberta em duas abas) | **P2** |
| Atalhos de teclado | **P2** |
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
| Bloco HTML/Liquid customizado | **P0** |
| ↕ **Repetidor genérico com estilo sincronizado** (o conceito do "content list") | **P0** *(era P1 — é o primitivo que substitui depoimentos, comparativos, benefícios e logos; construí-lo primeiro **reduz** o trabalho do MVP em vez de aumentá-lo)* |
| 🆕 **Elemento universal** — conversão de tipo (texto estático ↔ dado dinâmico) como propriedade do esquema | **P1** |
| Tabs / abas | **P1** |
| Slideshow / carrossel | **P1** |
| Lista de produtos (coleção) | **P1** |
| Lista de coleções | **P1** |
| Popup / modal | **P1** |
| 🆕 Botão de checkout dinâmico (Shop Pay / PayPal / Apple Pay) | **P1** |
| 🆕 Indicador de estoque baixo | **P1** |
| 🆕 Barra fixa de compra (sticky bar de produto) | **P1** |
| 🆕 Bloco de app do Shopify (app block do OS 2.0) | **P1** |
| Barra de progresso / meta | **P2** |
| Google Map | **P2** |
| Instagram / feeds sociais | **P2** |
| Tabela genérica | **P2** |
| QR code | **P2** |
| Áudio / SoundCloud | **P2** |
| Mídia 3D de produto | **P2** |
| 🆕 Comparador de imagens (antes/depois) | **P2** |
| 🆕 Formulário de busca | **P2** |
| 🆕 Blocos de blog (lista, título, conteúdo, meta) | **P2** |

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
| 🆕 **Tamanho em três modos** (preencher container / ajustar ao conteúdo / fixo) com min e max | **P0** |
| 🆕 **Controles de flex no container** (direção, gap H e V, alinhamento, distribuição, ordem invertida) | **P0** |
| ↕ **Herança de breakpoint explícita e visível** (mostrar se o valor é herdado ou próprio, com "limpar sobreposição") | **P0** *(era P1, como "herança em cascata" genérica — a seção 3.8 mostra que é aqui que o concorrente mais machuca o usuário)* |
| 🆕 **Isolamento de CSS por escopo próprio**, sem herança acidental do tema | **P0** |
| Sombra | **P1** |
| Estilos globais / tokens de marca (cores, fontes, botões) | **P1** |
| CSS customizado por página | **P1** |
| 🆕 CSS customizado por elemento | **P1** |
| Sticky (seção/elemento) | **P1** |
| Animação de entrada e hover | **P1** |
| 🆕 Fontes: do tema Shopify, do Google Fonts e upload próprio | **P1** |
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
| 🆕 **O publish congela o output** — atualizar o builder não altera página publicada | **P0** |
| 🆕 **HTML semântico correto por padrão** (link é `<a href>`, botão é `<button>`, hierarquia de headings) | **P0** |
| 🆕 **Inventário auditável do que o app escreve no tema**, com remoção completa | **P0** |
| 🆕 **Nada no storefront enquanto não houver página publicada** | **P0** |
| 🆕 **Aviso de orçamento de tamanho** no editor, antes do teto de 256 KB do template | **P1** |
| Publicação como template de tema (produto/coleção) | **P1** |
| Seções salvas / reutilizáveis | **P1** |
| Seção global com sincronização automática | **P1** |
| Gerar **seção Liquid nativa** editável no Theme Editor | **P1** |
| Export estático de HTML+CSS (anti-lock-in) | **P1** |
| 🆕 Export/import do documento de blocos em JSON aberto e documentado | **P1** |
| Orçamento de performance verificado no build (LCP/CLS/INP) | **P1** |
| ↕ Agendamento de publicação | **P1** *(era P2 — o campo `publishDate` já existe na API da Shopify, ver A.1; o custo é quase zero e o concorrente não tem)* |
| 🆕 Publicar página direto no menu de navegação do Shopify | **P2** |
| Diff visual entre versões | **P2** |

### 4.6 SEO

| Recurso | Prioridade |
|---|---|
| Título SEO, meta description e handle de URL | **P0** |
| Imagem Open Graph / Twitter card | **P0** |
| Validação de comprimento de título e descrição | **P1** |
| Alt text obrigatório/sugerido em imagens | **P1** |
| Heading hierarchy check (um H1, hierarquia correta) | **P1** |
| JSON-LD (Product, FAQPage, BreadcrumbList) | **P1** |
| 🆕 Detecção de JSON-LD já presente no tema, para não duplicar schema | **P1** |
| 🆕 Redirect automático ao trocar o handle da página (`redirectNewHandle`, ver A.1) | **P1** |
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
| 🆕 **Modelo de dados preparado para variantes de página desde o início** (o A/B test depois vira UI, não migração) | **P0** |
| Contagem de visualizações por página | **P1** |
| Conversão e receita por página | **P1** |
| A/B test (Control vs. Variant com divisão de tráfego) | **P1** |
| 🆕 Auditoria estática da página (um H1, alt text, hierarquia de headings, CTA presente, placeholders não preenchidos) — sem IA, só análise da árvore | **P1** |
| 🆕 IDs de rastreamento por elemento (medir clique em elemento nomeado) | **P2** |
| Heatmap de clique e rolagem | **P2** |
| Funnel analytics | **P2** |
| Desempenho por seção | **P2** |

### 4.9 Integrações e IA

| Recurso | Prioridade |
|---|---|
| Bloco HTML/Liquid (cobre a maior parte das integrações sem código dedicado) | **P0** |
| Bloco de reviews (Judge.me / Loox — o que a loja usar) | **P1** |
| Formulário → Klaviyo / e-mail da loja | **P1** |
| Geração de seção por IA a partir de prompt | **P2** |
| Auditoria de página por IA (o complemento visual da auditoria estática de 4.8) | **P2** |
| Geração de copy por IA | **P2** |
| Multi-idioma | **P2** |
| 🆕 Expor o builder por MCP (criar/editar/publicar página por conversa) | **P2** |
| 🆕 Variantes de página por Shopify Market | **P2** |
| 🆕 Gaveta de carrinho customizável | **P2** |

### 4.10 Resumo da priorização

| Prioridade | Nº de itens | Onde entra |
|---|---|---|
| **P0** | 56 | Fase 3 — MVP |
| **P1** | 54 | Fase 4 |
| **P2** | 35 | Backlog |
| **Total** | **145** | |

Os números acima foram **contados nas tabelas 4.1 a 4.9**, não estimados.

**Como o escopo mudou em relação à passada 1** (era 43 P0 / 37 P1 / 26 P2, total 106):

| | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Passada 1 | 43 | 37 | 26 | 106 |
| Itens novos (🆕) | +10 | +19 | +10 | **+39** |
| Repriorizados (↕) | +3 | −2 | −1 | 0 |
| **Esta revisão** | **56** | **54** | **35** | **145** |

- **39 itens novos.** A maioria veio de recursos que a leitura direta revelou e que a passada 1
  não tinha mapeado: layout flex, elemento universal, checkout dinâmico, indicador de estoque,
  sticky bar, app block do OS 2.0, comparador de imagens, composição com seções do tema, gaveta
  de carrinho, variantes por mercado, conector MCP, entre outros.
- **Quatro dos novos P0 vieram da seção 3**, e são os mais importantes de todos: o publish congela
  o output, HTML semântico correto por padrão, inventário auditável do que escrevemos no tema, e
  nada no storefront enquanto não houver página publicada. Nenhum deles é "recurso" no sentido de
  tela — são **invariantes de arquitetura**, e é exatamente por isso que precisam estar no MVP:
  depois não se acrescenta, se reescreve.
- **Quatro itens mudaram de prioridade**, todos subindo: edição inline de texto (P1→P0),
  repetidor genérico (P1→P0), herança de breakpoint explícita (P1→P0) e agendamento de publicação
  (P2→P1).

> O P0 cresceu de 43 para 47, mas **o MVP não ficou maior na mesma proporção**: dois dos quatro
> novos P0 (repetidor genérico e flex desde o início) *reduzem* trabalho, porque substituem blocos
> rígidos e evitam uma migração futura. Os outros dois são regras, não código adicional.
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
