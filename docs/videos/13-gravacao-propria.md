# RELATÓRIO 13 — `dvfly-pagefly-gravacao.mp4` (gravação própria)

**Origem:** arquivo no Google Drive do time · **Duração:** 6:07 (367 s) · **Sem áudio/narração**
**Loja real:** Ofertas Colombianas (Colômbia, COP) · **Data na tela:** 9 de set. de 2026 · **Relógio final:** 10:15
**Idioma da interface:** **português (pt-BR)** — primeira fonte nossa em português
**Método:** 24 pontos amostrados ao longo do vídeo, capturados em tela cheia. Tudo abaixo foi **lido nos frames**.

> ## ⭐ POR QUE ESTE RELATÓRIO É O MAIS IMPORTANTE
> É a **única fonte em português**, a **única numa loja real em produção** (40 slots usados, 25+ páginas, receita real) e a **única que mostra páginas do editor LEGADO** convivendo com o editor novo.
> Cobre cinco telas que **nenhum dos doze vídeos anteriores abriu**: a listagem **Páginas**, o painel **Configurações da página**, o popover **Publicar página**, o **editor de código HTML/Líquido** e o convite de **teste A/B**.
> **Hierarquia de confiança atualizada: 13 (português, produção) > 02 > 03 > 05 > 08 > 09/10/11/12 > 04 > 01.**

---

## 1. RESUMO

Gravação de tela, sem narração, de um operador navegando pelo PageFly numa loja Shopify colombiana real: lista de páginas → abre uma página legado → inspeciona elementos de código → configurações da página → publica → confere no editor de temas → confere na loja ao vivo.

O valor não está no fluxo (que já conhecíamos) e sim em **quais telas aparecem** e **como estão traduzidas**: é o mapa mais completo da interface administrativa do PageFly que temos.

Revela também três coisas que mudam decisões nossas: a **estrutura do editor legado** (Seção/Linha/Coluna) diferente da nova (Flex section/Flex block), o **modelo de vínculo página↔produto/post** via "Nome do modelo", e **falhas de tradução em produção**.

---

## 2. TELA A — MENU DO PAGEFLY NO ADMIN DA SHOPIFY

**Onde:** barra lateral esquerda do admin, grupo **Apps**.

```
Apps ›
├── EasySell COD Form
├── PageFly AI Page Builder        ← nome completo do app na sidebar
│   ├── Páginas                    ← selecionado
│   ├── Seções
│   ├── Análise
│   ├── Central de CRO
│   ├── Motor de Vendas
│   ├── Preços
│   └── Ver mais
└── Dropify
```

Acima, itens nativos da Shopify: `Início · Pedidos (9.999+) · Produtos · Clientes · Crescimento · Descontos · Conteúdo · Mercados · Análises`
Grupo `Canais de vendas`: `Ponto de venda · Loja virtual · Agêntico`
Rodapé: `Conversas com o Sidekick ›` · `Ver data de criação dos produt…` · `Configurações`

> **Sete itens de menu, não cinco.** O relatório 02 (frames em inglês) só mostrava Pages, Sections, Analytics, Extra functions, Preferences. Aqui aparecem **Central de CRO**, **Motor de Vendas** e **Preços** — e existe um **"Ver mais"**, ou seja, a lista é truncada e há ainda mais itens.
> Isso confirma a suspeita do relatório 04: o menu varia por conta/plano.

---

## 3. TELA B — LISTAGEM "PÁGINAS" (nunca documentada)

**Anatomia, de cima para baixo:**

### 3.1 Cabeçalho
- Ícone do app + breadcrumb `· Páginas`
- Título **"Páginas"**
- Canto direito: **"Novidades"** e **"⋯"**

### 3.2 Barra de ações
- Esquerda: ícone + texto **"Usando 40 slots"** ← **contador de consumo do plano, sempre visível**
- Direita, nesta ordem: **Importar** · **Exportar** · **Criar a partir do modelo ⌄** · **✦ Criar página em branco** (botão primário escuro)

