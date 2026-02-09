import { SheetsService } from "./services/sheetsService.js";
import { CommandRouter } from "./router.js";

/**
 * Inventory & Compliance Manager Agent
 *
 * Entry point for the agent. Can run in two modes:
 *
 * 1. CLI Mode: Pass a command as argument
 *    node src/index.js '{"nome_produto": "Labubu", ...}'
 *    node src/index.js '/priv1 794-CO-labubu Sim KARINE'
 *
 * 2. MCP Integration Mode: Import and use programmatically
 *    import { createAgent } from './index.js';
 *    const agent = createAgent(mcpClient, spreadsheetId);
 *    const result = await agent.route(input);
 */

/**
 * Create an agent instance with the given MCP client and spreadsheet ID.
 * @param {object} mcpClient - MCP client with callTool method
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @returns {CommandRouter}
 */
export function createAgent(mcpClient, spreadsheetId) {
  const sheets = new SheetsService(mcpClient, spreadsheetId);
  return new CommandRouter(sheets);
}

/**
 * CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Agente Gerente de Estoque e Compliance - Dv Digital");
    console.log("");
    console.log("Uso:");
    console.log("  Criar produto:   node src/index.js '{\"nome_produto\": ...}'");
    console.log("  Atualizar:       node src/index.js '/priv1 ID STATUS DONO'");
    console.log("");
    console.log("Para integração MCP, importe createAgent() programaticamente.");
    process.exit(0);
  }

  const input = args.join(" ");

  // In CLI mode without MCP, provide a mock client for testing
  const mockMcpClient = {
    callTool: async (toolName, params) => {
      console.log(`[MCP] ${toolName}`, JSON.stringify(params, null, 2));
      // Return mock data for testing
      if (toolName === "sheets_get_spreadsheet_info") {
        return {
          sheets: [
            { properties: { title: "template", sheetId: 0 } },
            { properties: { title: "793 produto-teste", sheetId: 1 } },
          ],
        };
      }
      if (toolName === "sheets_read_range") {
        return { values: [[""]] };
      }
      return {};
    },
  };

  const spreadsheetId = process.env.SPREADSHEET_ID || "1-GX9TTErcOsFykLLwJc9sBpKEi-y0p5SDTJ5vgiGRaA";
  const agent = createAgent(mockMcpClient, spreadsheetId);

  try {
    const result = await agent.route(input);
    console.log("\n--- Resultado ---");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Erro:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMainModule || process.argv[1]?.endsWith("index.js")) {
  main();
}
