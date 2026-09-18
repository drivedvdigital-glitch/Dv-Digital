import { z } from "zod";
import { normalizarTelefone } from "@/lib/domain";
import type { MensagemRecebida, ResultadoEnvio, WhatsAppProvider } from "./types";

/** Mensagem enviada pelo mock, guardada em memória para inspeção no dev. */
export interface EnvioMock {
  telefone: string;
  texto: string;
  enviadoEm: Date;
}

const enviados: EnvioMock[] = [];

/** Últimos envios do mock, do mais recente para o mais antigo. */
export function enviosMock(limite = 50): EnvioMock[] {
  return enviados.slice(-limite).reverse();
}

const payloadMockSchema = z.object({
  telefone: z.string(),
  texto: z.string().min(1),
  externalId: z.string().optional(),
});

/**
 * Provedor de desenvolvimento: não fala com o WhatsApp de verdade. Deixa você
 * rodar a operação inteira — agentes, fila, dashboard — antes de conectar um
 * número. As mensagens "enviadas" saem no console do servidor.
 *
 * Para simular um cliente respondendo:
 *   curl -X POST localhost:3000/api/webhook/whatsapp \
 *     -H 'content-type: application/json' \
 *     -H "x-webhook-token: $WEBHOOK_SECRET" \
 *     -d '{"telefone":"11999998888","texto":"pode enviar sim"}'
 */
export class MockProvider implements WhatsAppProvider {
  readonly nome = "mock";

  async enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio> {
    enviados.push({ telefone, texto, enviadoEm: new Date() });
    console.log(`[whatsapp:mock] -> ${telefone}: ${texto}`);
    return { externalId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` };
  }

  parseWebhook(payload: unknown): MensagemRecebida[] {
    const parsed = payloadMockSchema.safeParse(payload);
    if (!parsed.success) return [];

    const telefone = normalizarTelefone(parsed.data.telefone);
    if (!telefone) return [];

    return [
      {
        externalId: parsed.data.externalId ?? `mock_in_${Date.now()}`,
        telefone,
        texto: parsed.data.texto,
        recebidaEm: new Date(),
      },
    ];
  }
}
