# Manutenção CSS — 25/10/2026

Base: Sites 433, fonte ef1d0870e5593c11aca35af634cb5948669d53bf.
Bloco local do Grupo 3, com publicação autorizada após validação. APK físico adiado.

## Entrega

- Reunidas em `app/components/offline-mode-entry.css` as regras do acesso offline que estavam no final de `globals.css` e em `community-settings.css`. O componente importa seu próprio CSS. Mantidas declarações, ordem, responsividade, foco visível e compensação da escala do painel.
- Removidas 22 regras das seções comerciais de números, avatares/prova social e depoimentos retiradas na versão 432. Cinco grupos de seletores foram limpos, conservando suas partes ainda usadas. Busca no código não encontrou consumidores dessas classes.
- Não houve mudança de comportamento, conteúdo, permissões, esquema ou dados reais. A prévia usou contas fictícias e SQLite em memória.

## Validação

- PostCSS: regras globais/comunitárias restantes equivalentes às originais; regras offline transferidas equivalentes em ordem e declarações. Na página comercial, 213 regras por seletor ativo mantêm declarações e contexto de media query. Preservada a especificidade do foco do bloco final.
- Navegador em 390, 768 e 1864 px, tema escuro: 15 elementos do cartão offline com medidas e propriedades computadas iguais antes/depois; 246 elementos da página comercial também iguais. A camada transitória do editor visual foi excluída da comparação comercial. Nenhuma rolagem horizontal da página nesses percursos.
- Ação offline com altura física de 44,1875 px; cartão limitado a 850 px físicos no desktop, respeitando a escala existente. Inspeção visual do cartão em desktop e celular; nenhum erro de console no percurso observado.
- Suíte: **866/866 testes aprovados**, sem falhas ou testes ignorados. TypeScript e build aprovados. Lint: **zero erros e 38 avisos preexistentes**. `git diff --check` aprovado.
- Evidências locais: `.task-tools/css-baseline/`, `css-build.log`, `css-types.log`, `css-tests.log` e `css-lint.json`. O servidor e a ponte Android simulada pertencem apenas à prévia e não integram a publicação.

## Medidas

| Arquivo | Antes (bytes) | Depois (bytes) |
| --- | ---: | ---: |
| globals.css | 1.376.874 | 1.375.889 |
| landing-vinkulo.css | 20.949 | 18.539 |
| community-settings.css | 3.949 | 2.487 |
| offline-mode-entry.css | 0 | 2.925 |
| Soma dos CSS compilados em dist/client/assets | 2.010.470 | 2.008.219 |

Redução compilada de **2.251 bytes**, aproximadamente **0,112%**. A extração facilita manutenção; este bloco não constitui uma otimização ampla nem comprova redução de latência real.

## Limites e continuidade

A dívida do CSS global permanece: separar responsabilidades e remover sobreposições em novos blocos com evidências. Desempenho com volume representativo continua pendente. Esta comparação não é uma auditoria visual de todas as rotas e estados da plataforma. Nenhum APK foi alterado; o aparelho físico e a nova ponte para resumo nativo no painel continuam pendentes.

## Publicação

Publicado no Sites 434 em 25/10/2026 às 12h55 (Brasília), status succeeded. Fonte 845097a895946ff781d5bf93a05ca37ccfa47ae1; deployment appgdep_6ade264b82e48191b54f3486574f06a2; URL https://adote-gestao.da0602766.chatgpt.site. Audiência pública preservada. Registro documental posterior ao deploy.
