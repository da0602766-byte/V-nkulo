# Auditoria de acessos por perfil — 24/10/2026

Base: Sites 430, fonte 08d9cd2afa7bff7e12b8cae0bad22956a76f2276.
Escopo: autorização D1 por perfil, privilégios globais, hierarquia de pessoas, isolamento e revogação. APK em aparelho físico adiado expressamente pelo proprietário. Somente contas fictícias e SQLite em memória nos testes; nenhum dado de produção alterado.

## Defeitos reproduzidos e corrigidos

1. **Privilégios globais por perfil legado.** O campo usuarios.perfil=ADMIN promovia até um membro a SUPERADMIN. Vínculos SUPERADMIN e PROPRIETARIO_VISUALIZADOR também liberavam dados globais sem a sessão exclusiva do proprietário. A matriz anterior retornava 200 para estatísticas quando deveria retornar 403. Agora o cargo efetivo vem do vínculo ativo; SUPERADMIN legado é restrito a ADMIN_COMUNIDADE, isSuperadmin exige system_owner e permissões platform.* / feature_flags.* são retiradas de qualquer sessão comum após a composição de permissões. O login comum do próprio proprietário também fica restrito ao vínculo.
2. **Rebaixamento e remoção fora da hierarquia.** PATCH verificava o cargo de destino, mas não o cargo atual do alvo. Pastor conseguia rebaixar outro pastor ou administrador e alterar o proprietário cadastrado com cargo de membro. PATCH e DELETE agora verificam o alvo, protegem pares/superiores, a própria conta e os proprietários global e da comunidade. A sessão global conserva a supervisão e as ações legítimas. A remoção por administrador comum continua indisponível, conforme a política existente.
3. **Privacidade dos comentários públicos.** ADMIN legado podia consultar o nome oculto e o e-mail do comentarista. Agora somente a sessão exclusiva do proprietário recebe e-mail; o próprio autor continua vendo seu nome. Regressão cobre anônimo, ADMIN legado, autor e proprietário.
4. **Chat e presença.** ADMIN legado era classificado como oficial mesmo com vínculo de membro. Chat, presença e autorização das prévias de push usam agora o cargo/vínculo da comunidade, incluindo o administrador local legado, e não usuarios.perfil. Testes verificam conversa permitida entre membros, bloqueio de oficial e revogação da prévia.
5. **Destinatários administrativos.** Avisos de continuidade eram dirigidos a todas as contas ADMIN, deixando de alcançar o proprietário se seu perfil persistido não fosse ADMIN. A seleção usa agora a identidade protegida e data-limite. A rota do aviso exige a sessão global; avisos antigos com esse título também ficam ocultos nas sessões comuns. Avisos de entrada, publicação e agenda consideram os gestores da comunidade.
6. **Sincronização após rebaixamento.** A sincronização agendada de planilha aceitava usuarios.perfil=ADMIN como gestor mesmo após a perda do cargo local. O atalho foi removido. Um teste com dependências simuladas confirma o bloqueio antes de ler token ou acionar serviço externo.
7. **Ações incoerentes na tela.** Pessoas recebia apenas permissões gerais do gestor e oferecia ações também em registros protegidos. O servidor retorna canEditHierarchy/canRemove por pessoa; a interface respeita esses sinais. A agenda editorial lateral aparece apenas na sessão global.

A reprodução inicial teve 7 falhas em 13 testes, antes das correções. Uma primeira versão da matriz incluía indevidamente o GET da configuração pública de login; essa expectativa foi corrigida antes do registro definitivo. O PATCH dessa configuração permanece protegido e faz parte da matriz.

## Matriz verificada

| Perfil | Dados globais | Visitantes | Diretório de pessoas | Gestão de hierarquia |
| --- | --- | --- | --- | --- |
| Membro | Negado | Negado | Só os próprios dados na API; aba negada | Negada |
| Líder | Negado | Consulta | Só os próprios dados; aba negada | Negada |
| Pastor | Negado | Consulta e gestão | Comunidade ativa | Membros/líderes, sem atingir proprietários |
| Administrador da comunidade | Negado | Consulta e gestão | Comunidade ativa | Cargos inferiores, sem atingir proprietários |
| Proprietário da comunidade | Negado | Conforme cargo/permissões | Conforme cargo | Continuidade depende da propriedade cadastrada |
| ADMIN legado com vínculo de membro | Negado | Negado | Como membro | Negada |
| SUPERADMIN legado em vínculo | Negado | Como administrador local | Comunidade ativa | Como administrador local |
| PROPRIETARIO_VISUALIZADOR legado | Negado | Conforme política restrita | Sem diretório global | Negada |
| Proprietário global na entrada exclusiva | Permitido | Permitido | Comunidade ativa e console global | Supervisão global |

Líder com permissão explícita pode gerenciar categorias; a revogação da permissão bloqueia a próxima requisição da mesma sessão. Rebaixamento, suspensão do vínculo e desativação da conta também são reavaliados imediatamente no servidor. Foram testadas seleção indevida de outra comunidade, ficha de pessoa de outro tenant, alterações recusadas sem mudança do registro, remoção legítima de membro e proteção dos dois tipos de proprietário.

## Validação

- **855/855 testes aprovados** na regressão final. São 29 cenários adicionais: 25 de Worker, um de autorização individual da interface, um de push privado e dois de políticas locais de sincronização/notificação. A primeira regressão havia passado com 849/849 antes do complemento.
- TypeScript e build aprovados; lint geral com **zero erros e 38 avisos preexistentes**.
- Cinco fixtures históricas de integração usavam ADMIN como autorização global. Agora configuram a identidade protegida e autenticam pela entrada exclusiva do proprietário; as verificações de senha, isolamento, bloqueio de membro e conteúdo retornado foram preservadas. Um sexto teste histórico de comentários foi corrigido para exigir anonimato e e-mail oculto também ao ADMIN legado; o caso positivo do proprietário está na nova matriz.
- Navegador local: membro, líder, pastor, administrador, ADMIN legado e proprietário global. Membro bloqueado em Pessoas e Visitantes por endereço direto; líder bloqueado na área global; proprietário entra no console e mantém o painel global. Opções de Pessoas correspondem às permissões individuais.
- Pessoas em **390, 768 e 1864 px**, vários registros, um resultado, vazio, abertura por teclado e cancelamento do editor. Sem overflow horizontal da página; nenhum erro de console registrado no percurso. Não houve edição de dados reais pelo navegador.
- Evidências locais: .task-tools/access-before.log, access-targeted.log, access-final-tests.log, access-build.log, access-types.log e access-final-lint.json, access-comments-before.log e access-legacy-before.log. Prévia descartável em access-preview.mjs.

## Limites e continuidade

A auditoria cobre os caminhos acima e a regressão existente; não é uma certificação de todos os endpoints ou integrações externas. As verificações de plano, módulos, acesso temporário e isolamento existentes passaram na suíte completa. Medições com volume e comportamento do APK em aparelho físico permanecem pendentes. Não houve migração de schema, contratação de serviços, recuperação ou reinicialização de produção.

Publicação deste bloco será registrada após confirmação do serviço.
