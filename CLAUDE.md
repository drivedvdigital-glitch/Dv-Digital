# Agente Gerente de Estoque e Compliance (Google Sheets MCP)

## Função
Agente duplo de registro e compliance para produtos em Google Sheets:
1. **Registrar novos produtos** criando abas e analisando URLs para conformidade com Google Ads.
2. **Atualizar status** de produtos existentes via comandos privados.

## Estrutura do Projeto
```
src/
├── index.js                 # Entry point e factory createAgent()
├── router.js                # Roteador de comandos (/priv1 vs JSON)
├── commands/
│   ├── createProduct.js     # Cenário B: criação de produto
│   └── updateProduct.js     # Cenário A: /priv1 atualização
├── services/
│   ├── sheetsService.js     # Camada de abstração do Google Sheets MCP
│   └── urlAnalyzer.js       # Análise de URL para compliance Ads
└── utils/
    ├── constants.js         # Listas de validação (dropdowns)
    └── idGenerator.js       # Geração de IDs e numeração
```

## Listas de Validação (DROPDOWNS - Case Sensitive)
- **C15 (Risco Ads):** "De boa", "Atenção", "Marca", "Dúvida"
- **C17 (Mineiro):** "KARINE", "MIGUEL", "JOÃO", "VANDERSON"
- **C19 (Validação):** "Sim", "Não", "Mais ou Menos"
- **C21 (Criativo):** "KARINE", "MIGUEL", "JOÃO", "VANDERSON"
- **R2 (Gênero):** "Homem", "Mulher", "Ambos"
- **Países:** CO, RO, GT, ES, PT, CZ, PL, HU

## Comandos

### /priv1 - Atualização Rápida (Cenário A)
```
/priv1 [ID_PRODUTO] [STATUS_VALIDACAO] [DONO_CRIATIVO]
```
Exemplo: `/priv1 794-CO-labubu Sim KARINE`

### JSON - Criação de Produto (Cenário B)
```json
{
  "nome_produto": "Labubu",
  "pais": "CO",
  "url_concorrente": "https://example.com/product/labubu",
  "drop_id": "DRP-001",
  "preco": 29.90,
  "quantidade": 100,
  "verificado": true,
  "nome_mineiro": "KARINE"
}
```

## Regras de Compliance (Análise Automática)
- **Marca:** Produto de marca famosa (Nike, Apple, etc.) → C15 = "Marca"
- **Atenção:** Promessas milagrosas, emagrecimento, antes/depois → C15 = "Atenção"
- **Dúvida:** Uma claim suspeita isolada → C15 = "Dúvida"
- **De boa:** Produto genérico sem riscos → C15 = "De boa"

## Output JSON (para Agente de Tráfego)
```json
{
  "status": "sucesso",
  "id_gerado": "[ID_EM_I2]",
  "genero_detectado": "[VALOR_DE_R2]",
  "analise_risco": "[VALOR_DE_C15]"
}
```

## Integração MCP
Requer Google Sheets MCP server configurado. Veja `config/mcp.json`.
