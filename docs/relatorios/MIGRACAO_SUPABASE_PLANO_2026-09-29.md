# Migração do Vínkulo para Supabase — plano de execução

Data: 29/09/2026. Base: repositório local a partir de `41b7f6c`.

## Estado encontrado

- O esquema D1 declara 113 tabelas em `db/schema.ts`; as rotas de autenticação e operação usam `getD1()` e SQL SQLite diretamente.
- O Supabase possui fundação, RLS e conciliação de três catálogos: comunidades, perfis mínimos e vínculos. Essa cópia não atende às leituras operacionais.
- A autenticação usa hash PBKDF2 e sessão persistida no D1. Google, CPF, primeiro acesso e revogação dependem desse caminho. `vinkulo_profiles.auth_user_id` ainda não é preenchido.
- Imagens de publicações usam R2. Outras imagens compartilhadas usam Google Drive; a preferência de mídia local mantém arquivos somente no aparelho.
- A fila de notificações, seus dispositivos e cancelamentos são controlados por tabelas e transações D1.

## Sequência de migração

1. **Arquivos hospedados no R2.** Copiar por páginas para bucket privado, verificar SHA-256, guardar registro de cada cópia e preservar o objeto original. A migração D1 `0083` guarda o catálogo de cópias. A reinicialização definitiva precisa apagar a cópia e manter pendência durável em caso de erro. Depois de conferir todas as páginas, alterar leitura e escrita de imagens por uma chave de corte separada. Mídia no Google Drive precisa de inventário e fluxo próprio. Arquivos locais dependem de escolha explícita de cada titular antes de qualquer envio.
2. **Identidade.** Criar e vincular contas Supabase Auth sem importar hashes PBKDF2 como senha. O primeiro login ou redefinição de senha pode estabelecer a senha no Auth, após verificar a credencial atual. Conferir contas duplicadas, Google, CPF, revogação de sessão, proprietário global e múltiplas comunidades. A migração Supabase `0007` prepara a leitura de várias comunidades com base no vínculo ativo e no usuário Auth, mas ainda não cria contas nem troca o emissor da sessão.
3. **Esquema operacional.** Converter as tabelas D1 em grupos com chaves e políticas de isolamento: cadastros e visitantes; conteúdo e agenda; ministérios, equipes e escalas; cuidado e solicitações; chat; notificações; configuração e auditoria. Segredos e tokens não entram em cópias de leitura. Cada grupo exige migração PostgreSQL, contagens, integridade referencial, comparação por comunidade e procedimento de retorno.
4. **Mudança das APIs.** Migrar escrita e leitura do mesmo módulo com testes de permissão e concorrência. Ativar um módulo por vez depois de comparar origem e destino. Uma tabela copiada sem a API correspondente continua apenas réplica.
5. **Limpeza de divergências.** Manter revisão dos registros extras e política explícita de retenção. Nenhuma exclusão automática decorre da comparação.

## Critério de conclusão

O Supabase só será a origem de um módulo quando o esquema, dados, políticas RLS, operações, auditoria, exclusão, recuperação e testes de isolamento estiverem completos; quando a contagem e os campos baterem por comunidade; e quando a versão publicada for verificada usando o destino real. Até lá o D1 continua sendo a origem desse módulo.

## Etapa em desenvolvimento nesta alteração

A rota protegida `POST /api/proprietario/integracoes/supabase/storage-copy` e o painel do proprietário permitem copiar uma página de até 20 objetos R2 por vez. Apenas chaves de imagem no formato conhecido são aceitas. A rotina exige bucket privado, compara bytes antes e depois do envio e interrompe em conflito. Cada objeto conferido é registrado em `supabase_storage_copies`. A leitura pública recorre à cópia apenas se o R2 não encontrar o objeto e respeita o bloqueio de arquivos excluídos. O proprietário pode desfazer as cópias em páginas, desde que o original no R2 continue idêntico. Ainda não há corte de escrita de mídia, nem transferência de Google Drive ou arquivos locais.

A migração Supabase `0008` cria uma tabela separada, sem acesso de `anon` ou `authenticated`, para detalhes cadastrais dos perfis. A rota protegida compara e transfere apenas após confirmação da contagem pelo proprietário. Os dados incluem telefone, endereço, campos personalizados de cadastro, dados de participação e referências de foto; as tabelas de hashes de senha, sessões, tokens e identidade CPF não são lidas. Campos personalizados devem ser revisados antes da execução real, pois podem conter dados sensíveis escolhidos pela comunidade. A resposta ao navegador devolve somente contagens. Depois da primeira cópia conferida, o proprietário pode ativar uma cópia contínua, vinculada à URL e à referência do projeto Supabase configurado. Ela roda junto da sincronização automática geral e pausa se a integração mudar. Nenhuma API operacional lê dessa tabela.

Antes de criar ou atualizar uma cópia cadastral, o D1 registra que ela pode existir no projeto configurado. Enquanto esse registro estiver presente, a troca de projeto, a remoção da integração e a reinicialização da plataforma ficam bloqueadas. O proprietário pode remover explicitamente toda a cópia cadastral no Supabase; a operação pausa a sincronização, confere a contagem, apaga pelo serviço e exige uma segunda conferência vazia antes de liberar o bloqueio local. O D1 permanece como origem e não é alterado por essa remoção.

A migração Supabase `0009` oferece uma conferência de contagens e uma limpeza explícita das quatro tabelas de cópia: comunidades, perfis, vínculos e detalhes cadastrais. A limpeza é exclusiva do serviço, exige as contagens atuais do proprietário, pausa a sincronização e falha se houver perfil ligado ao Auth ou se alguma tabela operacional futura depender dessas tabelas. Após verificar o destino vazio, a integração é pausada. Trocar o projeto, remover a conexão ou reinicializar a plataforma passa a exigir essa conferência remota. Se a migração `0009` ou o Supabase estiver indisponível, essas operações ficam bloqueadas até ser possível verificar o destino.
A chave protegida também não pode ser removida enquanto houver cópias no Storage ou nos catálogos, pois ela é necessária para conferir e apagar esses dados.

A migração Supabase `0010` prepara o vínculo progressivo de perfis com Supabase Auth. O proprietário precisa ativá-lo explicitamente depois que a cópia mínima de perfis e a conciliação automática estiverem prontas. Em cada login CPF com senha válida, o servidor confere o perfil e a conta Auth. Quando não existe conta, cria uma com a senha verificada e o ID legado em metadados administrativos; quando uma criação anterior foi interrompida, confirma o mesmo ID e e-mail antes de retomar o vínculo. Contas existentes com identidade divergente ficam para revisão e não são ligadas automaticamente. A falha no Supabase não impede a sessão atual no D1. A senha não é armazenada na cópia dos perfis nem incluída no histórico da migração.

A contagem de segurança inclui contas Auth criadas antes de um vínculo interrompido. Elas bloqueiam a limpeza dos catálogos, a troca de projeto, a retirada da chave protegida e a reinicialização da plataforma. O vínculo pode ser pausado no painel. Esta etapa **não** migra o primeiro acesso, a redefinição de senha, Google OAuth, revogação de sessão ou o emissor das sessões; essas rotas seguem usando D1. As migrações SQL e D1 deste plano ainda precisam ser aplicadas e verificadas no ambiente real antes de ativar a função.
