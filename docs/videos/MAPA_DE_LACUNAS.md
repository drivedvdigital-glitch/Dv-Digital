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
