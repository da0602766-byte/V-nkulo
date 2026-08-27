import { normalizeBrazilianPhone, onlyDigits, validateCpfCnpj } from "../../../lib/brazilian-validation";
import { getSessionUser } from "../../../lib/local-auth";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.ativo) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("tipo");
  const value = url.searchParams.get("valor") || "";
  if (type === "documento") return Response.json({ valido: validateCpfCnpj(value) });
  if (type === "celular") {
    const normalized = normalizeBrazilianPhone(value);
    return Response.json({ valido: Boolean(normalized), normalizado: normalized || "" });
  }
  if (type === "cep") {
    const cep = onlyDigits(value, 8);
    if (cep.length !== 8) return Response.json({ error: "CEP inválido." }, { status: 400 });
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
    if (!response.ok) return Response.json({ error: "CEP não encontrado." }, { status: 404 });
    const address = await response.json() as Record<string, unknown>;
    if (address.erro) return Response.json({ error: "CEP não encontrado." }, { status: 404 });
    return Response.json({ valido: true, endereco: { cep, logradouro: address.logradouro, bairro: address.bairro, cidade: address.localidade, estado: address.uf } });
  }
  return Response.json({ error: "Tipo de validação não suportado." }, { status: 400 });
}
