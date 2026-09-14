// Política pura de limitação de requisições por origem.
//
// Fica em `.mjs` pelo mesmo motivo de `tenant-policy.mjs` e
// `upload-key-policy.mjs`: a decisão precisa ser testável diretamente por
// `node --test`, sem build e sem banco. A persistência em D1 e a leitura dos
// cabeçalhos ficam em `rate-limit.ts`, que só chama as funções daqui.
//
// O bloqueio por conta que já existia no login (3 erros de senha na mesma
// conta) continua valendo e resolve outro problema: ele protege *uma* conta.
// O que está aqui protege a plataforma de uma mesma origem tentar muitas
// contas diferentes (password spraying), enumerar e-mails no cadastro ou
// varrer tokens de redefinição — nenhum desses ataques dispara o contador por
// conta, porque cada requisição toca um usuário diferente.

/**
 * Limites por finalidade. Os números foram escolhidos bem acima do uso
 * humano legítimo: quem esquece a senha erra 3 ou 4 vezes, não 12.
 *
 * `limite`: requisições permitidas dentro da janela.
 * `janelaSegundos`: duração da janela de contagem.
 * `bloqueioSegundos`: quanto tempo a origem fica barrada ao estourar.
 */
export const AUTH_RATE_LIMITS = {
  // Tentativas de login: alto o suficiente para uma família compartilhando o
  // mesmo IP, baixo o suficiente para inviabilizar varredura de senhas.
  login: { limite: 12, janelaSegundos: 600, bloqueioSegundos: 900 },
  // Criação de conta: o 409 de e-mail já cadastrado é um oráculo de
  // enumeração, então a origem tem poucas chances por hora.
  cadastro: { limite: 5, janelaSegundos: 3600, bloqueioSegundos: 3600 },
  // Recuperação de acesso: cada chamada notifica a liderança da comunidade.
  // O cooldown de 2 minutos por conta continua valendo em paralelo.
  "esqueci-senha": { limite: 8, janelaSegundos: 3600, bloqueioSegundos: 1800 },
  // Consumo de token: protege contra varredura de links de redefinição.
  "redefinir-senha": { limite: 10, janelaSegundos: 900, bloqueioSegundos: 1800 },
  // Primeiro acesso confere token + login + senha temporária de uma vez.
  "primeiro-acesso": { limite: 10, janelaSegundos: 900, bloqueioSegundos: 1800 },
};

/**
 * Estado neutro, usado quando a origem ainda não tem linha no banco.
 */
export const ESTADO_INICIAL = Object.freeze({
  tentativas: 0,
  janelaInicioMs: 0,
  bloqueadoAteMs: 0,
});

/**
 * Decide se uma requisição passa e devolve o próximo estado a persistir.
 *
 * Nunca lança: uma falha de limitação não pode derrubar o login.
 *
 * @param {object} entrada
 * @param {number} entrada.agoraMs
 * @param {number} entrada.limite
 * @param {number} entrada.janelaSegundos
 * @param {number} entrada.bloqueioSegundos
 * @param {{ tentativas: number, janelaInicioMs: number, bloqueadoAteMs: number }} [entrada.estado]
 * @returns {{ permitido: boolean, motivo: string, tentarEmSegundos: number,
 *   restantes: number, proximoEstado: { tentativas: number, janelaInicioMs: number, bloqueadoAteMs: number } }}
 */
