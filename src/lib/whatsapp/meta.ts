import { z } from "zod";
import { normalizarTelefone } from "@/lib/domain";
import type { MensagemRecebida, ResultadoEnvio, WhatsAppProvider } from "./types";

const GRAPH_VERSION = "v21.0";

/**
 * Webhook da WhatsApp Cloud API. Um POST pode trazer várias entries, cada uma
 * com várias changes — e a maioria delas é status de entrega, não mensagem.
 */
const eventoMetaSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  type: z.string().optional(),
                  timestamp: z.string().optional(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

/**
 * WhatsApp Cloud API oficial da Meta. Exige número aprovado e templates
 * homologados para iniciar conversa fora da janela de 24h.
 */
export class MetaProvider implements WhatsAppProvider {
  readonly nome = "meta";

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefone,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(
        `WhatsApp Cloud API respondeu ${resposta.status} ao enviar mensagem: ${corpo.slice(0, 300)}`,
      );
    }

    const json: unknown = await resposta.json().catch(() => null);
    const id = z
      .object({ messages: z.array(z.object({ id: z.string() })).min(1) })
      .safeParse(json);

    return { externalId: id.success ? id.data.messages[0].id : `meta_${Date.now()}` };
  }

  parseWebhook(payload: unknown): MensagemRecebida[] {
    const parsed = eventoMetaSchema.safeParse(payload);
    if (!parsed.success) return [];

    const recebidas: MensagemRecebida[] = [];
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        for (const msg of change.value.messages ?? []) {
          if (msg.type && msg.type !== "text") continue;
          if (!msg.text?.body) continue;

          const telefone = normalizarTelefone(msg.from);
          if (!telefone) continue;

          const segundos = Number(msg.timestamp);
          recebidas.push({
            externalId: msg.id,
            telefone,
            texto: msg.text.body,
            recebidaEm: Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date(),
          });
        }
      }
    }
    return recebidas;
  }
}