### 3.3 Banner promocional (dispensável)
Card com ícone de app, texto em inglês *"Trooix - Need an age check or terms agreement before checkout? …"*, botão **"Free to install"** e **"×"**.
> Publicidade de app parceiro **na listagem de páginas**, não só no inspetor de elemento (relatórios 09 e 10). É sistêmico.

### 3.4 Abas de filtro por tipo
`All | Regular | Home | Product | Collection | Blog post | Password | +`
À direita: ícone de **busca**, ícone de **ordenação/filtro** e um terceiro ícone.
> As abas estão **em inglês** enquanto todo o resto da tela está em português. Falha de tradução.
> O **"+"** no fim sugere abas customizáveis (visão salva?) — não demonstrado.

### 3.5 Cabeçalhos da tabela
`Título · Estado · Heatmap · A/B Test · Tipo · Última atualização`

### 3.6 Anatomia de uma linha
| Coluna | Conteúdo observado |
|---|---|
| checkbox | seleção |
| **Título** | nome da página + badge **"Legado"** · segunda linha: **"Visualização ao vivo não disponível"** ou **"1 produto"** |
| **Estado** | ○ **Despublicado** (com bolinha) |
| **Heatmap** | um **toggle** + ícone **ⓘ** |
| **A/B Test** | **"--"** (vazio) |
| **Tipo** | **Blogue** ou **Produto** |
| **Última atualização** | "33 minutes ago" *(em inglês)* |
| ações | ícone de **gráfico/estatística** e ícone de **olho** |

### 3.7 Barra de seleção em massa
Aparece ao marcar linhas: **"25 selected  Select all 25+ items"** *(em inglês)*, com ações **Publicar** e **Despublicar** (esta desabilitada) e **"⋯"**.

> **Heatmap e A/B Test são colunas da listagem**, não recursos escondidos no editor. O operador liga o heatmap por página direto da lista.

---

## 4. TELA C — O EDITOR (página do tipo LEGADO)

### 4.1 Barra superior, linha 1
- Ícone + **"PageFly Page Editor"** *(em inglês, não traduzido)*
- Direita: **Publicar** (escuro) · **×**
- **Com alterações pendentes** vira: ⚠ **"Alterações não salvas"** · **Descartar** · **Salvar**

### 4.2 Barra superior, linha 2
`[ícone] El error que millones repiten cada día` · badge **Legado** · badge **○ Despublicado**
… espaço …
**Flymate** · 4 ícones de dispositivo · **1228px, 100%** · ícone de ajuste · **↺ ↻** · 👁 **Pré-visualizar** · 🖥 **Ver ao vivo** *(cinza)*

Valores de breakpoint observados neste vídeo: **1228px, 100%** (desktop) e **320px, 100%** (celular).
> Confirma pela quarta vez que o par `largura, zoom` é calculado.

### 4.3 Trilho de ícones (esquerda)
7 ícones no grupo superior + 4 no inferior. Um dos ícones inferiores exibe um **badge numérico "1"** (notificação/pendência) — **detalhe novo**, nunca visto nos vídeos em inglês.

### 4.4 Painel esquerdo — árvore de uma página LEGADO
```
PageFly body
└── Seção
    └── Linha
        └── Coluna
            ├── </> Código GTM        ⋯  👁
            ├── </> Landing Page
            └── </> HTML/Líquido
⊕ Adicionar seção  (rótulo: "Add section" em inglês em alguns frames)

Header
└── Theme header
Footer
└── Theme footer
```

> ## ⚠️ ACHADO ESTRUTURAL CRÍTICO
> Páginas **Legado** usam **Seção → Linha → Coluna** (Section → Row → Column), o modelo clássico de grid.
> Páginas novas usam **Flex section → Flex block** (relatórios 02, 05, 08, 09).
> **São dois modelos de layout convivendo no mesmo produto**, distinguidos por um badge "Legado".
> **Decisão para o D&VFly:** escolher UM modelo desde o início. Suportar dois é o que obriga o PageFly a manter dois editores, dois conjuntos de elementos e um badge de aviso em cada página antiga.

