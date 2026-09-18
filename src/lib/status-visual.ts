import type { StatusPedido } from "@/lib/domain";

/**
 * Cor de cada status.
 *
 * Duas regras da paleta valem aqui: as cores de status são reservadas (nunca
 * viram "série 4" de um gráfico) e nunca carregam significado sozinhas — todo
 * lugar que usa uma destas cores mostra o rótulo do status junto. É isso que
 * cobre "atenção" e "sério", que ficam abaixo de 3:1 no fundo claro.
 */
export const COR_STATUS: Record<StatusPedido, string> = {
  AGUARDANDO: "var(--tinta-fraca)",
  EM_CONTATO: "var(--acento)",
  CONFIRMADO: "var(--bom)",
  ENDERECO_PENDENTE: "var(--atencao)",
  ESCALADO: "var(--serio)",
  RECUSADO: "var(--critico)",
  SEM_RESPOSTA: "var(--tinta-fraca)",
};

/** Uma linha de explicação por status, para quem abre o painel sem contexto. */
export const EXPLICACAO_STATUS: Record<StatusPedido, string> = {
  AGUARDANDO: "Importado, ainda sem contato",
  EM_CONTATO: "Agente conversando agora",
  CONFIRMADO: "Pode faturar e enviar",
  ENDERECO_PENDENTE: "Quer receber, mas o endereço não fecha",
  ESCALADO: "Precisa de uma pessoa",
  RECUSADO: "Cliente desistiu",
  SEM_RESPOSTA: "Não respondeu após as tentativas",
};

/** Ordem de leitura: do que está em jogo para o que já foi decidido. */
export const ORDEM_STATUS: StatusPedido[] = [
  "AGUARDANDO",
  "EM_CONTATO",
  "ENDERECO_PENDENTE",
  "ESCALADO",
  "CONFIRMADO",
  "RECUSADO",
  "SEM_RESPOSTA",
];
