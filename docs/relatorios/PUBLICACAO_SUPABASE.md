# Publicação do sistema e Supabase

## Etapa 0 — diagnóstico

Base: versão 282 em produção, commit c31182e765c070ddb3f1ef467fec230474a2f21a. A branch solicitada foi alinhada a essa fonte para preservar o site atual. Área confirmada pelo proprietário em 21/09/2026: `PublicationWorkspace`, em `app/components/OwnerOperationsWorkspace.tsx:96`, alcançada por `OwnerWorkspace.tsx:81,492`. O prompt antecedia a criação dessa aba; Configurações e IA Editorial têm finalidades diferentes.

| Local original | Sintoma e causa | Correção prevista |
| --- | --- | --- |
| OwnerOperationsWorkspace.tsx:45,101 | Versões, autores, horários e etapas são constantes, apresentados como reais | Remover simulação da aba; exibir somente estado consultado e explicar a publicação pela hospedagem |
| OwnerOperationsWorkspace.tsx:101 | Ver logs e Liberar publicação não têm manipulador | Substituir controles sem implementação por diagnóstico e ações reais |
| OwnerOperationsWorkspace.tsx:97-101 | Aprovação e recusa só alteram useState, sem servidor nem auditoria | Não simular aprovação; salvar integração exclusivamente em rota protegida |
| OwnerOperationsWorkspace.tsx:101 | Selo Produção protegida não vem de verificação | Estado geral derivado da configuração e última verificação |
| OwnerOperationsWorkspace.tsx:96-102 | Não existem estados de carregamento, vazio ou erro; não há mensagens específicas | Leitura assíncrona com estado explícito e nova tentativa |
| OwnerOperationsWorkspace.tsx:101 | Nove etapas e tabela densa; classes ops não têm definições CSS no código publicado | Layout por cartões com regras escopadas, medir 360px e temas; contraste ainda não medido, não afirmar falha numérica |
| OwnerOperationsWorkspace.tsx:101 | Aviso de aprovação sem aria-live; nenhum rodapé de auditoria | Status acessível e trilha real |
| app/api/pilot/publicacoes-plataforma/route.ts:6 e [id]/route.ts:3 | Rotas retornam 410 por aposentadoria intencional | Preservar rotas; busca não encontrou consumidor em componentes, apenas testes; não religar |
| PlatformControlsWorkspace.tsx:138 | Publicação automática real significa editorial, não deploy | Explicar a distinção na área de publicação, preservando a flag |

Sem alterações de schema previstas. Credenciais reais não serão incluídas em código nem documentação. O diagnóstico de Storage exige credencial administrativa configurada pelo proprietário em campo protegido; somente a chave pública foi fornecida até agora.

## Validação

Diagnóstico baseado em leitura do código e comparação com a versão publicada. Testes de interface e comandos de validação serão registrados nas etapas seguintes.

## Etapa 1 — redesenho

Removidos histórico fictício, aprovações locais e botões inertes. Extraída a área de publicação do arquivo compartilhado, com consulta à auditoria existente, estados de carregamento/vazio/erro, cartões e explicação da diferença entre editorial e deploy. Layout revisado em harness local com o componente e CSS reais em 360 e 1440 px, dois temas e três estados; sem transbordamento horizontal. Ajustado fundo do cabeçalho escuro e espaçamento herdado. Lint: 0 erros e 41 avisos preexistentes de imagens. Build: concluído, artefato validado. Próxima etapa: formulário e persistência segura.

## Etapa 2 — configuração protegida

Criada a rota exclusiva do proprietário com GET, PATCH e DELETE. A configuração usa a chave existente supabase_integration em configuracoes, sem alteração de schema. Chave secreta e segredo JWT são cifrados com AES-GCM e uma chave derivada de AUTH_SECRET; o navegador recebe somente máscara, comprimento e estado. Campo secreto vazio preserva o valor anterior, troca de URL exige novos segredos, e a remoção exige confirmação literal. Toda escrita registra auditoria sem segredos. O formulário tem labels associados, confirmação para salvar/remover, alvos de 44px e indicação específica de carregamento, ausência e falha. O teste novo comprovou 401/403, validação da URL, cifra, máscara e preservação. Próxima etapa: diagnóstico de conexão.

## Etapa 3 — conexão verificável

Criada verificação somente de leitura, com timeout de 8s, no máximo uma repetição e cache desativado: Auth health, validação da chave pública em Auth settings, OpenAPI REST com chave de servidor, lista de buckets e conferência do bucket informado. O formulário exibe resultado, latência, códigos HTTP e data; integração desligada interrompe o teste antes de qualquer chamada externa. Teste automatizado percorreu o resultado de sucesso e confirmou auditoria sem segredo. Verificação externa do projeto informado em 21/09/2026: Auth health 200 e Auth settings 200; a raiz REST devolveu 401 “Secret API key required”, comportamento esperado sem a chave secreta. A verificação completa de REST/Storage ficará disponível ao proprietário assim que a chave secreta for preenchida no formulário.

## Etapa 4 — testes e validação

Não houve alteração de schema e, portanto, nenhuma migração foi criada nem db:generate foi executado. TypeScript passou sem erro. npm run lint terminou com 0 erros e 41 avisos preexistentes (40 usos de img e uma constante sem uso fora do escopo). npm test passou com 396/396 casos e executou o build/validação do artefato. A rodada dirigida de pilot-security, tenant-isolation-guard e integração Supabase passou com 19/19 casos. O build final reconheceu as duas novas rotas e validou o Worker ESM e o manifesto da hospedagem.
