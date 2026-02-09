import {
  BRAND_KEYWORDS,
  HEALTH_CLAIM_KEYWORDS,
  MALE_KEYWORDS,
  FEMALE_KEYWORDS,
} from "../utils/constants.js";

/**
 * Analyze a competitor URL/product page for Google Ads compliance.
 * Returns risk classification and detected gender target.
 */
export class UrlAnalyzer {
  /**
   * Fetch page content from a URL.
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Page text content (or empty on failure)
   */
  static async fetchPageContent(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      clearTimeout(timeout);

      if (!response.ok) return "";

      const html = await response.text();

      // Strip HTML tags, keep text content
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return "";
    }
  }

  /**
   * Full analysis pipeline: fetch URL + analyze content.
   * @param {string} url - The competitor product URL
   * @returns {Promise<{ riscoAds: string, genero: string, reasons: string[] }>}
   */
  static async analyzeWithFetch(url) {
    const pageContent = await this.fetchPageContent(url);
    return this.analyze(url, pageContent);
  }

  /**
   * Analyze product content for risk and gender classification.
   * @param {string} url - The competitor product URL
   * @param {string} [pageContent] - Optional pre-fetched page content
   * @returns {{ riscoAds: string, genero: string, reasons: string[] }}
   */
  static analyze(url, pageContent = "") {
    const textToAnalyze = (url + " " + pageContent).toLowerCase();
    const reasons = [];

    const riscoAds = this.classifyRisk(textToAnalyze, reasons);
    const genero = this.classifyGender(textToAnalyze);

    return { riscoAds, genero, reasons };
  }

  /**
   * Classify the Google Ads risk level based on content analysis.
   * Priority: Marca > Atenção > Dúvida > De boa
   * @param {string} text - Lowercased text to analyze
   * @param {string[]} reasons - Mutable array to collect reasoning
   * @returns {string} Risk classification
   */
  static classifyRisk(text, reasons) {
    // Check for known brand names first (highest specificity)
    for (const brand of BRAND_KEYWORDS) {
      if (text.includes(brand)) {
        reasons.push(`Marca detectada: "${brand}"`);
        return "Marca";
      }
    }

    // Check for health/beauty miracle claims
    const healthMatches = [];
    for (const keyword of HEALTH_CLAIM_KEYWORDS) {
      if (text.includes(keyword)) {
        healthMatches.push(keyword);
      }
    }

    if (healthMatches.length >= 2) {
      reasons.push(
        `Múltiplas claims de saúde/beleza: ${healthMatches.join(", ")}`
      );
      return "Atenção";
    }

    if (healthMatches.length === 1) {
      reasons.push(`Claim suspeita encontrada: "${healthMatches[0]}"`);
      return "Dúvida";
    }

    // No risk signals found
    reasons.push("Produto genérico sem indicadores de risco");
    return "De boa";
  }

  /**
   * Classify the target gender based on product content.
   * @param {string} text - Lowercased text to analyze
   * @returns {string} "Homem", "Mulher", or "Ambos"
   */
  static classifyGender(text) {
    let maleScore = 0;
    let femaleScore = 0;

    for (const keyword of MALE_KEYWORDS) {
      if (text.includes(keyword)) maleScore++;
    }

    for (const keyword of FEMALE_KEYWORDS) {
      if (text.includes(keyword)) femaleScore++;
    }

    if (maleScore > 0 && femaleScore === 0) return "Homem";
    if (femaleScore > 0 && maleScore === 0) return "Mulher";
    return "Ambos";
  }

  /**
   * Extract a base product name from a URL path.
   * @param {string} url - The product URL
   * @returns {string} Extracted product name or empty string
   */
  static extractProductNameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname
        .split("/")
        .filter((s) => s.length > 0);

      const slug = pathSegments[pathSegments.length - 1] || "";
      return slug
        .replace(/[-_]/g, " ")
        .replace(/\.\w+$/, "")
        .trim();
    } catch {
      return "";
    }
  }
}
