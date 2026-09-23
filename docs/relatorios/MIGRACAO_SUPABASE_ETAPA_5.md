# Migração Supabase — etapa 5: medição de leitura e contexto de acesso

Data: 22/09/2026.

## Escopo

A versão 289 adiciona uma comparação protegida, disponível somente ao proprietário, de três leituras dos mesmos vínculos no D1 e no Supabase. Antes da medição, a rota verifica a consistência dos perfis e das comunidades. Em cada amostra compara os vínculos campo a campo e devolve ao navegador somente contagens, tempos e o resultado da comparação. Nenhum dado é gravado pelo teste e a origem de leitura do aplicativo não muda.

No caminho atual de autorização, quatro consultas independentes ao D1 (diaconia, rede, escala de estacionamento e liderança de estacionamento) passaram a executar em paralelo. As permissões continuam sendo aplicadas na ordem anterior, e as regras de login, acesso temporário, comunidade e módulos não mudaram.

## Validação e publicação

- TypeScript e build aprovados; lint com 0 erros e 41 avisos preexistentes; 402/402 testes.
- Versão 289 publicada em `https://adote-gestao.da0602766.chatgpt.site`, commit `31761a97bbde5c6ab54d5e0471dd89124e38efc1`.
- Comparação executada no painel do proprietário em produção em 22/09/2026, 01:09:36 (horário de Brasília): 21 vínculos no D1, 21 no Supabase, todos iguais; mediana de 201 ms no D1 e 430 ms no Supabase, com três amostras por banco.

## Decisão

O D1 foi 229 ms mais rápido nessa medição específica de catálogo. A comparação não representa o tempo completo de uma página nem de uma requisição de autorização. A réplica Supabase ainda não contém sessões e permissões complementares, e não há sincronização contínua para impedir desatualização. Portanto, nenhuma leitura de autorização foi transferida ao Supabase. O possível ganho da paralelização das quatro consultas D1 ainda não foi medido antes/depois em produção; não se atribui a ela uma melhora quantificada de fluidez.