### 4.5 Painel direito — estado vazio (em português)
- **"Customize your pages"** *(em inglês)*
- "Select an element from the canvas or page outline to view its settings here." *(em inglês)*
- "A página do PageFly funciona como uma seção em seu tema do Shopify. Para editar as seções do tema, visite o editor de temas. **Saiba mais**" *(traduzido)*
- Link **"Ir para o editor de temas"** — **cinza/desabilitado** enquanto a página não está publicada; **habilitado** depois de publicar
- Bloco **"Atalhos de teclado"** (traduzido)

### 4.6 Atalhos de teclado — versão em PORTUGUÊS
| Teclas | Ação (pt-BR) |
|---|---|
| `hold` + `ctrl` | **Selecionar vários** |
| `ctrl` + `shift` + `S` | **Salvar & publicar** |
| `ctrl` + `S` | **Salvar** |
| `ctrl` + `shift` + `Z` | **Refazer** |
| `ctrl` + `Z` | **Desfazer** |
| `ctrl` + `D` | **Duplicar** |
| `delete` | **Excluir** |
| `ctrl` + `C` | **Copiar estilo** |
| `ctrl` + `V` | **Colar estilo** |

Confirma integralmente a lista do relatório 04, incluindo `ctrl+C`/`ctrl+V` = **estilo**, não elemento.

---

## 5. TELA D — ELEMENTOS DE CÓDIGO

### 5.1 Elemento "Landing Page" (código Líquido)
Breadcrumb: `Seção / Linha / Coluna / Landing Page`
Painel direito: abas **Geral | Estilo**
- Seção **"Conteúdo"**
- Botão **"✎ Abrir editor de código"**
- Nota em cinza: *"O código Líquido incorporado só funciona na página ativa."*

### 5.2 Elemento "HTML/Líquido" + gaveta de código
**No canvas**, o elemento em estado vazio mostra:
- Título **"HTML/Líquido"**
- Caixa âmbar: *"Para adicionar código HTML/Líquido, clique em **Abrir editor de código** na barra lateral direita."*

**A gaveta de código** (abre pela direita, sobre o painel):
- Título **"Editor de código HTML/Líquido"** + **×**
- Nota: *"O código Líquido incorporado só funciona na página ativa."*
- Área de código com **numeração de linha** (`1`)
- Rodapé: **Cancelar** | **Terminado** (escuro)

> Dois elementos diferentes para código (**Landing Page** e **HTML/Líquido**), ambos abrindo o mesmo tipo de editor. Provável resquício de versões — vale não repetir.

### 5.3 Elemento "Código GTM"
Presente na árvore com ícone `</>`. Ao passar o mouse, a linha mostra **"⋯"** e **👁**. Painel não aberto no vídeo.

---

## 6. TELA E — "MODELOS DA PÁGINA" (drawer de templates em PT)

- Título **"Modelos da página"**
- Campo **"Pesquisar"** + controle **"Classificar"**
- Filtros: **Tipo ⌄ · Indústria ⌄ · Estilo ⌄ · Recurso/Característica ⌄ · Coleção ⌄**
- Contador: **"128 de 129 modelos"**
- Grade de 4 cards por linha; no hover surgem **Pré-visualizar** e **Selecionar**
- Prova social por card — **e aqui aparece a falha**: "Usada em 1731 página" (singular errado), "**Used on 6862 pages**" (não traduzido), "Usada em 5685 páginas" (certo). **Três formas diferentes na mesma tela.**

**Painel direito:**
- "Selecione ou visualize mais de 100 modelos feitos à mão."
- "Modelos de página / Saiba mais"
- "Localize, visualize e selecione modelos de página pré-criados. Essa gaveta serve apenas para gerenciamento. Você pode editar um modelo depois de adicioná-lo à tela."
- **"Pré-visualização: {{templateName}}"** ← **placeholder de template cru vazando na interface**

---

