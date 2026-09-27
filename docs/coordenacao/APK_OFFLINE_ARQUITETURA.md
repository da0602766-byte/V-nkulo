# APK Vínkulo — arquitetura e sequência de evolução

Data: 27/09/2026. Estado: etapas 1–3 implementadas; APK 1.9.0 publicado para homologação no Sites 321. Etapa 4 autorizada e em implementação; etapas 5–7 aguardam autorização. Testes físicos e métricas Android continuam pendentes. Evidências em [etapa 1](../relatorios/APK_ETAPA_1_2026-09-27.md), [etapa 2](../relatorios/APK_ETAPA_2_2026-09-27.md) e [etapa 3](../relatorios/APK_ETAPA_3_2026-09-27.md).

## Objetivo e limites

Permitir abrir o aplicativo, consultar dados previamente autorizados e registrar trabalho selecionado sem rede; sincronizar depois sem perder operações ou duplicar registros. Melhorar a experiência com conectividade instável e medir os ganhos. “Maior parte offline” será avaliada pela cobertura dos fluxos cotidianos escolhidos, não por uma porcentagem inventada de telas.

Primeiro acesso, recuperação de conta, concessão de permissões, emissão de convites, aprovação administrativa, integrações e confirmação de operações concorrentes continuam online. Nenhum privilégio global do proprietário será concedido pelo cache. Todas as comunidades existentes e futuras obedecem às mesmas regras de disponibilidade e autorização.

## Estado de partida comprovado (APK 1.7.1)

- Android Java + WebView remota, pacote `com.vinkulo.app`, 1.7.1/code 10; minSdk 24, target/compileSdk 35 no fonte auditado. JavaScript, DOM storage e cookies próprios habilitados; cookies de terceiros desabilitados.
- Fonte Android em `.task-tools/android-p3`, commit `f5e1a06dad7147511f1ec3711d3b2e326c100ea1`, branch `feat/android-1.6-secure-lifecycle`. A PR 15 permanece aberta e em rascunho. Não inferir a versão pelo nome antigo da branch.
- Interface React/TypeScript, Vinext/Vite; servidor Workers/D1. `app/painel/page.tsx` faz autenticação/contexto e leituras no servidor antes de renderizar. Uma tela empacotada não pode executar esses imports de servidor.
- `PilotDashboard` já divide módulos com importação dinâmica. `CommunityHome` recebe feed inicial e atualiza publicações/eventos/escalas via APIs. Avaliar o custo de revalidação duplicada sem remover atualização necessária.
- `public/sw.js` não intercepta APIs; navegação depende da rede e cai em `offline.html`. Recursos estáticos têm cache; scripts/estilos priorizam a rede para evitar mistura de versões. Não existe base operacional offline geral.
- `local-media.ts` armazena blobs em IndexedDB. Preferências e alguns lembretes usam localStorage. Não confundir com rascunhos transacionais, armazenamento cifrado ou fila de sincronização.
- Push nativo FCM e Web Push são caminhos distintos. A fila durável de notificações do servidor não é uma fila de alterações do usuário no celular.
- O código atual do chat persiste mensagens no D1, com retenção semanal; anexos de publicações usam o bucket, enquanto fotos pessoais/outros fluxos podem usar Drive/local. README e trechos antigos do estado do projeto ainda descrevem política anterior. A migração offline deve partir das rotas atuais e preservar a retenção real; não criar um histórico permanente de conversas por acidente.

## Decisões de arquitetura

### 1. Evolução incremental

Preservar componentes React/TypeScript e APIs de domínio. Na etapa 2, manter Java também nos novos serviços Android: Room e Keystore não exigem uma troca de linguagem. Kotlin continua opção para serviços futuros, se trouxer benefício concreto; não converter arquivos apenas pela linguagem. Não migrar D1 para Supabase como parte do offline. Supabase continua integração separada.

Arquitetura-alvo para as próximas etapas (a etapa 2 entrega somente a entrada estática e a fundação nativa):

```text
Tela React empacotada
  → repositório de dados do módulo
    → adaptador Android / ponte restrita
      → banco Room + arquivos privados + fila persistente
        ↔ sincronizador nativo ↔ API autenticada ↔ D1

Tela web/PWA
  → mesmo contrato de repositório
    → adaptador web (IndexedDB, apenas nos módulos habilitados)
```

