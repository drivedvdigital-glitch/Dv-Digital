import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { iniciarContato } from "@/lib/agents/orchestrator";
import { autorizarOperacao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AGENTES_SIMULTANEOS, comTrava, emLote } from "@/lib/queue";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  /** Teto de pedidos por disparo, para não estourar rate limit nem custo. */
  limite: z.number().int().positive().max(200).default(20),
  /** Dispara só estes pedidos; sem isso, pega todos os AGUARDANDO. */
  pedidoIds: z.array(z.string()).optional(),
});

/**
 * Abre o atendimento dos pedidos que ainda não receberam contato.
 *
 * É a rota para o cron chamar: a cada rodada ela pega os pedidos parados e
 * coloca os agentes para trabalhar, AGENTES_SIMULTANEOS por vez.
 */
export async function POST(req: NextRequest) {
  const auth = autorizarOperacao(req);
  if (!auth.ok) return NextResponse.json({ erro: auth.motivo }, { status: 401 });

  const parsed = corpoSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Payload inválido.", detalhes: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { limite, pedidoIds } = parsed.data;

  const pendentes = await prisma.pedido.findMany({
    where: {
      status: "AGUARDANDO",
      ...(pedidoIds ? { id: { in: pedidoIds } } : {}),
    },
    orderBy: { criadoEm: "asc" },
    take: limite,
    select: { id: true, codigo: true },
  });

  if (pendentes.length === 0) {
    return NextResponse.json({ disparados: 0, agentesSimultaneos: AGENTES_SIMULTANEOS });
  }

  const resultados = await emLote(pendentes, async (pedido) => {
    const turno = await comTrava(`pedido:${pedido.id}`, () => iniciarContato(pedido.id));
    return {
      codigo: pedido.codigo,
      situacao: !turno ? ("sem_resposta" as const) : turno.erro ? ("erro" as const) : ("contatado" as const),
      erro: turno?.erro,
    };
  });

  return NextResponse.json({
    disparados: pendentes.length,
    agentesSimultaneos: AGENTES_SIMULTANEOS,
    resultados: resultados.map((r) => r.resultado ?? { situacao: "erro", erro: r.erro }),
  });
}
