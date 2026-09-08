# RELATÓRIO — OTIMIZAÇÃO GLOBAL SEGURA DO VÍNKULO

## Escopo e fontes oficiais

Auditoria executada em 13/08/2026 com base integral nos documentos:

- `VINKULO_PROMPT_MESTRE_OTIMIZACAO_GLOBAL_SEGURA(1).docx`;
- `VINKULO_PROMPT_IMPLEMENTACAO_MELHORIAS_MENU_VISITANTES_COMPARTILHAMENTO(2).docx`;
- `VINKULO_PROMPTS_AUXILIARES_OTIMIZACAO_E_CREDITOS(1).docx`;
- decisões complementares confirmadas pelo proprietário durante a conversa.

Foi preservada a arquitetura atual em Vinext/React, APIs internas, D1, R2, sessões, permissões e isolamento por `comunidade_id`. Nenhum dado existente foi removido e nenhuma migration foi necessária neste bloco.

## Auditoria técnica

### Áreas verificadas

- componentes públicos, login, painel comunitário e Área do Proprietário;
- rotas de páginas e APIs autenticadas;
- resolução de sessão, tenant, comunidade ativa, papéis e permissões;
- schema D1, migrations e política de retenção;
- upload e entrega de imagens pelo bucket;
- Visitantes, categorias, Ministérios, escalas e acesso temporário;
- mensagens, notificações, feed, paginação e polling;
- suíte automatizada, lint, build e artefato de hospedagem.

### Resultado da comparação

| Requisito | Estado auditado | Evidência principal |
|---|---|---|
| Menu responsivo e compacto | Implementado | menu lateral recolhido no computador, navegação móvel e testes V109 |
| Isolamento entre comunidades | Implementado | tenant resolvido no servidor e testes D1 multi-tenant |
| Categorias personalizadas de Visitantes | Implementado | CRUD, ordem por arraste, associação a Ministério e gates no backend |
| Permissões de categorias | Implementado | Proprietário, Pastor e Líder explicitamente autorizado; usuário comum bloqueado |
| Compartilhamento temporário | Implementado | pessoa, comunidade, escala, recurso, janela, status, token individual e seleção múltipla |
| Confirmação e substituição de escala | Implementado | confirmação obrigatória; “Não posso” exige substituto real do Ministério |
| Expiração e cancelamento em página aberta | Implementado | revalidação, contador e watcher de autorização |
| Histórico temporário cancelável/excluível | Implementado | aba Histórico do Ministério com permissão no backend |
| Imagens responsivas e conversão | Implementado | limite de 50 MB, conversão WebP, R2 e capas ministeriais |
| Retenção de solicitações e auditoria | Implementado | 7 dias para solicitações resolvidas; auditoria por 14 dias e 20 itens visíveis |
| Continuidade somente para dono da comunidade | Incompleto antes deste bloco; corrigido | autorização derivada de `proprietario_usuario_id`, sem herança por cargo |
| Ferramentas globais fora da comunidade | Parcial antes deste bloco; corrigido | IA Editorial e Estatísticas movidas para `/proprietario` |
| Polling somente quando relevante | Parcial antes deste bloco; corrigido | notificações e contador de mensagens pausam em aba oculta |

## Alterações realizadas neste bloco

### Segurança e permissões

- `TenantContext` agora distingue `isCommunityOwner` de `isOwner` global.
- `community.lifecycle.request` não é mais herdada por Pastor, Administrador ou Superadministrador somente pelo cargo.
- O dono cadastrado em `comunidades.proprietario_usuario_id` recebe a permissão operacional de Continuidade.
- O proprietário global preserva supervisão protegida; a revisão global continua exclusiva de `system_owner`.
- A mesma política alimenta menu e API, impedindo que acesso direto contorne a interface.

### Separação entre plataforma e comunidade

- IA Editorial e Estatísticas deixaram de ser destinos válidos de `/painel`.
- As duas ferramentas são renderizadas diretamente dentro de `/proprietario`.
- Endereços antigos do painel comunitário voltam para a visão inicial e não carregam a ferramenta global.

### Desempenho e estabilidade

- O carregamento editorial passou a usar callbacks estáveis e dependências corretas.
- Notificações cancelam requisições obsoletas com `AbortController`.
- Polling de notificações e contador de mensagens é suspenso quando a página está oculta.
- Ao voltar para a aba, os dados são sincronizados imediatamente.

## Banco de dados e migrations

- Nenhuma migration nova.
- Nenhuma coluna nova.
- Nenhum dado apagado, convertido ou reatribuído.
- A regra utiliza o campo existente `comunidades.proprietario_usuario_id`.

