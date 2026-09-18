import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // Variáveis já vindas do ambiente.
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

/** Minutos atrás, para as datas do seed parecerem uma operação em andamento. */
function atras(minutos: number): Date {
  return new Date(Date.now() - minutos * 60_000);
}

const PRODUTOS = [
  {
    sku: "SMW-001",
    nome: "Smartwatch Fit Pro",
    preco: 19900,
    descricao: "Relógio inteligente com medidor de batimentos e notificações.",
    objecoes: [
      {
        pergunta: "Funciona com iPhone?",
        resposta:
          "Funciona com iPhone e Android. No iPhone é a partir do iOS 12, pelo aplicativo FitCloudPro.",
      },
      {
        pergunta: "Quanto dura a bateria?",
        resposta:
          "De 5 a 7 dias em uso normal. Com a tela sempre ligada, cerca de 2 dias. Carrega por completo em 2 horas.",
      },
      {
        pergunta: "Pode tomar banho com ele? É à prova d'água?",
        resposta:
          "Tem proteção IP67: aguenta respingo, chuva e suor. Não deve ser usado para nadar nem no banho quente.",
      },
      {
        pergunta: "Tem garantia?",
        resposta: "Sim, 90 dias de garantia contra defeito de fábrica, a contar da entrega.",
      },
      {
        pergunta: "Mede pressão de verdade?",
        resposta:
          "Ele estima pressão e oxigenação para acompanhamento pessoal. Não é aparelho médico e não substitui medição clínica.",
      },
    ],
  },
  {
    sku: "FON-002",
    nome: "Fone Bluetooth TWS",
    preco: 12900,
    descricao: "Fone sem fio com estojo carregador e cancelamento de ruído.",
    objecoes: [
      {
        pergunta: "É original? Parece muito barato.",
        resposta:
          "É um fone da nossa marca própria, não é réplica de outra marca. O preço é menor porque vendemos direto, sem loja física no meio.",
      },
      {
        pergunta: "Quanto tempo de bateria?",
        resposta: "5 horas de uso contínuo, e até 20 horas somando as recargas do estojo.",
      },
      {
        pergunta: "Funciona para chamada?",
        resposta: "Funciona. Tem microfone nos dois lados e dá para usar só um fone por vez.",
      },
      {
        pergunta: "O cancelamento de ruído é bom?",
        resposta:
          "É cancelamento passivo, pelo encaixe do fone no ouvido. Abafa bem o ruído de fundo, mas não é o cancelamento ativo dos modelos de mil reais.",
      },
    ],
  },
  {
    sku: "KIT-003",
    nome: "Kit Skincare Vitamina C",
    preco: 8900,
    descricao: "Sérum facial com vitamina C, hidratante e protetor solar.",
    objecoes: [
      {
        pergunta: "Serve para pele oleosa?",
        resposta:
          "Serve. A fórmula é oil free e não comedogênica, indicada para pele oleosa e mista.",
      },
      {
        pergunta: "Qual a validade?",
        resposta: "12 meses fechado e 3 meses depois de aberto. A data vem impressa na embalagem.",
      },
      {
        pergunta: "Tem registro na Anvisa?",
        resposta: "Tem. O registro Anvisa vem impresso na caixa de cada produto do kit.",
      },
    ],
  },
];

const CLIENTES = [
  { nome: "Mariana Alves", telefone: "5511987654321" },
  { nome: "Carlos Eduardo Lima", telefone: "5521998877665" },
  { nome: "Juliana Ferreira", telefone: "5531991234567" },
  { nome: "Roberto Santos", telefone: "5541988776655" },
  { nome: "Patrícia Gomes", telefone: "5585994455667" },
  { nome: "Anderson Ribeiro", telefone: "5562993322110" },
  { nome: "Fernanda Castro", telefone: "5511976543210" },
];

