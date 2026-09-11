# Pesquisa de mercado: PageFly — base funcional para o D&VFly

> **Documento de pesquisa — Fase 1 do projeto D&VFly.**
> Objetivo: mapear *o que* um page builder maduro para Shopify precisa fazer, usando o
> PageFly como referência de mercado, para definir o escopo funcional do D&VFly.

---

## 0. Metodologia, fontes e limitações

### 0.1 Como esta pesquisa foi feita

O levantamento foi feito por busca web sobre fontes públicas: central de ajuda do PageFly
(`help.pagefly.io`), blog de releases (`pagefly.io/blogs/shopify`), página do app na Shopify
App Store, páginas de produto/preços, além de reviews e comparativos independentes
(Trustpilot, G2, Capterra, GetApp, blogs de agências e de concorrentes).

### 0.2 Limitação técnica relevante

O ambiente desta sessão roda atrás de um **proxy de egresso que bloqueia acesso HTTP direto**
a `help.pagefly.io`, `pagefly.io`, `apps.shopify.com`, `shopify.dev` e aos blogs de terceiros.
Só a ferramenta de busca web está liberada. Consequência prática:

- O conteúdo abaixo vem de **resultados de busca e sínteses de páginas**, não de leitura
  integral das páginas originais.
- Números específicos (quantidade exata de elementos, de templates, preços) devem ser tratados
  como **aproximações de ordem de grandeza**, não como dados auditados. Onde há incerteza, está
  marcado com ⚠️.
- Listas de elementos podem estar **incompletas** — a documentação do PageFly tem uma página por
  elemento e não foi possível varrer todas.

Isso **não compromete** o objetivo da Fase 1: o que precisamos é do *mapa funcional* e da
*ordem de prioridade*, e ambos estão sólidos. Se em algum momento você quiser precisão de
catálogo (ex.: contagem exata de elementos), dá para revisitar com o proxy liberado para esses
domínios.

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

### 1.1 Tipos de página suportados

O PageFly trabalha com **6 tipos de página**, e cada tipo tem regras de publicação diferentes:

| Tipo | O que é | Como se conecta ao Shopify |
|---|---|---|
| **Regular / Landing** | Página avulsa: Sobre, Contato, FAQ, landing de campanha | Cria uma *Page* no Shopify com URL próprio (`/pages/handle`) |
| **Home** | Substitui a home da loja | Vira o template da home no tema |
| **Produto** | Layout customizado de página de produto | Template alternativo de produto, atribuído a 1..N produtos |
| **Coleção** | Layout customizado de página de coleção | Template alternativo de coleção, atribuído a 1..N coleções |
| **Blog post** | Layout customizado de artigo | Template alternativo de artigo |
| **Password** | Página de "loja em construção" / captura de e-mail | Template de password page do tema |

**Conceito-chave: Page Assignment.** Páginas de produto e coleção funcionam como **templates**.
Você desenha uma vez e atribui a vários produtos/coleções. Os elementos de produto operam em
dois modos:

- **Auto** — o elemento puxa os dados do produto/coleção do contexto da página (o produto que o
  visitante está vendo).
- **Custom** — o elemento é fixado em um produto específico, independente do contexto (útil para
  cross-sell dentro de uma landing).

Esse par Auto/Custom é uma abstração muito boa e vale copiar como conceito no D&VFly.

### 1.2 Estrutura e sistema de layout

- Hierarquia em árvore: **Seção → Linha/Row → Coluna → Elemento**.
- Grid responsivo baseado em colunas, com controle de largura por breakpoint.
- **Page Outline** — painel de árvore navegável da estrutura da página (melhorado na 3.24).
- Seções full-width vs. contidas (largura máxima de container).
- Seções fixas (*sticky*) — a seção gruda no topo ao rolar.
- Drag & drop com reordenação, duplicar, copiar/colar entre páginas (refinado na 4.19),
  e colagem que preserva estilos.

### 1.3 Biblioteca de elementos/blocos

O PageFly organiza os elementos em famílias. Abaixo, o inventário consolidado (⚠️ possivelmente
incompleto — ver 0.2):

#### a) Containers / estrutura
Layout (linha/coluna), Slideshow / Carrossel, Popup / Modal, Tabs (abas),
Accordion (sanfona), Content List (lista de conteúdo repetível — a base de depoimentos,
cards de benefícios, tabelas comparativas etc.).

> O **Content List** é o elemento mais inteligente do conjunto: é um repetidor genérico com
> estilos sincronizados entre itens (melhorado na 4.18). Um único primitivo que gera dezenas de
> blocos de UI. Vale muito replicar o conceito.

#### b) Básicos
Heading (título), Paragraph (texto), Button (botão), List (lista), Icon (ícone),
Divider (divisor), Spacer (espaçador), HTML/Liquid (bloco de código).

#### c) Mídia
Image (imagem), Image Gallery, YouTube, Vimeo, HTML5 Video (vídeo próprio),
SoundCloud, mídia 3D de produto (a partir da 3.9/3.18), Parallax, Lazy loading.

