# Fluxos de uso e desenho de interface do D&VFly

> **Complemento da Fase 2.** A pesquisa da Fase 1 mapeou *o que existe*; a arquitetura definiu
> *como construir*. Faltava *como se usa* — e é isso que a Fase 3 precisa para não inventar
> interface no meio da implementação.
>
> Base: `docs/PESQUISA_PAGEFLY.md`, `docs/ARQUITETURA.md`, e a leitura dos fluxos passo a passo
> da documentação do concorrente.

---

## 0. Método e limitação

### O que foi usado

O PageFly mantém uma biblioteca de vídeos-tutorial embutida na documentação. A ideia de estudá-los
é boa, e a informação que eles carregam foi obtida — só que por outro caminho.

| Fonte | O que rendeu |
|---|---|
| **643 passos documentados**, em 117 das 241 páginas da central de ajuda | Os fluxos reais, escritos: "Passo 1 clique no ícone X → Passo 2 vá na aba Y → Passo 3 salve" |
| **101 títulos de vídeo**, recuperados via oEmbed do YouTube | O mapa de onde a interface não se explica sozinha |

### ⚠️ O que não foi possível

**Não consegui assistir aos vídeos.** Não tenho processamento de vídeo nem de áudio, e testei três
caminhos para contornar isso:

| Tentativa | Resultado |
|---|---|
| Buscar a página do vídeo no YouTube | **HTTP 429** — bloqueado neste ambiente |
| Extrair a faixa de legenda do player | Impossível sem a página acima |
| API de legendas (`timedtext`) direto | Responde 200 com **corpo vazio** — exige parâmetros assinados que só vêm da página |
| oEmbed (título e autor) | ✅ Funcionou — daí os 101 títulos |

**Por que isso não compromete o resultado:** os vídeos do PageFly demonstram exatamente os fluxos
que a documentação escreve em texto, passo a passo. Eu tinha essas 241 páginas desde a Fase 1 e as
minerei procurando **funcionalidades**, descartando os **fluxos**. O material estava aqui; o que
faltava era ler com a outra pergunta na cabeça.

O que se perde sem o vídeo é a camada de *sensação* — quantos cliques parecem muitos, onde o
cursor hesita, qual animação confunde. Isso não se recupera de texto, e a honestidade é dizer que
não está aqui. Não impede desenhar os fluxos; impede julgar o polimento.

---

## 1. Diagnóstico: o catálogo de vídeos como mapa de falhas

Um tutorial em vídeo é uma confissão. Se um produto precisou gravar um vídeo para explicar algo,
aquilo não era evidente na tela. Os 101 títulos, lidos assim, viram um mapa de onde a interface do
líder de mercado falha.

### 1.1 O achado mais forte: a biblioteca ficou presa no editor velho

| | Vídeos |
|---|---|
| Marcados **"(Legacy Editor)"** | **74** |
| Marcados **"Gen 2 Editor"** | **7** |
| Sem marcação de editor | 20 |

**Três quartos do material de ensino ensina o motor que o produto está abandonando.** Quem instala
o PageFly hoje, escolhe o editor novo e procura um tutorial, encontra um vídeo do editor antigo,
com outra estrutura de tela e outros nomes de campo.

Isso confirma, por um ângulo que eu não tinha, a decisão **D3/"nascer flex"** da arquitetura: a
troca de motor de layout não custa só a migração das páginas — custa a biblioteca de ensino
inteira, e ela leva anos para ser regravada.

### 1.2 Vídeos que não deveriam precisar existir

Separando por tema, aparece um padrão incômodo:

| Tema | Nº | O que isso diz |
|---|---|---|
| **"Como adicionar o elemento X"** | 42 | Um vídeo por elemento. Se cada bloco precisa de tutorial, o painel de blocos não se explica |
| **Operação básica de layout** (alinhar, estruturar, largura total, divisor, nomear seção) | 13 | Alinhar coisas precisa de vídeo |
| **Conserto de defeito** (conflito de tema, scroll horizontal no mobile, carrinho que não atualiza, velocidade) | 4 | Tutoriais que são contorno de bug |
| **Responsividade** | 3 | Fazer funcionar no celular precisa de aula |

