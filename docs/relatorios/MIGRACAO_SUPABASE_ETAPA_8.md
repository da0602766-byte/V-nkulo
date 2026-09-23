# Migração Supabase — etapa 8: triagem de divergências

Data: 22/09/2026.

## Escopo

A versão 292 acrescenta em **Publicação do sistema** uma revisão manual, somente para o proprietário, dos três catálogos copiados do D1: comunidades, perfis mínimos e vínculos. Ela classifica ausências no Supabase, diferenças em linhas de mesmo ID, registros extras no destino e linhas sem ID legado. Mostra contagens, IDs D1 e nomes dos campos divergentes, mas não devolve ao navegador nomes, e-mails, papéis, valores de campos ou payloads completos. A lista visível é limitada a 100 ocorrências; as contagens continuam completas dentro do limite de cada catálogo.

A verificação usa as funções de leitura protegidas já existentes. Não grava, apaga, desativa, reativa ou corrige dados. Em particular, um vínculo `REMOVIDO` que ainda exista no D1 é comparado como histórico preservado; uma linha ausente na origem e presente no Supabase é marcada como extra e continua bloqueando a conciliação automática. Não foi criada uma política de exclusão implícita: remover cópias no destino requer decisão específica sobre retenção, dependências e recuperação.

## Validação e produção

- Build e artefato aprovados; TypeScript e análise estática dos arquivos alterados sem erros.
- 408/408 testes passaram. O teste cobre proprietário versus membro/visitante, ausência de credenciais, diferenças, extras, ausências, IDs não rastreados, IDs duplicados, resposta sem valores pessoais e ausência de escrita.
- Commit de código `c11d06b36bf1a0dac414b3fae6a116076ee71e6a`, versão 292 publicada em `https://adote-gestao.da0602766.chatgpt.site`.
- Diagnóstico real em 22/09/2026, 11:35:40 (Brasília): 4 comunidades, 16 perfis e 21 vínculos em cada banco; zero ausentes, diferentes, extras ou sem ID. Nenhum registro foi alterado pela revisão.

## Limite desta etapa

A cópia em Supabase continua de apoio e o D1 é a fonte de login, autorização e dados operacionais. Esta etapa não aumenta a velocidade das telas nem migra arquivos, notificações ou autenticação. Ela torna observável a causa de um bloqueio futuro antes de decidir qualquer remoção.
