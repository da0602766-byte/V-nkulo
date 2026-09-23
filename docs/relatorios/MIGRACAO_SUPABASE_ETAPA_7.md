# Migração Supabase — etapa 7: conciliação sem tráfego

Data: 22/09/2026.

## Escopo

A versão 291 acrescenta um job do Supabase Cron a cada cinco minutos. Ele faz uma chamada HTTPS ao VÍNKULO e dispara a mesma conciliação da etapa 6, com trava e intervalo mínimo. Assim, a conferência não depende de acessos ao site. As alterações relevantes continuam acionando uma conferência mais cedo quando cabível. O D1 permanece fonte de leitura, escrita, autorização e autenticação.

O segredo de disparo é derivado no servidor, transmitido uma vez ao Supabase pelo proprietário e guardado no Vault. O SQL persistido no Cron lê o Vault em tempo de execução; não contém o segredo. O webhook aceita apenas esse segredo e não devolve dados pessoais. A função de instalação só permite `service_role`; `anon` e `authenticated` não podem executá-la.

O painel mostra a instalação e o último chamado recebido. Após quinze minutos sem um chamado, indica necessidade de examinar o histórico do Cron e as respostas do `pg_net`. Uma falha da conciliação continua registrada no painel, tenta novamente depois de um minuto e gera notificação interna ao proprietário; novos alertas são limitados a um a cada seis horas. A aplicação não consegue alertar sozinha se o próprio Cron parar de chamá-la: nesse caso, o indicador de atraso aparece na próxima abertura do painel.

## Validação e publicação

- 406/406 testes passaram. Build e TypeScript passaram; análise estática dos arquivos alterados: 0 erros. A análise geral conserva 41 avisos anteriores de imagens.
- Teste de segurança cobre acesso exclusivo do proprietário, negação de webhook sem credencial, ausência do segredo na resposta e estado de recebimento.
- Migração aplicada no projeto `erdyearvkahtwdmpcvgc`: `pg_cron`, `pg_net` e Vault presentes.
- Inspeção SQL: job 1 ativo em `*/5 * * * *`, segredo presente no Vault, nenhum token gravado no comando; `anon` e `authenticated` sem EXECUTE na função e `service_role` autorizado.
- Commit `f1e6fd754a146ae1336baa82224607f0509e2bc1`, versão 291 publicada em `https://adote-gestao.da0602766.chatgpt.site`.

## Primeiro disparo

Às 09:05:00 de Brasília, o histórico do `cron.job_run_details` registrou `succeeded`. O `pg_net` recebeu HTTP 200 sem erro e o painel do VÍNKULO registrou o chamado às 09:05:00 e uma conciliação concluída às 09:05:01. Os catálogos continuaram iguais: 4 comunidades, 16 perfis e 21 vínculos.