## 7. TELA F — "CONFIGURAÇÕES DA PÁGINA" (nunca documentada)

Abre no **painel ESQUERDO** (não no direito). O conteúdo **muda conforme o tipo de página**.

### 7.1 Variante: página de **Postagem do blogue**
```
Configurações da página

Título da página
[ El error que millones repiten cada día ]

Tipo de página
[ Postagem do blogue                   ⌄ ]

Origem de postagem do blogue
[ El error que millones repiten cada día ]   (desabilitado)

Quando essa página for publicada, ela será vinculada a uma postagem
de blogue do Shopify, onde você poderá definir as configurações de
SEO, trecho, autor, blogue pai, tags etc.

🔗 Ir para a postagem do blogue vinculada        (desabilitado)

URL da página
[ /blogs/ ][ millones-repiten ]

Nome do modelo
[ pf-099a56b4 ]

▾ Seções do tema
  ☐ Mostrar cabeçalho e rodapé
  Você ainda pode adicionar mais seções no editor de temas depois
  que esta página for publicada.
  🔗 Ir para o editor de temas                   (desabilitado)

▾ Otimização
  ☐ Ativar o carregamento preguiçoso de imagens  ⓘ
  Recomendamos usar o Google PageSpeed Insights para identificar…
```

**Painel direito correspondente:**
- "Altere as configurações de sua página" + badge **"Importante"** (âmbar)
- "Visualizar e editar as configurações e informações de sua página. **Saiba mais**"
- "**Configurações da página de postagem do blogue** — Você pode atribuir essa página a diferentes posts de blogue usando o nome do modelo de tema. Você também pode criar postagens de blog totalmente novas com o PageFly, fornecendo à página da postagem do blogue um URL original."

### 7.2 Variante: página de **Produto**
```
Título da página   [ 250-CO-S-semilla ]
Tipo de página     [ Produto                    ⌄ ]
URL da página      [ /products/ ][ (product-name) ]   (desabilitado)
🔗 Atribua esta página aos seus produtos para aplicar o design a eles.
Nome do modelo     [ pf-4f4ffdfa ]  [⧉ copiar]   ← ícone de copiar aparece após publicar
Assim que esta página for publicada, ela será mostrada aos visitantes
da sua loja quando eles acessarem qualquer um dos produtos atribuídos.
▾ Seções do tema   ☐ Mostrar cabeçalho e rodapé
▾ Otimização
```

**Painel direito:** "**Configurações da página do produto** — Os produtos aos quais uma página de produto foi atribuída adotarão seu design. Os URLs das páginas de produtos são os URLs originais dos produtos. Clicar no link de um produto atribuído abrirá essa página."

> ## 🔑 O MODELO DE VÍNCULO (a parte mais importante deste relatório)
> **"Nome do modelo"** (`pf-099a56b4`, `pf-4f4ffdfa`) é a **chave que liga a página PageFly ao tema da Shopify**.
> - Numa página de **produto**, a URL é a do **próprio produto** — a página PageFly é o **template** que aqueles produtos adotam.
> - Numa página de **blog**, o PageFly cria um post real com URL própria sob `/blogs/`.
> - O nome do modelo é **copiável** (ícone ⧉) — porque é ele que se seleciona no editor de temas.
>
> **Ou seja: o PageFly não "cria páginas soltas". Ele cria templates de tema nomeados e os atribui a recursos da loja.** Isso explica o badge "Visualização ao vivo não disponível" das páginas não atribuídas, e é a decisão de arquitetura mais estrutural que vimos em treze relatórios.

---

## 8. TELA G — POPOVER "PUBLICAR PÁGINA"

Ancorado ao botão **Publicar**, abre logo abaixo dele:
```
Publicar página

Título da página *
[ El error que millones repiten cada día ]

URL da página *
[ /blogs/ ][ millones-repiten ]

[ News                                  ⌄ ]   ← blogue de destino

[ Publicar ]
```
> Dois campos **obrigatórios** (asterisco) e a escolha do **blogue de destino**. Publicar não é um clique só — é um mini-formulário.

