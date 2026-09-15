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