#### d) Social
Instagram feed, Facebook like/share, Facebook feed, Twitter/X feed, botões de compartilhamento.

#### e) Avançados
Countdown (contador regressivo), Table (tabela), Google Map, Progress bar,
QR code, Mailchimp form, Tabela de preços/comparação (via Content List/Table).

#### f) Elementos Shopify (comércio — os que puxam dados da loja)

| Grupo | Elementos |
|---|---|
| Produto | Product Details (bloco completo), Product Title, Product Price, Compare-at Price, Product Image/Media (com vídeo e 3D), Product Variant / Variant Picker (dropdown, radio, swatch de imagem, swatch de cor), Product Quantity (+/−), Add to Cart, Buy Now, Product Description, Product View Details (link p/ página do produto), Product Metafield, Low-in-stock / estoque, Badges & selos |
| Listagem | Product List (com paginação, filtros básicos, ordenação), Collection List, Related/Recommended products |
| Conteúdo | Blog List, Blog Post, Blog Post Meta (autor, data, tags) |
| Formulários | Contact Form + Contact Form Field + Contact Form Button, Customer Form (cadastro/login), Newsletter |
| Reviews | Reviews & Ratings (nativos + via integração) |

**Campos de formulário suportados:** e-mail, texto de linha única, texto multilinha, escolha
única (radio), checkbox, dropdown, número, data, hora. Envio vai para o e-mail da loja
(Settings → Store details), com mensagens de sucesso/erro configuráveis e redirect pós-envio.

#### g) Elementos de terceiros
Uma aba dedicada expõe elementos injetados por apps integrados (reviews, upsell, wishlist,
subscription, tracking etc.). ⚠️ Material de marketing cita "130+ integrações".

### 1.4 Seções, seções salvas e templates

| Recurso | Descrição |
|---|---|
| **Premade sections** | Biblioteca de seções prontas para arrastar dentro de uma página |
| **Saved sections** | Você salva uma seção sua e reusa em outras páginas |
| **Global sections** | Seção publicada como entidade própria; alterações **sincronizam automaticamente** em todos os lugares onde foi usada (introduzido na 3.18/3.19) |
| **Seção no tema Shopify** | Seções publicadas aparecem no Theme Editor do Shopify como um bloco "seção do app", podendo ser inseridas em qualquer template OS 2.0 |
| **Templates de página** | ⚠️ "320+" templates, filtráveis por tipo de página (home, produto, coleção, landing, FAQ, sobre, contato) e por nicho/objetivo de campanha |

A ponte com o **Theme Editor do Shopify** é estrategicamente importante: permite usar o builder
para *pedaços* de páginas nativas, sem substituir o template inteiro. É um recurso P1 forte.

### 1.5 Controles de estilo

| Categoria | Controles |
|---|---|
| **Espaçamento** | Margin e padding por lado, em `px` ou `%`, **por breakpoint** |
| **Tipografia** | Família, peso, tamanho, altura de linha, espaçamento de letras, transformação, alinhamento, cor — por breakpoint. Integração com as fontes do tema Shopify (4.19) |
| **Cores & fundo** | Cor sólida, gradiente, imagem de fundo, overlay, opacidade; color picker com paleta (melhorado na 4.18) |
| **Bordas** | Largura, estilo, cor, raio por canto |
| **Sombra** | Box-shadow e text-shadow |
| **Dimensões** | Largura/altura, min/max, largura total vs. contida |
| **Posição** | Estático, relativo, absoluto, sticky; z-index |
| **Visibilidade** | Esconder/mostrar elemento **por breakpoint** |
| **Global styles** | Definições de marca (tipografia, cores, botões) aplicadas ao site inteiro; ganharam suporte responsivo na 4.13 |
| **Código** | Editores de CSS, JavaScript e HTML/Liquid por página |

**Breakpoints:** desktop, laptop, tablet e mobile, com um seletor de dispositivo no topo do
editor. Cada propriedade pode ter valor próprio por breakpoint (cascata do maior para o menor).

### 1.6 Interações e animações

- Animação de entrada (quando o elemento fica visível) e no hover (mouse over).
- Parallax em imagens de fundo.
- Popup/modal acionado por clique, tempo ou intenção de saída. ⚠️
- Sticky sections/elementos.
- Countdown com modos "data fixa" e "recorrente/evergreen". ⚠️

> ⚠️ Comparativos de concorrentes apontam que as **animações do PageFly são limitadas** frente a
> GemPages. Isso é uma brecha, não uma referência a seguir.

### 1.7 Experiência do editor

- Editor em tela cheia, canvas central com painéis laterais (blocos à esquerda, estilos à direita).
- Seletor de dispositivo para preview/edição responsiva.
- Painel de estrutura (Page Outline).
- **Autosave / Auto Backup** — ao reabrir o editor, oferece restaurar alterações não salvas.
- **Version History** — ⚠️ guarda as ~50 versões salvas mais recentes; permite pré-visualizar
  antes de restaurar, com confirmação.
- Undo/redo, copiar/colar de elementos e seções entre páginas.
- Preview da página antes de publicar.
- Editores de código embutidos (CSS/JS/HTML/Liquid).
- Atalhos de teclado. ⚠️
- UI administrativa em Shopify Polaris (migrada para Polaris v12 na 4.6).