---

## 9. TELA H — ESTADOS DE PUBLICAÇÃO

| Momento | Badge na barra | Botão | "Ver ao vivo" |
|---|---|---|---|
| Rascunho | **○ Despublicado** | Publicar | cinza |
| Durante | **○ Publicando…** | spinner no botão | cinza |
| Publicado | **● Publicado** (verde) + link **Despublicar** | Publicar | **habilitado** |

Depois de publicar, no painel de Configurações da página:
- **"Ir para o editor de temas"** deixa de ser cinza
- **"Nome do modelo"** ganha o **ícone de copiar**

### 9.1 Convite de teste A/B (pós-publicação)
Popover que aparece sozinho perto do topo:
```
Veja qual versão vence
Rode um teste A/B nesta página para descobrir qual versão
converte melhor.
              [ Agora não ]  [ Iniciar teste A/B ]
```
> **O produto pede o A/B test no momento certo** — logo depois de publicar, quando a página acabou de ficar viva. Não é um item de menu esperando ser descoberto. E oferece saída explícita ("Agora não").

---

## 10. TELA I — EDITOR DE TEMAS DA SHOPIFY COM A PÁGINA PAGEFLY

**Barra superior:** ← · 3 ícones de visualização · `sh-pro-es` + badge verde **Ativo** · **Padrão da loja** · **pf-4f4ffdfa** ← *(seletor de template)* · ícones à direita · **Salvar**

**Painel esquerdo:**
```
pf-4f4ffdfa
Atribuído a 1 produto
[img] Pré-visualização: Aceite de Calabaza y Saw P…   ✎

Modelo
├── Informações do produto
├── Horizontal Ticker
├── Section divider
├── Produtos relacionados
├── Custom columns
├── Image/Video Slider
├── Testimonials
├── Anreviews Product Section
├── Apps
└── PageFly Page 4f4ffdfa      ← o App Block
⊕ Adicionar seção
```

**No canvas:** a seção renderiza com a etiqueta azul **"PageFly Page 4f4ffdfa"**.

**Rodapé do preview:** `sh-pro-es` · **View as** · 🇧🇷 **Brasil** · **Espanhol** · **⋯** · **Edit theme**

> Confirma e completa o relatório 06: a página PageFly entra no tema como **uma seção entre as seções nativas**, identificada pelo **nome do modelo**, e o template mostra **a quantos produtos está atribuído**.

---

## 11. TELA J — LOJA AO VIVO

Página de produto publicada, no tema, renderizando:
- Barra de anúncio: `PAGO CONTRA ENTREGA · ENVÍO GRATIS · TIENDA HASTA UN 70% OFF`
- Header com menu hambúrguer, logo "Ofertas Colombianas", busca e carrinho
- Badges `+7548 VENDIDO` e `ÚLTIMAS UNIDADES`
- Avaliação `4.9 (397 reseñas)`
- Preço riscado + preço + badge de desconto
- Bullets de confiança (pago contra entrega, entrega rápida, calidad garantizada)
- CTA de duas linhas: **"Pedir Ahora y Pagar al Recibir / Llega en 2 a 5 días"**
- Carrossel de depoimentos com bolinhas
- Faixa de estatísticas (`+50mil ventas concretadas`, etc.)
- Bloco de garantia de 90 dias
- Rodapé completo com contato, links legais e **dois blocos de disclaimer** (resultados e plataforma)

---

## 12. FALHAS DE TRADUÇÃO ENCONTRADAS (não copiar)

| Onde | O que aparece | Deveria |
|---|---|---|
| Drawer de templates | **`Pré-visualização: {{templateName}}`** | placeholder interpolado |
| Drawer de templates | `Used on 6862 pages` | "Usada em … páginas" |
| Drawer de templates | `Usada em 1731 página` | plural |
| Listagem Páginas | Abas `All / Regular / Home / Product / Collection / Blog post / Password` | traduzidas |
| Listagem Páginas | `25 selected · Select all 25+ items` | traduzido |
| Listagem Páginas | `33 minutes ago` | "há 33 minutos" |
| Editor | `PageFly Page Editor` | traduzido |
| Painel direito | `Customize your pages` + descrição | traduzido |
| Árvore | `Add section` × `Adicionar seção` (alterna) | um só |

