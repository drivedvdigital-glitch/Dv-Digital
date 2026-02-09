/**
 * Google Sheets MCP Service Layer.
 *
 * This module provides an abstraction over the Google Sheets MCP tools.
 * When running inside Claude with MCP tools available, the methods here
 * map directly to MCP tool calls. When running standalone, they can be
 * overridden with a custom adapter (e.g., Google Sheets API directly).
 */

export class SheetsService {
  /**
   * @param {object} mcpClient - MCP client or adapter with tool calling capability
   * @param {string} spreadsheetId - The target Google Sheets spreadsheet ID
   */
  constructor(mcpClient, spreadsheetId) {
    this.mcp = mcpClient;
    this.spreadsheetId = spreadsheetId;
  }

  /**
   * List all tab (sheet) names in the spreadsheet.
   * @returns {Promise<string[]>} Array of sheet tab names
   */
  async listTabs() {
    const result = await this.mcp.callTool("sheets_get_spreadsheet_info", {
      spreadsheet_id: this.spreadsheetId,
    });
    return this._parseTabNames(result);
  }

  /**
   * Read a single cell value.
   * @param {string} sheetName - Tab name
   * @param {string} cell - Cell reference (e.g., "I2")
   * @returns {Promise<string>} Cell value
   */
  async readCell(sheetName, cell) {
    const range = `'${sheetName}'!${cell}`;
    const result = await this.mcp.callTool("sheets_read_range", {
      spreadsheet_id: this.spreadsheetId,
      range,
    });
    return this._parseCellValue(result);
  }

  /**
   * Write a value to a single cell.
   * @param {string} sheetName - Tab name
   * @param {string} cell - Cell reference (e.g., "C15")
   * @param {string|number|boolean} value - Value to write
   * @returns {Promise<void>}
   */
  async writeCell(sheetName, cell, value) {
    const range = `'${sheetName}'!${cell}`;
    await this.mcp.callTool("sheets_update_cells", {
      spreadsheet_id: this.spreadsheetId,
      range,
      values: [[value]],
    });
  }

  /**
   * Write multiple cells in a batch operation.
   * @param {string} sheetName - Tab name
   * @param {Array<{cell: string, value: any}>} updates - Array of cell-value pairs
   * @returns {Promise<void>}
   */
  async writeCells(sheetName, updates) {
    for (const { cell, value } of updates) {
      await this.writeCell(sheetName, cell, value);
    }
  }

  /**
   * Duplicate the "template" tab and rename the copy.
   * @param {string} newName - The name for the new tab
   * @returns {Promise<void>}
   */
  async duplicateTemplate(newName) {
    // First get the template sheet ID
    const info = await this.mcp.callTool("sheets_get_spreadsheet_info", {
      spreadsheet_id: this.spreadsheetId,
    });
    const templateSheetId = this._findSheetId(info, "template");

    if (templateSheetId === null) {
      throw new Error('Aba "template" não encontrada na planilha.');
    }

    // Duplicate the template
    await this.mcp.callTool("sheets_duplicate_sheet", {
      spreadsheet_id: this.spreadsheetId,
      sheet_id: templateSheetId,
      new_name: newName,
    });

    // Move the new tab to the last position
    await this.moveSheetToEnd(newName);
  }

  /**
   * Move a sheet tab to the last position in the spreadsheet.
   * Keeps tabs in sequential order (793, 794, 795...).
   * @param {string} sheetName - Name of the tab to move
   * @returns {Promise<void>}
   */
  async moveSheetToEnd(sheetName) {
    const info = await this.mcp.callTool("sheets_get_spreadsheet_info", {
      spreadsheet_id: this.spreadsheetId,
    });

    const sheetId = this._findSheetId(info, sheetName);
    if (sheetId === null) {
      throw new Error(`Aba "${sheetName}" não encontrada para mover.`);
    }

    const totalSheets = info?.sheets?.length || 0;

    await this.mcp.callTool("sheets_batch_update", {
      spreadsheet_id: this.spreadsheetId,
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              index: totalSheets - 1,
            },
            fields: "index",
          },
        },
      ],
    });
  }

  /**
   * Find a tab that contains a specific product ID in cell I2.
   * @param {string} productId - The product ID to search for
   * @returns {Promise<string|null>} The tab name or null if not found
   */
  async findTabByProductId(productId) {
    const tabs = await this.listTabs();
    for (const tab of tabs) {
      if (tab === "template") continue;
      try {
        const value = await this.readCell(tab, "I2");
        if (value === productId) {
          return tab;
        }
      } catch {
        // Tab might not have I2 or be inaccessible
        continue;
      }
    }
    return null;
  }

  /**
   * Find a tab by partial name match (product ID prefix).
   * @param {string} idPrefix - Beginning of the tab name (e.g., "794")
   * @returns {Promise<string|null>} The matching tab name or null
   */
  async findTabByPrefix(idPrefix) {
    const tabs = await this.listTabs();
    return tabs.find((tab) => tab.startsWith(idPrefix)) || null;
  }

  // --- Internal parsing helpers ---

  _parseTabNames(result) {
    if (Array.isArray(result)) return result;
    if (result?.sheets) {
      return result.sheets.map(
        (s) => s.properties?.title || s.title || s.name
      );
    }
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        return this._parseTabNames(parsed);
      } catch {
        return result.split("\n").filter(Boolean);
      }
    }
    return [];
  }

  _parseCellValue(result) {
    if (typeof result === "string") return result;
    if (Array.isArray(result) && result[0]) {
      return Array.isArray(result[0]) ? result[0][0] : result[0];
    }
    if (result?.values?.[0]?.[0] !== undefined) {
      return String(result.values[0][0]);
    }
    return String(result ?? "");
  }

  _findSheetId(info, sheetName) {
    const lower = sheetName.toLowerCase();
    if (info?.sheets) {
      const sheet = info.sheets.find(
        (s) => (s.properties?.title || s.title || "").toLowerCase() === lower
      );
      return sheet?.properties?.sheetId ?? sheet?.sheetId ?? null;
    }
    return null;
  }
}
