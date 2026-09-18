import Anthropic from "@anthropic-ai/sdk";

let cache: Anthropic | undefined;

/**
 * Modelo que atende os clientes. Confirmar ou recusar um pedido é uma decisão
 * com custo real, então o padrão é o modelo mais capaz.
 */
export const MODELO = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/**
 * Esforço de raciocínio por turno. Atendimento de WhatsApp é conversa curta e
 * sensível a latência: "medium" responde rápido e dá conta do roteiro. Suba
 * para "high" se a operação tiver produto complexo e muita objeção técnica.
 */
export const ESFORCO = (process.env.ANTHROPIC_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Teto de idas e voltas com ferramentas em um único turno. */
export const MAX_ITERACOES = Number(process.env.ANTHROPIC_MAX_ITERACOES ?? 12);

export function anthropic(): Anthropic {
  if (!cache) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY não está definida. Pegue uma chave em https://console.anthropic.com/settings/keys e coloque no .env.",
      );
    }
    cache = new Anthropic();
  }
  return cache;
}
