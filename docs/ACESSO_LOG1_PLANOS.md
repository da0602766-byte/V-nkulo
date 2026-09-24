# Acesso por CPF, LOG1 e planos

Implementação interna de 24/09/2026. Este documento descreve o código e a migração; não representa publicação ou aplicação no banco de produção.

## Entradas e separação de acesso

| Entrada | Finalidade | Resultado |
| --- | --- | --- |
| `/login` | CPF e senha de conta existente | Sessão comum, sujeita aos vínculos e permissões |
| `/vincular-cpf` | Transição de conta existente, mediante e-mail e senha atual | Vincula o CPF uma única vez; não cria conta ou sessão |
| `/log1` | Nome, telefone, nascimento e CPF do interessado | Somente solicitação, sem comunidade, usuário ou assinatura |
| `/contratacao/:token` | Link individual emitido pelo Proprietário | Condições aceitas aguardando aprovação |
| `/convite/:token` | Convite individual de comunidade | Conta/vínculo limitado ao papel e comunidade do convite |
| `/cadastro-membro/:token` | Formulário temporário de comunidade | Cadastro de membro e registro dos dados ministeriais |
| `/proprietario/acesso` | CPF e senha da conta global autorizada | Sessão administrativa de uma hora |

O cadastro público antigo retorna 403. O OAuth do Google continua atendendo contas existentes e a integração de armazenamento; não cria novas contas. A tela de login principal apresenta somente CPF e senha. As páginas do Proprietário e suas APIs validam a autorização no servidor. Seu endereço não é apresentado como opção de cadastro ou convite.

## Preservação de contas

Nenhum usuário, vínculo, senha ou comunidade é recriado pela migração. A identidade CPF fica em tabela separada. Contas existentes usam `/vincular-cpf` com a senha atual; duplicidades e tentativas de substituir documento já vinculado são rejeitadas. A associação é uma declaração do titular autenticado, não uma consulta de identidade em órgão externo.

Contas que usavam apenas Google precisam definir senha pelo procedimento de recuperação já existente, com apoio da liderança. A recuperação por CPF envia uma solicitação interna aos responsáveis quando existem; não promete envio de e-mail ou SMS. O procedimento operacional existente continua necessário para recuperar a conta global quando não houver outro responsável autorizado. Tokens de recuperação duram 30 minutos, são consumidos uma vez em transação e invalidam sessões, inclusive vínculos de push.

A conta global continua determinada pela configuração segura já existente `SYSTEM_OWNER_EMAIL` e `SYSTEM_OWNER_LOCKED_BEFORE`. É necessário vincular seu CPF antes de usar a nova entrada. Um login comum dessa conta não recebe os privilégios globais; exige a entrada administrativa. Sessões antigas continuam sujeitas à validade e revogação, mas precisam ser renovadas pela entrada exclusiva para administrar a plataforma.

## Solicitação, contratação e ativação

1. LOG1 grava somente a solicitação. Repetições de CPF em análise recebem a mesma resposta genérica.
2. Em **Proprietário → Solicitações LOG1**, abra a solicitação, registre a análise e selecione os planos permitidos.
3. Gere um link de 1 a 168 horas. O endereço é mostrado para copiar e encaminhar pelo canal já disponível. O sistema registra “link disponível”; não afirma que uma mensagem foi enviada.
4. O solicitante revisa preço, duração, recursos, cotas e condições. Confirma CPF, credenciais e dados da comunidade. O token é consumido e as condições ficam registradas como um retrato do contrato aceito.
5. O Proprietário revisa as condições e autoriza a ativação com um fundamento: gratuito, confirmação externa legítima ou isenção justificada. Um plano pago não aceita fundamento gratuito.
6. Uma transação cria a conta quando necessário, a comunidade, sua assinatura e o vínculo de administrador da comunidade. Não concede papel global. Repetição ou concorrência não duplica a ativação.

O catálogo começa com **Gratuito, Comunidade+, Community Church e Personalizado**, todos inativos. O Gratuito tem valor zero; os outros não recebem preço inventado. Configure valores, módulos e cotas e habilite a contratação em **Proprietário → Planos**. Os nomes são editáveis e outros planos podem ser adicionados. A página pública usa apenas ofertas ativas e configuradas.

Propostas personalizadas pertencem à solicitação específica. Após a ativação, a configuração é preservada na assinatura daquela comunidade. Alterar o catálogo não reescreve contratos aceitos. Mudanças posteriores são feitas na assinatura, com justificativa e auditoria.

## Recursos e cotas

O acesso combina papel, permissões, configuração de módulos da comunidade e condições da assinatura. Habilitar um plano não concede por si só um papel ou módulo anteriormente desabilitado pela comunidade.

São configuráveis os módulos reais do catálogo `community-modules`, Feed, Pedidos e Relatórios. As cotas controlam usuários ativos, administradores ativos, visitantes cadastrados ativos, células ativas e ministérios ativos. `null` significa ausência de limite definido. Os nomes exibidos informam o que é contado; cadastros de membros também consomem a cota de usuários.

Triggers SQLite aplicam cotas nas inserções e reativações/alterações pertinentes, inclusive nas APIs administrativas existentes. Uma falha de cota durante um convite reverte a conta, a identidade e o consumo do token. Reduzir uma cota não apaga registros existentes; bloqueia novas operações que aumentariam o excedente.

Comunidades anteriores à migração, sem assinatura nessa nova tabela, mantêm suas permissões e módulos existentes. Não recebem um plano comercial arbitrário. O Proprietário pode vinculá-las em **Planos → Vincular uma comunidade existente**, com revisão das condições, fundamento e justificativa. Assinaturas suspensas, encerradas ou vencidas restringem o acesso operacional. A duração controla o vencimento; a periodicidade comercial não simula renovação ou cobrança automática. Alterar apenas o status não renova o vencimento.

