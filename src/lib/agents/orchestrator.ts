import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { agenteSchema, MAX_TENTATIVAS, type Agente, type StatusPedido } from "@/lib/domain";
import { whatsapp } from "@/lib/whatsapp";
import { anthropic, ESFORCO, MAX_ITERACOES, MODELO } from "./client";
import { systemPrompt } from "./prompts";
import { ferramentas, novoContexto, type AcaoAgente } from "./tools";

/** Sentinela que o prompt manda usar quando não há nada a dizer ao cliente. */
const NADA_A_ENVIAR = "NADA_A_ENVIAR";

/** Quantas mensagens da conversa entram no contexto do modelo. */
const JANELA_HISTORICO = 40;

export interface ResultadoTurno {
  pedidoId: string;
  agente: Agente;
  /** Texto enviado ao cliente, quando houve envio. */
  resposta?: string;
  acoes: AcaoAgente[];
  erro?: string;
}

/** Monta o histórico da conversa no formato que a API espera. */
async function historico(conversaId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const mensagens = await prisma.mensagem.findMany({
    where: { conversaId },
    orderBy: { criadoEm: "desc" },
    take: JANELA_HISTORICO,
  });

  return mensagens.reverse().map((m) => ({
    role: m.direcao === "ENTRADA" ? ("user" as const) : ("assistant" as const),
    content: m.conteudo,
  }));
}

/** Extrai o texto final do turno, que é o que vai para o cliente. */
function textoFinal(mensagem: Anthropic.Beta.BetaMessage): string {
  return mensagem.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * Roda um turno do agente para um pedido: lê a conversa, decide, age através
 * das ferramentas e responde o cliente.
 *
 * Idempotência é responsabilidade de quem chama — o webhook só chama depois de
 * gravar a mensagem de entrada, e ignora reentregas pelo externalId.
 */
export async function processarTurno(pedidoId: string): Promise<ResultadoTurno> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { cliente: true, conversa: true },
  });
  if (!pedido) {
    return { pedidoId, agente: "CONFIRMADOR", acoes: [], erro: "Pedido não encontrado." };
  }

  const conversa =
    pedido.conversa ??
    (await prisma.conversa.create({ data: { pedidoId: pedido.id } }));

  const agente = agenteSchema.catch("CONFIRMADOR").parse(conversa.agenteAtual);
  const ctx = novoContexto(pedido.id, agente);

  // Primeiro contato: não há mensagem do cliente ainda, então a instrução de
  // abertura faz o papel do turno do usuário.
  const anteriores = await historico(conversa.id);
  const abertura: Anthropic.Beta.BetaMessageParam = {
    role: "user",
    content:
      anteriores.length === 0
        ? `[OPERAÇÃO] Primeiro contato com o cliente sobre o pedido ${pedido.codigo}. Consulte o pedido e inicie a conversa.`
        : `[OPERAÇÃO] Continue o atendimento do pedido ${pedido.codigo}.`,
  };
  const mensagens =
    anteriores.length === 0 ? [abertura] : [abertura, ...anteriores];

  let final: Anthropic.Beta.BetaMessage;
  try {
    final = await anthropic().beta.messages.toolRunner({
      model: MODELO,
      max_tokens: 4096,
      system: [
        // Bloco estável primeiro: o cache de prompt reaproveita entre conversas.
        { type: "text", text: systemPrompt(agente), cache_control: { type: "ephemeral" } },
      ],
      output_config: { effort: ESFORCO },
      tools: ferramentas(ctx),
      messages: mensagens,
      max_iterations: MAX_ITERACOES,
    });
  } catch (causa) {
    const erro = causa instanceof Error ? causa.message : String(causa);
    await prisma.eventoPedido.create({
      data: { pedidoId: pedido.id, tipo: "ERRO_AGENTE", detalhe: erro.slice(0, 500), agente },
    });
    return { pedidoId, agente, acoes: ctx.acoes, erro };
  }

  // O modelo pode recusar por segurança. Nesse caso não há texto confiável
  // para enviar: o caso vira trabalho de gente.
  if (final.stop_reason === "refusal") {
    await prisma.pedido.update({ where: { id: pedido.id }, data: { status: "ESCALADO" } });
    await prisma.eventoPedido.create({
      data: {
        pedidoId: pedido.id,
        tipo: "ESCALADO",
        detalhe: "O modelo recusou responder este turno.",
        agente,
      },
    });
    return { pedidoId, agente, acoes: ctx.acoes, erro: "refusal" };
  }

  const texto = textoFinal(final);
  const deveEnviar = texto.length > 0 && !texto.includes(NADA_A_ENVIAR);

  let resposta: string | undefined;
  if (deveEnviar) {
    try {
      const envio = await whatsapp().enviarTexto(pedido.cliente.telefone, texto);
      await prisma.mensagem.create({
        data: {
          conversaId: conversa.id,
          direcao: "SAIDA",
          autor: "AGENTE",
          agente,
          conteudo: texto,
          externalId: envio.externalId,
        },
      });
      resposta = texto;
    } catch (causa) {
      const erro = causa instanceof Error ? causa.message : String(causa);
      await prisma.eventoPedido.create({
        data: {
          pedidoId: pedido.id,
          tipo: "ERRO_AGENTE",
          detalhe: `Falha ao enviar no WhatsApp: ${erro}`.slice(0, 500),
          agente,
        },
      });
      return { pedidoId, agente, acoes: ctx.acoes, erro };
    }
  }

  // O agente definido aqui é quem assume o PRÓXIMO turno.
  const proximoAgente = ctx.proximoAgente ?? agente;
  await prisma.conversa.update({
    where: { id: conversa.id },
    data: {
      agenteAtual: proximoAgente,
      ultimaMsgEm: new Date(),
      encerrada: ctx.encerrado,
    },
  });

  // AGUARDANDO só sai depois que a primeira mensagem de fato saiu.
  if (!ctx.encerrado && pedido.status === "AGUARDANDO" && deveEnviar) {
    await prisma.pedido.update({ where: { id: pedido.id }, data: { status: "EM_CONTATO" } });
    await prisma.eventoPedido.create({
      data: { pedidoId: pedido.id, tipo: "CONTATO_INICIADO", agente },
    });
  }

  return { pedidoId, agente, resposta, acoes: ctx.acoes };
}