Somando com as chaves cruas do relatório 05 (`flymate_tone_persuasive`, `flymate_creds_used`, `flymate_layout_quick_template_text`), são **doze pontos de falha de i18n em produção**.

> **Ação concreta para o D&VFly:** teste automatizado que falhe o build quando (a) uma chave crua (`[a-z]+_[a-z_]+`) ou (b) um placeholder `{{…}}` aparecer em texto renderizado, e (c) lint de cobertura de tradução por locale.
> *(Registrado como regra para QUANDO houver camada de i18n — hoje a interface é pt-BR
> escrita à mão, sem chaves, então não há o que vazar.)*

---

## 13. O QUE ISSO DECIDE PARA O D&VFLY

**Adotar:**
1. **Contador de slots no cabeçalho da listagem** ("Usando 40 slots") — o limite do plano visível antes de esbarrar nele. *(Nossa versão honesta: não temos slots nem limites de plano — mostramos "N páginas · M no ar", contado dos dados.)*
2. **Heatmap e A/B Test como colunas da listagem**, com toggle por linha — recursos de otimização ao lado da página, não escondidos. *(Padrão anotado; heatmap/A-B seguem fora de escopo — ❌ decidido.)*
3. **Configurações da página que mudam conforme o tipo** — campos, textos de ajuda e links diferentes para blog, produto, coleção.
4. **Convite de A/B test logo após publicar**, com "Agora não". *(Padrão "oferta no momento certo, com saída" — anotado para quando houver algo a oferecer pós-publicação.)*
5. **Ações em massa** (publicar/despublicar) com seleção e contador.
6. **Publicar como mini-formulário** com campos obrigatórios, não clique único.
7. **Habilitar/desabilitar com estado visível** — "Ir para o editor de temas" cinza até publicar. *(Já é regra nossa no CLAUDE.md.)*

**Evitar:**
1. **Dois modelos de layout coexistindo** (Seção/Linha/Coluna vs Flex). Escolher um. *(Nosso: um só desde o dia 1 — a árvore de blocos do compilador.)*
2. **Dois elementos diferentes para a mesma coisa** (Landing Page e HTML/Líquido). *(Nosso: um bloco HTML.)*
3. **Publicidade de parceiros na listagem e no inspetor.**
4. **Interface meio traduzida.** *(Nosso: um idioma só, pt-BR, escrito à mão.)*

**Decidir cedo:**
- **O modelo de vínculo.** Página PageFly = **template de tema nomeado** (`pf-xxxxxxxx`) atribuído a produtos/posts, e não uma página avulsa com URL própria. Isso define URL, SEO, preview, publicação e integração com o tema — tudo de uma vez. É a decisão mais cara de mudar depois. *(Decisão registrada em `docs/MODELOS_DE_TEMA.md` — nosso desenho já é exatamente esse.)*

---

## 14. PENDÊNCIAS QUE ESTE VÍDEO NÃO RESOLVE

| Pendência | Origem |
|---|---|
| **Sync item / Object unsynced** | Rel. 11 |
| Telas **Seções**, **Análise**, **Central de CRO**, **Motor de Vendas** do menu do app | Rel. 13 (novas) |
| O que há em **"Ver mais"** do menu | Rel. 13 (nova) |
| Painel do **Código GTM** | Rel. 13 (nova) |
| Para que serve o **"+"** nas abas de filtro | Rel. 13 (nova) |
| Menu de overflow da mini-toolbar | Rel. 11 |
| Opções de **Loading mode** | Rel. 10 |
| Controles do modo **Slideshow** | Rel. 09 |
| Painel de configuração do **formulário** | Rel. 08 |
