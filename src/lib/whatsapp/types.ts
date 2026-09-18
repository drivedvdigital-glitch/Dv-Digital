/** Uma mensagem do cliente, já normalizada, seja qual for o provedor. */
export interface MensagemRecebida {
  /** ID da mensagem no provedor. Usado para não processar o mesmo webhook duas vezes. */
  externalId: string;
  /** Telefone do cliente em E.164 sem o "+", ex: 5511999998888. */
  telefone: string;
  texto: string;
  recebidaEm: Date;
}

export interface ResultadoEnvio {
  externalId: string;
}

/**
 * Contrato que todo provedor de WhatsApp precisa cumprir. Trocar de provedor
 * é trocar a variável WHATSAPP_PROVIDER — nada no resto do app muda.
 */
export interface WhatsAppProvider {
  readonly nome: string;

  /** Envia uma mensagem de texto para o cliente. */
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;

  /**
   * Traduz o payload bruto do webhook para mensagens normalizadas.
   *
   * O payload vem da internet: nunca confie no formato. Retorne uma lista
   * vazia para qualquer coisa que não seja uma mensagem de texto do cliente
   * (status de entrega, echo das nossas próprias mensagens, mídia, etc).
   */
  parseWebhook(payload: unknown): MensagemRecebida[];
}
