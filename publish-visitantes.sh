#!/bin/bash

# Script para publicar a branch claude/visitantes-layout-desktop-11wzop para main
# Uso: ./publish-visitantes.sh

set -e

FEATURE_BRANCH="claude/visitantes-layout-desktop-11wzop"
MAIN_BRANCH="main"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📦 Iniciando publicação do Visitantes Layout..."
echo ""

# 1. Verificar se estamos no diretório correto
cd "$REPO_DIR"
echo "✓ Diretório: $REPO_DIR"

# 2. Fetch para atualizar branches remotas
echo "🔄 Atualizando branches remotas..."
git fetch origin

# 3. Verificar se a feature branch existe
if ! git rev-parse --verify "$FEATURE_BRANCH" > /dev/null 2>&1; then
    echo "❌ Erro: Branch '$FEATURE_BRANCH' não encontrada"
    exit 1
fi
echo "✓ Branch '$FEATURE_BRANCH' encontrada"

# 4. Verificar se main existe
if ! git rev-parse --verify "origin/$MAIN_BRANCH" > /dev/null 2>&1; then
    echo "❌ Erro: Branch remota 'origin/$MAIN_BRANCH' não encontrada"
    exit 1
fi
echo "✓ Branch 'origin/$MAIN_BRANCH' encontrada"

# 5. Checkout para main
echo ""
echo "📍 Trocando para branch '$MAIN_BRANCH'..."
git checkout "$MAIN_BRANCH"

# 6. Pull latest main
echo "🔄 Puxando últimas mudanças de '$MAIN_BRANCH'..."
git pull origin "$MAIN_BRANCH"

# 7. Merge da feature branch
echo ""
echo "🔀 Fazendo merge de '$FEATURE_BRANCH'..."
if ! git merge "$FEATURE_BRANCH" --no-edit; then
    echo ""
    echo "⚠️  Conflitos detectados! Resolva manualmente:"
    echo "   1. Abra os arquivos em conflito"
    echo "   2. Resolva os conflitos"
    echo "   3. Execute: git add ."
    echo "   4. Execute: git commit -m 'Merge: resolve conflitos do Visitantes Layout'"
    echo "   5. Execute: git push origin $MAIN_BRANCH"
    echo ""
    exit 1
fi
echo "✓ Merge realizado com sucesso"

# 8. Push para origin
echo ""
echo "📤 Enviando para origin..."
git push origin "$MAIN_BRANCH"
echo "✓ Push concluído"

# 9. Limpeza (opcional - remover feature branch)
echo ""
echo "🧹 Limpando branch local..."
git branch -d "$FEATURE_BRANCH"
echo "✓ Branch local deletada"

echo ""
echo "🎉 Publicação concluída com sucesso!"
echo ""
echo "Resumo:"
echo "  • Feature branch mergeada: $FEATURE_BRANCH → $MAIN_BRANCH"
echo "  • Branch remota: pronta para produção"
echo "  • Branch local: deletada"
echo ""
echo "Próximas etapas (se necessário):"
echo "  • Deletar branch remota: git push origin --delete $FEATURE_BRANCH"
echo "  • Criar release/tag: git tag -a v1.x.x -m 'Visitantes Layout v1.x.x'"
echo "  • Deploy em produção conforme seu fluxo"
