"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cell, HighlightMessage } from "./types";

async function apiJson<T = { ok: boolean }>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}

const DEFAULT_HIGHLIGHT: HighlightMessage = {
  titulo: "Mateus 18:20",
  mensagem:
    "Porque onde dois ou três estiverem reunidos em meu nome, ali estou eu no meio deles.",
  atualizadoEm: null,
  podeEditar: false,
};

/**
 * Dados e ações da aba Células, compartilhados entre a Gestão
 * (CellManagementConsole) e a Participação (CellMemberPortal) — as duas
 * experiências leem a mesma lista de células e a mesma mensagem de
 * destaque, só mudam o que mostram dela.
 */
export function useCellsData() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: number; nome: string; papel: string }>>([]);
  const [canManage, setCanManage] = useState(false);
  const [highlight, setHighlight] = useState<HighlightMessage>(DEFAULT_HIGHLIGHT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // O relógio vem de estado: lê-lo durante a renderização daria valores
  // diferentes no servidor e no cliente e quebraria a hidratação.
  const [agora, setAgora] = useState(0);

  const loadCells = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await apiJson<{
        celulas: Cell[];
        availableUsers?: Array<{ id: number; nome: string; papel: string }>;
        canManage: boolean;
      }>("/api/pilot/celulas");
      setCells(result.celulas);
      setAvailableUsers(result.availableUsers || []);
      setCanManage(Boolean(result.canManage));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadHighlight = useCallback(async () => {
    try {
      const result = await apiJson<HighlightMessage>("/api/pilot/celulas/mensagem");
      setHighlight(result);
    } catch {
      // A caixa de destaque não é essencial: se falhar, fica no texto padrão.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCells();
      void loadHighlight();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCells, loadHighlight]);

  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 3600000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  // Devolve se deu certo em vez de rejeitar a promise: os componentes que
  // só devem fechar um diálogo ou limpar um formulário em caso de sucesso
  // conferem esse retorno, em vez de precisar de try/catch espalhado — e o
  // erro já fica visível via OperationFeedback de qualquer forma.
  async function run(action: () => Promise<void>, successMessage?: string): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await action();
      if (successMessage) setMessage(successMessage);
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createCell(body: Record<string, unknown>) {
    return run(async () => {
      await apiJson("/api/pilot/celulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await loadCells(true);
    }, "Célula criada com os dias e a liderança definidos.");
  }

  async function cellAction(cellId: number, body: Record<string, unknown>, successMessage = "Alteração salva.") {
    return run(async () => {
      await apiJson(`/api/pilot/celulas/${cellId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await loadCells(true);
    }, successMessage);
  }

  async function archiveCell(cell: Cell) {
    return run(async () => {
      await apiJson(`/api/pilot/celulas/${cell.id}`, { method: "DELETE" });
      await loadCells(true);
    }, "Célula arquivada.");
  }

  async function requestCellEntry(cellId: number, cellName: string, data: Record<string, unknown>) {
    return run(async () => {
      await apiJson(`/api/public/celulas/${cellId}/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }, `Solicitação enviada à liderança da célula ${cellName}.`);
  }

  async function saveHighlight(titulo: string, mensagem: string) {
    return run(async () => {
      const result = await apiJson<{ titulo: string; mensagem: string }>("/api/pilot/celulas/mensagem", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensagem }),
      });
      setHighlight((current) => ({ ...current, ...result, atualizadoEm: new Date().toISOString() }));
    }, "Mensagem de destaque atualizada.");
  }

  return {
    cells,
    availableUsers,
    canManage,
    highlight,
    loading,
    saving,
    message,
    error,
    agora,
    clearFeedback: () => { setMessage(""); setError(""); },
    reload: () => loadCells(true),
    createCell,
    cellAction,
    archiveCell,
    requestCellEntry,
    saveHighlight,
  };
}

export type CellsData = ReturnType<typeof useCellsData>;
