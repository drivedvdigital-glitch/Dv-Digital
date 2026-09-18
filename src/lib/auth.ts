import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export type Autorizacao = { ok: true } | { ok: false; motivo: string };

/** Comparação em tempo constante, para não vazar o segredo por timing. */
function iguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Autoriza um POST de webhook.
 *
 * A Meta assina o corpo com HMAC-SHA256 usando o app secret e manda em
 * x-hub-signature-256. Os demais provedores não assinam nada, então exigimos
 * um segredo compartilhado no header x-webhook-token — é o que impede alguém
 * de forjar uma "resposta do cliente" e confirmar pedidos na sua operação.
 */
export function autorizarWebhook(req: NextRequest, corpoBruto: string): Autorizacao {
  if (process.env.WHATSAPP_PROVIDER === "meta") {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return {
        ok: false,
        motivo:
          "META_APP_SECRET não configurado. Sem ele não dá para verificar a assinatura da Meta.",
      };
    }

    const assinatura = req.headers.get("x-hub-signature-256");
    if (!assinatura?.startsWith("sha256=")) {
      return { ok: false, motivo: "Assinatura x-hub-signature-256 ausente." };
    }

    const esperado = createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex");
    return iguais(assinatura.slice("sha256=".length), esperado)
      ? { ok: true }
      : { ok: false, motivo: "Assinatura inválida." };
  }

  const segredo = process.env.WEBHOOK_SECRET;
  if (!segredo || segredo === "troque-este-valor") {
    return {
      ok: false,
      motivo: "WEBHOOK_SECRET não foi configurado. Defina um valor próprio no .env.",
    };
  }

  const token = req.headers.get("x-webhook-token");
  if (!token) return { ok: false, motivo: "Header x-webhook-token ausente." };

  return iguais(token, segredo)
    ? { ok: true }
    : { ok: false, motivo: "Token de webhook inválido." };
}

/**
 * Autoriza as rotas internas de operação (importar pedido, disparar contato).
 * Mesmo segredo do webhook — este app não tem login de usuário ainda.
 */
export function autorizarOperacao(req: NextRequest): Autorizacao {
  const segredo = process.env.WEBHOOK_SECRET;
  if (!segredo || segredo === "troque-este-valor") {
    return {
      ok: false,
      motivo: "WEBHOOK_SECRET não foi configurado. Defina um valor próprio no .env.",
    };
  }
  const token = req.headers.get("x-webhook-token");
  if (!token) return { ok: false, motivo: "Header x-webhook-token ausente." };

  return iguais(token, segredo)
    ? { ok: true }
    : { ok: false, motivo: "Token inválido." };
}
