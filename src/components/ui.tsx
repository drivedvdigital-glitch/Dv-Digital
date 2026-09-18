import { ROTULO_STATUS, type StatusPedido } from "@/lib/domain";
import { COR_STATUS } from "@/lib/status-visual";

/** Cartão base: superfície do painel com anel de 1px. */
export function Cartao({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl bg-superficie p-5 ring-1 ring-borda ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * O único número grande da tela. A paleta pede exatamente um por visão, então
 * ele fica reservado para a taxa de confirmação — a métrica que a operação lê
 * primeiro.
 */
export function NumeroHeroi({
  rotulo,
  valor,
  apoio,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
}) {
  return (
    <div>
      <p className="text-sm text-tinta-2">{rotulo}</p>
      <p className="mt-1 text-6xl font-semibold leading-none text-tinta">{valor}</p>
      {apoio ? <p className="mt-2 text-sm text-tinta-fraca">{apoio}</p> : null}
    </div>
  );
}

/** Número de apoio: rótulo, valor e uma linha de contexto. */
export function Indicador({
  rotulo,
  valor,
  apoio,
  cor,
}: {
  rotulo: string;
  valor: string;
  apoio?: string;
  cor?: string;
}) {
  return (
    <Cartao>
      <p className="text-sm text-tinta-2">{rotulo}</p>
      <p
        className="mt-1 text-2xl font-semibold leading-tight"
        style={{ color: cor ?? "var(--tinta)" }}
      >
        {valor}
      </p>
      {apoio ? <p className="mt-1 text-xs text-tinta-fraca">{apoio}</p> : null}
    </Cartao>
  );
}

/**
 * Selo de status. A cor vem sempre acompanhada do texto — é o que permite usar
 * os tons de atenção e sério, que sozinhos não teriam contraste suficiente.
 */
export function SeloStatus({ status }: { status: StatusPedido }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-tinta">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: COR_STATUS[status] }}
      />
      {ROTULO_STATUS[status]}
    </span>
  );
}

/**
 * Barra de proporção de um status sobre o total.
 * O trilho é a mesma cor da barra em baixa opacidade, para o estado ser
 * legível ao longo de toda a linha.
 */
export function Medidor({
  status,
  quantidade,
  total,
  descricao,
}: {
  status: StatusPedido;
  quantidade: number;
  total: number;
  descricao: string;
}) {
  const fracao = total === 0 ? 0 : quantidade / total;
  const cor = COR_STATUS[status];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1">
      <SeloStatus status={status} />
      <span className="tabular text-sm font-medium text-tinta">
        {quantidade}
        <span className="ml-1.5 text-tinta-fraca">
          {(fracao * 100).toFixed(0)}%
        </span>
      </span>
      <div
        className="col-span-2 h-1.5 overflow-hidden rounded-full"
        style={{ background: `color-mix(in oklab, ${cor} 16%, transparent)` }}
        role="img"
        aria-label={`${quantidade} de ${total} pedidos`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(fracao * 100, quantidade > 0 ? 1.5 : 0)}%`, background: cor }}
        />
      </div>
      <p className="col-span-2 text-xs text-tinta-fraca">{descricao}</p>
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-base px-4 py-8 text-center text-sm text-tinta-fraca">
      {children}
    </p>
  );
}
