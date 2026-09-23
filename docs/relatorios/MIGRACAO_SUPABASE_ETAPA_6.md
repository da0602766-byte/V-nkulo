# Migração Supabase — etapa 6: conciliação automática dos catálogos mínimos

Data: 22/09/2026.

## Escopo

A versão 290 permite ao proprietário ativar, conferir e pausar a conciliação D1 → Supabase em **Publicação do sistema**. Somente os campos já autorizados nas etapas 2 a 4 são copiados: dados básicos de comunidades; ID, nome, e-mail, situação e criação de perfis; IDs, papel, situação e criação de vínculos. Login, senhas, sessões, contatos adicionais, arquivos e permissões especiais continuam fora do Supabase. O D1 segue como fonte de leitura, escrita e autorização do aplicativo.

Com a rotina ativa, uma alteração relevante bem-sucedida agenda a conferência em segundo plano. Enquanto o site recebe tráfego, a rotina também verifica a cópia a cada cinco minutos, mesmo se alguma alteração não tiver acionado o primeiro agendamento. Não há cron externo: sem tráfego não existe garantia de execução no horário exato. A conciliação processa comunidades, perfis e vínculos nessa ordem, usa trava no D1 para evitar execuções simultâneas, confirma a comparação após cada escrita e registra último sucesso ou erro no painel. Uma falha permite nova tentativa após um minuto. A troca do projeto Supabase é bloqueada enquanto a rotina estiver ativa; é preciso pausá-la antes.

Registros extras no destino, inclusive casos de exclusão definitiva na origem, **não são apagados automaticamente**: a rotina interrompe e pede revisão. Limites existentes continuam valendo (500 comunidades, 1.000 perfis e 1.000 vínculos); para volumes maiores é necessária uma migração em lotes.

## Validação e publicação

- Build, TypeScript e artefato aprovados; lint 0 erros/41 avisos preexistentes; 404/404 testes.
- Testes cobrem acesso exclusivo do proprietário, integração desligada, ordem de importação, payload mínimo, atualização de perfil e vínculo, bloqueio de registros extras, pausa e impossibilidade de trocar de projeto com a rotina ativa.
- Versão 290 publicada em `https://adote-gestao.da0602766.chatgpt.site`, commit `c82be5e7c4ab0f7a90220470af6e716aee1ebfd2`.
- Rotina ativada pelo painel do proprietário em produção em 22/09/2026, 01:26:20 (Brasília). Primeira conciliação: 4 comunidades, 16 perfis e 21 vínculos conferidos, sem diferenças e sem registros atualizados.

## Limites da evidência

O acionamento após uma alteração real em produção não foi provocado artificialmente: alterar o cadastro de uma pessoa ou comunidade apenas para teste teria efeito sobre dados reais. Esse caminho foi coberto por teste automatizado e a primeira conciliação foi confirmada na interface de produção. Um HTTP 401 transitório na verificação de fundação desapareceu na repetição (HTTP 200); se voltar, o estado e o erro da rotina devem ser acompanhados no painel.
