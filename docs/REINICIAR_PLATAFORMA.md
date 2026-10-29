# Reiniciar a plataforma

Entrada: `/proprietario?tab=reset`, em **Sistema → Reiniciar plataforma**.
Somente a sessão exclusiva de Proprietário global acessa a API. A migração
0080 apenas cria estruturas: instalar ou publicar não executa nenhuma limpeza.

## Operação

1. Escolher **Arquivar e reiniciar** ou **Excluir definitivamente**.
2. Conferir as quantidades de pessoas, comunidades, registros e arquivos.
3. Reconhecer o alcance, digitar a frase exibida e informar a senha atual.
4. Executar. A conferência expira em cinco minutos e não pode ser reutilizada.

A primeira opção remove os dados operacionais e guarda uma cópia AES-256-GCM
no D1, em blocos de 128 KiB. A chave deriva de `AUTH_SECRET` e o identificador
da operação autentica cada arquivo. O Proprietário pode exportar o JSON após
informar novamente a senha. **Não existe restauração automática:** o JSON é
um arquivo para recuperação técnica. Desde 24/10/2026, o
[procedimento local verificável](guias/RECUPERACAO_LOCAL.md) permite reconstruí-lo
em outro SQLite, preservando a identidade atual do proprietário e sem reativar
sessões, convites ou integrações antigas. Isso não restaura produção nem substitui
backup periódico. A exportação contém dados pessoais
e credenciais antigas; deve ser mantida em local privado. Não trocar ou perder
`AUTH_SECRET` enquanto houver arquivos que precisem ser recuperados.

A segunda opção apaga fisicamente os registros das tabelas operacionais e os
blocos de todas as cópias geradas por esta função. O esquema, histórico de
migrações e código permanecem instalados. Não há botão de desfazer.

## Preservado e removido

- Preservados: conta autenticada de Proprietário, identidade CPF, senha, datas
  necessárias à autorização global, suas sessões, catálogos `planos_plataforma`
  e `planos_rede`, contadores de proteção do login e metadados mínimos da limpeza.
- Removidos: todos os demais usuários; todas as comunidades, inclusive demos,
  inativas e arquivadas; vínculos, conversas, eventos, publicações, ministérios,
  células, cadastros, convites, LOG1, assinaturas, notificações, auditorias antigas,
  preferências, configurações e credenciais das integrações. Campos operacionais
  e foto do próprio Proprietário também são limpos; a identidade de acesso não muda.
- A descoberta do esquema inclui tabelas operacionais futuras e dados legados.
  As tabelas internas D1/SQLite e as estruturas da própria função não são apagadas.
- IDs/autoincrementos não são zerados: evita reutilizar identificadores antigos.

O bucket R2 pertence ao aplicativo. Na opção Arquivar, seus objetos são mantidos
e seus links públicos são bloqueados. O JSON contém a lista das chaves; o endpoint
POST `/api/proprietario/reset`, ação `DOWNLOAD_FILE`, `key` e `password`, permite
baixar cada anexo arquivado com autorização de Proprietário. Na opção Excluir,
os objetos são apagados. Falhas ficam persistidas como `DELETE_PENDING`, bloqueadas
para leitura pública, e podem ser retomadas pelo botão do histórico, em lotes de
até 100 arquivos. Outra reinicialização é bloqueada até concluir essas pendências.

## Limites e serviços externos

**A função não apaga cópias no Supabase, Google Drive pessoal, downloads ou
backups/Time Travel retidos pelo provedor.** Esses serviços têm administração e
retenção próprias. As conexões locais e a sincronização automática são removidas;
nenhum pedido de apagamento é enviado a contas externas. Conteúdo previamente
armazenado no cache de um navegador também não pode ser recolhido remotamente.

Arquivamento limitado a 16 MiB de JSON; enumeração de até 10 mil objetos. Limites
menores do D1 por consulta/linha também podem impedir arquivos muito grandes.
Nesses casos o fluxo interrompe antes de apagar e exige manutenção técnica.
Execute a operação durante uma janela sem atividade, particularmente sem uploads
ou deploys em andamento. R2 e D1 não compartilham uma transação: por isso o estado
pendente é explícito, e falha em R2 nunca é apresentada como exclusão completa.

## Consistência e segurança

Contagens são conferidas novamente dentro de `D1.batch`. No arquivamento, o banco
é lido em um único batch e cada conteúdo serializado é comparado dentro do batch
de limpeza, impedindo um arquivo incompleto diante de edição concorrente.
Falha em qualquer guard, FK ou DELETE reverte todo o batch, inclusive os blocos
do arquivo e o consumo do desafio. As exclusões seguem dependências de filhos
para pais, com verificação de ausência de registros ao final. O arquivo não é
publicado em URL estática. Downloads exigem senha e retornam `no-store`.

Não reimporte sessões, pedidos de recuperação, convites, links temporários ou
credenciais de integração durante uma recuperação técnica. Preserve a conta e
senha atuais do Proprietário e confira todas as chaves estrangeiras. A recuperação
deve ser preparada em banco isolado antes de qualquer intervenção em produção.

Testes: `tests/platform-reset.test.mjs` cobre autorização, CSRF, senha, expiração,
replay, todas as tabelas, conta preservada, FKs, arquivo/exportação, concorrência,
rollback e retomada de objetos R2. Todos usam banco em memória e anexos fictícios.

## Publicação anterior

O acesso por CPF, LOG1 e planos foi publicado primeiro na versão Sites **309**,
commit `8650f7711717de426bb3bdb33f87e52f271b5bd2`, em 24/09/2026.
Foi necessário isolar `controlled_auth_rate_limits` de uma tabela legada da
hospedagem e usar CASE parentetizado/LF nos triggers para o parser SQL do D1.
