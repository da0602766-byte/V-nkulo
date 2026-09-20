# 📋 Instruções para Publicar Visitantes Layout

Este documento contém instruções para publicar a feature branch `claude/visitantes-layout-desktop-11wzop` para a branch `main`.

## 🚀 Início Rápido

### Opção 1: Script Automatizado (Recomendado)

```bash
cd /home/user/V-nkulo
./publish-visitantes.sh
```

O script fará automaticamente:
- ✓ Atualizar branches remotas
- ✓ Verificar se as branches existem
- ✓ Trocar para `main`
- ✓ Fazer merge de `claude/visitantes-layout-desktop-11wzop`
- ✓ Enviar para origin
- ✓ Deletar branch local

### Opção 2: Passo a Passo Manual

Se preferir executar manualmente ou o script apresentar conflitos:

```bash
# 1. Entrar no diretório
cd /home/user/V-nkulo

# 2. Atualizar branches remotas
git fetch origin

# 3. Trocar para main
git checkout main

# 4. Atualizar main com latest changes
git pull origin main

# 5. Fazer merge da feature branch
git merge claude/visitantes-layout-desktop-11wzop --no-edit

# 6. Enviar para origin
git push origin main

# 7. Deletar feature branch local (opcional)
git branch -d claude/visitantes-layout-desktop-11wzop

# 8. Deletar feature branch remota (opcional)
git push origin --delete claude/visitantes-layout-desktop-11wzop
```

---

## 📊 Informações sobre a Feature

**Branch:** `claude/visitantes-layout-desktop-11wzop`

**Commits inclusos:**
- `eef3309` — Redesenha Visitantes no padrão de Ministérios
- `d3fdc93` — Acerta o layout de Visitantes no desktop

**Mudanças principais:**
- Novo layout responsivo para desktop
- Estrutura em 4 abas (Visão Geral, Pessoas, Acompanhamento, Aniversários)
- Padrão visual alinhado com Ministérios
- Correção de overflow e avisos

**Status de testes:**
- ✓ TypeScript: sem erros
- ✓ Lint: 0 erros  
- ✓ Build: sucesso
- ✓ Merge simulado contra main: 358/358 testes passam

---

## ⚠️ Possíveis Conflitos

A branch foi criada a partir de `main` e não deve ter conflitos, mas se ocorrerem:

1. **Conflitos detectados?** O script parará e exibirá as instruções
2. **Resolva manualmente:**
   - Abra os arquivos marcados com conflitos
   - Escolha qual versão manter (feature ou main)
   - Remova os marcadores `<<<<<<<`, `=======`, `>>>>>>>`
3. **Finalize:**
   ```bash
   git add .
   git commit -m "Merge: resolve conflitos do Visitantes Layout"
   git push origin main
   ```

---

## ✅ Verificação Pós-Merge

Depois do merge, verifique:

```bash
# Ver o log de commits
git log --oneline -5

# Verificar se a feature branch foi deletada
git branch -a | grep visitantes-layout

# Confirmar que main foi atualizada
git log origin/main --oneline -2
```

---

## 🔍 Rollback (se necessário)

Se algo der errado e precisar reverter:

```bash
# Voltar para o commit anterior
git reset --hard <commit-anterior>

# OU revert se já foi feito push
git revert <commit-do-merge>
git push origin main
```

---

## 📞 Suporte

Se encontrar erros:

1. **Erro: "Branch not found"** → Verifique se a branch ainda existe: `git branch -a`
2. **Erro: "Permission denied"** → Certifique-se de ter permissão de push em `main`
3. **Conflitos complexos** → Abra os arquivos em conflito e resolva manualmente
4. **Merge falhou** → Execute `git merge --abort` e tente novamente

---

## 📝 Notas

- A feature branch está **100% pronta** para merge
- Todos os testes passaram na simulação
- Não há conflitos esperados
- A branch remota permanecerá disponível até ser deletada manualmente

Boa sorte! 🚀
