import { EvolutionProvider } from "./evolution";
import { MetaProvider } from "./meta";
import { MockProvider } from "./mock";
import type { WhatsAppProvider } from "./types";

export type { MensagemRecebida, ResultadoEnvio, WhatsAppProvider } from "./types";
export { enviosMock } from "./mock";

let cache: WhatsAppProvider | undefined;

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `${nome} não está definida, mas WHATSAPP_PROVIDER=${process.env.WHATSAPP_PROVIDER} exige essa variável.`,
    );
  }
  return valor;
}

function criar(): WhatsAppProvider {
  switch (process.env.WHATSAPP_PROVIDER) {
    case "evolution":
      return new EvolutionProvider(
        exigir("EVOLUTION_API_URL"),
        exigir("EVOLUTION_API_KEY"),
        exigir("EVOLUTION_INSTANCE"),
      );
    case "meta":
      return new MetaProvider(exigir("META_PHONE_NUMBER_ID"), exigir("META_ACCESS_TOKEN"));
    default:
      // Sem provedor configurado, o mock mantém o app utilizável de ponta a ponta.
      return new MockProvider();
  }
}

/** Provedor de WhatsApp ativo, decidido por WHATSAPP_PROVIDER. */
export function whatsapp(): WhatsAppProvider {
  cache ??= criar();
  return cache;
}
