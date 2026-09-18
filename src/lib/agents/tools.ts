import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Pedido } from "@prisma/client";
import { z } from "zod";
import { consultarCEP } from "@/lib/cep";
import { prisma } from "@/lib/db";
import {
  agenteSchema,
  formatarBRL,
  formatarCEP,
  formatarTelefone,
  type Agente,
  type StatusPedido,
  type TipoEvento,
} from "@/lib/domain";

/** Efeito que um agente produziu no turno, para o orquestrador persistir depois. */
export interface AcaoAgente {
  tipo: TipoEvento;
  detalhe?: string;
}

/**
 * Estado compartilhado pelas ferramentas dentro de um turno. As ferramentas
 * escrevem no banco direto, mas registram aqui o que fizeram para o
 * orquestrador saber como encerrar o turno.
 */
export interface ContextoAgente {
  pedidoId: string;
  agente: Agente;
  acoes: AcaoAgente[];
  /** Definido quando o agente pediu transferência para outro especialista. */
  proximoAgente?: Agente;
  /** true quando o pedido saiu de um status aberto neste turno. */
  encerrado: boolean;
}

export function novoContexto(pedidoId: string, agente: Agente): ContextoAgente {
  return { pedidoId, agente, acoes: [], encerrado: false };
}

function ok(dados: unknown): string {
  return JSON.stringify(dados);
}

function erro(mensagem: string): string {
  return JSON.stringify({ erro: mensagem });
}

async function registrarEvento(ctx: ContextoAgente, tipo: TipoEvento, detalhe?: string) {
  ctx.acoes.push({ tipo, detalhe });
  await prisma.eventoPedido.create({
    data: { pedidoId: ctx.pedidoId, tipo, detalhe, agente: ctx.agente },
  });
}

/** Impede que o agente mexa num pedido que já teve desfecho. */
const STATUS_MUTAVEIS: StatusPedido[] = ["AGUARDANDO", "EM_CONTATO", "ENDERECO_PENDENTE"];

type GuardaPedido =
  | { ok: false; erro: string }
  | { ok: true; pedido: Pedido };

async function exigirPedidoAberto(ctx: ContextoAgente): Promise<GuardaPedido> {
  const pedido = await prisma.pedido.findUnique({ where: { id: ctx.pedidoId } });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!STATUS_MUTAVEIS.includes(pedido.status as StatusPedido)) {
    return {
      ok: false,
      erro: `Este pedido já foi finalizado com status ${pedido.status} e não pode mais ser alterado pelo agente.`,
    };
  }
  return { ok: true, pedido };
}

/**
 * Monta o conjunto de ferramentas amarrado a um pedido. Cada turno cria o seu,
 * então uma ferramenta nunca consegue tocar num pedido que não é o dela.
 */
