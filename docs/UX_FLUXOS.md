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

### Atualização — a limitação abaixo foi superada

A seção que segue descreve a tentativa original de ler os vídeos, que falhou. **Isso mudou:** as
transcrições completas dos 15 vídeos mais vistos do canal oficial foram obtidas por outro meio e
lidas. O resultado está na **seção 8**, que substitui o que este documento dizia não ter.

O registro abaixo fica como está, porque descreve honestamente o que este ambiente consegue e não
consegue fazer sozinho.

### ⚠️ O que não foi possível *(pela via automatizada)*

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


---

## 8. O modelo mental do concorrente, pelas transcrições dos próprios tutoriais

> **Fonte:** transcrições dos 15 vídeos mais vistos do canal oficial do concorrente que tratam do
> app (de 7,8 mil a 82 mil views; de 1 a 29 minutos). Lidas integralmente.
>
> Isto é o que a seção 0 dizia não ser recuperável de texto: **o método**, ensinado pelo próprio
> fornecedor, com os erros que o apresentador comete ao vivo.

### 8.1 A tese que justifica a existência da categoria

O vídeo conceitual mais assistido não fala de recursos. Fala de uma limitação da Shopify:

- **A home page** é flexível no editor de temas — dá para adicionar e reordenar seções.
- **Todo o resto** (produto, coleção, blog) é praticamente fixo. A demonstração abre a página de
  produto num tema gratuito e mostra que só existem três coisas: header, o bloco do produto,
  footer. Nada para adicionar, nada para ajustar.

> É o argumento inteiro da categoria, em uma frase: **o tema deixa você desenhar a vitrine e
> proíbe você de desenhar a prateleira.** Todo page builder de Shopify existe para desfazer essa
> proibição.
>
> **Para o D&VFly:** confirma a escolha das trilhas de publicação da arquitetura. A trilha A
> (páginas avulsas) resolve a parte fácil; o valor real está na trilha B — produto e coleção —
> que é justamente onde o tema não deixa mexer.

### 8.2 As regras de layout, como o fornecedor as ensina

A aula mais longa (29 minutos) é de fundamentos. As regras que ela repete:

| Regra ensinada | O que ela revela |
|---|---|
| Sempre comece por uma **Full Section** | O container vem antes do conteúdo — o usuário monta andaime, não página |
| **Colunas são rígidas — defina-as primeiro** | Não dá para decidir o layout depois. Errou a contagem de colunas, refaz |
| **Padding vai na section**, não no elemento | Regra que existe só porque a hierarquia vaza para o usuário |
| **Percentagem em vez de pixels** | Conselho de sobrevivência para o responsivo não quebrar |
| Centralizar verticalmente = Column → Flex → Direction Column → Justify Center | Quatro passos para centralizar |
| Inverter colunas = **Row** → Flex → **Row Reverse** | E o apresentador erra: seleciona a section, não a row |
| Imagem colada nas bordas = gutter 0 na row + padding 0 na section + max-width off | Três ajustes em dois níveis diferentes da árvore |

E o detalhe mais revelador de todos: **a aula ensina a instalar três extensões de navegador**
(um medidor de fontes, um conta-gotas de cor e uma régua de pixels) **para medir o design de
referência à mão** e depois transcrever os números no painel.

> Isso não é tutorial de page builder. É tutorial de engenharia reversa manual de CSS.
>
> **Para o D&VFly:** é a régua do nosso trabalho. Se para reproduzir um layout comum o usuário
> precisa de três extensões e de saber em qual dos quatro níveis da árvore aplicar cada
> propriedade, a ferramenta terceirizou o problema. Reforça U2 (o gesto comum é direto; o conceito
> técnico fica no modelo, não no caminho) e a decisão de nascer flex com alvos de drop visíveis.

### 8.3 Os erros que o apresentador comete — mapa de armadilhas

Numa aula gravada, editada e publicada pelo próprio fornecedor, o apresentador erra e corrige ao
vivo:

1. Aplica o padding no **heading** quando deveria ser na **section**.
2. Cola o texto do parágrafo dentro do **heading**.
3. Seleciona a **section** quando precisava da **row**, para inverter as colunas.
4. Tenta configurar a cor de hover de um botão, **não encontra**, e remete à documentação.

Os três primeiros são o mesmo erro: **aplicar a propriedade no nível errado da árvore**. O
mecanismo oficial de correção é o breadcrumb, que existe justamente porque a seleção é ambígua.

> **Para o D&VFly:** um nível de container a menos (flex, sem row/column) elimina por construção
> a classe inteira de erro nº 1, 2 e 3. E o hover ter derrotado o próprio apresentador é o
> argumento para estados de elemento serem visíveis no inspector, não escondidos atrás de um
> seletor de estado.

### 8.4 A anatomia canônica de landing page

