import type { ParkingEventOption, Space } from "./types";

export async function readJson<T>(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function isSpaceAvailable(space: Space) {
  return space.status === "LIVRE" && !Boolean(space.reservada);
}

export function hasCustomParkingLayout(spaces: Space[]) {
  if (!spaces.length) return false;
  const positions = new Set(spaces.map((space) => `${space.posicao_x}:${space.posicao_y}`));
  return positions.size > 1 || spaces.some((space) => space.posicao_x > 0 || space.posicao_y > 0);
}

export function getParkingCanvasWidth(spaces: Space[]) {
  const furthest = Math.max(0, ...spaces.map((space) => Number(space.posicao_x) || 0));
  return Math.max(360, Math.min(1200, furthest + 76));
}

export function getParkingCanvasHeight(spaces: Space[]) {
  const furthest = Math.max(0, ...spaces.map((space) => Number(space.posicao_y) || 0));
  return Math.max(220, Math.min(720, furthest + 58));
}

export function getEventParkingWindow(event: ParkingEventOption) {
  const eventStart = new Date(event.inicia_em);
  const rawEnd = event.termina_em ? new Date(event.termina_em) : null;
  const eventEnd = rawEnd && Number.isFinite(rawEnd.getTime())
    ? rawEnd
    : new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
  return {
    start: toLocalDateTimeInput(new Date(eventStart.getTime() - 45 * 60 * 1000)),
    end: toLocalDateTimeInput(new Date(eventEnd.getTime() + 30 * 60 * 1000)),
  };
}

export function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
