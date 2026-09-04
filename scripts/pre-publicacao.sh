#!/usr/bin/env bash
# Roda tudo que precisa estar aprovado antes de publicar no Sites.
#
# Este script NÃO publica. A publicação usa credencial temporária por comando e
# fica com quem tem acesso ao Sites — aqui só se prova que o candidato está
# pronto. Uso:
#
#   scripts/pre-publicacao.sh              # verificação completa
#   scripts/pre-publicacao.sh --rapido     # pula build e artefato
#
# Sai com 0 quando tudo passa, 1 quando encontra regressão.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

cd "${SITES_PROJECT_ROOT}"

rapido=0
for argumento in "$@"; do
  case "${argumento}" in
    --rapido) rapido=1 ;;
    *) echo "argumento desconhecido: ${argumento}" >&2; exit 64 ;;
  esac
done

conhecidas="${SITES_PROJECT_ROOT}/tests/falhas-conhecidas.txt"
trabalho="$(mktemp -d)"
trap 'rm -rf "${trabalho}"' EXIT

etapa=0
falhou=0

titulo() {
  etapa=$((etapa + 1))
  printf '\n=== %d. %s ===\n' "${etapa}" "$1"
}

reprovar() {
  printf '  REPROVADO: %s\n' "$1"
  falhou=1
}

# ── Dependências ────────────────────────────────────────────────────────────
titulo "Dependências"
if [[ ! -x "node_modules/.bin/tsc" ]]; then
  echo "  node_modules ausente ou incompleto. Rode: npm run install:ci"
  exit 69
fi
echo "  presentes"

# ── TypeScript ──────────────────────────────────────────────────────────────
titulo "TypeScript"
if node_modules/.bin/tsc --noEmit > "${trabalho}/tsc.txt" 2>&1; then
  echo "  limpo"
else
  reprovar "$(wc -l < "${trabalho}/tsc.txt") linha(s) de erro"
  head -20 "${trabalho}/tsc.txt" | sed 's/^/  /'
fi

# ── Lint ────────────────────────────────────────────────────────────────────
# Avisos não bloqueiam: o projeto convive com avisos preexistentes de
# @next/next/no-img-element. Erros bloqueiam.
titulo "Lint"
set +e
node_modules/.bin/eslint . --ignore-pattern dist --ignore-pattern .next \
  > "${trabalho}/lint.txt" 2>&1
set -e
# O eslint já imprime "(0 errors, 44 warnings)" na linha de resumo. Reconstruir
# isso a partir dos números soltos foi o que produziu "0 errors 44 warnings":
# `paste -sd' e '` consome a lista de delimitadores um caractere por vez, então
# só o espaço era usado. Aproveitar a linha pronta evita o problema inteiro.
resumo_lint="$(grep -oE '\([0-9]+ errors?, [0-9]+ warnings?\)' "${trabalho}/lint.txt" | tail -1 | tr -d '()')"
erros_lint="$(printf '%s' "${resumo_lint}" | grep -oE '^[0-9]+' || echo 0)"
if [[ "${erros_lint:-0}" -gt 0 ]]; then
  reprovar "${resumo_lint}"
  grep -E '^\s+[0-9]+:[0-9]+\s+error' "${trabalho}/lint.txt" | head -20 | sed 's/^/  /'
else
  echo "  ${resumo_lint:-0 errors, 0 warnings}"
fi

# ── Build e artefato do Sites ───────────────────────────────────────────────
titulo "Build e artefato do Sites"
if [[ "${rapido}" -eq 1 ]]; then
  echo "  PULADO por --rapido. Não publique sem rodar isto."
elif bash "${script_dir}/build-verified.sh" > "${trabalho}/build.txt" 2>&1; then
  echo "  aprovado (Worker ESM e hosting.json presentes)"
else
  reprovar "build ou validação do artefato"
  tail -25 "${trabalho}/build.txt" | sed 's/^/  /'
fi

# ── Suíte, comparada com as falhas conhecidas ───────────────────────────────
# O que importa não é a contagem, e sim quais testes falham: uma falha nova
# aparece mesmo que outra tenha sido corrigida no mesmo ciclo.
titulo "Suíte de testes"
set +e
node --test tests/*.test.mjs > "${trabalho}/testes.txt" 2>&1
set -e

grep "^not ok" "${trabalho}/testes.txt" \
  | sed -E 's/^not ok [0-9]+ - //' | sort > "${trabalho}/falhas.txt" || true
grep -vE '^\s*(#|$)' "${conhecidas}" | sort > "${trabalho}/conhecidas.txt"

passaram="$(grep -cE '^ok [0-9]+ - ' "${trabalho}/testes.txt" || true)"
total_falhas="$(wc -l < "${trabalho}/falhas.txt" | tr -d ' ')"
echo "  ${passaram} passaram, ${total_falhas} falharam"

novas="$(comm -23 "${trabalho}/falhas.txt" "${trabalho}/conhecidas.txt")"
corrigidas="$(comm -13 "${trabalho}/falhas.txt" "${trabalho}/conhecidas.txt")"

if [[ -n "${novas}" ]]; then
  reprovar "$(printf '%s\n' "${novas}" | wc -l | tr -d ' ') falha(s) NOVA(S) — isto é regressão"
  printf '%s\n' "${novas}" | sed 's/^/    · /'
else
  echo "  nenhuma falha nova"
fi

if [[ -n "${corrigidas}" ]]; then
  echo "  $(printf '%s\n' "${corrigidas}" | wc -l | tr -d ' ') teste(s) conhecido(s) voltaram a passar:"
  printf '%s\n' "${corrigidas}" | sed 's/^/    · /'
  echo "  Remova essas linhas de tests/falhas-conhecidas.txt."
fi

# ── Resultado ───────────────────────────────────────────────────────────────
printf '\n'
if [[ "${falhou}" -eq 1 ]]; then
  echo "REPROVADO — não publique. Veja as etapas marcadas acima."
  exit 1
fi

if [[ "${rapido}" -eq 1 ]]; then
  echo "APROVADO no modo rápido. Rode sem --rapido antes de publicar de fato."
else
  echo "APROVADO. O candidato está pronto para a publicação no Sites."
fi
