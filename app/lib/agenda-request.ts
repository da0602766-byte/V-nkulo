export class AgendaRequestError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export function agendaErrorMessage(error: unknown, saving = false) {
  if (error instanceof AgendaRequestError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (error instanceof TypeError || /fetch|network|load failed|abort|json|unexpected token/i.test(message)) {
    return saving ? "A conexão falhou. Seus dados continuam no formulário; confira a agenda antes de tentar salvar novamente." : "Não foi possível atualizar a agenda. Verifique sua conexão e tente novamente.";
  }
  return message || "Não foi possível consultar a agenda. Tente novamente.";
}

/** Retry only reads, once. Writes are never replayed automatically. */
export async function readAgendaJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = new AbortController();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) request.abort();
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: request.signal });
      if (!response.ok) {
        const message = response.status === 401 ? "Sua sessão expirou. Entre novamente para consultar a agenda."
          : response.status === 403 ? "Seu acesso à agenda mudou. Atualize a página."
          : "A agenda está temporariamente indisponível. Tente novamente.";
        throw new AgendaRequestError(message, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt === 0 && (!(error instanceof AgendaRequestError) || error.status >= 500)) continue;
      throw error instanceof AgendaRequestError ? error : new AgendaRequestError(agendaErrorMessage(error));
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  throw new AgendaRequestError("Não foi possível consultar a agenda.");
}
