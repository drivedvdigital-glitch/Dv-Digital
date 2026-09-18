import { z } from "zod";
import { normalizarTelefone } from "@/lib/domain";
import type { MensagemRecebida, ResultadoEnvio, WhatsAppProvider } from "./types";

/**
 * Formato do webhook da Evolution API (evento messages.upsert).
 * Só os campos que usamos — o payload real traz bem mais coisa.
 */
const eventoEvolutionSchema = z.object({
  event: z.string().optional(),
  data: z.object({
    key: z.object({
      id: z.string(),
      remoteJid: z.string(),
      fromMe: z.boolean().optional(),
    }),
    message: z
      .object({
        conversation: z.string().optional(),
        extendedTextMessage: z.object({ text: z.string() }).optional(),
      })
      .nullish(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  }),
});

/** "5511999998888@s.whatsapp.net" -> "5511999998888" (ignora grupos). */
function telefoneDoJid(jid: string): string | null {
  if (jid.endsWith("@g.us")) return null; // mensagem de grupo
  return normalizarTelefone(jid.split("@")[0] ?? "");
}

/**
 * Evolution API — gateway auto-hospedado, o caminho mais comum no Brasil por
 * funcionar com um número de WhatsApp comum, sem aprovação da Meta.
 */
export class EvolutionProvider implements WhatsAppProvider {
  readonly nome = "evolution";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instancia: string,
  ) {}

  async enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/message/sendText/${this.instancia}`;
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: telefone, text: texto }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      throw new Error(
        `Evolution API respondeu ${resposta.status} ao enviar mensagem: ${corpo.slice(0, 300)}`,
      );
    }

    const json: unknown = await resposta.json().catch(() => null);
    const id = z
      .object({ key: z.object({ id: z.string() }) })
      .safeParse(json);

    return { externalId: id.success ? id.data.key.id : `evo_${Date.now()}` };
  }

  parseWebhook(payload: unknown): MensagemRecebida[] {
    const parsed = eventoEvolutionSchema.safeParse(payload);
    if (!parsed.success) return [];

    const { key, message, messageTimestamp } = parsed.data.data;
    // Echo das mensagens que nós mesmos mandamos: ignorar, senão o agente
    // responde a si próprio.
    if (key.fromMe) return [];

    const texto = message?.conversation ?? message?.extendedTextMessage?.text;
    if (!texto) return []; // áudio, imagem, figurinha: fora do escopo do agente

    const telefone = telefoneDoJid(key.remoteJid);
    if (!telefone) return [];

    const segundos = Number(messageTimestamp);
    return [
      {
        externalId: key.id,
        telefone,
        texto,
        recebidaEm: Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date(),
      },
    ];
  }
}
