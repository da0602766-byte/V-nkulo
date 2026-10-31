# VÍNKULO — Gestão para igrejas e comunidades

Plataforma responsiva para comunicação, organização e gestão de igrejas,
comunidades e ministérios.

## O que está implementado

- Landing Page comercial na raiz e diretório institucional de comunidades, sem feed público agregado.
- Área do Proprietário separada, com visão global, solicitações, comunidades, usuários, auditoria e configurações.
- Solicitação de nova comunidade com criação e ativação exclusivas pelo proprietário do sistema.
- Feed interno e áreas privadas isolados por comunidade.
- Autenticação, sessões, papéis e permissões validados no servidor.
- Ministérios independentes, equipes, integrantes, escalas e checklists.
- Visitantes organizados por categorias configuráveis de cada comunidade.
- Pedidos de oração e solicitações com públicos direcionados.
- Conversas privadas otimizadas entre pessoas autorizadas da mesma comunidade.
- Conta Google opcional, sem criação automática de conta, e autorização separada para o Google Drive.
- Fotos e arquivos no Google Drive ou somente no aparelho; mensagens privadas criptografadas no Drive comunitário.
- Automação editorial com política, revisão e agendamento somente para a comunidade escolhida.
- Temas claro, escuro e automático e interface adaptada para computador e celular.
- Banco D1 persistente com migrações Drizzle versionadas.

## Proteções importantes

- Nenhuma comunidade acessa dados operacionais de outra comunidade.
- O proprietário global recebe papel `SUPERADMIN` e acesso `OWNER` em todas as comunidades ativas.
- O feed público agregado, o selo pastoral e a criação direta de comunidades por pastores foram desativados.
- O módulo de redes e afiliadas permanece desativado por padrão.
- Não há processamento de pagamentos.
- MFA, geração livre por IA e notificações externas dependem de serviços externos.
- Publicações editoriais automáticas obedecem às políticas e autorizações registradas.
- Conteúdo novo não é persistido no bucket ou incorporado ao banco; o armazenamento da plataforma fica restrito a referências, preferências e metadados.

O estado técnico e as limitações atuais estão em `docs/coordenacao/ESTADO_DO_PROJETO.md`.

## Tecnologias

- TypeScript, React e Vinext.
- HTML e CSS responsivo.
- APIs no servidor.
- SQL com banco D1 e Drizzle ORM.

## Desenvolvimento local

```bash
npm run install:ci
npm run dev
```

Requer Node.js 22.13 ou superior. Os comandos funcionam em PowerShell/Windows
sem Bash; o instalador e build Linux continuam disponíveis para CI.

Antes de enviar alterações:

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` compila e valida o artefato antes de executar a suíte. Para conferir
imports sem uso, execute `npm run audit:source`: os candidatos precisam de
revisão humana antes de excluir arquivos. `outputs/`, `dist/` e diretórios de
ferramentas são locais e não entram na análise de fontes.

O ambiente hospedado aplica as migrações presentes em `drizzle/` e fornece o banco conectado.

## Documentação

Prompts de publicação, guias, relatórios e o estado do projeto estão
organizados em [`docs/`](docs/README.md).