### 1.8 Publicação e versionamento

- **Publicar / despublicar** por página.
- Página regular despublicada **permanece** na lista de páginas do Shopify (comportamento
  ajustado na 3.25) — evita quebrar links.
- Versionamento com restauração (ver 1.7).
- Script auxiliar entregue via **Theme App Extension** (migração feita na 4.14), habilitável
  de dentro do app, sem o merchant precisar ir no App Embeds do tema.
- O app cria/mantém um arquivo de layout próprio no tema (um `theme.*.liquid` derivado do
  `theme.liquid` do tema, com os ajustes que o app precisa).
- ⚠️ Não há agendamento de publicação nativo (apontado como lacuna em comparativos).

### 1.9 SEO

- Título SEO, meta description e handle de URL por página.
- Validação de comprimento recomendado para título e meta description.
- Configuração equivalente para artigos de blog.
- ⚠️ Open Graph / imagem de compartilhamento: não confirmado como campo nativo dedicado;
  pode depender de app de SEO externo ou de código customizado.
- Integração com apps de SEO de terceiros (ex.: SEOAnt).
- Suporte a tradução via Weglot e Langify (o conteúdo do builder é traduzível).

### 1.10 Analytics, heatmap e A/B testing

Esta é a camada onde o PageFly se reposicionou de "page builder" para "plataforma de CRO"
(2025–2026):

| Recurso | Descrição |
|---|---|
| **Dashboard Analytics** | Sessões, taxa de conversão, receita por visitante, por página |
| **Section performance** | Desempenho por seção da página |
| **Heatmaps** | Mapas de clique e de rolagem, nativos (sem app externo) |
| **A/B Experiments** | Duplica a página em Control + Variant, divide o tráfego, usa estatística **bayesiana** para declarar vencedor; recomendação de rodar ≥7 dias, ≥500 visitantes e ≥10 conversões por versão |
| **Funnel analytics** | Identificação de pontos de abandono no funil |

Tudo roda sobre o mesmo script que o app já injeta — argumento de "não precisa de outra tag".

### 1.11 Recursos de IA (2024–2026)

- **AI Section Generator** — gera uma seção completa (conteúdo + layout + estilo) a partir de
  um prompt, com um "prompt builder" auxiliar.
- **AI Smart Pages** — gera página de vendas inteira, com personalização por localização,
  tipo de cliente e origem de tráfego.
- **AI copywriting** — textos orientados a benefício e gatilhos de decisão.
- **Page Checkup** — auditoria automática da página em SEO, copy, layout e sinais de conversão,
  com nota de saúde e lista priorizada de correções.
- **Gerador de descrição de produto** (ferramenta gratuita de marketing, fora do app).
- Modelo de **créditos de IA** por plano (⚠️ free ≈ 10 créditos/mês).

### 1.12 Integrações

⚠️ Material de marketing cita **130+ integrações**. As famílias confirmadas:

| Categoria | Exemplos citados |
|---|---|
| Reviews / UGC | Judge.me, Loox, Yotpo, Opinew, Stamped.io, Fera, Okendo, Junip, Growave, Reputon |
| E-mail / marketing | Klaviyo, Mailchimp, AiTrillion |
| Tradução | Weglot, Langify |
| Assinaturas | Recurpay |
| Rastreio / pós-venda | Track123 |
| Vídeo / galeria | Minta, Enorm |
| SEO | SEOAnt |
| Consentimento / GDPR | Consentmo |
| Loyalty | AiTrillion, Growave |

O mecanismo é sempre o mesmo: o app de terceiros expõe um snippet/bloco e o PageFly o embrulha
como um "elemento de terceiro" arrastável.

### 1.13 Estratégia de performance (declarada)

- Lazy loading de imagens.
- Script auxiliar movido para Theme App Extension, consolidando o JS necessário.
- "Código otimizado" e "global styling" como argumentos de venda.
- Otimização de velocidade oferecida como **serviço do plano mais caro** — o que, lido ao
  contrário, admite que o padrão não é ótimo.

### 1.14 Modelo comercial e limites (contexto, não requisito)

⚠️ Preços de 2026, sujeitos a variação:

| Plano | Preço | Slots publicados |
|---|---|---|
| Free | US$ 0 | 1 página ou seção |
| Pay As You Go / Builder | a partir de ~US$ 24/mês | 5 slots, +US$ 4,80 por slot extra |
| Unlimited | US$ 99/mês (~US$ 82,50 anual) | ilimitado + suporte prioritário + serviço de otimização |

Um **slot** = uma página **ou** seção publicada. Não há travamento de funcionalidade entre
planos — o gate é puramente de quantidade. Para downgrade, é preciso despublicar até caber no
limite.

> **Relevância para o D&VFly:** nenhuma. Como app privado da sua loja, não existe slot, plano
> nem limite. Isso já é, por si só, uma vantagem estrutural — e elimina toda a complexidade de
> billing, que no PageFly é fonte constante de atrito.

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
