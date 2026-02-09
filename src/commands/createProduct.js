import { CELL_MAP, MINEIROS, PAISES } from "../utils/constants.js";
import {
  getNextNumber,
  generateProductId,
  generateTabName,
} from "../utils/idGenerator.js";
import { UrlAnalyzer } from "../services/urlAnalyzer.js";

/**
 * Validate the incoming product data JSON.
 * @param {object} data - Product creation payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateProductData(data) {
  const errors = [];

  if (!data.url_concorrente) errors.push("url_concorrente é obrigatório");
  if (!data.nome_produto) errors.push("nome_produto é obrigatório");
  if (!data.pais || !PAISES.includes(data.pais.toUpperCase())) {
    errors.push(`pais inválido. Use: ${PAISES.join(", ")}`);
  }
  if (!data.nome_mineiro || !MINEIROS.includes(data.nome_mineiro.toUpperCase())) {
    errors.push(`nome_mineiro inválido. Use: ${MINEIROS.join(", ")}`);
  }
  if (data.drop_id === undefined) errors.push("drop_id é obrigatório");
  if (data.preco === undefined) errors.push("preco é obrigatório");
  if (data.quantidade === undefined) errors.push("quantidade é obrigatório");

  return { valid: errors.length === 0, errors };
}

/**
 * Create a new product sheet in the spreadsheet.
 *
 * Expected input JSON:
 * {
 *   "nome_produto": "Labubu",
 *   "pais": "CO",
 *   "url_concorrente": "https://example.com/product/labubu",
 *   "drop_id": "DRP-001",
 *   "preco": 29.90,
 *   "quantidade": 100,
 *   "verificado": true,
 *   "nome_mineiro": "KARINE",
 *   "page_content": ""  // optional: pre-fetched page text for analysis
 * }
 *
 * @param {import('../services/sheetsService.js').SheetsService} sheets
 * @param {object} productData
 * @returns {Promise<object>} Result with generated ID and analysis
 */
export async function createProduct(sheets, productData) {
  // 1. Validate input
  const validation = validateProductData(productData);
  if (!validation.valid) {
    return {
      status: "erro",
      errors: validation.errors,
    };
  }

  // 2. Analyze URL for compliance (fetch real page content)
  const analysis = productData.page_content
    ? UrlAnalyzer.analyze(productData.url_concorrente, productData.page_content)
    : await UrlAnalyzer.analyzeWithFetch(productData.url_concorrente);

  // 3. Determine next number and generate ID
  const tabNames = await sheets.listTabs();
  const nextNumber = getNextNumber(tabNames);
  const productId = generateProductId(
    nextNumber,
    productData.pais,
    productData.nome_produto
  );
  const tabName = generateTabName(nextNumber, productData.nome_produto);

  // 4. Duplicate template and rename
  await sheets.duplicateTemplate(tabName);

  // 5. Fill in all cells
  const updates = [
    { cell: CELL_MAP.ID, value: productId },
    { cell: CELL_MAP.DROP_ID, value: productData.drop_id },
    { cell: CELL_MAP.PRECO, value: productData.preco },
    { cell: CELL_MAP.QUANTIDADE, value: productData.quantidade },
    { cell: CELL_MAP.URL_CONCORRENTE, value: productData.url_concorrente },
    {
      cell: CELL_MAP.VERIFICADO,
      value: productData.verificado === true ||
        productData.verificado === "true" ||
        productData.verificado === "sim"
        ? true
        : false,
    },
    { cell: CELL_MAP.MINEIRO, value: productData.nome_mineiro.toUpperCase() },
    { cell: CELL_MAP.RISCO_ADS, value: analysis.riscoAds },
    { cell: CELL_MAP.GENERO, value: analysis.genero },
  ];

  await sheets.writeCells(tabName, updates);

  // 6. Build output for next agent
  const output = {
    status: "sucesso",
    id_gerado: productId,
    genero_detectado: analysis.genero,
    analise_risco: analysis.riscoAds,
    tab_nome: tabName,
    numero: nextNumber,
    analise_detalhes: analysis.reasons,
  };

  return output;
}
