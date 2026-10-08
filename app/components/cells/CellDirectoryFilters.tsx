"use client";

import { useState } from "react";
import { matchesDirectorySearch } from "../../lib/directory-search";
import { DAY_LABELS, DAY_ORDER, type Cell } from "./types";

export type ParticipationStatus = "participo" | "pendente" | "aberta";

export function useCellDirectory(list: Cell[], statusOf: (cell: Cell) => ParticipationStatus) {
  const [search, setSearch] = useState("");
  const [rede, setRede] = useState("");
  const [dia, setDia] = useState("");
  const [status, setStatus] = useState("");
  const filtered = list.filter((cell) =>
    (!rede || cell.rede === rede) && (!dia || cell.dias_reuniao.includes(dia)) &&
    (!status || statusOf(cell) === status) &&
    matchesDirectorySearch(search, cell.nome, cell.descricao_publica, cell.rede, cell.endereco_publico, cell.lider_nome, cell.responsavel));
  return {
    search, setSearch, rede, setRede, dia, setDia, status, setStatus, filtered,
    redes: [...new Set(list.map((cell) => cell.rede).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    dias: DAY_ORDER.filter((day) => list.some((cell) => cell.dias_reuniao.includes(day))),
    active: Boolean(search.trim() || rede || dia || status),
    reset: () => { setSearch(""); setRede(""); setDia(""); setStatus(""); },
  };
}

export type CellDirectory = ReturnType<typeof useCellDirectory>;

export default function CellDirectoryFilters({ directory, total }: { directory: CellDirectory; total: number }) {
  const d = directory;
  return (
    <section className="cell-directory-controls" aria-label="Encontrar uma célula">
      <div className="cell-directory-fields">
        <label className="cell-directory-search">Buscar célula, líder ou bairro
          <input type="search" value={d.search} onChange={(event) => d.setSearch(event.target.value)} placeholder="Nome, liderança ou endereço" />
        </label>
        <label>Rede<select value={d.rede} onChange={(event) => d.setRede(event.target.value)}><option value="">Todas as redes</option>{d.redes.map((rede) => <option key={rede}>{rede}</option>)}</select></label>
        <label>Dia do encontro<select value={d.dia} onChange={(event) => d.setDia(event.target.value)}><option value="">Todos os dias</option>{d.dias.map((dia) => <option key={dia} value={dia}>{DAY_LABELS[dia] || dia}</option>)}</select></label>
        <label>Participação<select value={d.status} onChange={(event) => d.setStatus(event.target.value)}><option value="">Todas as situações</option><option value="participo">Já participo</option><option value="pendente">Solicitação pendente</option><option value="aberta">Abertas</option></select></label>
      </div>
      <div className="cell-directory-results"><p role="status">{d.filtered.length} de {total} células</p>{d.active && <button type="button" onClick={d.reset}>Limpar filtros</button>}</div>
    </section>
  );
}

export function CellDirectoryEmpty({ total }: { total: number }) {
  return <p className="cpart-empty">{total ? "Nenhuma célula corresponde à busca. Ajuste os filtros ou use Limpar filtros." : "Nenhuma célula disponível no momento. Consulte a liderança da comunidade."}</p>;
}
