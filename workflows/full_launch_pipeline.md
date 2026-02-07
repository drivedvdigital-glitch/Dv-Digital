# Full Launch Pipeline

## Overview

Pipeline automatizado de lançamento de produto para dropshipping. O operador fornece **apenas o link do produto e o país-alvo**, e o sistema executa a cadeia completa de agentes até entregar todos os assets de marketing prontos para publicação.

---

## Input do Operador

```
product_url: "[URL da página do produto]"
target_country: "[País-alvo]"
```

Apenas esses dois campos são necessários. Todos os demais parâmetros são derivados automaticamente pelo pipeline.

---

## Fluxo de Execução

```
┌─────────────────────────────────────────────────────────────┐
│                     INPUT DO OPERADOR                       │
│              product_url + target_country                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 0 — Setup                                              │
│  Criar pasta: products/{slug_do_produto}/                    │
│  Extrair dados do produto via URL                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 1 — Product Intelligence Agent                         │
│  Input: dados extraídos da URL + país-alvo                   │
│  Output: {slug}_intelligence_{COUNTRY}.md                    │
│  Salvar em: products/{slug}/                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 2 — Sales Copy Agent                                   │
│  Input: relatório do Step 1                                  │
│  Output: {slug}_shopify_copy_{COUNTRY}.md                    │
│  Salvar em: products/{slug}/                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 3 — Video Script Agent                                 │
│  Input: relatório do Step 1                                  │
│  Output: {slug}_video_scripts_{COUNTRY}.md                   │
│  Salvar em: products/{slug}/                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 4 — Traffic Agent                                      │
│  Input: relatório do Step 1 + copy do Step 2                 │
│  Output: {slug}_traffic_ads_{COUNTRY}.md                     │
│  Salvar em: products/{slug}/                                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 5 — Validação e Commit                                 │
│  Verificar que os 4 arquivos existem na pasta                │
│  Commit e push para o repositório                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Detalhamento dos Steps

### Step 0 — Setup Inicial

**Objetivo:** Preparar o ambiente e extrair dados brutos do produto.

**Ações:**

1. **Gerar o slug do produto** a partir da URL:
   - Extrair o último segmento do path da URL
   - Converter para snake_case sem acentos
   - Exemplo: `https://moferte.shop/products/ochelari-inteligenti` → `ochelari_inteligenti`

2. **Criar a pasta de destino:**
   ```
   products/{slug}/
   ```

3. **Acessar a URL do produto** e extrair:
   - Nome do produto
   - Descrição
   - Preço e moeda
   - Imagens disponíveis
   - Features listadas
   - Categoria / nicho

4. **Derivar automaticamente os parâmetros do pipeline:**

   | Parâmetro         | Como derivar                                                              |
   | ----------------- | ------------------------------------------------------------------------- |
   | `product_name`    | Extraído da página do produto (tag `<title>` ou H1)                      |
   | `description`     | Extraído da meta description ou primeiro parágrafo                       |
   | `niche`           | Inferido da categoria da página ou das keywords do produto               |
   | `price_range`     | Extraído da página (preço atual + preço riscado se existir)              |
   | `target_gender`   | Inferido do produto (Unissex como padrão se ambíguo)                     |
   | `age_range`       | Inferido do nicho e do país (padrão: 25-65)                              |
   | `target_language` | Derivado do `target_country` conforme tabela de idiomas                  |
   | `tone`            | Padrão: "Emocional com toque racional"                                   |
   | `video_duration`  | Padrão: "30s"                                                            |
   | `video_style`     | Padrão: "UGC"                                                            |
   | `platform`        | Padrão: "Meta"                                                           |
   | `num_variations`  | Padrão: 3 (roteiros de vídeo)                                            |
   | `monthly_budget`  | Padrão por país (ver tabela abaixo)                                      |

5. **Tabela de derivação por país:**

   | País       | Idioma   | Moeda | Budget Padrão | COD  |
   | ---------- | -------- | ----- | ------------- | ---- |
   | Romênia    | Romeno   | RON   | 3000 RON      | Sim  |
   | Hungria    | Húngaro  | HUF   | 150.000 HUF   | Sim  |
   | Colômbia   | Espanhol | COP   | 1.500.000 COP | Não  |
   | Guatemala  | Espanhol | GTQ   | 4000 GTQ      | Não  |

---

### Step 1 — Product Intelligence Agent

**Agente:** `agents/product_intelligence.md`

**Input automático:**

```
product_name:  [extraído no Step 0]
description:   [extraído no Step 0]
niche:         [inferido no Step 0]
price_range:   [extraído no Step 0]
target_gender: [inferido no Step 0]
age_range:     [inferido no Step 0]
```

