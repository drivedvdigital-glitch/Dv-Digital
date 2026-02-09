import { CELL_MAP, VALIDACAO_OPTIONS, CRIATIVO_OPTIONS } from "../utils/constants.js";

/**
 * Parse the /priv1 command string.
 * Format: /priv1 [ID_PRODUTO] [STATUS_VALIDACAO] [DONO_CRIATIVO]
 *
 * @param {string} input - Full command string
 * @returns {{ valid: boolean, productId?: string, validacao?: string, criativo?: string, errors?: string[] }}
 */
export function parsePriv1Command(input) {
  const errors = [];
  const parts = input.trim().split(/\s+/);

  // parts[0] = "/priv1", parts[1] = ID, parts[2] = status, parts[3+] = name
  if (parts.length < 4) {
    return {
      valid: false,
      errors: ["Formato: /priv1 [ID_PRODUTO] [STATUS_VALIDACAO] [DONO_CRIATIVO]"],
    };
  }

  const productId = parts[1];

  // Status can be multi-word: "Mais ou Menos"
  // Strategy: try to match criativo name from the end, rest is status
  const lastWord = parts[parts.length - 1].toUpperCase();
  const criativo = CRIATIVO_OPTIONS.find((c) => c === lastWord);

  if (!criativo) {
    errors.push(
      `Dono criativo inválido: "${parts[parts.length - 1]}". Use: ${CRIATIVO_OPTIONS.join(", ")}`
    );
  }

  // Everything between productId and criativo is the validation status
  const statusParts = parts.slice(2, parts.length - 1);
  const statusRaw = statusParts.join(" ");

  // Find exact match in allowed values (case-insensitive lookup, exact value output)
  const validacao = VALIDACAO_OPTIONS.find(
    (v) => v.toLowerCase() === statusRaw.toLowerCase()
  );

  if (!validacao) {
    errors.push(
      `Status validação inválido: "${statusRaw}". Use: ${VALIDACAO_OPTIONS.join(", ")}`
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, productId, validacao, criativo };
}

/**
 * Execute the /priv1 command: update validation status and creative owner.
 *
 * @param {import('../services/sheetsService.js').SheetsService} sheets
 * @param {string} input - The raw /priv1 command string
 * @returns {Promise<object>} Result object
 */
export async function updateProduct(sheets, input) {
  // 1. Parse command
  const parsed = parsePriv1Command(input);
  if (!parsed.valid) {
    return { status: "erro", errors: parsed.errors };
  }

  const { productId, validacao, criativo } = parsed;

  // 2. Find the product tab
  let tabName = await sheets.findTabByProductId(productId);

  // Fallback: try to find by prefix (the numeric part)
  if (!tabName) {
    const numericPrefix = productId.split("-")[0];
    tabName = await sheets.findTabByPrefix(numericPrefix);
  }

  if (!tabName) {
    return {
      status: "erro",
      errors: [`Produto não encontrado: "${productId}"`],
    };
  }

  // 3. Update cells
  await sheets.writeCells(tabName, [
    { cell: CELL_MAP.VALIDACAO, value: validacao },
    { cell: CELL_MAP.CRIATIVO, value: criativo },
  ]);

  return {
    status: "sucesso",
    mensagem: `Atualização Privada: Produto ${productId} validado como ${validacao} por ${criativo}.`,
    tab: tabName,
    validacao,
    criativo,
  };
}
