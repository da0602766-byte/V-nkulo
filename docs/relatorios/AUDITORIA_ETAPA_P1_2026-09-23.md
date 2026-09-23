# Auditoria Vínkulo — etapa P1

Data: 23/09/2026. Base: versão 297; fonte `0c70b3259b563bf37bb77ea4737e722692fa7781` do repositório do Sites.

## Entrega

Correções de responsividade, tema e acessibilidade nos acessos, landing, console do proprietário e páginas públicas de comunidades.

| Problema verificado | Mudança |
| --- | --- |
| Na landing de produção em 320 px, o botão Proprietário terminava em 386 px e ficava cortado | Cabeçalho pode ocupar duas linhas; ações e menu ficam dentro da largura disponível |
| Login mantinha preferência separada do restante da plataforma | Um módulo de tema atende bootstrap, login e controles, com atualização na mesma página e entre abas |
| Cores de texto e fundo de botão compartilhavam o mesmo token | Paletas de login e landing separam superfície, texto, ação e foco, incluindo o tema escuro |
| Formulários herdavam larguras mínimas e cores fixas de estilos antigos | Grade fluida, cadastro em uma coluna no celular, campos de 16 px e cores por função |
| Rótulo da senha incluía o botão Mostrar; atalhos e menus perdiam a referência de foco | Label explícito, botão com nome/estado acessíveis, destino do skip link focável, Escape devolvendo o foco |
| Controles do proprietário mediam 38 px; metadados públicos chegavam a menos de 9 px | Controles principais com 44 px, textos auxiliares selecionados ampliados e perfil público com metadados de 12/14 px |
| Pausa explícita do carrossel era sobrescrita pela saída do mouse/foco | Estados independentes para pausa, hover, foco, visibilidade e preferência de movimento reduzido |

O carrossel também pausa após navegação manual ou toque no conteúdo; não cria temporizador enquanto a aba está oculta ou o usuário pede movimento reduzido. Os indicadores têm alvos de 24 px; anterior/próximo/pausa têm pelo menos 44 px. Anúncios de atualização ficam desativados durante a rotação automática.

## Tema e compatibilidade

A chave global `vinkulo-theme` passa a ser a referência comum. `vinkulo-login-theme` é lida somente como fallback de migração, inclusive respeitando uma escolha global explícita de AUTO, e removida na próxima escolha. Preferências pessoais existentes são preservadas e reaplicadas quando o controle recebe o identificador da conta.

O bootstrap aplica atributos e `color-scheme` antes da hidratação. Armazenamento indisponível não impede a troca na página. Mudanças do sistema operacional só alteram o tema em AUTO; alterações da preferência global são propagadas entre abas. Isso foi exercitado em testes e, para a sincronização entre login e diretório, no navegador.

Nenhuma dependência, API externa ou migração de produção foi adicionada. Os estilos foram limitados às superfícies da etapa, conservando as interfaces existentes.

## Verificação visual e funcional

Prévia local com a mesma aplicação, dados locais e navegador Chromium. Formulários não foram submetidos e nenhuma conta foi criada. Para conferir o console carregado, a coluna legada de ciclo foi renomeada somente no banco local, com backup; não houve execução de SQL em produção.

| Superfície | Larguras em CSS px | Resultado |
| --- | --- | --- |
| Cadastro | 320, 390, 768, 1280, 1920 | Sem transbordamento horizontal medido; campos legíveis e dentro do cartão |
| Login e recuperação | 320 e 1280 | Inspeção visual, controles acessíveis e recuperação sem transbordamento |
| Landing com ações do proprietário | 320, 390, 768, 1280, 1920 | Sem transbordamento; botão antes cortado dentro da área útil |
| Console carregado, visão executiva | 320, 390, 768, 1280, 1920 | Sem transbordamento; busca e ações principais cabem no cabeçalho |
| Diretório e perfil público | 320, 390, 768, 1280, 1920 | Sem transbordamento; conteúdo se reorganiza |

Claro/escuro conferidos em amostras desktop e mobile, incluindo login, landing, console, diretório e perfil. Menu da landing e diálogo do proprietário fecham por Escape e devolvem o foco ao acionador. O skip link foi acionado com Tab/Enter e confirmou foco em `main-content`.

Referências: texto normal 4,5:1 e texto grande 3:1 em [WCAG 2.2 — contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); reflow em [320 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html); [alvo mínimo de 24 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), com 44 px adotados nos controles principais desta entrega. Os testes verificam os pares definidos de texto, ação e foco das paletas de login/landing; não representam certificação integral WCAG nem medição de todas as personalizações.

## Validação automatizada

`scripts/pre-publicacao.sh` aprovado:

- TypeScript sem erros.
- Lint sem erros, 43 avisos preexistentes.
- Build de produção e validação do Worker ESM/manifesto aprovados.
- **448 testes aprovados, nenhuma falha**.

Oito novos testes exercitam migração/sincronização do tema, armazenamento bloqueado, atualização pelo sistema, contraste das paletas e ciclo do carrossel (incluindo foco, toque e aba oculta). O teste de preferências pessoais foi reapontado ao módulo compartilhado.

## Limites e continuidade

As medições de largura não substituem testes em aparelhos físicos, Safari ou leitor de tela. Não foram auditadas todas as subabas administrativas nem cores definidas por personalizações do proprietário. APK, push nativo com app fechado, fila durável de eventos, conectores visuais e dashboards por integração permanecem nas próximas etapas.

## Publicação

Candidato validado. A versão, o commit publicado e a conferência de produção serão registrados após a implantação.