O tutorial de landing page dá o esqueleto oficial, em ordem:

1. Hero banner
2. Lista de produtos
3. Lista de coleções
4. Banner de oferta / contador
5. Depoimentos
6. Selos de confiança
7. Newsletter

> **Para o D&VFly:** é a especificação dos nossos templates P0 — e casa com o que a seção 4.7 da
> pesquisa já pedia ("5+ templates de landing de conversão criados do zero"). Agora existe uma
> lista de seções para preencher, escrita a partir do consenso de mercado e não do nosso palpite.
> O conteúdo e o desenho são nossos; a sequência é de domínio público.

### 8.5 Conflito de tema: o procedimento oficial de socorro

O vídeo de troubleshooting descreve a causa raiz sem rodeios: **o CSS do tema sobrescreve o CSS
do app**. Os sintomas e as correções oficiais:

| Sintoma | Correção oficial |
|---|---|
| A página fica diferente no editor e ao vivo | Ligar o "estilo do tema" para o editor **adotar** o CSS do tema |
| Seção não fica em largura total | **Três trechos de CSS diferentes, distribuídos na descrição do vídeo — "teste cada um para ver qual funciona no seu tema"** |
| Espaço em branco abaixo do header | Outro CSS avulso, que só funciona em alguns temas gratuitos |
| Nada funciona | Chat de suporte, que fornece o CSS específico do seu tema |

> **Este é o achado mais forte da seção 8, e confirma a reclamação nº 1 da pesquisa (3.1) pela
> boca do próprio fornecedor.** O procedimento oficial para fazer uma seção ocupar a largura da
> tela é colar CSS que você pegou na descrição de um vídeo do YouTube, testando três variantes até
> uma funcionar.
>
> **Para o D&VFly:** é exatamente o que os invariantes I1 (um compilador só) e o isolamento de CSS
> escopado existem para tornar impossível. Nosso CSS é prefixado e não disputa cascata com o tema;
> nosso preview renderiza o output real dentro do CSS do tema, então divergência não sobrevive até
> a publicação. Largura total é uma propriedade do bloco, não um remédio externo.

### 8.6 Passos obrigatórios que ninguém adivinha

Três coisas que os tutoriais precisam ensinar porque a interface não as revela:

| Passo | Por que existe |
|---|---|
| **Página avulsa publicada não aparece na loja** — é preciso linká-la no menu de navegação do Shopify | Publicar não é o mesmo que ser encontrável, e a interface não diz isso |
| **A página de produto aparece duplicada** — é preciso esconder a seção nativa do tema pelo ícone de olho no editor de temas | Confirma o "passo 8" observado na gravação (`docs/USO_REAL.md`) |
| **Esconder header/footer só funciona depois de publicar** e recarregar | Ordem de operações escondida |

> **Para o D&VFly:** os três viram comportamento automático ou aviso no momento certo. Publicar
> uma página avulsa deve oferecer, ali mesmo, adicioná-la ao menu. Publicar uma página de produto
> deve detectar e resolver a duplicação — ou no mínimo avisar, com o link para onde resolver.
> Nenhum deles merece um tutorial.

### 8.7 Regras de integração de terceiros

Elementos de apps externos têm um contrato irregular: alguns só funcionam **uma vez por página**,
outros **precisam estar dentro do bloco de produto**, e o app precisa estar instalado e
configurado **antes**. Recursos que parecem básicos exigem app externo — status de estoque, lista
de desejos, avaliações, personalização de produto.

> **Para o D&VFly:** confirma a aposta da seção 4.9 — bloco HTML/Liquid e bloco de app do OS 2.0
> como P0 cobrem quase tudo, sem catálogo de integrações dedicadas. E o contrato tem de ser
> uniforme: se um bloco tiver restrição de uso, a interface impede em vez de deixar falhar calado
> (regra U7).

### 8.8 O que esta leitura muda

**Nada na lista de 145 itens.** Confirma e afina:

| Já estava | Agora tem evidência do próprio fornecedor |
|---|---|
| **I1 — um compilador só** | O procedimento oficial de conflito de tema é colar CSS de descrição de vídeo |
| **Nascer flex, sem row/column** | Três dos quatro erros da aula oficial são "propriedade no nível errado da árvore" |
| **U2 — gesto comum direto** | Centralizar verticalmente são quatro passos; inverter colunas exige saber que é a row |
| **Templates P0** | A sequência de sete seções dá a especificação |
| **U7 — nenhum estado silencioso** | Três passos obrigatórios que só existem em tutorial |

**Um item novo, P1:** **detectar e resolver a duplicação da seção nativa do tema** ao publicar
página de produto. Está nos tutoriais do concorrente como passo manual e apareceu na gravação
real — é a mesma dor, vista de dois ângulos independentes.