**Output esperado:**
- Persona completa (min. 5 dores + min. 5 desejos)
- Min. 3 ângulos de venda
- Notas culturais para o país-alvo
- Seção de compliance

**Arquivo de saída:**
```
products/{slug}/{slug}_intelligence_{COUNTRY}.md
```

**Exemplo:**
```
products/ochelari_inteligenti/ochelari_inteligenti_intelligence_RO.md
```

**Critério de conclusão:** O arquivo existe, contém as 3 seções obrigatórias (Persona, Ângulos, Notas Culturais) e está no idioma correto.

---

### Step 2 — Sales Copy Agent

**Agente:** `agents/sales_copy.md`

**Input automático:**

```
intelligence_report: "products/{slug}/{slug}_intelligence_{COUNTRY}.md"
target_country:      [do input do operador]
target_language:     [derivado do país]
tone:                "Emocional com toque racional"
include_faq:         true
```

**Output esperado:**
- Título do produto (max 70 chars + SEO keyword + 2 variações A/B)
- Descrição Rich Text (4 blocos: gancho, benefícios, prova social, escassez)
- Briefing de imagem de capa
- FAQ em acordeão HTML (min. 5 perguntas)

**Arquivo de saída:**
```
products/{slug}/{slug}_shopify_copy_{COUNTRY}.md
```

**Critério de conclusão:** O arquivo contém os 4 blocos obrigatórios, todo o conteúdo está no idioma-alvo, e os limites de caracteres estão respeitados.

---

### Step 3 — Video Script Agent

**Agente:** `agents/video_script.md`

**Input automático:**

```
intelligence_report: "products/{slug}/{slug}_intelligence_{COUNTRY}.md"
target_country:      [do input do operador]
target_language:     [derivado do país]
video_duration:      "30s"
video_style:         "UGC"
platform:            "Meta"
num_variations:      3
```

**Output esperado (por roteiro):**
- 3 variações de hook (dor, curiosidade, transformação)
- Desenvolvimento em tabela com timestamps (problema + solução)
- CTA adaptado ao país (com COD se aplicável)
- Briefing visual completo (overlays, música, corte, specs)

**Output total:** 3 roteiros completos usando ângulos de venda diferentes.

**Arquivo de saída:**
```
products/{slug}/{slug}_video_scripts_{COUNTRY}.md
```

**Critério de conclusão:** O arquivo contém 3 roteiros, cada um com 4 seções obrigatórias (hook, desenvolvimento, CTA, briefing), timestamps em todas as tabelas, e falas no idioma-alvo.

> **Nota:** O Step 3 pode executar em paralelo com o Step 2, pois ambos dependem apenas do Step 1. O pipeline deve aproveitar esse paralelismo quando possível.

---

### Step 4 — Traffic Agent

**Agente:** `agents/traffic_agent.md`

**Input automático:**

```
intelligence_report: "products/{slug}/{slug}_intelligence_{COUNTRY}.md"
shopify_copy:        "products/{slug}/{slug}_shopify_copy_{COUNTRY}.md"
target_country:      [do input do operador]
target_language:     [derivado do país]
product_url:         [do input do operador]
monthly_budget:      [derivado da tabela de país]
platforms:           ["Meta", "Google"]
```

**Output esperado:**
- Meta Ads: 5 headlines + 3 primary texts
- Google Ads: 5 títulos (30ch) + 5 descrições (90ch) + 5 títulos longos (90ch)
- Configuração de público: min. 3 ad sets (prospecção + retargeting)
- UTMs: URLs finais prontas + tabela de decodificação

**Arquivo de saída:**
```
products/{slug}/{slug}_traffic_ads_{COUNTRY}.md
```

**Critério de conclusão:** O arquivo contém os 4 blocos obrigatórios, limites de caracteres respeitados, interesses são categorias reais do Ads Manager, e UTMs seguem convenção snake_case.

---

### Step 5 — Validação e Commit

**Objetivo:** Verificar integridade do pipeline e persistir no repositório.

**Checklist de validação:**

```
products/{slug}/
├── {slug}_intelligence_{COUNTRY}.md    ✅ Existe e tem Persona + Ângulos + Notas Culturais
├── {slug}_shopify_copy_{COUNTRY}.md    ✅ Existe e tem Título + Descrição + Imagem + FAQ
├── {slug}_video_scripts_{COUNTRY}.md   ✅ Existe e tem 3 roteiros com hooks + timestamps
└── {slug}_traffic_ads_{COUNTRY}.md     ✅ Existe e tem Meta + Google + Público + UTMs
```

**Ações de finalização:**

