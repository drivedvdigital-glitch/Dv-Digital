import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Cartao, SeloStatus, Vazio } from "@/components/ui";
import { prisma } from "@/lib/db";
import {
  formatarBRL,
  formatarCEP,
  formatarTelefone,
  ROTULO_AGENTE,
  ROTULO_EVENTO,
  agenteSchema,
  tipoEventoSchema,
  type StatusPedido,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

const horario = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DetalhePedido(props: PageProps<"/pedidos/[id]">) {
  const { id } = await props.params;

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      cliente: true,
      endereco: true,
      itens: { include: { produto: true } },
      eventos: { orderBy: { criadoEm: "desc" } },
      conversa: { include: { mensagens: { orderBy: { criadoEm: "asc" } } } },
    },
  });

  if (!pedido) notFound();

  const status = pedido.status as StatusPedido;
  const mensagens = pedido.conversa?.mensagens ?? [];
  const agenteAtual = agenteSchema.catch("CONFIRMADOR").parse(pedido.conversa?.agenteAtual ?? "");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-tinta-2 underline-offset-4 hover:text-tinta hover:underline"
        >
          ← Painel
        </Link>
        <AutoRefresh segundos={10} />
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tinta">Pedido {pedido.codigo}</h1>
          <p className="mt-1 text-sm text-tinta-2">
            {pedido.cliente.nome} ·{" "}
            <span className="tabular">{formatarTelefone(pedido.cliente.telefone)}</span>
          </p>
        </div>
        <div className="text-right">
          <SeloStatus status={status} />
          <p className="tabular mt-1 text-lg font-semibold text-tinta">
            {formatarBRL(pedido.valorTotal)}
          </p>
          <p className="text-xs text-tinta-fraca">
            {pedido.formaPagamento === "COD" ? "Pagamento na entrega" : pedido.formaPagamento}
          </p>
        </div>
      </header>

      {pedido.motivoRecusa ? (
        <Cartao className="mt-4">
          <p className="text-sm text-tinta-2">
            <span className="font-medium text-tinta">Motivo da recusa:</span>{" "}
            {pedido.motivoRecusa}
          </p>
        </Cartao>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao>
          <h2 className="text-sm font-semibold text-tinta">Itens</h2>
          <ul className="mt-4 space-y-3">
            {pedido.itens.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 border-b border-linha pb-3 last:border-0 last:pb-0"
              >
                <span className="text-sm text-tinta">
                  {item.quantidade}× {item.produto.nome}
                </span>
                <span className="tabular shrink-0 text-sm text-tinta-2">
                  {formatarBRL(item.precoUnit * item.quantidade)}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao>
          <h2 className="text-sm font-semibold text-tinta">Entrega</h2>
          {pedido.endereco ? (
            <div className="mt-4 text-sm text-tinta-2">
              <p className="text-tinta">
                {pedido.endereco.logradouro}, {pedido.endereco.numero}
                {pedido.endereco.complemento ? ` — ${pedido.endereco.complemento}` : ""}
              </p>
              <p>
                {pedido.endereco.bairro} · {pedido.endereco.cidade}/{pedido.endereco.uf}
              </p>
              <p className="tabular">{formatarCEP(pedido.endereco.cep)}</p>
              {pedido.endereco.referencia ? (
                <p className="mt-1 text-xs text-tinta-fraca">
                  Referência: {pedido.endereco.referencia}
                </p>
              ) : null}
              <p
                className="mt-3 inline-flex items-center gap-1.5 text-xs"
                style={{ color: pedido.endereco.validado ? "var(--positivo)" : "var(--tinta-2)" }}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{
                    background: pedido.endereco.validado ? "var(--bom)" : "var(--atencao)",
                  }}
                />
                {pedido.endereco.validado
                  ? "Endereço confere com o CEP"
                  : "CEP não conferido — revise antes de despachar"}
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <Vazio>Sem endereço cadastrado. O agente vai coletar com o cliente.</Vazio>
            </div>
          )}
        </Cartao>
      </div>

      <Cartao className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-tinta">Conversa no WhatsApp</h2>
          {pedido.conversa ? (
            <p className="text-xs text-tinta-fraca">
              Próximo turno: {ROTULO_AGENTE[agenteAtual]}
              {pedido.conversa.encerrada ? " · encerrada" : ""}
            </p>
          ) : null}
        </div>

        {mensagens.length === 0 ? (
          <div className="mt-4">
            <Vazio>Nenhuma mensagem trocada ainda.</Vazio>
          </div>
        ) : (
          <ol className="mt-5 space-y-3">
            {mensagens.map((msg) => {
              const doCliente = msg.direcao === "ENTRADA";
              const agente = msg.agente
                ? agenteSchema.safeParse(msg.agente)
                : null;

              return (
                <li
                  key={msg.id}
                  className={`flex flex-col ${doCliente ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      doCliente
                        ? "rounded-bl-md bg-plano text-tinta ring-1 ring-borda"
                        : "rounded-br-md text-white"
                    }`}
                    style={doCliente ? undefined : { background: "var(--acento)" }}
                  >
                    {msg.conteudo}
                  </div>
                  <p className="tabular mt-1 px-1 text-xs text-tinta-fraca">
                    {doCliente
                      ? pedido.cliente.nome
                      : agente?.success
                        ? ROTULO_AGENTE[agente.data]
                        : msg.autor === "HUMANO"
                          ? "Equipe"
                          : "Agente"}{" "}
                    · {horario.format(msg.criadoEm)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Cartao>

      <Cartao className="mt-4">
        <h2 className="text-sm font-semibold text-tinta">O que o agente fez</h2>
        {pedido.eventos.length === 0 ? (
          <div className="mt-4">
            <Vazio>Nenhuma ação registrada.</Vazio>
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {pedido.eventos.map((evento) => {
              const tipo = tipoEventoSchema.safeParse(evento.tipo);
              const agente = evento.agente ? agenteSchema.safeParse(evento.agente) : null;

              return (
                <li key={evento.id} className="border-b border-linha pb-3 text-sm last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-tinta">
                      {tipo.success ? ROTULO_EVENTO[tipo.data] : evento.tipo}
                    </span>
                    <span className="tabular text-xs text-tinta-fraca">
                      {agente?.success ? `${ROTULO_AGENTE[agente.data]} · ` : ""}
                      {horario.format(evento.criadoEm)}
                    </span>
                  </div>
                  {evento.detalhe ? (
                    <p className="mt-1 text-tinta-2">{evento.detalhe}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Cartao>
    </main>
  );
}
