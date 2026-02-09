/**
 * Validation lists for Google Sheets dropdowns.
 * All values are case-sensitive and must match exactly.
 */

export const RISCO_ADS_OPTIONS = ["De boa", "Atenção", "Marca", "Dúvida"];

export const MINEIROS = ["KARINE", "MIGUEL", "JOÃO", "VANDERSON"];

export const VALIDACAO_OPTIONS = ["Sim", "Não", "Mais ou Menos"];

export const CRIATIVO_OPTIONS = ["KARINE", "MIGUEL", "JOÃO", "VANDERSON"];

export const GENERO_OPTIONS = ["Homem", "Mulher", "Ambos"];

export const PAISES = ["CO", "RO", "GT", "ES", "PT", "CZ", "PL", "HU"];

/** Mapeamento completo: sigla → nome do país */
export const PAISES_NOMES = {
  CO: "Colômbia",
  RO: "Romênia",
  GT: "Guatemala",
  ES: "Espanha",
  PT: "Portugal",
  CZ: "República Tcheca",
  PL: "Polônia",
  HU: "Hungria",
};

/** Cell mapping for the product sheet template */
export const CELL_MAP = {
  ID: "I2",
  DROP_ID: "I6",
  PRECO: "K6",
  QUANTIDADE: "L6",
  URL_CONCORRENTE: "F12",
  VERIFICADO: "J6",
  RISCO_ADS: "C15",
  MINEIRO: "C17",
  VALIDACAO: "C19",
  CRIATIVO: "C21",
  GENERO: "R2",
};

/** Brand keywords that trigger "Marca" risk classification */
export const BRAND_KEYWORDS = [
  "nike", "adidas", "apple", "samsung", "sony", "gucci", "prada",
  "louis vuitton", "chanel", "dior", "versace", "armani", "rolex",
  "cartier", "hermes", "burberry", "balenciaga", "fendi", "puma",
  "reebok", "under armour", "new balance", "converse", "vans",
  "microsoft", "google", "amazon", "lg", "huawei", "xiaomi",
  "philips", "bosch", "siemens", "dyson", "kitchenaid", "braun",
];

/** Keywords that trigger "Atenção" risk for misleading health/beauty claims */
export const HEALTH_CLAIM_KEYWORDS = [
  "emagrec", "emagrecimento", "antes e depois", "milagroso", "milagre",
  "rejuvenesce", "rejuvenescimento", "anti-idade", "anti-rugas",
  "queima gordura", "queima de gordura", "perda de peso", "perde peso",
  "elimina celulite", "acne", "manchas na pele", "clareamento",
  "crescimento capilar", "calvície", "queda de cabelo",
  "whitening", "slimming", "weight loss", "fat burn", "miracle",
  "before and after", "anti-aging", "wrinkle", "skin lightening",
  "hair growth", "baldness", "acne removal",
];

/** Keywords that indicate male-targeted products */
export const MALE_KEYWORDS = [
  "barba", "barbear", "beard", "shaving", "masculino", "homem", "men",
  "gravata", "cueca", "suspensório", "abotoadura",
];

/** Keywords that indicate female-targeted products */
export const FEMALE_KEYWORDS = [
  "sutiã", "bra", "feminino", "mulher", "women", "batom", "lipstick",
  "rímel", "mascara", "saia", "vestido", "dress", "calcinha",
  "meia-calça", "cílios", "eyelash", "maternidade", "maternity",
];