O banco local alimenta as telas offline. O servidor decide permissões e o estado compartilhado confirmado. Um registro pendente não equivale a aprovação pelo servidor. Esta separação segue o desenho de [fontes local/remota do Android](https://developer.android.com/topic/architecture/data-layer/offline-first).

### 2. Interface inicial empacotada

Criar uma entrada cliente mobile independente do render de `/painel`; reaproveitar componentes sem importar sessão, banco ou secrets do servidor. O servidor entrega um bootstrap mínimo autenticado para a primeira preparação online. A primeira instalação sem rede abre uma orientação local, sem simular usuário autenticado.

Proposta de implementação: WebViewAssetLoader servindo somente um prefixo reservado, como `/mobile-app/`, sob o domínio HTTPS oficial. Recursos locais versionados e empacotados; `/api/`, login e OAuth continuam no servidor. Isso permite testar a preservação da origem/cookies existentes sem expor cookies HttpOnly ao JavaScript. A capacidade de servir conteúdo local por URLs HTTPS é documentada em [WebViewAssetLoader](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader).

Antes de liberar: provar que o service worker atual não intercepta/substitui os recursos dessa entrada, que URLs fora do prefixo não recebem conteúdo local e que APIs nunca recebem HTML por fallback. Testar CSP, origem da ponte, OAuth, deep links, downloads autenticados e navegação entre módulos locais e remotos. Não habilitar `file://`, acesso universal ou ponte de SQL.

O pacote local contém somente recursos públicos de interface; nenhum dado pessoal, segredo ou sessão. Uma mudança dessa interface exige novo APK. O site continua com seu ciclo próprio de publicação.

### 3. Armazenamento e privacidade

Room sobre SQLite para entidades locais, rascunhos, outbox e cursores; arquivos em diretório privado do aplicativo. Room fornece persistência estruturada e migrações, mas não cifra o banco automaticamente. [Referência Room](https://developer.android.com/training/data-storage/room).

Contrato inicial das tabelas:

| Estrutura | Identificação e responsabilidade |
| --- | --- |
| `local_records` | conta + comunidade + tipo + ID local/servidor; versão do servidor, dados cifrados, expiração e estado de sincronização |
| `drafts` | conta + comunidade + fluxo + UUID; conteúdo cifrado e versão do formato |
| `outbox` | operationId UUID, conta/comunidade, entidade, operação permitida, versão-base, payload cifrado, dependências, tentativas e recibo |
| `sync_state` | cursor opaco por conta/comunidade/módulo, versão do protocolo e última sincronização confirmada |
| `media_manifest` | referência autorizada, caminho privado, tamanho, hash, expiração e intenção de download do usuário |

Proposta: cifrar payloads/arquivos sensíveis com AES-GCM, chaves protegidas pelo Android Keystore; avaliar índices e consultas para não deixar nomes, contatos ou conteúdo em colunas auxiliares abertas. Room sozinho e localStorage não satisfazem essa proteção. Credenciais não passam pela ponte JS, não entram em logs ou no banco de entidades.

Ponte com operações tipadas e lista permitida: consultas paginadas, salvar rascunho, registrar alteração, observar status. Exigir origem oficial/frame principal, limite de mensagem, contexto autenticado nativo e identificador de requisição. A página não escolhe livremente conta/comunidade por argumento. Respostas atrasadas de uma sessão anterior são descartadas.

Cache, arquivos baixados e dados ainda não enviados têm políticas separadas. Evicção automática pode retirar cópias baixadas recuperáveis, nunca rascunhos/outbox. Limite inicial proposto: 50 MiB de cache estruturado e 200 MiB de mídia opcional, ajustáveis após teste de volume. Sem espaço, informar erro antes de declarar “salvo”.

### 4. Autenticação offline e saída de conta

Sessão online atual usa cookie HttpOnly validado no D1. O prazo online não deve ser reutilizado automaticamente como prazo offline.

Na etapa 2, o Android obtém diretamente por HTTPS um snapshot autenticado mínimo e o cifra localmente com Keystore, vinculado aos cookies de sessão/comunidade. O snapshot vale no máximo 24 horas e nunca além da sessão; habilita apenas `shell.open`, sem leitura ou escrita de módulos. Não é um token de API nem uma autorização assinada transferível; a página não pode instalar snapshots. Não há segredo de assinatura novo no servidor.

Para etapas de dados operacionais, definir autorização offline vinculada a conta, aparelho, comunidade, escopos e versão das permissões. A proposta anterior de assinatura do servidor e prazo de 8 horas para dados sensíveis permanece para avaliação antes dessa ampliação, não como recurso já entregue. Operações administrativas e acessos temporários permanecem online.

Conferir tempo de servidor, tempo decorrido e retrocesso de relógio; se a validade não puder ser garantida após reinicialização/alteração de relógio, exigir reconexão. Ao expirar, bloquear leitura privada e envio; não apagar automaticamente trabalho pendente.

Logout bloqueia imediatamente a leitura local e interrompe sincronizadores. Havendo pendências, a interface explica que precisam da mesma conta reautenticada para retomar e oferece descarte explícito; nunca transfere a fila para outra conta. Revogação remota conhecida bloqueia envio e sela dados pendentes até decisão de recuperação compatível com a política. O aparelho desconectado não recebe revogação instantânea: limite de validade reduz essa janela, sem prometer eliminá-la.

### 5. Sincronização e contrato de servidor

Separar leitura incremental de escrita. Endpoints novos e versionados não substituem imediatamente APIs usadas por APKs antigos.

| Contrato proposto | Regra obrigatória |
| --- | --- |
| Bootstrap | Sessão e comunidade validadas, capacidades, hora do servidor, autorização offline, versão mínima compatível e início do snapshot |
| Leitura incremental | Cursor opaco de sequência do servidor, páginas limitadas, alterações e tombstones (marcadores de remoção); checkpoint só avança após transação local concluída |
| Escrita | UUID estável da operação, tipo permitido, entidade e versão-base; resultado individual aceito/conflito/rejeitado |
| Idempotência | Chave única por conta + comunidade + operationId; guardar recibo e hash do pedido atomicamente com a alteração; mesmo ID/payload retorna mesmo resultado, payload diferente é recusado |
| Concorrência | Versão-base verificada em atualização atômica; conflito devolve estado autorizado atual, sem sobrescrever silenciosamente |
| Acesso | Revalidar usuário, comunidade e permissão em toda sincronização; mudança de escopo força expurgo/rebootstrap das cópias afetadas |

Snapshot inicial precisa de marco consistente e aplicação dos deltas posteriores. Paginação por ID, sozinha, não detecta edições/exclusões de registros antigos. Ao expirar cursor ou histórico de remoções, realizar ressincronização completa mantendo rascunhos/outbox isolados. Exclusão de entidade não pode ser revertida por um upload atrasado.

Estados da fila: `pendente → enviando → confirmado`, com saídas para `nova tentativa`, `conflito`, `rejeitado` e `aguardando autenticação`. Recuperar reserva de processamento abandonada após morte do processo. Dados da alteração e item da fila são gravados na mesma transação local. Repetição usa o mesmo UUID, não gera uma segunda intenção.

Aplicar backoff e jitter para rede/5xx, respeitar 429/Retry-After; 401 suspende para autenticação, 403 bloqueia por acesso, 409 exige resolução, validação inválida pede correção. Dependências entre cadastro local e anexos/seguimentos precisam de mapeamento de UUID para ID confirmado. Falhas parciais são visíveis por operação.

Android: trabalho persistente único por contexto com WorkManager, restrição de conectividade e sincronização também ao retomar o app. Trabalho em segundo plano não tem prazo de execução garantido. [Agendamento persistente Android](https://developer.android.com/develop/background-work/background-tasks/persistent).

O worker não depende de JavaScript/WebView abertos. Antes de habilitá-lo, implementar credencial nativa de sincronização de escopo restrito, curta e revogável, emitida em fluxo autenticado vinculado ao aparelho; armazenamento nativo seguro e revalidação de sessão no servidor. Não reutilizar token Firebase como autenticação nem copiar cookie HttpOnly para JS. A liberação do worker depende desse contrato estar testado.

Web/PWA: sincronizar ao abrir, retomar e reconectar; não prometer equivalência ao worker Android nem cifragem baseada em Keystore. Habilitar dados sensíveis no navegador apenas após política de proteção específica.

## Matriz inicial de módulos

### Recorte autorizado da etapa 4 (27/09/2026)

Primeira escrita: cadastro básico de visitante (nome, telefone/e-mail opcionais e data de entrada). Formulário no leitor leve existente; cadastro completo e dados pastorais/administrativos ficam online. Salvar rascunho e colocar na fila são ações explícitas diferentes. Um único registro cifrado do Room/schema 2 contém payload, UUID e estado; 200 registros mais a concessão, sem evicção automática. Campos digitados ainda não salvos não são rascunhos persistidos.

Concessão nativa `visitor.create` separada da leitura, até 8h, token aleatório cifrado no aparelho e HMAC no servidor, vinculado à sessão/comunidade/instalação. Worker envia token **e** cookies próprios; servidor revalida sessão e permissões a cada operação. Token sozinho não autentica o usuário. Nada disso é exposto à ponte JS. Reautenticação da mesma conta/comunidade recupera pendências; bloqueio não apaga trabalho. WorkManager exclusivo com rede, backoff/jitter e reserva recuperável; sem garantia de execução imediata.

Novas APIs `write-bootstrap` e `visitors` em `/api/mobile/`, cliente `android-write-1`. Migração 0081 aditiva, recibo/hash/cadastro/auditoria transacionais no D1; resposta perdida reutiliza o UUID. Conflito ou recusa é visível, sem merge silencioso. Não apagar operação de resultado incerto nem promover a estável sem homologação física. Evidências e pendências em `docs/relatorios/APK_ETAPA_4_2026-09-27.md`.

### Recorte autorizado e implementação da etapa 3 (27/09/2026)

- APK candidato 1.9.0/code 12, somente homologação. A versão geral 1.7.1 e o protocolo 1 da etapa 2 permanecem compatíveis. A autorização da etapa 3 não libera escrita/outbox nem a distribuição geral.
- Evidência da implementação: fonte Android `ccfaa4f`, CI `36351726420` aprovado nos emuladores API 29/35; 528 testes web aprovados. Relatório `docs/relatorios/APK_ETAPA_3_2026-09-27.md` registra assinatura, hash, capturas e limitações. Homologação física e medição de desempenho ainda pendentes.
- `GET /api/mobile/snapshot`, protocolo 2: autenticação/tenant reais, desafio por requisição, origem oficial e sessão própria ainda válida. Capacidades `shell.open` e `snapshot.read`. Snapshot HTTPS autenticado e selado pelo Keystore; **não** é credencial de API nem concessão portátil com assinatura assimétrica.
- Ativação explícita na entrada local. Consentimento vinculado ao hash dos cookies de sessão/comunidade; login, saída e bloqueio removem a ativação. Abrir o painel só atualiza automaticamente após essa escolha e no mesmo vínculo; sem agendamento/background sync. Falhas de rede conservam somente a cópia ainda válida; 401/403 bloqueiam e apagam o contexto.
- Prazo operacional máximo de **8 horas**, reduzido à validade da sessão e ao tempo consumido pela requisição. Reinício do aparelho, mudança importante do relógio, troca de sessão/comunidade e expiração bloqueiam a leitura. Revogação remota sem conexão não é instantânea: o limite de exposição é o prazo restante.
- Uma substituição integral em um único registro AES-GCM do Room/schema 2: instalação atômica, sem migração destrutiva e sem misturar lotes antigos. Não usa a tabela reservada a futuros registros/outbox. Uma nova cópia remove itens excluídos/cancelados e esvazia seções sem permissão. Não há merge por ID, cursor incremental ou acúmulo de contas.
- Quota do piloto: **1 MiB por resposta**; até 50 publicações, 100 eventos, 100 compromissos pessoais e 100 designações próprias. Textos/campos têm limites no servidor e no cliente. Payload acima da quota é recusado por inteiro, sem substituir o conteúdo anterior. Essa política substitui os orçamentos maiores propostos, apenas para este recorte.
- Mural: somente publicações publicadas no canal feed e autorizadas por comunidade/audiência. Agenda: eventos publicados e compromissos da própria pessoa, de agora menos 24h até os próximos 30 dias; compromissos de terceiros, mesmo públicos, ficam online neste piloto. Escalas: somente publicadas com designação própria ativa e permissão `schedules.view`. Alterações e aceite continuam online.
- Sem fotos, anexos, lista de inscritos, demais integrantes, tokens de compartilhamento, diretório de pessoas, contatos ou chat. Download de mídia não foi implementado. Busca é exclusivamente local nos textos já salvos; lotes truncados são sinalizados.
- Decisão de interface: estender o leitor leve empacotado da etapa 2, em vez de duplicar o calendário e os workspaces React operacionais. O painel React/TypeScript continua sendo a interface completa online. O leitor só projeta campos de consulta com `textContent` e ponte restrita; nenhum SQL, cookie ou comando de escrita chega ao JavaScript. A extração/reutilização de componentes React do painel permanece trabalho posterior, não concluído implicitamente nesta etapa.
- Mensagens da ponte recebem IDs para descartar respostas antigas; a tela limpa conteúdo ao ocultar, bloquear ou expirar. CSP impede rede e mídia no documento local. Testes físicos, TalkBack, processo frio com sessão real e integrações seguem necessários antes da promoção.

L = leitura offline de dados já preparados; R = rascunho local; F = fila futura, com confirmação do servidor; O = operação online. São metas, não recursos já disponíveis.

| Módulo / fontes atuais | Meta | Condição e prioridade |
| --- | --- | --- |
| Início/mural — `CommunityHome`, `publicacoes` | L, R; publicação O inicialmente | Conteúdo recente autorizado; mídias sob demanda, remoções respeitadas. Etapa 3 |
| Agenda/eventos — `agenda`, `eventos` | L, R; confirmações/votos O inicialmente | Cancelamento e lotação impedem confirmação offline definitiva. Etapa 3 |
| Minhas escalas — `escalas` | L; aceite/substituição O inicialmente | Dados próprios, cancelamentos e expiração; não autorizar recursos temporários offline. Etapa 3 |
| Visitantes — `TenantOperations`, `visitantes` | R, F; L mínima autorizada | Primeiro fluxo de escrita: UUID e validação real de duplicidade. Dados de contato sensíveis. Etapa 4 |
| Acompanhamentos/anotações — `acompanhamentos`, `anotacoes` | R, F, L restrita | Público/autor/responsável, conflitos, conteúdo pessoal. Etapa 5 |
| Ministérios/equipes/checklists — `ministerios`, `escalas` | L; R/F para checklist | Administração de equipe e distribuição de acesso O. Etapa 5 |
| Pedidos — `solicitacoes`, `solicitacoes/central` | R, F e L própria/restrita | Público e destinatários revalidados; conteúdo pastoral não baixado indiscriminadamente. Etapa 5 |
| Células — `celulas`, `CellMemberPortal` | L selecionada, R; entrada/aprovação O | Lembrete em localStorage não é fila nem comprovante. Etapa 5 |
| Diaconia — registros históricos | Sem ampliação | Aba removida por decisão explícita do proprietário em 25/09; não reintroduzir navegação, busca ou atalhos. Ver `docs/product-decisions.md` |
| Estacionamento — `estacionamento/*` | L do comprovante; R/F ocorrência | Disponibilidade e reserva definitiva O; não mostrar ocupação antiga como atual. Etapa 5 |
| Pessoas/perfil — `pessoas`, `pessoas/perfil` | L mínima, R perfil | CPF, permissões e diretório completo fora do download automático. Gestão de papéis O |
| Chat — `chat`, `chat-retention` | R; envio O inicialmente | Histórico só com autorização específica e expiração semanal local; não incluir no primeiro piloto |
| Notificações/presença — FCM, `notificacoes`, `presenca` | L dos avisos elegíveis; presença O | Cache não anuncia pessoas como online. Push não comprova sincronização |
| Conta/convites/continuidade/gestão/proprietário | O; preferências visuais locais | Ações com impacto em acesso, contratos, integrações ou comunidade exigem servidor |
| Redes e módulos desativados | Sem ampliação | Não reativar funcionalidades como efeito colateral do offline |
| Fotos/arquivos/relatórios | L por escolha; upload futuro separado | Respeitar provedor/retenção vigente, quota, cancelamento e referências; URL de arquivo não equivale a cópia disponível |

## Entregas e critérios de liberação

| Etapa | Entrega | Evidência exigida / publicação |
| --- | --- | --- |
| 1 | Origem e build rastreáveis, baseline disponível, arquitetura e matriz | Relatório e comandos reproduzíveis. Sem novo APK para documentação |
| 2 | Entrada empacotada, contexto protegido, banco e migrações | Abertura em modo avião após preparação; separação entre contas; atualização 1.7.1 sem perda; APK de homologação antes da distribuição geral |
| 3 | Leitura offline de início/agenda/minhas escalas | Testar reinício, dados expirados, cancelamento/remoção, autorização revogada e quota; novo APK/API compatível |
| 4 | Rascunhos/outbox e cadastro de visitante | Queda antes/depois do commit no servidor, resposta perdida, processo morto, reenvio, validação, conflito e troca de conta; publicação por capacidade |
| 5 | Expandir por módulos da matriz | Dois aparelhos e alterações concorrentes por módulo; disponibilizar somente blocos aprovados |
| 6 | Fluidez e usabilidade transversal | Comparação antes/depois no mesmo aparelho/rede/volume; listas, imagens, teclado, voltar, TalkBack e fonte ampliada |
| 7 | Atualização e distribuição consolidadas | Migração com fila pendente, recuperação, testes físicos, assinatura e compatibilidade antigas/novas APIs; APK, e AAB se houver canal Play |

A autorização de uma etapa inclui sua publicação quando aplicável e aprovada nos testes; não autoriza começar automaticamente a próxima. Não confundir esta numeração com `ETAPAS_5_A_9.md`, que trata de outro programa de evolução.

## Métricas e ensaio Android ainda necessário

Meta inicial proposta para homologação, não ganho já obtido: abertura local preparada p50 ≤ 2 s/p95 ≤ 3 s; tela local p50 ≤ 300 ms/p95 ≤ 700 ms; confirmação de rascunho durável p95 ≤ 500 ms. Validar se esses orçamentos são adequados ao aparelho de referência antes de torná-los critério contratual. Zero perda e zero duplicação nos cenários de falha são critérios funcionais obrigatórios.

No aparelho de referência (preferência por um modelo modesto, além de um modelo atual): registrar Android/WebView, RAM, espaço livre, versão/hash e rede. Fazer 20 repetições por cenário para p50/p95: processo frio autenticado online, processo frio offline preparado, retomada e navegação interna. Instalação nova é um cenário separado. Medir conteúdo utilizável, não somente Activity exibida. Registrar amostras brutas, falhas e tempo limite; não apagar cache/dados de usuário para simular primeira instalação.

Medir PSS após início e após 10 minutos de uso, quadros lentos, tráfego e energia em janela controlada; separar tela acesa/segundo plano e notificações. Não extrapolar números do navegador desktop. Escala de teste: 1 mil e 10 mil registros fictícios em ambiente isolado, com paginação. Nunca inserir carga fictícia em produção.

## Publicação, compatibilidade e recuperação

1. Partir do fonte Android confirmado, sem copiar builds ou reverter o web atual. A integração definitiva da PR Android é uma ação futura separada, após revisão do diff e validação conjunta.
2. Manter package e chave de produção; incrementar versionCode acima de 10. Publicar primeiro APIs compatíveis, depois APK; habilitar capacidades após homologação. Não retirar endpoints dos APKs antigos abruptamente.
3. Versão do app, protocolo, schema local e schema servidor são independentes. Guardar versões mínimas compatíveis e testar migrações sem recriação destrutiva de banco.
4. Corrigir uma versão Android ruim com APK de versionCode maior; downgrade simples pode ser impedido pelo Android e por migração do banco. Desligar uma capacidade não pode apagar a fila.
5. Reter artefato, SHA-256, certificado público, commit, CI e testes de instalação. Segredos ficam no mecanismo de CI já existente. Não colocar Firebase administrativo, senha ou chave de assinatura no pacote.
6. Gradle Wrapper com checksum, travamento/verificação de dependências e actions fixadas por SHA permanecem pendências antes da distribuição geral. O candidato de homologação ainda usa Gradle 8.10.2 instalado no CI e versões explícitas de bibliotecas, sem wrapper/lockfiles versionados; não afirmar build bit a bit reproduzível. Essa limitação não foi ocultada como tarefa concluída.

## Decisões a validar durante a etapa 2

- Prova da entrada local com a origem/cookies/ponte existentes e exclusão do prefixo no service worker.
- Definição de aparelho de referência e execução do baseline nativo antes das alterações de desempenho.
- Criptografia/índices, quota e prazos offline propostos, com critérios de erro e recuperação.
- Esquema da credencial do worker e manutenção de sessão; não habilitar sincronização em segundo plano antes disso.
- Reconciliação das descrições antigas de armazenamento com o comportamento atual antes de ampliar cópias locais de dados sensíveis.
