# Reforma offline — etapa 3: central de pendências

## Escopo e implementação

Autorização do proprietário: “Pode Prosseguir”, após a etapa visual 2.
Candidato 1.17.0/code20, sem promoção do estável 1.7.1. A entrega reúne trabalho
local em uma tela; não muda banco/schema, cifra, APIs, payloads, permissões ou
estados das filas. Não toca em registros de produção.

- Atalho no início com resumo dos módulos acessíveis. Tela dedicada e filtros
  Tudo, Revisão, Na fila, Rascunhos e Confirmados, com retorno ao módulo.
- Rascunho não é envio; tentativa não é confirmação; recibo aparece somente
  para estado CONFIRMED. Resultado desconhecido orienta não recriar o envio.
- A projeção nativa consulta as filas existentes com autorização individual
  válida de conta/comunidade/sessão e prazo. Módulo bloqueado não expõe títulos,
  registros ou contagens. Consulta parcial é indicada, não apresentada como
  ausência absoluta de pendências. Sem segundo banco/cache persistente.
- Ponte restrita à origem oficial, página local e frame principal, somente
  status/sync com dois campos, limite de mensagem e ID. Não devolve payload
  completo, contatos, tokens ou binding. Conteúdo renderizado como texto.
- “Atualizar lista local” não usa rede. “Tentar sincronizar fila” pede confirmação
  e agenda somente workers existentes para PENDING/RETRY/SENDING com acesso de
  escrita. Nunca coloca DRAFT na fila, reenvia recusas/conflitos ou habilita
  escrita de Células. Os workers mantêm UUID/recibo e validação de servidor.
- Expiração, bloqueio e segundo plano limpam a exibição. Respostas atrasadas são
  descartadas; timeout libera nova consulta sem alegar que um envio foi cancelado.
  Atualização local a cada 15 segundos apenas com a central aberta/visível.
- Paleta e tipografia seguem a etapa 2. Não baixa imagens nem adiciona framework.

## Validação local

39 testes JavaScript aprovados (cinco novos da central), 549 testes web e
TypeScript aprovados. Playwright/Edge com fixtures em 320/390/600 px, claro/escuro,
texto 200%, alvos de toque >=48 px, sem rolagem horizontal. Filtros, cancelamento
e confirmação de tentativa, recibo, acesso bloqueado e navegação testados.
102 capturas em `.task-tools/offline-redesign3-qa/`, com revisão visual.
Nenhuma conta real usada nesses testes.
Build verificado aprovado. Lint do fonte (excluindo dist/.next, conforme script
do projeto) sem erros, com 46 avisos preexistentes. Uma execução exploratória
incluiu dist por engano; seus diagnósticos de código gerado não são do fonte.

## Android e publicação

CI aprovado. Fonte Android `c44fac93dabbe725463b849da9754051358d6351`, workflow
https://github.com/da0602766-byte/V-nkulo/actions/runs/36426415596.
39 JS e 8 Java aprovados. API35: 25 instrumentados aprovados; API29: 19 aprovados
e seis ignorados por WebView antigo. XMLs sem falhas/erros. Inclui projeção mínima,
leitura sem mutação dos bytes cifrados, isolamento, expiração, limitação de
agendamento, contatos omitidos, Células sem envio e ponte/filtros/bloqueio reais.
Captura `pending-review` do emulador revisada. Três fases de atualização
1.16→1.17 passaram em cada API, preservando sete registros cifrados.
Cadeia de releases assinados desde 1.7.1 passou, sem reinstalação intermediária
nessa verificação. Build com dependências estritas e lint Android aprovados.

Artefato API35 `10970649998`, 630.444 bytes, SHA-256
`f257a406776c1853b4eb2489baa8dbf966f35748b29958faf8051e20f46c1208`.
Certificado original `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
Relatórios/capturas API35 `10971811385` e API29 `10971703007`.
Estável 1.7.1 e candidatos anteriores preservados. Manifesto e hash local
verificados; publicação e conferência do download público serão registradas
após o deploy.

Homologação física com sessão real, TalkBack, dois aparelhos, rede instável,
OAuth/push/anexos e desempenho/bateria continua pendente. As três entregas
visuais não encerram esse gate da etapa 7 original. Instalar por cima, sem
desinstalar, limpar dados ou fazer downgrade enquanto houver trabalho pendente.
PR16 permanece em rascunho, sem mesclar a base web histórica.
