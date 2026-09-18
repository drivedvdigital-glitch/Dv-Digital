"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Mantém o painel vivo: recarrega os dados do servidor em intervalo fixo.
 *
 * Polling e não streaming de propósito — a operação toda cabe em uma consulta
 * barata e o intervalo é de segundos, então um SSE aberto por aba custaria mais
 * do que entrega. Pausa quando a aba não está visível.
 */
export function AutoRefresh({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!ativo) return;

    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);

    return () => clearInterval(id);
  }, [ativo, segundos, router]);

  return (
    <button
      type="button"
      onClick={() => setAtivo((v) => !v)}
      className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-tinta-2 ring-1 ring-borda transition-colors hover:text-tinta"
      aria-pressed={ativo}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: ativo ? "var(--bom)" : "var(--tinta-fraca)" }}
      />
      {ativo ? `Ao vivo · ${segundos}s` : "Atualização pausada"}
    </button>
  );
}
