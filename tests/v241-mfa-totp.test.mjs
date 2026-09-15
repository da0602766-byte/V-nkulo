import assert from "node:assert/strict";
import test from "node:test";
import {
  DIGITOS,
  PASSO_SEGUNDOS,
  comparacaoConstante,
  deBase32,
  gerarCodigo,
  gerarCodigoDoPasso,
  gerarSegredo,
  paraBase32,
  passoDoInstante,
  uriOtpauth,
  verificarCodigo,
} from "../app/lib/totp.mjs";

// Segredo oficial do RFC 6238, Apêndice B: os 20 bytes ASCII de
// "12345678901234567890".
const SEGREDO_RFC = paraBase32(new TextEncoder().encode("12345678901234567890"));

test("o segredo do RFC codifica em Base32 como o esperado", () => {
  assert.equal(SEGREDO_RFC, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(
    deBase32(SEGREDO_RFC),
    new TextEncoder().encode("12345678901234567890"),
  );
});

test("Base32 sobrevive a ida e volta com tamanhos irregulares", () => {
  for (const tamanho of [1, 2, 3, 5, 7, 10, 20]) {
    const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
    assert.deepEqual(deBase32(paraBase32(bytes)), bytes, `falhou com ${tamanho} bytes`);
  }
});

test("a decodificação tolera minúscula, espaço e preenchimento", () => {
  const esperado = deBase32(SEGREDO_RFC);
  assert.deepEqual(deBase32(SEGREDO_RFC.toLowerCase()), esperado);
  assert.deepEqual(deBase32("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ"), esperado);
  assert.deepEqual(deBase32(`${SEGREDO_RFC}======`), esperado);
  assert.throws(() => deBase32("108!"), /Base32 inválido/);
});

// Estes são os vetores publicados no RFC 6238. Se a implementação passar
// neles, ela é interoperável com qualquer aplicativo autenticador — é a única
// forma de garantir isso sem instalar um.
test("os vetores oficiais do RFC 6238 (SHA-1) conferem", async () => {
  const vetores = [
    { segundos: 59, esperado: "94287082" },
    { segundos: 1111111109, esperado: "07081804" },
    { segundos: 1111111111, esperado: "14050471" },
    { segundos: 1234567890, esperado: "89005924" },
    { segundos: 2000000000, esperado: "69279037" },
    { segundos: 20000000000, esperado: "65353130" },
  ];
  const segredoBytes = deBase32(SEGREDO_RFC);
  for (const vetor of vetores) {
    const passo = passoDoInstante(vetor.segundos * 1000);
    const oitoDigitos = await gerarCodigoDoPasso(segredoBytes, passo, 8);
    assert.equal(oitoDigitos, vetor.esperado, `T=${vetor.segundos}`);

    // O código de 6 dígitos é o resto menor do mesmo número, ou seja, os seis
    // dígitos finais do vetor de 8.
    const seisDigitos = await gerarCodigoDoPasso(segredoBytes, passo, 6);
    assert.equal(seisDigitos, vetor.esperado.slice(-6), `T=${vetor.segundos} em 6 dígitos`);
  }
});

test("o código gerado agora é aceito na verificação", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const codigo = await gerarCodigo(SEGREDO_RFC, agoraMs);
  assert.equal(codigo.length, DIGITOS);
  const resultado = await verificarCodigo({ segredoBase32: SEGREDO_RFC, codigo, agoraMs });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.passo, passoDoInstante(agoraMs));
});

test("a janela de tolerância cobre um passo para cada lado e para aí", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const passoMs = PASSO_SEGUNDOS * 1000;

  // Relógio do celular atrasado ou adiantado em um passo: precisa passar.
  for (const desvio of [-1, 0, 1]) {
    const codigo = await gerarCodigo(SEGREDO_RFC, agoraMs + desvio * passoMs);
    const resultado = await verificarCodigo({ segredoBase32: SEGREDO_RFC, codigo, agoraMs });
    assert.equal(resultado.valido, true, `desvio de ${desvio} passo deveria ser aceito`);
  }

  // Dois passos de distância já é código velho demais.
  for (const desvio of [-2, 2]) {
    const codigo = await gerarCodigo(SEGREDO_RFC, agoraMs + desvio * passoMs);
    const resultado = await verificarCodigo({ segredoBase32: SEGREDO_RFC, codigo, agoraMs });
    assert.equal(resultado.valido, false, `desvio de ${desvio} passos deveria ser recusado`);
    assert.equal(resultado.motivo, "INCORRETO");
  }
});

