import { validateCpfCnpj } from './brazilian-validation';

export function normalizeCpf(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^[\d.\-\s]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 && validateCpfCnpj(digits) ? digits : '';
}

export function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10);
}
