"use client";

import { useCallback, useEffect, useState } from "react";

export type SavedVehicle = {
  id: string;
  apelido: string;
  placa: string;
  tipo: string;
  modelo: string;
  cor: string;
};

function storageKeyFor(ownerKey: string) {
  return `vinkulo:gestao:garagem:${ownerKey}`;
}

function readGarage(ownerKey: string): SavedVehicle[] {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(ownerKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Cadastro de veículos salvo pelo próprio usuário neste aparelho. Guarda uma
 * pequena garagem (placa, modelo, cor) para reutilizar em reservas futuras
 * sem precisar digitar tudo de novo.
 */
export function useParkingGarage(ownerKey: string) {
  const [vehicles, setVehicles] = useState<SavedVehicle[]>([]);

  useEffect(() => {
    if (!ownerKey) return;
    // Sincroniza com o localStorage (fonte externa) assim que sabemos de
    // quem é a garagem — não há como evitar o setState aqui.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVehicles(readGarage(ownerKey));
  }, [ownerKey]);

  const persist = useCallback((next: SavedVehicle[]) => {
    setVehicles(next);
    if (!ownerKey) return;
    try {
      window.localStorage.setItem(storageKeyFor(ownerKey), JSON.stringify(next));
    } catch {
      // A garagem local é apenas uma conveniência; a reserva continua funcionando sem ela.
    }
  }, [ownerKey]);

  const addVehicle = useCallback((vehicle: Omit<SavedVehicle, "id">) => {
    const record: SavedVehicle = { ...vehicle, id: crypto.randomUUID() };
    persist([record, ...vehicles].slice(0, 8));
    return record;
  }, [persist, vehicles]);

  const removeVehicle = useCallback((id: string) => {
    persist(vehicles.filter((item) => item.id !== id));
  }, [persist, vehicles]);

  return { vehicles, addVehicle, removeVehicle };
}
