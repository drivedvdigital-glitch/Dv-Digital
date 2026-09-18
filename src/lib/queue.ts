/**
 * Controle de concorrência dos agentes.
 *
 * Limitação conhecida: as travas e o limite vivem na memória do processo. Com
 * uma instância só — que é o caso de um deploy padrão — resolvem. Ao escalar
 * para várias instâncias, troque por uma fila externa (Redis, BullMQ,
 * SQS) e um lock distribuído, senão dois processos podem atender o mesmo
 * pedido ao mesmo tempo.
 */

/** Quantos pedidos são atendidos ao mesmo tempo. */
export const AGENTES_SIMULTANEOS = Math.max(
  1,
  Number(process.env.AGENTES_SIMULTANEOS ?? 3),
);

const travas = new Map<string, Promise<unknown>>();

/**
 * Serializa o trabalho por chave. Dois webhooks do mesmo pedido chegando
 * juntos rodariam o agente duas vezes sobre o mesmo histórico e mandariam duas
 * respostas ao cliente; a trava faz o segundo esperar o primeiro terminar.
 */
export function comTrava<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = travas.get(chave) ?? Promise.resolve();
  // Encadeia nos dois casos: uma tarefa que falhou não pode travar a fila.
  const atual = anterior.then(tarefa, tarefa);

  // No Map fica uma versão que nunca rejeita, para o erro de uma tarefa não
  // vazar para quem entrar na fila depois.
  const elo = atual.then(
    () => undefined,
    () => undefined,
  );
  travas.set(chave, elo);

  void elo.then(() => {
    // Só limpa se ninguém entrou na fila no meio tempo; comparar contra o elo
    // guardado é o que evita apagar a trava de uma tarefa que ainda vai rodar.
    if (travas.get(chave) === elo) travas.delete(chave);
  });

  return atual;
}

/**
 * Executa as tarefas com no máximo `limite` em voo ao mesmo tempo.
 * Uma tarefa que falha não derruba o lote: o erro volta no resultado.
 */
export async function emLote<T, R>(
  itens: readonly T[],
  tarefa: (item: T) => Promise<R>,
  limite = AGENTES_SIMULTANEOS,
): Promise<Array<{ item: T; resultado?: R; erro?: string }>> {
  const saida: Array<{ item: T; resultado?: R; erro?: string }> = new Array(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      const item = itens[indice];
      try {
        saida[indice] = { item, resultado: await tarefa(item) };
      } catch (causa) {
        saida[indice] = {
          item,
          erro: causa instanceof Error ? causa.message : String(causa),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador()),
  );
  return saida;
}
