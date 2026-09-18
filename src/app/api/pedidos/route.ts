import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { autorizarOperacao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizarTelefone, statusPedidoSchema } from "@/lib/domain";

export const dynamic = "force-dynamic";

const importarPedidoSchema = z.object({
  codigo: z.string().min(1).describe("Código do pedido na sua plataforma de origem."),
  cliente: z.object({
    nome: z.string().min(1),
    telefone: z.string().min(10),
    email: z.email().optional(),
  }),
  itens: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantidade: z.number().int().positive().default(1),
      }),
    )
    .min(1),
  endereco: z
    .object({
      cep: z.string(),
      logradouro: z.string(),
      numero: z.string(),
      complemento: z.string().optional(),
      bairro: z.string(),
      cidade: z.string(),
      uf: z.string().length(2),
      referencia: z.string().optional(),
    })
    .optional(),
  formaPagamento: z.string().default("COD"),
});

/** Lista os pedidos, com filtro opcional por status. */
export async function GET(req: NextRequest) {
  const statusBruto = req.nextUrl.searchParams.get("status");
  const status = statusBruto ? statusPedidoSchema.safeParse(statusBruto) : null;

  if (status && !status.success) {
    return NextResponse.json({ erro: `Status desconhecido: ${statusBruto}` }, { status: 400 });
  }

  const pedidos = await prisma.pedido.findMany({
    where: status?.success ? { status: status.data } : undefined,
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: {
      cliente: true,
      endereco: true,
      itens: { include: { produto: true } },
      conversa: true,
    },
  });

  return NextResponse.json({ pedidos });
}

/**
 * Importa um pedido vindo do checkout, ERP ou planilha. O pedido entra como
 * AGUARDANDO; o contato só começa quando /api/operacao/disparar rodar.
 */
export async function POST(req: NextRequest) {
  const auth = autorizarOperacao(req);
  if (!auth.ok) return NextResponse.json({ erro: auth.motivo }, { status: 401 });

  const parsed = importarPedidoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { erro: "Payload inválido.", detalhes: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const entrada = parsed.data;

  const telefone = normalizarTelefone(entrada.cliente.telefone);
  if (!telefone) {
    return NextResponse.json(
      { erro: `Telefone não reconhecido: ${entrada.cliente.telefone}` },
      { status: 400 },
    );
  }

  const jaExiste = await prisma.pedido.findUnique({ where: { codigo: entrada.codigo } });
  if (jaExiste) {
    return NextResponse.json(
      { erro: `Pedido ${entrada.codigo} já foi importado.`, pedidoId: jaExiste.id },
      { status: 409 },
    );
  }

  const skus = entrada.itens.map((i) => i.sku);
  const produtos = await prisma.produto.findMany({ where: { sku: { in: skus } } });
  const porSku = new Map(produtos.map((p) => [p.sku, p]));

  const faltando = skus.filter((sku) => !porSku.has(sku));
  if (faltando.length > 0) {
    return NextResponse.json(
      { erro: `SKU não cadastrado: ${faltando.join(", ")}` },
      { status: 400 },
    );
  }

  // O preço é congelado no momento da importação: mudar a tabela depois não
  // pode alterar o valor que o cliente já viu no checkout.
  const itens = entrada.itens.map((item) => {
    const produto = porSku.get(item.sku)!;
    return {
      produtoId: produto.id,
      quantidade: item.quantidade,
      precoUnit: produto.preco,
    };
  });
  const valorTotal = itens.reduce((soma, i) => soma + i.precoUnit * i.quantidade, 0);

  const pedido = await prisma.pedido.create({
    data: {
      codigo: entrada.codigo,
      valorTotal,
      formaPagamento: entrada.formaPagamento,
      cliente: {
        connectOrCreate: {
          where: { telefone },
          create: { nome: entrada.cliente.nome, telefone, email: entrada.cliente.email },
        },
      },
      endereco: entrada.endereco
        ? {
            create: {
              ...entrada.endereco,
              cep: entrada.endereco.cep.replace(/\D/g, ""),
              uf: entrada.endereco.uf.toUpperCase(),
              validado: false,
            },
          }
        : undefined,
      itens: { create: itens },
    },
    include: { cliente: true, itens: true },
  });

  return NextResponse.json({ pedido }, { status: 201 });
}
