import { NextResponse, type NextRequest } from "next/server";
import { receberMensagem } from "@/lib/agents/orchestrator";
import { autorizarWebhook } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATUS_REENGAJAVEIS } from "@/lib/domain";
import { comTrava, emLote } from "@/lib/queue";
import { whatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Verificação de webhook da Meta: ela chama com hub.challenge e espera o valor
 * de volta em texto puro. Os outros provedores não usam esta rota.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const desafio = params.get("hub.challenge");

  if (modo === "subscribe" && token && token === process.env.META_VERIFY_TOKEN && desafio) {
    return new Response(desafio, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ erro: "Verificação recusada." }, { status: 403 });
}

/** Acha o pedido mais recente daquele telefone que ainda aceita atendimento. */
async function pedidoDoTelefone(telefone: string) {
  return prisma.pedido.findFirst({
    where: { cliente: { telefone }, status: { in: STATUS_REENGAJAVEIS } },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
}

export async function POST(req: NextRequest) {
  // O corpo bruto é necessário para conferir a assinatura HMAC da Meta, então
  // lemos como texto e só depois convertemos para JSON.
  const corpoBruto = await req.text();

  const auth = autorizarWebhook(req, corpoBruto);
  if (!auth.ok) {
    return NextResponse.json({ erro: auth.motivo }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
  }

  const recebidas = whatsapp().parseWebhook(payload);
  if (recebidas.length === 0) {
    // Status de entrega, mídia, echo: nada a fazer, mas é entrega bem-sucedida.
    // Responder != 200 faz o provedor reenviar o mesmo evento para sempre.
    return NextResponse.json({ processadas: 0 });
  }

  const resultados = await emLote(recebidas, async (mensagem) => {
    const pedido = await pedidoDoTelefone(mensagem.telefone);
    if (!pedido) {
      return { telefone: mensagem.telefone, situacao: "sem_pedido_aberto" as const };
    }

    // Trava por pedido: duas mensagens seguidas do mesmo cliente não podem
    // rodar o agente em paralelo sobre o mesmo histórico.
    const turno = await comTrava(`pedido:${pedido.id}`, () =>
      receberMensagem({
        pedidoId: pedido.id,
        texto: mensagem.texto,
        externalId: mensagem.externalId,
        recebidaEm: mensagem.recebidaEm,
      }),
    );

    if (!turno) return { pedidoId: pedido.id, situacao: "ignorada" as const };
    if (turno.erro) return { pedidoId: pedido.id, situacao: "erro" as const, erro: turno.erro };
    return { pedidoId: pedido.id, situacao: "respondida" as const };
  });

  return NextResponse.json({
    processadas: recebidas.length,
    resultados: resultados.map((r) => r.resultado ?? { situacao: "erro", erro: r.erro }),
  });
}