Títulos que valem ser citados literalmente, porque são o argumento inteiro:

- *"How to Align Elements"* e *"How to Align Content"* — **alinhar** precisa de dois vídeos.
- *"How to Add Shopify Divider Spacer"* — um **divisor** precisa de vídeo.
- *"How to Name A Section"* — **dar nome** a uma seção precisa de vídeo.
- *"How to Avoid Shopify Theme Conflict"* — o conflito é esperado o bastante para ter tutorial.
- *"How to Increase Shopify Page Speed"* — aula sobre um problema que o próprio produto cria.

> **Regra que sai daqui, e que vale como critério de aceite da Fase 3:**
> **se um bloco ou gesto do D&VFly precisar de tutorial, o desenho está errado.** Não é aspiração
> de qualidade — é teste. Antes de dar por pronto qualquer bloco, a pergunta é "isso precisaria de
> um vídeo?". Se sim, volta para a prancheta.

---

## 2. Os fluxos, lado a lado

Cada fluxo abaixo está descrito como a documentação do concorrente o descreve, seguido do fluxo
equivalente no D&VFly. Não é comparação por esporte: é que o atrito deles já está medido em
reclamações reais (seção 3 da pesquisa), então cada passo que cortamos tem justificativa.

### 2.1 Colocar dois elementos lado a lado

**Concorrente** — 4 passos, e é flexbox cru exposto ao lojista:

1. Criar um *Block* e colocar os dois elementos dentro
2. Selecionar o Block → aba **Styling**
3. Habilitar o recurso **Flex**
4. Definir **Flex Direction** como *Row*

> Este é o fluxo mais revelador que encontrei. Pôr duas coisas lado a lado é o gesto mais banal de
> montar uma página, e exige entender container, display flex e direção de eixo. A reclamação
> *"completamente desenhado para desenvolvedores"* e a do *"painel lateral que parece painel de
> nave espacial"* nascem aqui.

**D&VFly** — 1 gesto:

Arrastar o segundo elemento para a **borda lateral** do primeiro. O indicador de drop mostra uma
linha vertical (ao lado) ou horizontal (acima/abaixo). Soltou ao lado, virou linha; soltou
embaixo, virou coluna. O container flex é criado automaticamente, e o painel passa a mostrar
direção, gap e alinhamento **já preenchidos** — para ajustar, não para descobrir.

O conceito de flexbox continua existindo no modelo de dados. Ele simplesmente não é pré-requisito
para o gesto.

### 2.2 Mudar um texto

**Concorrente** — 2 passos, fora do canvas:

1. Clicar no elemento
2. Ir na aba **General** e digitar numa caixa de texto da barra lateral

**D&VFly** — duplo clique no texto, digita ali.

Edição inline no canvas. A barra lateral serve para o que não é conteúdo. Este é o gesto mais
frequente de toda a ferramenta — é por isso que a edição inline subiu de P1 para **P0** na
priorização (seção 4.2 da pesquisa): um MVP em que mudar uma palavra exige desviar o olho para a
lateral é desagradável de usar desde o primeiro minuto.

### 2.3 Fazer a página funcionar no celular

**Concorrente** — a documentação lista cinco frentes, e a primeira é:

1. Selecionar a linha que contém as colunas
2. Aba **Styling** → **Display style** → escolher **Flex**
3. Definir **Flex direction** como *Column reverse*

E as "boas práticas" oficiais são, em essência, uma lista de coisas a não fazer: evitar margens
negativas, manter a estrutura simples, ficar em 1 ou 2 itens por linha.

> Quando a orientação oficial é "mantenha simples para não quebrar", o sistema está frágil. Casa
> com a reclamação 3.8 — *"você precisa criar dois designs, e nenhum dos dois fica bom no tablet"*.

**D&VFly** — o empilhamento é o padrão, não a configuração:

