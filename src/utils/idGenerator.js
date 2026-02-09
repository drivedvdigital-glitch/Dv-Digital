import { PAISES } from "./constants.js";

/**
 * Extract the numeric prefix from a sheet tab name.
 * Tab names follow the pattern: "794 produto-nome"
 * Returns the number or null if not found.
 */
export function extractTabNumber(tabName) {
  const match = tabName.match(/^(\d+)\s/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Find the highest product number across all sheet tabs.
 * @param {string[]} tabNames - List of all tab names in the spreadsheet
 * @returns {number} The highest number found, or 0 if none
 */
export function findHighestNumber(tabNames) {
  let max = 0;
  for (const name of tabNames) {
    const num = extractTabNumber(name);
    if (num !== null && num > max) {
      max = num;
    }
  }
  return max;
}

/**
 * Generate the next product number.
 * @param {string[]} tabNames - List of all tab names
 * @returns {number} The next sequential number
 */
export function getNextNumber(tabNames) {
  return findHighestNumber(tabNames) + 1;
}

/**
 * Generate a product ID in the format: NUMBER-COUNTRY-name
 * Example: 794-CO-labubu
 * @param {number} number - Product sequence number
 * @param {string} countryCode - Country code (must be in PAISES list)
 * @param {string} productName - Base product name
 * @returns {string} The formatted product ID
 */
export function generateProductId(number, countryCode, productName) {
  const upperCountry = countryCode.toUpperCase();
  if (!PAISES.includes(upperCountry)) {
    throw new Error(
      `País inválido: "${countryCode}". Use: ${PAISES.join(", ")}`
    );
  }
  const baseName = productName.toLowerCase().trim().replace(/\s+/g, "-");
  return `${number}-${upperCountry}-${baseName}`;
}

/**
 * Generate the tab name for a new product sheet.
 * Format: "NUMBER nome_produto"
 * @param {number} number - Product sequence number
 * @param {string} productName - Product name
 * @returns {string} The tab name
 */
export function generateTabName(number, productName) {
  return `${number} ${productName}`;
}
