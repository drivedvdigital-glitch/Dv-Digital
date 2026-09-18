import { z } from "zod";

export interface EnderecoCEP {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

const respostaViaCepSchema = z.object({
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

/**
 * Consulta um CEP no ViaCEP. Serviço público e gratuito, sem chave.
 *
 * Retorna null quando o CEP não existe ou o serviço está fora do ar — nos dois
 * casos o agente deve pedir o endereço por escrito em vez de travar.
 */
export async function consultarCEP(cepBruto: string): Promise<EnderecoCEP | null> {
  const cep = cepBruto.replace(/\D/g, "");
  if (cep.length !== 8) return null;

  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return null;

    const parsed = respostaViaCepSchema.safeParse(await resposta.json());
    if (!parsed.success) return null;

    // O ViaCEP responde 200 com {"erro": true} para CEP inexistente.
    const { erro, localidade, uf } = parsed.data;
    if (erro === true || erro === "true" || !localidade || !uf) return null;

    return {
      cep,
      logradouro: parsed.data.logradouro ?? "",
      bairro: parsed.data.bairro ?? "",
      cidade: localidade,
      uf,
    };
  } catch {
    // Timeout, DNS, rede: tratado como "não consegui conferir".
    return null;
  }
}