1. Verificar que os 4 arquivos existem na pasta `products/{slug}/`
2. Verificar que nenhum arquivo está vazio
3. Fazer `git add` dos 4 arquivos
4. Commit com mensagem padronizada:
   ```
   Add full launch pipeline for {product_name} — {Country} market

   Pipeline: intelligence → shopify copy → video scripts → traffic ads
   ```
5. Push para a branch de trabalho

---

## Grafo de Dependências

```
                    Step 0 (Setup)
                         │
                         ▼
                  Step 1 (Intelligence)
                    │           │
                    ▼           ▼
           Step 2 (Copy)   Step 3 (Video)    ← PARALELO
                    │           │
                    └─────┬─────┘
                          ▼
                   Step 4 (Traffic)           ← Depende de Step 1 + Step 2
                          │
                          ▼
                   Step 5 (Validação)
```

> Steps 2 e 3 são independentes e podem rodar em paralelo. Step 4 precisa dos outputs de Step 1 e Step 2.

---

## Convenção de Nomes de Arquivo

### Regra do Slug

O slug é gerado a partir da URL do produto:

```
URL:  https://moferte.shop/products/ochelari-inteligenti
Path: ochelari-inteligenti
Slug: ochelari_inteligenti  (hifens → underscores)
```

### Regra do Country Code

Usar código ISO de 2 letras em maiúsculo:

| País       | Código |
| ---------- | ------ |
| Romênia    | RO     |
| Hungria    | HU     |
| Colômbia   | CO     |
| Guatemala  | GT     |

### Padrão de Nome de Arquivo

```
{slug}_{tipo}_{COUNTRY}.md
```

| Tipo               | Exemplo                                       |
| ------------------ | --------------------------------------------- |
| intelligence       | ochelari_inteligenti_intelligence_RO.md        |
| shopify_copy       | ochelari_inteligenti_shopify_copy_RO.md        |
| video_scripts      | ochelari_inteligenti_video_scripts_RO.md       |
| traffic_ads        | ochelari_inteligenti_traffic_ads_RO.md         |

---

## Estrutura Final da Pasta

Após a execução completa do pipeline para um produto:

```
products/
└── ochelari_inteligenti/
    ├── ochelari_inteligenti_intelligence_RO.md
    ├── ochelari_inteligenti_shopify_copy_RO.md
    ├── ochelari_inteligenti_video_scripts_RO.md
    └── ochelari_inteligenti_traffic_ads_RO.md
```

Para múltiplos países do mesmo produto:

```
products/
└── ochelari_inteligenti/
    ├── ochelari_inteligenti_intelligence_RO.md
    ├── ochelari_inteligenti_shopify_copy_RO.md
    ├── ochelari_inteligenti_video_scripts_RO.md
    ├── ochelari_inteligenti_traffic_ads_RO.md
    ├── ochelari_inteligenti_intelligence_HU.md
    ├── ochelari_inteligenti_shopify_copy_HU.md
    ├── ochelari_inteligenti_video_scripts_HU.md
    └── ochelari_inteligenti_traffic_ads_HU.md
```

Para múltiplos produtos:

```
products/
├── ochelari_inteligenti/
│   ├── ochelari_inteligenti_intelligence_RO.md
│   ├── ...
├── corretor_postura/
│   ├── corretor_postura_intelligence_CO.md
│   ├── ...
└── lampa_led/
    ├── lampa_led_intelligence_GT.md
    └── ...
```

---

## Example Usage

### Input do operador:

```
product_url: "https://moferte.shop/products/ochelari-inteligenti"
target_country: "Romênia"
```

### Execução automática:

```
Step 0 → Slug: ochelari_inteligenti | País: RO | Idioma: Romeno | Pasta criada
Step 1 → ochelari_inteligenti_intelligence_RO.md ✅
Step 2 → ochelari_inteligenti_shopify_copy_RO.md ✅ (paralelo com Step 3)
Step 3 → ochelari_inteligenti_video_scripts_RO.md ✅ (paralelo com Step 2)
Step 4 → ochelari_inteligenti_traffic_ads_RO.md ✅
Step 5 → Validação OK. Commit e push ✅
```

### Output final:

```
products/ochelari_inteligenti/
├── ochelari_inteligenti_intelligence_RO.md     (relatório de inteligência)
├── ochelari_inteligenti_shopify_copy_RO.md     (copy Shopify pronta)
├── ochelari_inteligenti_video_scripts_RO.md    (3 roteiros de vídeo)
└── ochelari_inteligenti_traffic_ads_RO.md      (anúncios + público + UTMs)
```

---

## Prompt de Ativação

Para acionar este pipeline, o operador deve dizer:

> **"Execute o Full Launch Pipeline para [URL] no mercado [PAÍS]."**

O sistema deve então executar automaticamente os Steps 0-5 sem intervenção adicional.
