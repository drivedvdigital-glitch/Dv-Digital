import { z } from "zod";

/**
 * Vocabulário da operação. O banco guarda estes valores como String para o
 * schema continuar portável entre SQLite e PostgreSQL, então a validação de
 * verdade acontece aqui, com zod, antes de qualquer escrita.
 */

export const statusPedidoSchema = z.enum([
  /** Pedido importado, primeiro contato ainda não foi enviado. */
  "AGUARDANDO",
  /** Agente conversando com o cliente agora. */
  "EM_CONTATO",
  /** Cliente confirmou: pode faturar e enviar. */
  "CONFIRMADO",
  /** Cliente desistiu. O motivo fica em Pedido.motivoRecusa. */
  "RECUSADO",
  /** Cliente quer receber, mas o endereço não fecha. Não envie ainda. */
  "ENDERECO_PENDENTE",
  /** Estourou o limite de tentativas sem resposta. */
  "SEM_RESPOSTA",
  /** Caso fora do alcance do agente, esperando um humano. */
  "ESCALADO",
]);
export type StatusPedido = z.infer<typeof statusPedidoSchema>;

export const agenteSchema = z.enum([
  /** Conduz a confirmação: identidade, itens, valor, prazo. */
  "CONFIRMADOR",
  /** Responde dúvida técnica sobre o produto usando a base de objeções. */
  "OBJECOES",
  /** Conserta endereço incompleto ou divergente do CEP. */
  "ENDERECO",
]);
export type Agente = z.infer<typeof agenteSchema>;

export const direcaoSchema = z.enum(["ENTRADA", "SAIDA"]);
export type Direcao = z.infer<typeof direcaoSchema>;

export const autorSchema = z.enum(["CLIENTE", "AGENTE", "HUMANO", "SISTEMA"]);
export type Autor = z.infer<typeof autorSchema>;

export const tipoEventoSchema = z.enum([
  "CONTATO_INICIADO",
  "CONFIRMADO",
  "RECUSADO",
  "ENDERECO_CORRIGIDO",
  "OBJECAO_RESPONDIDA",
  "ESCALADO",
  "SEM_RESPOSTA",
  "ERRO_AGENTE",
]);
export type TipoEvento = z.infer<typeof tipoEventoSchema>;

/** Status a partir dos quais o agente ainda pode agir sobre o pedido. */
export const STATUS_ABERTOS: StatusPedido[] = [
  "AGUARDANDO",
  "EM_CONTATO",
  "ENDERECO_PENDENTE",
];

/**
 * Status em que uma mensagem do cliente ainda reabre o atendimento. Inclui
 * SEM_RESPOSTA porque o cliente que some e volta dois dias depois é venda que
 * ainda dá para salvar.
 */
export const STATUS_REENGAJAVEIS: StatusPedido[] = [...STATUS_ABERTOS, "SEM_RESPOSTA"];

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  AGUARDANDO: "Aguardando contato",
  EM_CONTATO: "Em atendimento",
  CONFIRMADO: "Confirmado",
  RECUSADO: "Recusado",
  ENDERECO_PENDENTE: "Endereço pendente",
  SEM_RESPOSTA: "Sem resposta",
  ESCALADO: "Escalado p/ humano",
};

export const ROTULO_AGENTE: Record<Agente, string> = {
  CONFIRMADOR: "Confirmador",
  OBJECOES: "Quebra-objeções",
  ENDERECO: "Endereço",
};

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  CONTATO_INICIADO: "Contato iniciado",
  CONFIRMADO: "Pedido confirmado",
  RECUSADO: "Pedido recusado",
  ENDERECO_CORRIGIDO: "Endereço corrigido",
  OBJECAO_RESPONDIDA: "Objeção respondida",
  ESCALADO: "Escalado para humano",
  SEM_RESPOSTA: "Sem resposta",
  ERRO_AGENTE: "Erro no agente",
};

/** Quantas tentativas sem resposta antes de desistir do contato automático. */
export const MAX_TENTATIVAS = 3;

/** Valores em centavos no banco; formatação só na borda. */
export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Normaliza um telefone brasileiro para E.164 sem o "+", que é o formato que
 * os provedores de WhatsApp usam como identificador de contato.
 *
 * Aceita "(11) 99999-8888", "11999998888", "+55 11 99999-8888" e devolve
 * "5511999998888". Devolve null quando não dá para reconhecer o número.
 */
export function normalizarTelefone(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, "");
  if (digitos.length < 10) return null;

  // Já veio com o código do país.
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }
  // DDD + número, com ou sem o 9 do celular.
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }
  return null;
}

/** Formata para leitura humana: 5511999998888 -> (11) 99999-8888 */
export function formatarTelefone(e164: string): string {
  const nacional = e164.startsWith("55") ? e164.slice(2) : e164;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return e164;
}

export function formatarCEP(cep: string): string {
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Concorda o número com o substantivo: plural(1, "pedido", "pedidos") -> "1 pedido". */
export function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