- Todo container em linha **empilha sozinho** abaixo do breakpoint, sem ninguém pedir.
- Quem quiser o contrário, desliga explicitamente.
- Trocar para a vista mobile e mexer num valor cria uma **sobreposição** só daquele valor. Não
  existe "design de mobile" separado — existe o design e o que difere nele.
- Cada campo do inspector mostra se o valor é **herdado** (cinza, com a origem) ou **próprio**
  (destacado, com um "×" para limpar a sobreposição e voltar a herdar).

Esse último detalhe é pequeno de implementar e é a diferença entre entender e adivinhar por que
uma coisa mudou.

### 2.4 Criar a primeira página

**Concorrente** — onboarding com tarefas guiadas: ver a introdução, criar a primeira página,
habilitar o analytics, habilitar a otimização de UI. Depois: escolher tipo de página, escolher
template, editar, prever, publicar. Criar a partir de template dentro do editor pede **5 passos**,
incluindo marcar uma caixa de *"eu entendo o que estou fazendo"*.

**D&VFly** — duas portas, sem tarefas guiadas:

| Porta | Fluxo |
|---|---|
| **Página em branco** | Nome → tipo → editor abre vazio com o convite de arrastar o primeiro bloco |
| **A partir de template** | Galeria → escolher → editor abre com a página montada |

Sem onboarding com checklist: numa loja própria, a lista de tarefas é ruído. A caixa de "eu
entendo o que estou fazendo" também some — ela existe lá porque aplicar um template **descarta a
página atual**. No D&VFly aplicar template numa página com conteúdo é uma ação desfazível como
qualquer outra, então não precisa de confissão do usuário.

### 2.5 Publicar

**Concorrente** — o detalhe que gera confusão: **Salvar** e **Publicar** são botões diferentes, e
salvar uma página já publicada **não** atualiza o que está no ar. É preciso "Save and Publish".

**D&VFly** — dois estados nomeados sem ambiguidade:

```
Rascunho  ──[Publicar]──►  Publicado
                              │
        edita ──► "Publicado · com alterações não publicadas"
                              │
                    [Publicar alterações] ──► Publicado
```

Regras:

- O rótulo do botão **sempre diz o que vai acontecer** — nunca "Salvar" quando o efeito é publicar.
- Salvar é automático e contínuo; não é um botão.
- Publicar é sempre explícito, sempre reversível (despublicar devolve a página do tema), e mostra
  o **tamanho compilado** antes de confirmar (o orçamento da seção 8 da arquitetura, na cara do
  usuário).
- Agendar publicação é um campo ao lado do botão, não uma tela à parte — a API da Shopify já
  entrega isso com `publishDate`.

### 2.6 Atribuir um template a produtos

**Concorrente** — ícone de etiqueta acima do ícone de configurações, abre o *Page Assignment*, com
dois modos: todos os produtos, ou seleção manual. Detalhe documentado: a página **não salva** se
você esquecer de atribuir.

**D&VFly** — mesmo conceito (é um bom conceito, e está mapeado como P1), com duas correções:

- A atribuição vive **dentro das configurações da página**, não num ícone separado — é uma
  propriedade da página, não uma ferramenta.
- Nunca bloqueia o salvamento. Uma página de produto sem produto atribuído é um rascunho válido;
  o que ela não pode é ser **publicada**. Bloquear o save é punir o usuário por trabalhar fora de
  ordem.

### 2.7 Desfazer um erro

É o fluxo mais importante do produto inteiro, porque num app privado **não há suporte para
socorrer ninguém** — e porque, do lado do concorrente, é a origem de boa parte das avaliações de
1 estrela.

**D&VFly** — quatro camadas, da mais leve para a mais pesada:

| Camada | Alcance | Gesto |
|---|---|---|
| **Desfazer/refazer** | A última ação | `Ctrl/Cmd+Z` |
| **Rascunho automático** | A sessão de edição | Ao reabrir, oferece restaurar o não salvo |
| **Histórico de versões** | Toda versão salva | Pré-visualizar antes de restaurar, sempre |
| **Lixeira** | Páginas e seções excluídas | Restaurar |

