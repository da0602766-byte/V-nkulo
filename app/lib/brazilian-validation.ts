export function onlyDigits(value: unknown, maximum = 20) {
  return String(value || "").replace(/\D/g, "").slice(0, maximum);
}

export function normalizeBrazilianPhone(value: unknown) {
  const digits = onlyDigits(value, 13).replace(/^55(?=\d{10,11}$)/, "");
  if (!/^\d{10,11}$/.test(digits) || /^([0-9])\1+$/.test(digits)) return null;
  return `+55${digits}`;
}

export function validateCpfCnpj(value: unknown) {
  const digits = onlyDigits(value, 14);
  if (digits.length === 11) return validateDocument(digits, [10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]);
  if (digits.length === 14) return validateDocument(digits, [5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return false;
}

function validateDocument(digits: string, first: number[], second: number[]) {
  if (/^(\d)\1+$/.test(digits)) return false;
  const check = (base: string, weights: number[]) => {
    const total = weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const firstDigit = check(digits, first);
  const secondDigit = check(`${digits.slice(0, -2)}${firstDigit}`, second);
  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

export function maskDocument(value: unknown) {
  const digits = onlyDigits(value, 14);
  return digits.length === 14 ? `**.***.***/****-${digits.slice(-2)}` : `***.***.***-${digits.slice(-2)}`;
}