## Convites e links de membros

Convites individuais têm token aleatório de 256 bits, hash no banco, validade de 1 a 168 horas, uso único e revogação. O servidor determina comunidade e papel a partir do convite; ignora tentativas de elevar privilégios pelo formulário. A geração de papéis de liderança/administração requer autorização adicional do responsável. Para vincular uma conta existente, é necessário confirmar sua senha e a identidade CPF.

Formulários coletivos mantêm o token UUID seguro do fluxo existente, vinculados à comunidade de origem, prazo máximo de 30 dias para novos links/edições, máximo configurável de 1 a 10.000 cadastros e revogação. O limite padrão da migração é 100 e o uso anterior é contabilizado. Registros existentes são preservados. Cadastros novos criam a própria senha e retornam ao login por CPF.

## Proteções e retenção

- CPF normalizado, dígitos verificadores válidos, unicidade por conta e HMAC-SHA-256 por finalidade usando `AUTH_SECRET`. A tabela nova guarda o hash e apenas os dois últimos dígitos.
- CPF não aparece em URLs, auditorias ou notificações do novo fluxo. Os formulários usam POST também no envio nativo, sem depender de JavaScript para evitar credenciais na URL.
- Tentativas por identidade e por IP confiável são limitadas no banco. As mensagens de autenticação e recuperação não confirmam a existência de CPF.
- Cookies de sessão `HttpOnly`, `Secure`, `SameSite=Lax`; assinatura, prazo, estado da conta, senha e revogação conferidos no servidor. Origem de mutações é verificada pelo Worker.
- Páginas com tokens não enviam referência de navegação; páginas e APIs de acesso usam `no-store`.
- Solicitações e links LOG1 são removidos após 180 dias, inclusive cópias de contato e credenciais pendentes. A limpeza roda com tráfego, em intervalos de dez minutos, e ao enviar/consultar solicitações. Sem tráfego, ocorre na próxima execução.
- A remoção da solicitação preserva usuários, comunidades e o retrato contratual da assinatura. Auditorias mantêm identificadores das operações. Dados já existentes seguem os procedimentos de retenção do projeto.
- Senhas pendentes de contratação são hashes com salt e são apagadas da solicitação na ativação ou recusa. Nunca são devolvidas pela API.

`AUTH_SECRET` agora também é necessário para localizar identidades CPF. Uma troca da chave sem uma estratégia de migração inviabiliza os hashes atuais. Preserve a chave no ambiente seguro e no procedimento de recuperação operacional; não a registre no repositório. Rotação futura exige chave versionada e revinculação/migração autorizada das identidades.

## Implantação e reversão

1. Faça backup consistente do banco e registre a versão em produção pelo procedimento já utilizado na hospedagem. Preserve suas variáveis seguras.
2. Valide em homologação o caminho da conta global existente: senha, configuração de autorização e associação de CPF. Nenhuma conta privilegiada é semeada por este código.
3. Aplique `drizzle/0079_controlled_onboarding.sql` uma única vez, pelo histórico de migrações da hospedagem. Os triggers fazem parte obrigatória do arquivo; `db:generate` não os substitui.
4. Publique o artefato produzido por `npm run build` no fluxo já existente. Banco e Worker precisam ser implantados juntos; o Worker novo requer a migração.
5. Verifique login comum, entrada global, associação da conta antiga e fluxos com uma comunidade de homologação. Configure as ofertas reais antes de gerar links para clientes.

Para reverter uma regressão, mantenha tabelas, identidades e contratos. Desative novas ofertas e revogue links pendentes no painel enquanto aplica uma correção ou reverte apenas a apresentação. Não remova triggers nem restaure uma versão que reabra cadastro ou elimine as novas validações. Uma restauração completa do backup só é adequada com janela de manutenção e reconciliação das escritas posteriores; ela não é executada automaticamente. A migração é aditiva e não possui `down` destrutivo.

## Serviços externos

`app/lib/external-access-providers.ts` define os contratos de integração de pagamento e segundo fator. Os provedores permanecem desabilitados. `/api/payments/webhook` retorna 503 e não aceita uma mensagem “approved” como pagamento.

Ainda dependem de implementação/configuração do provedor: checkout real, validação criptográfica de webhook, transações e reconciliação idempotente, renovação/cobrança, mensageria por e-mail/SMS/WhatsApp e desafio/enrolamento de segundo fator. A interface de segundo fator é um ponto de extensão, não 2FA ativo. Nenhuma assinatura é marcada como “paga”; a ativação interna registra somente o fundamento auditável escolhido pelo Proprietário.

## Verificação

`tests/controlled-onboarding.test.mjs` exercita CPF, migração de conta, autorização global, sessão, CSRF, LOG1, contratos, concorrência, revogação, cotas, isolamento, recuperação e retenção, com o Worker compilado e banco SQLite descartável. As contas e valores usados nesses testes não são inseridos em produção.

Os testes legados usam um adaptador de fixtures exclusivamente em `tests/helpers/cpf-login.mjs`; ele prepara a identidade das contas de teste e chama a autenticação real por CPF. Não existe entrada por e-mail equivalente no código de produção.

Verificações locais: build com validação do artefato, TypeScript, lint e suíte completa. Inspeção visual em 360, 390, 412, 768 e 1366 pixels, com temas claro e escuro. Nenhum ambiente remoto foi alterado por essa validação.