Duas decisões dentro disso:

- **Restaurar nunca apaga.** Restaurar a versão de ontem cria uma versão nova; a de hoje continua
  no histórico. Ninguém perde trabalho tentando recuperar trabalho.
- **Pré-visualizar é obrigatório antes de restaurar.** O concorrente acerta nisso e vale copiar.

---

## 3. Anatomia da tela

```
┌────────────────────────────────────────────────────────────────────┐
│  ‹ Voltar   Nome da página      ○ Rascunho        [Prever] [Publicar] │  barra
├───┬──────────────┬─────────────────────────────────┬───────────────┤
│   │              │                                 │               │
│ b │   Árvore     │   ┌─── iframe ────────────────┐  │   Inspector   │
│ a │   ou         │   │                          │  │               │
│ r │   Blocos     │   │   CSS do tema real       │  │  Conteúdo     │
│ r │              │   │   + output do compilador │  │  ──────────   │
│ a │   (painel    │   │                          │  │  Layout       │
│   │    troca     │   │   overlay de seleção     │  │  Espaço       │
│ í │    conforme  │   │   desenhado por fora     │  │  Tipografia   │
│ c │    o ícone)  │   │                          │  │  Cor          │
│ o │              │   └──────────────────────────┘  │  Avançado     │
│ n │              │                                 │               │
│ e │              │      ▣ ▤ ▥   ← dispositivo      │               │
└───┴──────────────┴─────────────────────────────────┴───────────────┘
```

**Barra de ícones (esquerda, fina).** Quatro entradas, não nove: Blocos · Árvore · Configurações ·
Histórico. O concorrente tem nove, e três delas (templates, atribuição, código) são coisas que
pertencem às configurações da página.

**Canvas.** É o iframe com o output real, dentro do CSS do tema — decisão D5 da arquitetura. O
seletor de dispositivo fica embaixo do canvas, junto do que ele afeta, não no topo longe dele.

**Inspector (direita).** Agrupado por **o que a pessoa quer mudar**, não por como o CSS é
organizado: Conteúdo primeiro (é o que mais muda), depois Layout, Espaço, Tipografia, Cor, e
Avançado por último e recolhido.

Regras do inspector, todas vindas de reclamações reais:

- **Só aparece o que se aplica** ao elemento selecionado. Nada de grupo vazio, nada de campo
  desabilitado sem explicação.
- **Busca de parâmetro** no topo. O concorrente tem e é bom: digitar "cor" e ver onde ela aparece.
- **Herdado vs. próprio** visível em cada campo, com um clique para limpar a sobreposição.
- Mudar um valor **repinta o canvas imediatamente** — a ~5 ms de compilação (medido no protótipo),
  isso cabe num frame.

---

## 4. Os gestos

O que o usuário faz com as mãos. É onde um builder ganha ou perde, e é o que os 42 vídeos de "como
adicionar o elemento X" dizem que o concorrente não resolveu.

| Gesto | Comportamento |
|---|---|
| **Clique** | Seleciona o elemento mais interno sob o cursor |
| **Clique de novo** | Sobe um nível na árvore (do texto para o card, do card para a seção) |
| **Duplo clique em texto** | Edição inline, ali mesmo |
| **Arrastar da biblioteca** | Insere; a linha de drop mostra exatamente onde vai cair |
| **Arrastar para a borda lateral** | Cria linha (o fluxo 2.1) |
| **Arrastar na árvore** | Mesma operação, para quando o alvo é pequeno ou está escondido |
| **`Ctrl/Cmd+D`** | Duplica |
| **`Delete`** | Remove, com desfazer |
| **`Esc`** | Sobe um nível de seleção |
| **Alça de espaçamento** | Arrastar a borda ajusta padding com número visível |

Duas regras que valem mais que a lista:

