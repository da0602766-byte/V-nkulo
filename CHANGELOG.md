# Histórico de versões

Registro cronológico do que foi publicado. Cada entrada resume a mudança e
aponta para o relatório detalhado, quando existe.

Antes deste arquivo, o histórico vivia espalhado em dezenas de documentos por
versão dentro de `docs/relatorios/` e `docs/prompts/`, além das seções de
"último bloco concluído" em `docs/coordenacao/ESTADO_DO_PROJETO.md`. Aqueles
arquivos continuam sendo a fonte detalhada — este é o índice por onde se
começa.

As decisões vigentes (o que é público, quem cria comunidade, o que está
desativado de propósito) **não** ficam aqui: continuam em
`docs/coordenacao/ESTADO_DO_PROJETO.md`.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

### Adicionado

- **Verificação em duas etapas (TOTP), sem serviço externo.** O projeto
  registrava MFA como dependência de terceiro e a aprovação crítica de
  continuidade devolvia 423 por causa disso. O TOTP do RFC 6238 é HMAC-SHA1
  sobre um contador de tempo, calculado no próprio Worker
  (`app/lib/totp.mjs`, validado contra os vetores oficiais do RFC), e
  funciona com qualquer aplicativo autenticador. Inclui cadastro por QR Code,
  dez códigos de recuperação de uso único, anti-replay por passo e segredo
  cifrado em AES-GCM (migração `0072`). Nova API em `/api/conta/mfa`.
- **Aprovação de reativação de comunidade**, agora protegida pelo segundo
  fator. Cancelamento e desativação continuam bloqueados, mas pelo motivo
  real: não existe estado de destino definido para uma comunidade cancelada e
  a política de retenção proíbe exclusão automática de denúncias, evidências e
  auditorias. Definir esse desfecho é decisão do proprietário.
- **Aba "Saúde técnica" na Área do Proprietário**: taxa de erro, volume por
  hora e as rotas que mais falham, nas últimas 24 horas ou 7 dias. O log
  estruturado tornou visível uma falha por vez; esta é a contagem consultável
  que responde "a taxa de erro subiu?" (migração `0073`). Guarda contagem,
  nunca conteúdo — a rota entra com os identificadores trocados por `:id`,
  então a tabela não vira rastro de navegação.
- `app/lib/base64url.mjs` e `app/lib/owner-access.ts`, extraídos de cópias que
  estavam embutidas em `google-integration.ts` e `api/proprietario/route.ts`.

### Anterior nesta rodada

- **Limite de requisições por origem na autenticação.** Nova tabela
  `limites_autenticacao` (migração `0071`) e `app/lib/rate-limit.ts`, aplicados
  em login, cadastro, esqueci-senha, redefinir-senha e primeiro-acesso. O
  bloqueio que já existia era por conta (3 erros de senha na mesma conta) e não
  enxergava uma origem varrendo muitas contas diferentes, enumerando e-mails
  pelo 409 do cadastro ou testando tokens de redefinição em série. O IP entra
  na tabela apenas como SHA-256 combinado com o `AUTH_SECRET`, nunca em texto.
- **Registro estruturado de eventos** (`app/lib/logger.mjs`): uma linha JSON
  por evento, com redação automática de e-mail, senha, token, cookie, telefone
  e IP. O `catch` global do Worker deixou de engolir os erros 500 em silêncio,
  e as rotinas de manutenção (otimizador e retenção de mensagens) passaram a
  registrar suas falhas.
- **Integração contínua** em `.github/workflows/ci.yml`: lint, build,
  verificação de tipos e a suíte completa a cada push e pull request. Até
  aqui essa validação dependia de alguém lembrar de rodá-la à mão.
- Scripts `npm run typecheck` e `npm run test:nobuild`.
- `CONTRIBUTING.md` com ambiente, ordem de validação, convenções de teste,
  migrações e commits.
- Este `CHANGELOG.md`.

## [V4.9.0] — 2026-08-31

Conta Google e privacidade de armazenamento.

- Login Google separado da autorização do Google Drive; nenhuma conta é criada
  automaticamente e o usuário pode revogar o vínculo.
- Fotos e arquivos passam a viver no Drive autorizado ou somente no aparelho;
  a plataforma guarda apenas referências, preferências e metadados.
- Conversas privadas gravadas como arquivos criptografados no Drive
  comunitário, com migração segura do histórico legado (cópia validada antes
  de qualquer exclusão).
- Migração `0060_google_drive_privacy.sql`.
- Validação registrada: TypeScript sem erros, build e artefato aprovados,
  222/222 testes.

Detalhes em `docs/coordenacao/ESTADO_DO_PROJETO.md` e
`docs/guias/GOOGLE_DRIVE_SETUP.md`.

## [V4.8.0] — 2026-08

Redesign visual.

- Tokens violeta, superfícies claras e modo escuro declarados no `<html>`.
- Bricolage Grotesque, Instrument Sans e IBM Plex Mono via `next/font`.
- Painel desktop com barra superior de 60 px, busca por `⌘K` e sidebar de
  236 px agrupada por Principal, Comunidade e Gestão, filtrada pelas
  permissões reais.
- Navegação móvel com cinco destinos: Início, Comunidade, Agenda, Pedidos e
  Menu.
- Tela inicial convertida em "fio do dia".

Detalhes em `docs/coordenacao/REFORMA_VISUAL_V5.md`.

## [Pedidos V213] — 2026-09-05

Reconstrução da aba Pedidos sobre a versão 217, autorizada pelo proprietário.

- Espaço do membro ("Meus pedidos"), criação de oração/visita, histórico
  próprio e acompanhamento sem exposição de notas internas.
- Painel operacional com pesquisa, filtros, prioridade, responsável, retorno,
  agenda de visita, histórico e notas internas.
- Permissão explícita `requests.manage`, sem concessão automática por cargo.
- Migração `0067_request_care_operations.sql`.
- Validação registrada: lint e TypeScript sem erros, build aprovado,
  289/289 testes.

## Versões anteriores

O histórico anterior está nos relatórios por bloco, entre eles:

| Documento | Assunto |
| --- | --- |
| `docs/relatorios/RELATORIO_IMPLEMENTACAO_VINKULO_2026-08-08.md` | Implementação inicial do Vínkulo |
| `docs/relatorios/RELATORIO_VISITANTES_V118_2026-08-13.md` | Módulo de Visitantes |
| `docs/relatorios/RELATORIO_OTIMIZACAO_GLOBAL_SEGURA_2026-08-13.md` | Central de Otimização |
| `docs/relatorios/AUDITORIA_ENDPOINTS_LEGADOS_2026-09-08.md` | Encerramento de endpoints legados |
| `docs/relatorios/RELATORIO_PERFORMANCE_2026-09-08.md` | Desempenho |