export function decidirLimite({
  agoraMs,
  limite,
  janelaSegundos,
  bloqueioSegundos,
  estado = ESTADO_INICIAL,
}) {
  const agora = Number(agoraMs) || 0;
  const tentativasAtuais = Math.max(0, Number(estado.tentativas) || 0);
  const janelaInicio = Math.max(0, Number(estado.janelaInicioMs) || 0);
  const bloqueadoAte = Math.max(0, Number(estado.bloqueadoAteMs) || 0);

  // Origem já barrada: a janela de bloqueio não é estendida a cada nova
  // batida. Estender transformaria um bloqueio de 15 minutos em bloqueio
  // permanente para quem estivesse atrás do mesmo IP compartilhado.
  if (bloqueadoAte > agora) {
    return {
      permitido: false,
      motivo: "BLOQUEADO",
      tentarEmSegundos: Math.ceil((bloqueadoAte - agora) / 1000),
      restantes: 0,
      proximoEstado: {
        tentativas: tentativasAtuais,
        janelaInicioMs: janelaInicio,
        bloqueadoAteMs: bloqueadoAte,
      },
    };
  }

  const janelaExpirada =
    janelaInicio === 0 || agora - janelaInicio >= janelaSegundos * 1000;
  const tentativas = janelaExpirada ? 1 : tentativasAtuais + 1;
  const inicio = janelaExpirada ? agora : janelaInicio;

  if (tentativas > limite) {
    const novoBloqueio = agora + bloqueioSegundos * 1000;
    return {
      permitido: false,
      motivo: "LIMITE_EXCEDIDO",
      tentarEmSegundos: bloqueioSegundos,
      restantes: 0,
      // O contador zera junto com o bloqueio: quando ele vencer, a origem
      // recomeça com a cota inteira em vez de ser barrada na primeira batida.
      proximoEstado: {
        tentativas: 0,
        janelaInicioMs: agora,
        bloqueadoAteMs: novoBloqueio,
      },
    };
  }

  return {
    permitido: true,
    motivo: "PERMITIDO",
    tentarEmSegundos: 0,
    restantes: limite - tentativas,
    proximoEstado: {
      tentativas,
      janelaInicioMs: inicio,
      bloqueadoAteMs: 0,
    },
  };
}

/**
 * Extrai o IP de origem dos cabeçalhos da requisição.
 *
 * Em produção o Cloudflare preenche `CF-Connecting-IP` e o cliente não
 * consegue forjá-lo — é o único cabeçalho realmente confiável aqui.
 * `X-Forwarded-For` entra como segundo nome do mesmo cabeçalho de borda; se
 * nenhum dos dois existir (desenvolvimento local, por exemplo) devolve `null`
 * e o chamador deixa passar, porque inventar uma chave fixa colocaria todo
 * mundo no mesmo balde e bloquearia usuários legítimos em massa.
 *
 * @param {{ get(name: string): string | null }} headers
 * @returns {string | null}
 */
export function origemDaRequisicao(headers) {
  const conectando = headers.get("cf-connecting-ip");
  if (conectando && conectando.trim()) return conectando.trim();
  const encaminhado = headers.get("x-forwarded-for");
  if (!encaminhado) return null;
  const primeiro = encaminhado.split(",")[0]?.trim();
  return primeiro || null;
}

/**
 * Converte o estado gravado no banco (texto ISO) para milissegundos.
 *
 * @param {{ tentativas?: unknown, janela_inicio?: unknown, bloqueado_ate?: unknown } | null} linha
 */
export function estadoDaLinha(linha) {
  if (!linha) return { ...ESTADO_INICIAL };
  return {
    tentativas: Math.max(0, Number(linha.tentativas) || 0),
    janelaInicioMs: paraMilissegundos(linha.janela_inicio),
    bloqueadoAteMs: paraMilissegundos(linha.bloqueado_ate),
  };
}

function paraMilissegundos(valor) {
  if (!valor) return 0;
  // O SQLite grava `CURRENT_TIMESTAMP` como "YYYY-MM-DD HH:MM:SS" em UTC, sem
  // o sufixo Z. Sem normalizar, `new Date` interpretaria como hora local e o
  // limite poderia vencer horas antes ou depois do previsto.
  const texto = String(valor).trim();
  const normalizado = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(texto)
    ? `${texto.replace(" ", "T")}Z`
    : texto;
  const instante = new Date(normalizado).getTime();
  return Number.isFinite(instante) ? instante : 0;
}