1. **Todo alvo de drop é visível antes de soltar.** A dúvida "onde isso vai cair" é a maior fonte
   de frustração em builder, e ela se resolve mostrando, não adivinhando.
2. **Todo gesto de arrasto tem equivalente por teclado**, via árvore. Alvos pequenos e elementos
   aninhados são ruins de mirar, e dnd-kit (decisão D3) já traz os sensores de teclado prontos —
   a acessibilidade sai de graça se a gente não a desligar.

---

## 5. Estados e feedback

O concorrente falha em estados — daí *"o editor trava e o suporte diz que a página está perto do
limite"*, *"publicaram uma página inacabada no ar"*, *"as imagens sumiram"*.

| Situação | O que a tela mostra |
|---|---|
| Salvando | Indicador discreto na barra; nunca bloqueia a edição |
| Falha ao salvar | Aviso persistente **com o conteúdo preservado em memória**, e um botão de tentar de novo |
| Perto do orçamento de tamanho | Aviso no canvas em ~70% dos 100 KB, com o que mais pesa na página |
| Estourou o orçamento | Publicação **bloqueada**, com a lista do que cortar |
| Bloco com erro | O bloco renderiza uma tarja de erro no canvas; **a página ainda publica sem ele**, e a publicação avisa |
| Imagem faltando | Placeholder explícito, nunca espaço em branco silencioso |
| Mesma página em duas abas | Aviso, como o concorrente faz — é um acerto dele |

Regra geral: **nenhum estado silencioso.** Toda falha aparece onde o usuário está olhando, e
sempre diz o que fazer em seguida. Um app sem equipe de suporte não pode ter erro que exige
suporte para entender.

---

## 6. Regras de interface

Sete, cada uma amarrada a uma evidência desta pesquisa:

| # | Regra | De onde vem |
|---|---|---|
| **U1** | **Se precisa de tutorial, o desenho está errado.** | 42 vídeos de "como adicionar o elemento X" |
| **U2** | **O gesto comum é direto; o conceito técnico fica no modelo, não no caminho.** | Flexbox exposto para pôr duas coisas lado a lado (2.1) |
| **U3** | **Conteúdo se edita no lugar onde ele aparece.** | Texto editado na barra lateral (2.2) |
| **U4** | **Responsivo é um design com sobreposições, não três designs.** | "Precisa criar dois designs e nenhum serve no tablet" (2.3) |
| **U5** | **O botão diz o que vai acontecer.** | "Salvar" que não publica (2.5) |
| **U6** | **Todo erro é reversível, e restaurar nunca apaga.** | Não há suporte num app privado (2.7) |
| **U7** | **Nenhum estado silencioso.** | Página inacabada publicada sem aviso (seção 5) |

---

## 7. O que isso muda na priorização

A pesquisa fechou em 56 P0 / 54 P1 / 35 P2. Esta leitura **não acrescenta itens** — confirma
posições e reordena a execução:

**Confirma três promoções que já tinham sido feitas por outro argumento:**

- **Edição inline de texto (P0)** — 2.2 mostra o custo de não ter.
- **Herança de breakpoint explícita (P0)** — 2.3 mostra que é aqui que o concorrente mais machuca.
- **Layout flex desde o início (P0)** — reforçado pelo achado 1.1: a troca de motor custou 74 dos
  101 vídeos.

**Muda a ordem dentro da Fase 3.** A seção 11 da arquitetura lista dez etapas. Esta leitura diz
que, quando chegar na etapa 6 (painéis), a ordem certa dentro dela é:

1. **Gestos de drop com alvo visível** — é o que faz ou quebra a sensação de "isso funciona"
2. **Edição inline**
3. **Inspector com herdado vs. próprio**
4. Árvore
5. Busca de parâmetro

Os três primeiros são o produto. Os dois últimos são conveniência.

**E acrescenta um critério de aceite**, que é a regra U1 virada em teste: antes de dar um bloco
por pronto, alguém que nunca o viu tem de conseguir usá-lo sem explicação. Se precisaria de vídeo,
não está pronto.
