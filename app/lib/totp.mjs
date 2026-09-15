// TOTP (RFC 6238) — segundo fator sem serviço externo.
//
// O projeto registrava MFA como "dependência externa" (ver o 423 devolvido
// pela aprovação crítica em app/api/pilot/continuidade/route.ts). Não é: o
// TOTP é HMAC-SHA1 sobre um contador de tempo, e `crypto.subtle` existe tanto
// no Worker quanto no Node que roda os testes. Qualquer aplicativo
// autenticador (Google Authenticator, Aegis, 1Password, …) lê o mesmo padrão.
// Nada aqui fala com a rede.
//
// Fica em `.mjs`, como tenant-policy e rate-limit-policy, para ser testável
// contra os vetores oficiais da RFC sem build e sem banco.

/** Dígitos do código. Seis é o que os aplicativos autenticadores assumem. */
export const DIGITOS = 6;

/** Duração de cada passo, em segundos. Trinta é o padrão do RFC e dos apps. */
export const PASSO_SEGUNDOS = 30;

/**
 * Quantos passos de tolerância aceitar para cada lado.
 *
 * 1 significa aceitar o código anterior e o seguinte, além do atual — ou seja,
 * uma janela de 90 segundos. É o suficiente para relógio de celular
 * dessincronizado e para quem digita devagar, sem alargar a janela de um
 * código roubado.
 */
export const JANELA_PADRAO = 1;

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Gera um segredo novo com entropia adequada.
 *
 * 20 bytes (160 bits) é o tamanho recomendado pelo RFC 4226 para HMAC-SHA1 e
 * o que os aplicativos autenticadores esperam.
 *
 * @returns {string} segredo em Base32, sem preenchimento
 */
export function gerarSegredo() {
  return paraBase32(crypto.getRandomValues(new Uint8Array(20)));
}

/**
 * Codifica bytes em Base32 (RFC 4648), sem `=` no fim — é assim que os
 * aplicativos autenticadores leem o segredo.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function paraBase32(bytes) {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/**
 * Decodifica Base32. Aceita minúsculas, espaços e `=` porque é comum o usuário
 * colar o segredo do jeito que o aplicativo mostrou.
 *
 * @param {string} texto
 * @returns {Uint8Array}
 */
export function deBase32(texto) {
  const limpo = String(texto || "").toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let valor = 0;
  const saida = [];
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice < 0) throw new Error("Segredo Base32 inválido.");
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(saida);
}

/**
 * Converte um instante no passo TOTP correspondente.
 *
 * @param {number} agoraMs
 * @param {number} [passoSegundos]
 * @returns {number}
 */
export function passoDoInstante(agoraMs, passoSegundos = PASSO_SEGUNDOS) {
  return Math.floor(agoraMs / 1000 / passoSegundos);
}

/**
 * Gera o código de um passo específico (HOTP do RFC 4226, que é o TOTP com o
 * contador derivado do tempo).
 *
 * @param {Uint8Array} segredoBytes
 * @param {number} contador
 * @param {number} [digitos]
 * @returns {Promise<string>} código com zeros à esquerda
 */
export async function gerarCodigoDoPasso(segredoBytes, contador, digitos = DIGITOS) {
  // O contador entra como inteiro de 64 bits big-endian. `BigInt` evita o
  // limite de 32 bits dos operadores bit a bit do JavaScript.
  const bloco = new Uint8Array(8);
  let restante = BigInt(contador);
  for (let indice = 7; indice >= 0; indice -= 1) {
    bloco[indice] = Number(restante & 0xffn);
    restante >>= 8n;
  }

  const chave = await crypto.subtle.importKey(
    "raw",
    segredoBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, bloco));

  // Truncagem dinâmica do RFC 4226: os 4 bits finais escolhem de onde ler os
  // 4 bytes do código, e o bit mais alto é descartado para o número ser
  // sempre positivo.
  const deslocamento = assinatura[assinatura.length - 1] & 0x0f;
  const binario =
    ((assinatura[deslocamento] & 0x7f) << 24) |
    ((assinatura[deslocamento + 1] & 0xff) << 16) |
    ((assinatura[deslocamento + 2] & 0xff) << 8) |
    (assinatura[deslocamento + 3] & 0xff);

  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

/**
 * Gera o código válido agora.
 *
 * @param {string} segredoBase32
 * @param {number} [agoraMs]
 * @returns {Promise<string>}
 */
export async function gerarCodigo(segredoBase32, agoraMs = Date.now()) {
  return gerarCodigoDoPasso(deBase32(segredoBase32), passoDoInstante(agoraMs));
}

/**
 * Confere um código digitado pelo usuário.
 *
 * Devolve o passo aceito em vez de apenas `true`: quem chama precisa dele para
 * gravar o anti-replay. Sem isso, um código interceptado valeria de novo
 * dentro da mesma janela de 90 segundos.
 *
 * @param {object} entrada
 * @param {string} entrada.segredoBase32
 * @param {string} entrada.codigo
 * @param {number} [entrada.agoraMs]
 * @param {number} [entrada.janela]
 * @param {number | null} [entrada.ultimoPasso] último passo já usado por este usuário
 * @returns {Promise<{ valido: boolean, passo: number | null, motivo: string }>}
 */
export async function verificarCodigo({
  segredoBase32,
  codigo,
  agoraMs = Date.now(),
  janela = JANELA_PADRAO,
  ultimoPasso = null,
}) {
  const digitado = String(codigo || "").replace(/\D/g, "");
  if (digitado.length !== DIGITOS) {
    return { valido: false, passo: null, motivo: "FORMATO" };
  }

  let segredoBytes;
  try {
    segredoBytes = deBase32(segredoBase32);
  } catch {
    return { valido: false, passo: null, motivo: "SEGREDO_INVALIDO" };
  }
  if (segredoBytes.length === 0) {
    return { valido: false, passo: null, motivo: "SEGREDO_INVALIDO" };
  }

  const passoAtual = passoDoInstante(agoraMs);
  for (let desvio = -janela; desvio <= janela; desvio += 1) {
    const passo = passoAtual + desvio;
    if (passo < 0) continue;
    const esperado = await gerarCodigoDoPasso(segredoBytes, passo);
    if (!comparacaoConstante(esperado, digitado)) continue;
    // O código confere, mas pode já ter sido gasto. Recusar aqui é o que
    // impede reapresentar o mesmo código dentro da janela de tolerância.
    if (ultimoPasso !== null && passo <= Number(ultimoPasso)) {
      return { valido: false, passo, motivo: "REUTILIZADO" };
    }
    return { valido: true, passo, motivo: "VALIDO" };
  }
  return { valido: false, passo: null, motivo: "INCORRETO" };
}

/**
 * Monta a URI `otpauth://` que vira o QR Code lido pelo aplicativo.
 *
 * @param {object} entrada
 * @param {string} entrada.segredoBase32
 * @param {string} entrada.conta rótulo de quem é a conta
 * @param {string} [entrada.emissor]
 * @returns {string}
 */
export function uriOtpauth({ segredoBase32, conta, emissor = "VINKULO" }) {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const parametros = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASSO_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}

/**
 * Comparação de tempo constante entre dois códigos de mesmo tamanho.
 *
 * Um `===` vazaria, pelo tempo de resposta, quantos dígitos iniciais estavam
 * certos. A margem é pequena em rede, mas o custo de evitar é zero.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function comparacaoConstante(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) {
    diferenca |= a.charCodeAt(indice) ^ b.charCodeAt(indice);
  }
  return diferenca === 0;
}
