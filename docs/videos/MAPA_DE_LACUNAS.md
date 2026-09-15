# Mapa de lacunas — D&VFly × referência

Alimentado pelos relatórios em `docs/videos/`. Cada item ganha uma prioridade pela
frequência com que aparece nos vídeos e pelo peso no fluxo real de trabalho.

Legenda: ✅ já temos · 🔨 em construção · ⬜ falta · ❌ decidimos não ter

## Estado atual (antes dos relatórios), 15/09/2026

### Já temos
- ✅ Lista de páginas direto na entrada (sem dashboard/tutoriais — decisão do dono)
- ✅ Editor em tela cheia: árvore / canvas / inspetor (Geral + Estilo por breakpoint)
- ✅ Arrastar para reordenar (árvore e canvas), barra flutuante, breadcrumb
- ✅ Desfazer/refazer + atalhos completos + painel de atalhos
- ✅ Salvar só quando há mudança; publicar multi-loja com trava de produção
- ✅ Olhinho (esconder bloco sem publicar os bytes)
- ✅ Copiar/colar estilo (Ctrl+C/V)
- ✅ Tamanhos de tela com ícones (monitor/notebook/tablet/celular)
- ✅ Pré-visualizar, exportar/importar .json, publicar/despublicar na lista
- ✅ Configurações da página: URL, tipo, cabeçalho/rodapé (real, via modelo de tema)
- ✅ Compilador próprio: mesma saída no editor e no ar; auditoria (H1, alt, CTA)

### Em construção / planejado
- 🔨 Página de produto (modelo por produto — plano provado em docs/MODELOS_DE_TEMA.md)
- ⬜ Postagem de blog
- ⬜ Segurar Ctrl para selecionar vários elementos
- ⬜ Imagem de compartilhamento social (og:image)
- ⬜ Toggle de carregamento preguiçoso nas configurações
- ⬜ Upload de imagem (hoje é por URL)
- ⬜ Controles dedicados para sanfona/repetidor/contagem (hoje JSON)
- ⬜ Autosave

### Decidimos não ter
- ❌ Teste A/B · ❌ "Ver análises" · ❌ Dashboard com tutoriais

## Lacunas descobertas pelos vídeos

### Do vídeo 1 (EcomSensei 2026) — implementado em 15/09

- ✅ **4 dispositivos consistentes** (celular/tablet/notebook/computador) em estilo,
  visibilidade E preview — breakpoint `xl` (≥1440) adicionado ao compilador; pílulas do
  Estilo agora são os 4 ícones de dispositivo, os mesmos da barra superior.