export function ferramentas(ctx: ContextoAgente) {
  const consultar_pedido = betaZodTool({
    name: "consultar_pedido",
    description:
      "Retorna os dados do pedido em atendimento: cliente, itens, valor total, forma de pagamento e endereço de entrega. Chame antes de falar qualquer coisa com o cliente.",
    inputSchema: z.object({}),
    run: async () => {
      const pedido = await prisma.pedido.findUnique({
        where: { id: ctx.pedidoId },
        include: { cliente: true, endereco: true, itens: { include: { produto: true } } },
      });
      if (!pedido) return erro("Pedido não encontrado.");

      return ok({
        codigo: pedido.codigo,
        status: pedido.status,
        cliente: {
          nome: pedido.cliente.nome,
          telefone: formatarTelefone(pedido.cliente.telefone),
        },
        itens: pedido.itens.map((item) => ({
          produto: item.produto.nome,
          quantidade: item.quantidade,
          preco_unitario: formatarBRL(item.precoUnit),
        })),
        valor_total: formatarBRL(pedido.valorTotal),
        forma_pagamento:
          pedido.formaPagamento === "COD" ? "Pagamento na entrega" : pedido.formaPagamento,
        endereco: pedido.endereco
          ? {
              cep: formatarCEP(pedido.endereco.cep),
              logradouro: pedido.endereco.logradouro,
              numero: pedido.endereco.numero,
              complemento: pedido.endereco.complemento,
              bairro: pedido.endereco.bairro,
              cidade: pedido.endereco.cidade,
              uf: pedido.endereco.uf,
              referencia: pedido.endereco.referencia,
              ja_validado: pedido.endereco.validado,
            }
          : null,
      });
    },
  });

  const buscar_resposta_produto = betaZodTool({
    name: "buscar_resposta_produto",
    description:
      "Busca na base de conhecimento a resposta oficial para uma dúvida sobre os produtos deste pedido. Use SEMPRE antes de responder qualquer pergunta técnica. Se voltar vazio, você não tem a informação: escale para um humano em vez de inventar.",
    inputSchema: z.object({
      duvida: z.string().describe("A dúvida do cliente, nas palavras dele."),
    }),
    run: async ({ duvida }) => {
      const itens = await prisma.itemPedido.findMany({
        where: { pedidoId: ctx.pedidoId },
        include: { produto: { include: { objecoes: true } } },
      });

      const candidatos = itens.flatMap((item) =>
        item.produto.objecoes.map((o) => ({
          produto: item.produto.nome,
          pergunta: o.pergunta,
          resposta: o.resposta,
        })),
      );
      if (candidatos.length === 0) {
        return ok({ encontrado: false, respostas: [] });
      }

      // Ranking por palavra em comum. A base por pedido é pequena (dezenas de
      // entradas), então isso resolve sem trazer busca vetorial para dentro.
      const termos = duvida
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/\W+/)
        .filter((t) => t.length > 3);

      const pontuados = candidatos
        .map((c) => {
          const alvo = `${c.pergunta} ${c.resposta}`
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return { ...c, score: termos.filter((t) => alvo.includes(t)).length };
        })
        .sort((a, b) => b.score - a.score);

      // Sem palavra em comum não quer dizer que a base não sirva — o cliente
      // pode ter perguntado com outras palavras. Devolvemos o topo e deixamos
      // o modelo julgar se alguma entrada responde de fato.
      const relevantes = pontuados.filter((c) => c.score > 0);
      const respostas = (relevantes.length > 0 ? relevantes : pontuados).slice(0, 6);

      return ok({
        encontrado: true,
        aviso:
          "Responda apenas com o que estiver nestas entradas. Se nenhuma responde a dúvida, escale para um humano.",
        respostas: respostas.map(({ produto, pergunta, resposta }) => ({
          produto,
          pergunta,
          resposta,
        })),
      });
    },
  });

  const consultar_cep = betaZodTool({
    name: "consultar_cep",
    description:
      "Consulta um CEP e retorna logradouro, bairro, cidade e UF oficiais. Use para conferir se o endereço cadastrado bate com o CEP.",
    inputSchema: z.object({
      cep: z.string().describe("CEP com 8 dígitos, com ou sem hífen."),
    }),
    run: async ({ cep }) => {
      const encontrado = await consultarCEP(cep);
      if (!encontrado) {
        return ok({
          encontrado: false,
          orientacao:
            "CEP inválido ou serviço indisponível. Peça o endereço por escrito ao cliente (rua, número, bairro, cidade).",
        });
      }
      return ok({ encontrado: true, ...encontrado, cep: formatarCEP(encontrado.cep) });
    },
  });

  const atualizar_endereco = betaZodTool({
    name: "atualizar_endereco",
    description:
      "Grava o endereço de entrega corrigido. Chame só quando tiver o endereço completo confirmado pelo cliente.",
    inputSchema: z.object({
      cep: z.string().describe("CEP com 8 dígitos. Use string vazia se o cliente não souber."),
      logradouro: z.string().describe("Rua, avenida, travessa."),
      numero: z.string().describe("Número da casa. Use 'S/N' quando não houver."),
      complemento: z.string().optional().describe("Apartamento, bloco, sala."),
      bairro: z.string(),
      cidade: z.string(),
      uf: z.string().length(2).describe("Sigla do estado, ex: SP."),
      referencia: z.string().optional().describe("Ponto de referência para o entregador."),
    }),
    run: async (entrada) => {
      const guarda = await exigirPedidoAberto(ctx);
      if (!guarda.ok) return erro(guarda.erro);

      const cepLimpo = entrada.cep.replace(/\D/g, "");
      const oficial = cepLimpo.length === 8 ? await consultarCEP(cepLimpo) : null;
      // "Validado" significa que o CEP existe e a cidade bate com o que o
      // cliente disse — é o que separa endereço conferido de endereço digitado.
      const validado =
        oficial !== null &&
        oficial.cidade.toLowerCase() === entrada.cidade.trim().toLowerCase() &&
        oficial.uf.toUpperCase() === entrada.uf.trim().toUpperCase();

      const dados = {
        cep: cepLimpo,
        logradouro: entrada.logradouro.trim(),
        numero: entrada.numero.trim(),
        complemento: entrada.complemento?.trim() || null,
        bairro: entrada.bairro.trim(),
        cidade: entrada.cidade.trim(),
        uf: entrada.uf.trim().toUpperCase(),
        referencia: entrada.referencia?.trim() || null,
        validado,
      };

      const pedido = guarda.pedido;
      if (pedido.enderecoId) {
        await prisma.endereco.update({ where: { id: pedido.enderecoId }, data: dados });
      } else {
        const criado = await prisma.endereco.create({ data: dados });
        await prisma.pedido.update({
          where: { id: pedido.id },
          data: { enderecoId: criado.id },
        });
      }

      await registrarEvento(
        ctx,
        "ENDERECO_CORRIGIDO",
        `${dados.logradouro}, ${dados.numero} - ${dados.bairro}, ${dados.cidade}/${dados.uf}`,
      );

      return ok({
        gravado: true,
        cep_conferido: validado,
        observacao: validado
          ? "Endereço bate com o CEP oficial."
          : "Endereço gravado, mas não foi possível conferir contra o CEP. A operação vai revisar antes de despachar.",
      });
    },
  });

  const confirmar_pedido = betaZodTool({
    name: "confirmar_pedido",
    description:
      "Marca o pedido como confirmado e libera o envio. Só chame depois de o cliente dizer claramente que quer receber. Dúvida, silêncio ou 'ok' solto não são confirmação.",
    inputSchema: z.object({
      observacao: z
        .string()
        .optional()
        .describe("Algo que a operação precise saber antes de despachar."),
    }),
    run: async ({ observacao }) => {
      const guarda = await exigirPedidoAberto(ctx);
      if (!guarda.ok) return erro(guarda.erro);

      const endereco = guarda.pedido.enderecoId
        ? await prisma.endereco.findUnique({ where: { id: guarda.pedido.enderecoId } })
        : null;

      // Confirmar sem endereço entregável despacharia às cegas — exatamente o
      // prejuízo que esta operação existe para evitar.
      if (!endereco || !endereco.numero || !endereco.cidade) {
        await prisma.pedido.update({
          where: { id: ctx.pedidoId },
          data: { status: "ENDERECO_PENDENTE" },
        });
        return erro(
          "O cliente confirmou, mas o endereço está incompleto. O pedido foi para ENDERECO_PENDENTE: colete o endereço com o cliente e chame atualizar_endereco antes de confirmar de novo.",
        );
      }

      await prisma.pedido.update({
        where: { id: ctx.pedidoId },
        data: { status: "CONFIRMADO", confirmadoEm: new Date(), motivoRecusa: null },
      });
      await registrarEvento(ctx, "CONFIRMADO", observacao);
      ctx.encerrado = true;

      return ok({ confirmado: true });
    },
  });

  const recusar_pedido = betaZodTool({
    name: "recusar_pedido",
    description:
      "Registra que o cliente não quer o pedido. Use só com um não claro — desistência, engano ou 'não fui eu que pedi'.",
    inputSchema: z.object({
      motivo: z
        .string()
        .describe("O motivo nas palavras do cliente, para a operação entender a perda."),
    }),
    run: async ({ motivo }) => {
      const guarda = await exigirPedidoAberto(ctx);
      if (!guarda.ok) return erro(guarda.erro);

      await prisma.pedido.update({
        where: { id: ctx.pedidoId },
        data: { status: "RECUSADO", motivoRecusa: motivo },
      });
      await registrarEvento(ctx, "RECUSADO", motivo);
      ctx.encerrado = true;

      return ok({ recusado: true });
    },
  });

  const escalar_para_humano = betaZodTool({
    name: "escalar_para_humano",
    description:
      "Passa o atendimento para uma pessoa da equipe. Use quando a dúvida não está na base, quando o cliente pede desconto ou troca, quando ele está irritado, ou em qualquer caso fora do seu alcance.",
    inputSchema: z.object({
      motivo: z.string().describe("O que a pessoa precisa saber para assumir a conversa."),
    }),
    run: async ({ motivo }) => {
      const guarda = await exigirPedidoAberto(ctx);
      if (!guarda.ok) return erro(guarda.erro);

      await prisma.pedido.update({ where: { id: ctx.pedidoId }, data: { status: "ESCALADO" } });
      await registrarEvento(ctx, "ESCALADO", motivo);
      ctx.encerrado = true;

      return ok({
        escalado: true,
        orientacao:
          "Avise o cliente que alguém da equipe vai responder em seguida e encerre sua mensagem por aqui.",
      });
    },
  });

  const transferir_para = betaZodTool({
    name: "transferir_para",
    description:
      "Passa a conversa para outro especialista: OBJECOES para dúvida técnica sobre o produto, ENDERECO para problema de entrega, CONFIRMADOR para fechar o pedido. Você continua respondendo o cliente neste turno; a troca vale do próximo turno em diante.",
    inputSchema: z.object({
      agente: agenteSchema.describe("CONFIRMADOR, OBJECOES ou ENDERECO."),
      motivo: z.string().describe("Por que está transferindo."),
    }),
    run: async ({ agente, motivo }) => {
      if (agente === ctx.agente) {
        return erro(`Você já é o agente ${agente}. Siga o atendimento sem transferir.`);
      }
      ctx.proximoAgente = agente;
      return ok({ transferido_para: agente, motivo });
    },
  });

  return [
    consultar_pedido,
    buscar_resposta_produto,
    consultar_cep,
    atualizar_endereco,
    confirmar_pedido,
    recusar_pedido,
    escalar_para_humano,
    transferir_para,
  ];
}
