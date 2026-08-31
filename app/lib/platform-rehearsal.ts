/* Ensaio de plataforma: rascunho, alvo, publicação e reversão.
 *
 * A regra que organiza tudo aqui: publicar é escrever em `configuracoes` a
 * chave de cada comunidade alvo, guardando antes o que havia lá. O retrato do
 * "antes" é o que permite reverter — sem ele, desfazer seria adivinhação.
 */

export type EnsaioAssunto = "tema" | "modulos";

export type EnsaioEstado = "RASCUNHO" | "PUBLICADO" | "REVERTIDO";

export type EnsaioAlvo = { tipo: "TODAS" } | { tipo: "ESPECIFICAS"; ids: number[] };

export const ENSAIO_ASSUNTOS: {
  id: EnsaioAssunto;
  label: string;
  descricao: string;
  chave: (comunidadeId: number) => string;
}[] = [
  {
    id: "tema",
    label: "Tema da comunidade",
    descricao: "Paleta, logo e capa aplicadas ao painel e à página pública.",
    chave: (id) => `community_theme:${id}`,
  },
  {
    id: "modulos",
    label: "Módulos ativos",
    descricao: "Quais áreas ficam disponíveis para a comunidade.",
    chave: (id) => `community_modules:${id}`,
  },
];

export function assuntoValido(valor: unknown): valor is EnsaioAssunto {
  return ENSAIO_ASSUNTOS.some((item) => item.id === valor);
}

export function chaveDoAssunto(assunto: EnsaioAssunto, comunidadeId: number) {
  const item = ENSAIO_ASSUNTOS.find((entry) => entry.id === assunto);
  if (!item) throw new Error(`Assunto desconhecido: ${assunto}`);
  return item.chave(comunidadeId);
}

/* O alvo chega da interface como JSON. Uma lista vazia em "ESPECIFICAS" seria
 * uma publicação que não atinge ninguém e mesmo assim marca o ensaio como
 * publicado — por isso ela é recusada na validação, não aqui. */
export function parseAlvo(tipo: unknown, json: unknown): EnsaioAlvo {
  if (tipo === "ESPECIFICAS") {
    const bruto = typeof json === "string" ? safeParse(json) : json;
    const ids = Array.isArray(bruto)
      ? [...new Set(bruto.map((valor) => Number(valor)).filter((valor) => Number.isInteger(valor) && valor > 0))]
      : [];
    return { tipo: "ESPECIFICAS", ids };
  }
  return { tipo: "TODAS" };
}

function safeParse(valor: string) {
  try {
    return JSON.parse(valor) as unknown;
  } catch {
    return null;
  }
}

export function descreveAlvo(alvo: EnsaioAlvo, total: number) {
  if (alvo.tipo === "TODAS") {
    return total === 1 ? "1 comunidade (todas)" : `${total} comunidades (todas)`;
  }
  return alvo.ids.length === 1
    ? "1 comunidade escolhida"
    : `${alvo.ids.length} comunidades escolhidas`;
}

/* Um ensaio publicado só pode ser revertido enquanto o retrato do "antes"
 * ainda corresponde ao que está no ar. Se alguém publicou outro ensaio do
 * mesmo assunto depois, reverter este apagaria o trabalho do outro — por isso
 * só o último publicado de cada assunto é reversível. */
export function podeReverter(
  ensaio: { id: number; assunto: string; estado: string },
  ultimoPublicadoPorAssunto: Map<string, number>,
) {
  if (ensaio.estado !== "PUBLICADO") return false;
  return ultimoPublicadoPorAssunto.get(ensaio.assunto) === ensaio.id;
}
