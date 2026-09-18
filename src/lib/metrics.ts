import { prisma } from "@/lib/db";
import { statusPedidoSchema, type StatusPedido } from "@/lib/domain";

export interface Metricas {
  /** Quantidade de pedidos em cada status. */
  porStatus: Record<StatusPedido, number>;
  total: number;
  /** Confirmados sobre os que já tiveram desfecho — ignora quem ainda está em atendimento. */
  taxaConfirmacao: number;
  /** Já pode faturar (centavos). */
  valorConfirmado: number;
  /** Ainda em jogo: aguardando, em atendimento ou com endereço pendente (centavos). */
  valorEmAberto: number;
  /** Recusado ou sem resposta (centavos). */
  valorPerdido: number;
  /** Mediana do tempo entre importar e confirmar, em minutos. Null sem confirmações. */
  medianaConfirmacaoMin: number | null;
  motivosRecusa: Array<{ motivo: string; quantidade: number }>;
  /** Pedidos que uma pessoa precisa olhar agora. */
  precisamAtencao: number;
}

const ZERADO: Record<StatusPedido, number> = {
  AGUARDANDO: 0,
  EM_CONTATO: 0,
  CONFIRMADO: 0,
  RECUSADO: 0,
  ENDERECO_PENDENTE: 0,
  SEM_RESPOSTA: 0,
  ESCALADO: 0,
};

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export async function calcularMetricas(): Promise<Metricas> {
  const [agrupado, valores, confirmados, recusas] = await Promise.all([
    prisma.pedido.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.pedido.groupBy({ by: ["status"], _sum: { valorTotal: true } }),
    prisma.pedido.findMany({
      where: { status: "CONFIRMADO", confirmadoEm: { not: null } },
      select: { criadoEm: true, confirmadoEm: true },
      take: 500,
      orderBy: { confirmadoEm: "desc" },
    }),
    prisma.pedido.groupBy({
      by: ["motivoRecusa"],
      where: { status: "RECUSADO", motivoRecusa: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const porStatus = { ...ZERADO };
  for (const linha of agrupado) {
    const status = statusPedidoSchema.safeParse(linha.status);
    if (status.success) porStatus[status.data] = linha._count._all;
  }

  const somaPorStatus = new Map<string, number>(
    valores.map((v) => [v.status, v._sum.valorTotal ?? 0]),
  );
  const somar = (...status: StatusPedido[]) =>
    status.reduce((total, s) => total + (somaPorStatus.get(s) ?? 0), 0);

  const total = Object.values(porStatus).reduce((a, b) => a + b, 0);
  // A taxa só faz sentido sobre pedidos decididos. Incluir quem ainda está em
  // atendimento afundaria o número sem motivo.
  const decididos = porStatus.CONFIRMADO + porStatus.RECUSADO + porStatus.SEM_RESPOSTA;

  const temposMin = confirmados
    .filter((p) => p.confirmadoEm)
    .map((p) => (p.confirmadoEm!.getTime() - p.criadoEm.getTime()) / 60_000)
    .filter((min) => min >= 0);

  return {
    porStatus,
    total,
    taxaConfirmacao: decididos === 0 ? 0 : porStatus.CONFIRMADO / decididos,
    valorConfirmado: somar("CONFIRMADO"),
    valorEmAberto: somar("AGUARDANDO", "EM_CONTATO", "ENDERECO_PENDENTE"),
    valorPerdido: somar("RECUSADO", "SEM_RESPOSTA"),
    medianaConfirmacaoMin: mediana(temposMin),
    motivosRecusa: recusas
      .map((r) => ({ motivo: r.motivoRecusa ?? "não informado", quantidade: r._count._all }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6),
    precisamAtencao: porStatus.ESCALADO + porStatus.ENDERECO_PENDENTE,
  };
}