## Rotas e APIs afetadas

- `/painel`: não aceita mais `editorial`, `estatisticas` ou `plataforma` como módulos comunitários.
- `/proprietario`: passa a concentrar IA Editorial e Estatísticas.
- `/api/pilot/continuidade`: mantém a rota e passa a receber a permissão dinâmica do dono real da comunidade.
- `/api/pilot/notificacoes` e `/api/pilot/chat`: contrato preservado; somente a frequência de consulta do frontend foi otimizada.

## Testes e evidências

### Automatizados

- Build de produção Vinext: aprovado.
- Validação do artefato Sites: aprovada.
- Suíte D1, integração, segurança, permissões, tenant e responsividade: **101/101 aprovada**, sem falhas.
- Nova regressão cobre dono real da comunidade, bloqueio de Pastor por URL/API, isolamento entre donos, supervisão global, ferramentas globais e polling condicional.
- Lint: 0 erros; 38 avisos conhecidos de elementos `<img>` usados com URLs dinâmicas/R2.
- `git diff --check`: aprovado.

### Prévia visual local

- Landing Page carregada em 1363 px sem estouro horizontal, com banner, conteúdo e chamadas separados e legíveis.
- Login carregado em 1363 px sem estouro horizontal, com formulário completo, banner independente e hierarquia preservada.
- Acesso anônimo direto a `/painel?view=editorial` foi redirecionado para o login por ausência de sessão; nenhuma ferramenta protegida foi renderizada.
- Console sem erro da aplicação; o único registro observado pertencia à extensão interna do navegador de inspeção, não ao VÍNKULO.
- Responsividade móvel permanece coberta pelos testes estruturais específicos de menu, cartões 2x2, compartilhamento, Visitantes, login e Ministérios.

### TypeScript complementar

O build oficial usado pela aplicação é válido. A execução isolada de `tsc --noEmit`, que não faz parte dos scripts de entrega do projeto, ainda encontra dívida técnica anterior em tipos do adaptador D1/Vinext (`batch`, `changes` e estreitamento do contexto de tenant) espalhada por rotas não alteradas neste bloco. Essa dívida não foi mascarada e permanece registrada como recomendação técnica, sem falha no compilador de produção ou na suíte executável.

## Riscos de regressão e controles

- **Perda de acesso à Continuidade:** controlada por teste do dono real e supervisão global.
- **Elevação de privilégio por cargo:** controlada por teste negativo de Pastor, Administrador e usuário comum.
- **Mistura entre comunidades:** controlada por duas comunidades e dois proprietários distintos no teste D1.
- **Ferramentas globais no tenant errado:** controlada por remoção da rota comunitária e teste estrutural.
- **Polling excessivo:** controlado por visibilidade da página, cancelamento e sincronização no retorno.
- **Regressão visual:** validada em prévia local antes do checkpoint de produção.

## Pendências externas preservadas

- provedor real de IA;
- MFA homologado;
- envio automático por WhatsApp/e-mail/push;
- WebSocket para tempo real;
- pagamentos e integrações físicas.

Essas pendências dependem de serviços e credenciais externos e não foram simuladas como concluídas.

## Complemento V117 — otimizador interno da plataforma

Foi implementada uma Central de Otimização exclusiva na Área do Proprietário. O recurso possui diagnóstico antes da execução, acionamento manual, programação automática diária, semanal ou a cada 30 dias, indicação da última e da próxima execução e relatório recolhível do resultado.

O backend usa uma lista fechada de seis tarefas:

- excluir sessões vencidas;
- excluir redefinições de senha usadas ou vencidas;
- excluir solicitações de entrada já aprovadas/recusadas há mais de sete dias;
- excluir auditoria acima da retenção oficial de 14 dias;
- marcar convites pendentes vencidos como expirados;
- marcar acessos temporários cujo horário terminou como expirados, preservando o histórico.

A execução automática é disparada em segundo plano durante atividade normal da plataforma, consulta no máximo uma vez a cada cinco minutos por instância e usa trava persistida para impedir duplicidade concorrente. Configuração, execução e falhas ficam na trilha de auditoria. O recurso reutiliza `configuracoes` e `auditoria_piloto`; nenhuma migration foi necessária.

### Evidências V117

- build Vinext e artefato Sites: aprovados;
- lint: aprovado sem erros;
- suíte completa: **103/103 testes aprovados**;
- teste de integração: usuário comum bloqueado com `403`, proprietário autorizado, seis candidatos tratados e registros ativos preservados;
- `git diff --check`: aprovado;
- nenhuma instrução de exclusão de usuários, comunidades ou acessos temporários existe na rotina.
