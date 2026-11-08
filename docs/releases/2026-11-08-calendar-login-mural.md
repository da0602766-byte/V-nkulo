# Calendário, login e Mural — validação de 08/11/2026

Implementação da prévia aprovada pelo proprietário, preparada sobre a versão pública 468.

## Comportamento entregue

- Calendário: Mês, Semana, Dia e Agenda; busca sem acentos, filtros de responsável, origem, status e prioridade; indicadores calculados de registros, pendências sem data e conflitos.
- Tarefas persistentes em D1, separadas das fontes Evento, Escala e Compromisso. Prazo final e data agendada são campos independentes. Prioridades P1/P2/P3 e estados Planejado, Em andamento, Bloqueado e Concluído.
- Backlog com arraste e alternativa Agendar; edição lateral; reagendamento e Desfazer persistentes. Revisão otimista no servidor. Aviso de conflito considera os compromissos do responsável mesmo quando um filtro os oculta, sem revelar conteúdo privado.
- Tarefas privadas disponíveis ao criador/responsável; compartilhamento e atribuição exigem gestão. Eventos e escalas preservam suas áreas de administração. Publicação de eventos continua separada de conclusão de tarefas.
- Compromissos privados de outros usuários não são expostos à gestão pela agenda. Edições de compromissos públicos feitas por membros retornam à aprovação. Registros que cruzam a meia-noite permanecem no intervalo consultado.
- Login em coluna única, totalmente recomposto, com CPF, senha, recuperação, vínculo de CPF, convite e criação de comunidade. Autenticação real e fallback nativo preservados. Ajuda no topo, sem botão flutuante cobrindo o conteúdo.
- Introdução do Mural recolhe completamente. Controle de traço junto de Sobre esta área reabre/recolhe; reabertura manual permanece até fechar. Aviso operacional de Drive cheio continua independente.

## Persistência e compatibilidade

Migração aditiva 0095_calendar_management.sql: cria agenda_tarefas e acrescenta versao a agenda_compromissos. Sem backfill, exclusão ou alteração de dados existentes. Novo inventário de recuperação inclui tarefas; recuperação e isolamento testados. Não há dependência paga nem registros fictícios no código ou na migração de produção.

Mantidos React/TypeScript e estilos/tokens da plataforma. Grade própria permite manter os adaptadores existentes; não foram instalados FullCalendar nem plugins Premium. Horários são gravados em UTC e exibidos no fuso explicitamente indicado do dispositivo. Agenda navega por mês; consultas limitadas a 62 dias, com até 400 itens por origem. Recorrências e Timeline por recursos não fazem parte desta entrega.

## Evidências pré-publicação

- TypeScript sem erros; lint dos arquivos alterados sem erros; build ESM Worker e artefato Sites válidos.
- Suíte completa: 992 testes passaram, zero falhas (inclui Workers/D1 e recuperação).
- Navegador isolado com build real e banco fictício local: 40 casos responsivos (320, 390, 768 e 1864 px; claro/escuro; quatro modos de calendário e login), sem overflow horizontal da página ou erros JavaScript.
- Fluxos reais no ambiente local: persistência após recarregar, conflito escondido pela busca, confirmação explícita, arraste, Desfazer, compromisso pessoal, Mural com altura zero/reabertura, mostrar senha e recuperação.

Os dados de QA ficam somente no banco em memória do servidor local. A revisão posterior da publicação deve registrar URL, versão, implantação e limites da sessão autenticada em relatório separado.