import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Cartao, Indicador, Medidor, NumeroHeroi, SeloStatus, Vazio } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatarBRL, formatarTelefone, plural, type StatusPedido } from "@/lib/domain";
import { calcularMetricas } from "@/lib/metrics";
import { EXPLICACAO_STATUS, ORDEM_STATUS } from "@/lib/status-visual";

export const dynamic = "force-dynamic";

function tempoRelativo(data: Date): string {
  const min = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas} h`;
  return `${Math.floor(horas / 24)} d`;
}

export default async function Painel() {
  const [metricas, pedidos] = await Promise.all([
    calcularMetricas(),
    prisma.pedido.findMany({
      orderBy: { atualizadoEm: "desc" },
      take: 25,
      include: { cliente: true, conversa: true, itens: true },
    }),
  ]);

  const decididos =
    metricas.porStatus.CONFIRMADO +
    metricas.porStatus.RECUSADO +
    metricas.porStatus.SEM_RESPOSTA;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tinta">DV Confirma</h1>
          <p className="mt-1 max-w-prose text-sm text-tinta-2">
            Confirmação de pedidos por WhatsApp. Os agentes confirmam, respondem dúvida de
            produto e consertam endereço antes de a mercadoria sair.
          </p>
        </div>
        <AutoRefresh />
      </header>

      {metricas.total === 0 ? (
        <Cartao className="mt-8">
          <Vazio>
            Nenhum pedido importado ainda. Rode <code className="text-tinta">npm run db:seed</code>{" "}
            para carregar dados de exemplo, ou importe um pedido em{" "}
            <code className="text-tinta">POST /api/pedidos</code>.
          </Vazio>
        </Cartao>
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Cartao className="flex flex-col justify-center">
              <NumeroHeroi
                rotulo="Taxa de confirmação"
                valor={`${(metricas.taxaConfirmacao * 100).toFixed(0)}%`}
                apoio={
                  decididos === 0
                    ? "Nenhum pedido decidido ainda"
                    : `${metricas.porStatus.CONFIRMADO} de ${decididos} pedidos decididos`
                }
              />
            </Cartao>

            <div className="grid gap-4 sm:grid-cols-2">
              <Indicador
                rotulo="Liberado para envio"
                valor={formatarBRL(metricas.valorConfirmado)}
                apoio={plural(metricas.porStatus.CONFIRMADO, "pedido confirmado", "pedidos confirmados")}
                cor="var(--positivo)"
              />
              <Indicador
                rotulo="Ainda em jogo"
                valor={formatarBRL(metricas.valorEmAberto)}
                apoio="Aguardando, em atendimento ou com endereço pendente"
              />
              <Indicador
                rotulo="Perdido"
                valor={formatarBRL(metricas.valorPerdido)}
                apoio="Recusados e sem resposta"
              />
              <Indicador
                rotulo="Tempo até confirmar"
                valor={
                  metricas.medianaConfirmacaoMin === null
                    ? "—"
                    : `${Math.round(metricas.medianaConfirmacaoMin)} min`
                }
                apoio="Mediana entre importar e confirmar"
              />
            </div>
          </div>

          {metricas.precisamAtencao > 0 ? (
            <Cartao className="mt-4">
              <p className="text-sm text-tinta">
                <strong className="font-semibold">
                  {metricas.precisamAtencao}{" "}
                  {metricas.precisamAtencao === 1 ? "pedido precisa" : "pedidos precisam"} de uma
                  pessoa
                </strong>{" "}
                <span className="text-tinta-2">
                  — escalados pelo agente ou com endereço que não fecha. Nenhum deles pode ser
                  despachado assim.
                </span>
              </p>
            </Cartao>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Cartao>
              <h2 className="text-sm font-semibold text-tinta">Onde estão os pedidos</h2>
              <div className="mt-5 space-y-5">
                {ORDEM_STATUS.map((status) => (
                  <Medidor
                    key={status}
                    status={status}
                    quantidade={metricas.porStatus[status]}
                    total={metricas.total}
                    descricao={EXPLICACAO_STATUS[status]}
                  />
                ))}
              </div>
            </Cartao>

            <Cartao>
              <h2 className="text-sm font-semibold text-tinta">Por que recusam</h2>
              {metricas.motivosRecusa.length === 0 ? (
                <div className="mt-5">
                  <Vazio>Nenhuma recusa registrada até agora.</Vazio>
                </div>
              ) : (
                <ul className="mt-5 space-y-3">
                  {metricas.motivosRecusa.map((m) => (
                    <li
                      key={m.motivo}
                      className="flex items-baseline justify-between gap-4 border-b border-linha pb-3 last:border-0 last:pb-0"
                    >
                      <span className="text-sm text-tinta-2">{m.motivo}</span>
                      <span className="tabular shrink-0 text-sm font-medium text-tinta">
                        {m.quantidade}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>

          <Cartao className="mt-4">
            <h2 className="text-sm font-semibold text-tinta">Pedidos recentes</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-linha text-xs text-tinta-fraca">
                    <th className="pb-2 font-medium">Pedido</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((pedido) => (
                    <tr key={pedido.id} className="border-b border-linha last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/pedidos/${pedido.id}`}
                          className="font-medium text-acento underline-offset-4 hover:underline"
                        >
                          {pedido.codigo}
                        </Link>
                        <p className="text-xs text-tinta-fraca">
                          {plural(
                            pedido.itens.reduce((soma, i) => soma + i.quantidade, 0),
                            "item",
                            "itens",
                          )}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-tinta">{pedido.cliente.nome}</p>
                        <p className="tabular text-xs text-tinta-fraca">
                          {formatarTelefone(pedido.cliente.telefone)}
                        </p>
                      </td>
                      <td className="tabular py-3 pr-4 text-right text-tinta">
                        {formatarBRL(pedido.valorTotal)}
                      </td>
                      <td className="py-3 pr-4">
                        <SeloStatus status={pedido.status as StatusPedido} />
                      </td>
                      <td className="tabular py-3 text-right text-tinta-fraca">
                        {tempoRelativo(pedido.atualizadoEm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        </>
      )}
    </main>
  );
}