- ✅ **Visibilidade por dispositivo na aba Geral**: 4 toggles com ícone ("mostrar este
  bloco em:"). Semântica corrigida no compilador: esconder num dispositivo vale SÓ para
  a faixa daquele dispositivo (media query de faixa exata) — antes "esconder no celular"
  vazava para todos os tamanhos maiores.
- ✅ **Animações de entrada** (Aparecer/Subir/Aproximar) com **preview no hover** no
  seletor, igual à referência. Progressive enhancement: sem JS a página fica visível;
  `prefers-reduced-motion` respeitado; CSS+runtime só saem quando algum bloco anima;
  no canvas as animações chegam assentadas (não repetem a cada tecla).
- ✅ **Ação ao clicar do botão**: abrir link / rolar até âncora / enviar e-mail / ligar
  (deriva do formato do href, sem campo duplicado).

### Do vídeo 2 (How to Easy, ★ referência-base com frames) — implementado em 15/09

- ✅ **Placeholders do cabeçalho/rodapé do tema no canvas** (cinza, hachurado, não
  editáveis) — a página é vista dentro do enquadramento real do tema, e a fronteira
  builder/tema fica declarada na tela. **Clicar no placeholder abre as Configurações da
  página**, onde a visibilidade deles realmente mora (nosso showChrome).
- ✅ **Estado "Alterações não salvas"** na barra: aviso ●, botão **Descartar** (com
  confirmação em dois cliques — reverte ao último salvo) e Salvar; **Publicar sai de
  cena enquanto há pendências** (Ctrl+Shift+S continua salvando e publicando de uma vez).
- ✅ **Desabilitar em vez de esconder**: "Ver no ar" agora aparece cinza antes de
  publicar, com o motivo no tooltip ("Disponível depois de publicar").
- ✅ **Estado vazio instrutivo no canvas**: "Esta página está vazia" + para onde ir —
  em vez de um vão em branco.

### Do vídeo 2 — fila nova (com o que já sabemos dos frames)

- ⬜ **Fontes do tema com tokens** no seletor de tipografia (type-heading-font etc.) —
  reusar a identidade do tema em vez de competir com ela.
- ⬜ **Zoom do canvas** + indicador conjunto "1440px, 58%".
- ⬜ **Busca na árvore** (lupa no Page content).
- ⬜ **Pílulas com contagem** no painel de elementos + badges "Novo".
- ⬜ **Variantes por elemento** (miniaturas; layouts por fração 1/2, 1/3…).
- ⬜ **Elemento "Adicionar ao carrinho"** + callout redirecionador no botão comum.
- ⬜ Popup, Slideshow, Comparação de imagens, YouTube/Vimeo/HTML video.
- ⬜ **Modal de fricção proporcional** para ação destrutiva de página inteira (quando a
  galeria de templates existir): "não tem desfazer" + checkbox + confirmar.
- ⬜ Prova social por template ("usado em N páginas") — quando houver galeria.
- ❌ FlyMate/créditos/onboarding por nicho — IA fora do escopo atual (registrado).
- ⚠️ Integração Instagram: o OAuth deles sai do produto com outro nome de app —
  decisão de confiança a pesar se formos fazer parecido.

### Dos vídeos 3 e 4 (catálogo + atalhos) — implementado em 15/09

- ✅ **Paleta "Adicionar" em grupos com contagem** (Estrutura / Básico / Mídia /
  Avançado + pílula "D&VFly N" calculada, nunca hardcoded — a deles muda entre versões).
- ✅ **Elemento Lista** (um item por linha, opção numerada — `<ul>/<ol>` de verdade,
  acessível).
- ✅ **Elemento Vídeo YouTube** (cola qualquer formato de link — watch, youtu.be,
  Shorts — e só o id do vídeo entra na página; embed nocookie, lazy, 16:9).
- ✅ **Toast "Salvo ✓" sobre o canvas** (onde o olho está), no lugar do banner lateral
  para o caso comum.
- ✅ **Atalhos: paridade confirmada** — nossos 9 batem 1:1 com a lista completa deles
  (Ctrl+C/V = estilo, Ctrl+D = duplicar). Falta só **segurar Ctrl = multi-seleção**.

### Dos vídeos 5-7 (produto, seções no tema, preços/CRO) — implementado em 15/09

- ✅ **Multi-seleção (segurar Ctrl)** — o último atalho da referência: Ctrl+clique na
  árvore E no canvas soma/remove da seleção; Excluir, Duplicar e Colar estilo valem
  para todos; o inspetor avisa "N blocos selecionados" e edita o último clicado; o
  canvas destaca todos. Painel de atalhos atualizado.
- ✅ **Estados vazios com a rota exata** (padrão nº 1 do rel. 05): imagem sem URL e
  YouTube sem link mostram no canvas "… — informe em Geral → [campo]", clicáveis para
  selecionar. Na página publicada, bloco não configurado **não sai** (nem img quebrada).
- ✅ **Renomear itens na árvore** (Seção/Pilha): "Nome na estrutura" — "Banner
  principal" em vez de "Seção", navegável em páginas longas (padrão dos rel. 03/05).
- ✅ **Indicador de responsividade**: a aba Estilo carrega o ícone do dispositivo em
  edição — a divisão Geral (global) × Estilo (por dispositivo) fica visível o tempo todo
  (a versão nossa do "ícone por campo" do rel. 05, coerente com nosso design de abas).

### Registros estratégicos dos rel. 5-7 (sem código)

- Modelo econômico deles: 2 moedas (slots × créditos IA) — nossa vantagem estrutural é
  NÃO ter moeda artificial; preservar.
- Pergunta em aberto do rel. 06 a responder no nosso design de seções-no-tema: o que
  acontece no tema quando a seção é despublicada (resposta explícita, ex. placeholder).
- CRO checklist completável ("N/M etapas") — padrão a considerar quando tivermos
  auditorias agrupadas.
- i18n: se formos multi-idioma, teste que quebra build com chave crua na tela (bug real
  visto na produção deles).
- Caminho de mídia deles é frágil (3 falhas em 3 vídeos) — nossa futura biblioteca de
  mídia deve nascer melhor: upload aplica direto.

### Da spec 08 (frames de Abas + Fontes) — implementado em 15/09

- ✅ **Elemento Abas**: itens com lista própria (duplicar/excluir/adicionar, seleção por
  inversão total de cor), cabeçalho e conteúdo separados na árvore, âncora de deep-link
  (#ancora abre a aba na página publicada), ARIA real, runtime/CSS só quando usados —
  e **duplo clique no canvas renomeia a aba** (melhor que a referência).
- ✅ **Fontes do tema com tokens**: "fonte-do-corpo (Helvetica)" / "fonte-de-título
  (Archivo)" — nomes resolvidos ao vivo da vitrine; compila para as variáveis do tema;
  o canvas injeta os valores reais (o título renderiza Archivo no editor, igual ao ar).

### Dos relatórios 9-10 (aba Shopify, formulários, Product list) — implementado em 15/09

- ✅ **Formulário de contato** (grupo novo "Loja" na paleta): widget configurável —
  DECISÃO consciente contra o modelo composicional deles (registrada no rel. 09) —
  nome/telefone opcionais, e-mail+mensagem fixos, botão e mensagem de sucesso
  configuráveis. Posta no `/contact` NATIVO da vitrine (campos `contact[...]`): o envio
  cai na caixa da própria loja, zero servidor nosso; sucesso aparece no
  `contact_posted=true`. CSS/JS só quando usado.
- ✅ **Despublicar no editor**: link ao lado do badge "publicada" (o par de estados que
  o rel. 09 confirmou) — verificado ao vivo na loja real, ida e volta.
- 📋 Adotados para o plano de produto: nomenclatura `<Recurso> <Campo>`; carrossel como
  MODO do Product list (não elemento); aviso honesto de limite nomeando a plataforma;
  fonte por coleção com seleção única; Content (dados) ≠ Layout (grade).
- 🚫 Não copiar: publicidade no inspetor; dependência de App Embed sem detecção (se
  tivermos integrações: detectar e avisar no elemento).

### Fila (consolidada, por valor)

- ⬜ **Biblioteca de mídia com upload** (melhor que a deles: upload já aplica).
- ⬜ **Galeria de templates** (com fricção proporcional no aplicar + prova social).
- ⬜ **Zoom do canvas** + indicador "1440px, 58%".
- ⬜ **Busca na árvore** (o renomear semântico já saiu da fila — feito).
- ⬜ Ícone, Tabela, QR Code, Barra de progresso, Comparação de imagens, Slideshow,
  Popup, Vimeo/HTML video, Google Map, Adicionar ao carrinho (+ callout no botão).
- ⬜ Aba de SEO nomeada; variantes por elemento; "?" de ajuda por item.
- ❌ Soundcloud (nicho, sem demanda nossa) · ❌ Product Personalizer · ❌ IA/FlyMate.

### Do vídeo 1 — fila (por ordem de valor)

- ⬜ **Elemento Abas (tabs)** — único bloco de conteúdo da demonstração que não temos.
- ⬜ **Biblioteca de mídia com upload** (fazer MELHOR que a referência: upload já aplica,
  sem a segunda etapa que o relatório aponta como atrito).
- ⬜ **Galeria de templates** (criar a partir de template + inserir seções prontas na
  página aberta; preview multi-dispositivo antes de escolher).
- ⬜ **Aba de SEO** (temos as auditorias do compilador; falta expô-las como aba nomeada
  + título/descrição de busca).
- ⬜ Content list com escolha de colunas na inserção (nosso repetidor cobre parte).
- ⬜ Video slideshow.
- ❌ Quick Edit AI / AI Sales Page — exigiria serviço de IA; fora do escopo atual.
- ❌ Image to PageFly — idem.
- ❌ Onboarding/wizard — decisão do dono: direto às páginas.