async function main() {
  console.log("Limpando dados anteriores...");
  await prisma.mensagem.deleteMany();
  await prisma.eventoPedido.deleteMany();
  await prisma.conversa.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.endereco.deleteMany();
  await prisma.objecao.deleteMany();
  await prisma.produto.deleteMany();
  await prisma.cliente.deleteMany();

  console.log("Criando produtos e base de objeções...");
  const produtos = new Map<string, string>();
  for (const { objecoes, ...produto } of PRODUTOS) {
    const criado = await prisma.produto.create({
      data: { ...produto, objecoes: { create: objecoes } },
    });
    produtos.set(criado.sku, criado.id);
  }

  console.log("Criando clientes...");
  const clientes = new Map<string, string>();
  for (const cliente of CLIENTES) {
    const criado = await prisma.cliente.create({ data: cliente });
    clientes.set(criado.telefone, criado.id);
  }

  const criarPedido = async (dados: {
    codigo: string;
    telefone: string;
    sku: string;
    quantidade?: number;
    status: string;
    motivoRecusa?: string;
    tentativas?: number;
    criadoHaMin: number;
    confirmadoHaMin?: number;
    endereco?: {
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      validado: boolean;
    };
  }) => {
    const produtoId = produtos.get(dados.sku)!;
    const produto = await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } });
    const quantidade = dados.quantidade ?? 1;

    // Quem guarda a chave estrangeira do endereço é o Pedido, então o endereço
    // precisa existir antes.
    const endereco = dados.endereco
      ? await prisma.endereco.create({ data: dados.endereco })
      : null;

    return prisma.pedido.create({
      data: {
        codigo: dados.codigo,
        clienteId: clientes.get(dados.telefone)!,
        status: dados.status,
        motivoRecusa: dados.motivoRecusa,
        tentativas: dados.tentativas ?? 0,
        valorTotal: produto.preco * quantidade,
        criadoEm: atras(dados.criadoHaMin),
        confirmadoEm: dados.confirmadoHaMin ? atras(dados.confirmadoHaMin) : null,
        enderecoId: endereco?.id,
        itens: { create: { produtoId, quantidade, precoUnit: produto.preco } },
      },
    });
  };

  console.log("Criando pedidos...");

  // Confirmado, com conversa completa: é o que mostra o agente trabalhando.
  const confirmado = await criarPedido({
    codigo: "DV-10231",
    telefone: "5511987654321",
    sku: "SMW-001",
    status: "CONFIRMADO",
    criadoHaMin: 180,
    confirmadoHaMin: 166,
    endereco: {
      cep: "01310100",
      logradouro: "Avenida Paulista",
      numero: "1578",
      complemento: "Apto 132",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
      validado: true,
    },
  });

  const conversa = await prisma.conversa.create({
    data: {
      pedidoId: confirmado.id,
      agenteAtual: "CONFIRMADOR",
      encerrada: true,
      criadoEm: atras(178),
      ultimaMsgEm: atras(166),
    },
  });

  const roteiro: Array<{
    direcao: "ENTRADA" | "SAIDA";
    autor: "CLIENTE" | "AGENTE";
    agente?: string;
    conteudo: string;
    haMin: number;
  }> = [
    {
      direcao: "SAIDA",
      autor: "AGENTE",
      agente: "CONFIRMADOR",
      conteudo:
        "Oi, Mariana! Aqui é da DV Digital. Seu pedido do Smartwatch Fit Pro saiu por R$ 199,00, com pagamento na entrega. Posso liberar o envio?",
      haMin: 178,
    },
    {
      direcao: "ENTRADA",
      autor: "CLIENTE",
      conteudo: "oi! antes de confirmar, ele funciona no iphone? tenho um 13",
      haMin: 174,
    },
    {
      direcao: "SAIDA",
      autor: "AGENTE",
      agente: "OBJECOES",
      conteudo:
        "Funciona sim, no iPhone 13 roda tranquilo pelo app FitCloudPro. Posso liberar o envio então?",
      haMin: 173,
    },
    {
      direcao: "ENTRADA",
      autor: "CLIENTE",
      conteudo: "e a bateria dura quanto? minha preocupação é ter que carregar todo dia",
      haMin: 171,
    },
    {
      direcao: "SAIDA",
      autor: "AGENTE",
      agente: "OBJECOES",
      conteudo:
        "Dura de 5 a 7 dias em uso normal, então não precisa carregar todo dia. Fecho o envio?",
      haMin: 170,
    },
    {
      direcao: "ENTRADA",
      autor: "CLIENTE",
      conteudo: "perfeito, pode mandar! só confirma que é na paulista 1578 apto 132",
      haMin: 167,
    },
    {
      direcao: "SAIDA",
      autor: "AGENTE",
      agente: "CONFIRMADOR",
      conteudo:
        "É esse mesmo: Avenida Paulista, 1578, apto 132, Bela Vista. Pedido confirmado, Mariana! Você paga os R$ 199,00 na entrega.",
      haMin: 166,
    },
  ];

  for (const [indice, msg] of roteiro.entries()) {
    await prisma.mensagem.create({
      data: {
        conversaId: conversa.id,
        direcao: msg.direcao,
        autor: msg.autor,
        agente: msg.agente,
        conteudo: msg.conteudo,
        externalId: `seed_${confirmado.codigo}_${indice}`,
        criadoEm: atras(msg.haMin),
      },
    });
  }

  await prisma.eventoPedido.createMany({
    data: [
      {
        pedidoId: confirmado.id,
        tipo: "CONTATO_INICIADO",
        agente: "CONFIRMADOR",
        criadoEm: atras(178),
      },
      {
        pedidoId: confirmado.id,
        tipo: "OBJECAO_RESPONDIDA",
        detalhe: "Compatibilidade com iPhone e duração da bateria.",
        agente: "OBJECOES",
        criadoEm: atras(173),
      },
      {
        pedidoId: confirmado.id,
        tipo: "CONFIRMADO",
        detalhe: "Cliente confirmou endereço e pagamento na entrega.",
        agente: "CONFIRMADOR",
        criadoEm: atras(166),
      },
    ],
  });

  await criarPedido({
    codigo: "DV-10232",
    telefone: "5521998877665",
    sku: "FON-002",
    quantidade: 2,
    status: "EM_CONTATO",
    criadoHaMin: 40,
    endereco: {
      cep: "22071900",
      logradouro: "Avenida Atlântica",
      numero: "1702",
      bairro: "Copacabana",
      cidade: "Rio de Janeiro",
      uf: "RJ",
      validado: true,
    },
  });

  await criarPedido({
    codigo: "DV-10233",
    telefone: "5531991234567",
    sku: "KIT-003",
    status: "ENDERECO_PENDENTE",
    criadoHaMin: 95,
    endereco: {
      cep: "30140071",
      logradouro: "Avenida Afonso Pena",
      numero: "S/N",
      bairro: "Centro",
      cidade: "Belo Horizonte",
      uf: "MG",
      validado: false,
    },
  });

  await criarPedido({
    codigo: "DV-10234",
    telefone: "5541988776655",
    sku: "SMW-001",
    status: "RECUSADO",
    motivoRecusa: "Achou caro, disse que viu mais barato em outro site",
    criadoHaMin: 320,
  });

  await criarPedido({
    codigo: "DV-10235",
    telefone: "5585994455667",
    sku: "FON-002",
    status: "RECUSADO",
    motivoRecusa: "Não reconheceu o pedido",
    criadoHaMin: 400,
  });

  await criarPedido({
    codigo: "DV-10236",
    telefone: "5562993322110",
    sku: "KIT-003",
    quantidade: 2,
    status: "ESCALADO",
    criadoHaMin: 60,
    endereco: {
      cep: "74023010",
      logradouro: "Avenida Goiás",
      numero: "450",
      bairro: "Setor Central",
      cidade: "Goiânia",
      uf: "GO",
      validado: true,
    },
  });

  await criarPedido({
    codigo: "DV-10237",
    telefone: "5511976543210",
    sku: "SMW-001",
    status: "AGUARDANDO",
    criadoHaMin: 8,
    endereco: {
      cep: "04538133",
      logradouro: "Avenida Brigadeiro Faria Lima",
      numero: "3477",
      complemento: "Conjunto 141",
      bairro: "Itaim Bibi",
      cidade: "São Paulo",
      uf: "SP",
      validado: true,
    },
  });

  const total = await prisma.pedido.count();
  console.log(`Pronto: ${PRODUTOS.length} produtos, ${CLIENTES.length} clientes, ${total} pedidos.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
