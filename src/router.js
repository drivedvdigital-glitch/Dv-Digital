import { createProduct } from "./commands/createProduct.js";
import { updateProduct } from "./commands/updateProduct.js";

/**
 * Command Router for the Inventory & Compliance Manager Agent.
 *
 * Routes incoming messages to the appropriate handler:
 * - /priv1 commands -> updateProduct (Scenario A)
 * - JSON payloads  -> createProduct (Scenario B)
 */
export class CommandRouter {
  /**
   * @param {import('./services/sheetsService.js').SheetsService} sheetsService
   */
  constructor(sheetsService) {
    this.sheets = sheetsService;
  }

  /**
   * Route an incoming message to the correct command handler.
   * @param {string} input - Raw user input (command string or JSON)
   * @returns {Promise<object>} Command result
   */
  async route(input) {
    const trimmed = input.trim();

    // Scenario A: /priv1 command
    if (trimmed.startsWith("/priv1")) {
      return this.handlePriv1(trimmed);
    }

    // Scenario B: JSON product creation
    if (trimmed.startsWith("{")) {
      return this.handleProductCreation(trimmed);
    }

    return {
      status: "erro",
      errors: [
        "Comando não reconhecido. Use /priv1 ou envie um JSON de produto.",
      ],
    };
  }

  /**
   * Handle /priv1 update command.
   * @param {string} input
   * @returns {Promise<object>}
   */
  async handlePriv1(input) {
    return updateProduct(this.sheets, input);
  }

  /**
   * Handle product creation from JSON input.
   * @param {string} jsonString
   * @returns {Promise<object>}
   */
  async handleProductCreation(jsonString) {
    let productData;
    try {
      productData = JSON.parse(jsonString);
    } catch (e) {
      return {
        status: "erro",
        errors: [`JSON inválido: ${e.message}`],
      };
    }
    return createProduct(this.sheets, productData);
  }
}