/**
 * Registra a mensagem que chegou do cliente e roda o turno do agente.
 * Retorna null quando a mensagem é uma reentrega já processada.
 */
export async function receberMensagem(entrada: {
  pedidoId: string;
  texto: string;
  externalId: string;
  recebidaEm: Date;
}): Promise<ResultadoTurno | null> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: entrada.pedidoId },
    include: { conversa: true },
  });
  if (!pedido) return null;

  const conversa =
    pedido.conversa ?? (await prisma.conversa.create({ data: { pedidoId: pedido.id } }));

  // O provedor reentrega webhooks. O externalId é único no banco, então uma
  // reentrega bate na constraint e paramos aqui, sem rodar o agente de novo.
  // Só a violação de unicidade é engolida: qualquer outra falha de banco
  // precisa subir, senão perderíamos a mensagem do cliente em silêncio.
  try {
    await prisma.mensagem.create({
      data: {
        conversaId: conversa.id,
        direcao: "ENTRADA",
        autor: "CLIENTE",
        conteudo: entrada.texto,
        externalId: entrada.externalId,
        criadoEm: entrada.recebidaEm,
      },
    });
  } catch (causa) {
    if (causa instanceof Prisma.PrismaClientKnownRequestError && causa.code === "P2002") {
      return null;
    }
    throw causa;
  }

  // Cliente respondeu: zera a contagem de tentativas. Se o pedido já tinha
  // sido dado como perdido por silêncio, ele volta para atendimento — quem
  // some e responde dois dias depois ainda é venda.
  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      tentativas: 0,
      ...(pedido.status === "SEM_RESPOSTA" ? { status: "EM_CONTATO" } : {}),
    },
  });

  // Num pedido já finalizado, guardamos a mensagem mas não acionamos o agente:
  // quem responde a partir daí é uma pessoa.
  const status = pedido.status as StatusPedido;
  if (status === "CONFIRMADO" || status === "RECUSADO" || status === "ESCALADO") {
    return null;
  }

  return processarTurno(pedido.id);
}

/**
 * Abre o atendimento de um pedido que ainda não recebeu contato.
 * Conta a tentativa e desiste depois de MAX_TENTATIVAS sem resposta.
 */
export async function iniciarContato(pedidoId: string): Promise<ResultadoTurno | null> {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) return null;

  if (pedido.tentativas >= MAX_TENTATIVAS) {
    await prisma.pedido.update({
      where: { id: pedidoId },
      data: { status: "SEM_RESPOSTA" },
    });
    await prisma.eventoPedido.create({
      data: {
        pedidoId,
        tipo: "SEM_RESPOSTA",
        detalhe: `Sem retorno após ${pedido.tentativas} tentativas.`,
      },
    });
    return null;
  }

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { tentativas: { increment: 1 } },
  });

  return processarTurno(pedidoId);
}
