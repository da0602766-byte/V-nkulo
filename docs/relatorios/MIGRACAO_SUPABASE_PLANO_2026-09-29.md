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

A migração Supabase `0008` cria uma tabela separada, sem acesso de `anon` ou `authenticated`, para detalhes cadastrais dos perfis. A rota protegida compara e transfere apenas após confirmação da contagem pelo proprietário. Os dados incluem telefone, endereço, campos personalizados de cadastro, dados de participação e referências de foto; as tabelas de hashes de senha, sessões, tokens e identidade CPF não são lidas. Campos personalizados devem ser revisados antes da execução real, pois podem conter dados sensíveis escolhidos pela comunidade. A resposta ao navegador devolve somente contagens. Essa é uma cópia manual: alterações posteriores no D1 ainda não são sincronizadas para essa tabela, e nenhuma API operacional lê dela.