test("o mesmo código não vale duas vezes", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const codigo = await gerarCodigo(SEGREDO_RFC, agoraMs);

  const primeira = await verificarCodigo({ segredoBase32: SEGREDO_RFC, codigo, agoraMs });
  assert.equal(primeira.valido, true);

  // Reapresentar dentro da mesma janela precisa falhar: sem isso, um código
  // interceptado continuaria valendo por até 90 segundos.
  const segunda = await verificarCodigo({
    segredoBase32: SEGREDO_RFC,
    codigo,
    agoraMs,
    ultimoPasso: primeira.passo,
  });
  assert.equal(segunda.valido, false);
  assert.equal(segunda.motivo, "REUTILIZADO");
});

test("um código anterior ao último usado também é recusado", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const passoMs = PASSO_SEGUNDOS * 1000;
  const codigoAnterior = await gerarCodigo(SEGREDO_RFC, agoraMs - passoMs);
  const resultado = await verificarCodigo({
    segredoBase32: SEGREDO_RFC,
    codigo: codigoAnterior,
    agoraMs,
    ultimoPasso: passoDoInstante(agoraMs),
  });
  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivo, "REUTILIZADO");
});

test("entrada malformada é recusada sem exceção", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const casos = [
    { codigo: "", motivo: "FORMATO" },
    { codigo: "12345", motivo: "FORMATO" },
    { codigo: "1234567", motivo: "FORMATO" },
    { codigo: "abcdef", motivo: "FORMATO" },
    { codigo: null, motivo: "FORMATO" },
    { codigo: "000000", motivo: "INCORRETO" },
  ];
  for (const caso of casos) {
    const resultado = await verificarCodigo({
      segredoBase32: SEGREDO_RFC,
      codigo: caso.codigo,
      agoraMs,
    });
    assert.equal(resultado.valido, false, `código ${JSON.stringify(caso.codigo)}`);
    assert.equal(resultado.motivo, caso.motivo);
  }

  // Segredo corrompido no banco não pode derrubar a verificação.
  const segredoRuim = await verificarCodigo({
    segredoBase32: "!!!",
    codigo: "123456",
    agoraMs,
  });
  assert.equal(segredoRuim.valido, false);
  assert.equal(segredoRuim.motivo, "SEGREDO_INVALIDO");
});

test("o formato aceita o código digitado com espaço", async () => {
  const agoraMs = Date.UTC(2026, 8, 14, 12, 0, 0);
  const codigo = await gerarCodigo(SEGREDO_RFC, agoraMs);
  const comEspaco = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
  const resultado = await verificarCodigo({
    segredoBase32: SEGREDO_RFC,
    codigo: comEspaco,
    agoraMs,
  });
  assert.equal(resultado.valido, true);
});

test("cada segredo gerado é diferente e tem 160 bits", () => {
  const vistos = new Set();
  for (let vez = 0; vez < 50; vez += 1) {
    const segredo = gerarSegredo();
    assert.equal(deBase32(segredo).length, 20, "o RFC 4226 pede 160 bits para SHA-1");
    assert.equal(vistos.has(segredo), false, "segredo repetido");
    vistos.add(segredo);
  }
});

test("a URI otpauth traz o que o aplicativo autenticador precisa", () => {
  const uri = uriOtpauth({ segredoBase32: SEGREDO_RFC, conta: "douglas@exemplo.org" });
  assert.match(uri, /^otpauth:\/\/totp\/VINKULO%3Adouglas%40exemplo\.org\?/);
  const parametros = new URL(uri).searchParams;
  assert.equal(parametros.get("secret"), SEGREDO_RFC);
  assert.equal(parametros.get("issuer"), "VINKULO");
  assert.equal(parametros.get("algorithm"), "SHA1");
  assert.equal(parametros.get("digits"), "6");
  assert.equal(parametros.get("period"), "30");
});

test("a comparação de códigos não vaza acerto parcial pelo tamanho", () => {
  assert.equal(comparacaoConstante("123456", "123456"), true);
  assert.equal(comparacaoConstante("123456", "123457"), false);
  assert.equal(comparacaoConstante("123456", "12345"), false);
  assert.equal(comparacaoConstante("", ""), true);
});
