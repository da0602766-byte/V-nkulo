# Pendências por grau de necessidade

Revisão de 24/10/2026, baseada no código local e em verificações desta tarefa.
“Sem serviços externos” significa que o desenvolvimento e a validação local
não exigem contratar ou configurar outro provedor. Não significa que toda a
plataforma funcione sem sua hospedagem e seus armazenamentos atuais.

## Grupo 1 — Crítico: proteção dos dados e dos acessos

| Trabalho | Situação atual | Critério de conclusão |
| --- | --- | --- |
| Recuperação verificável | Implementada ferramenta que reconstrói arquivo existente em outro SQLite, preserva a conta atual do proprietário e exclui acessos antigos; ensaio pelo Worker aprovado | Entrega local concluída; backup periódico completo, recuperação de mídia e homologação com base real ainda pendentes |
| Concorrência de convites | Dois defeitos reproduzidos e corrigidos: ultrapassar dez pendentes e duplicar links ativos para o mesmo e-mail | Transação única, testes de concorrência, substituição com cota cheia e rollback de auditoria aprovados; publicação pendente |
| Auditoria de comunidades e permissões | Fluxos de CPF, LOG1, contratação, cotas, convites, revogação, acesso temporário e isolamento cobertos pelo bloco de regressão executado | Completar matriz de navegação por papel em navegador e medições com volume; testes automatizados não encerram sozinhos a etapa 6 |
| Confiabilidade da validação geral | Primeira execução desta tarefa encontrou 27 testes falhando e lint com 47 erros/38 avisos em arquivos preexistentes | Diagnosticar e corrigir, preservando a intenção dos testes; não suprimir falhas para liberar publicação |

Validação do primeiro bloco: **52/52 testes críticos**, build, Worker/manifesto,
TypeScript e lint dos arquivos alterados aprovados. Comparação da suíte geral:
**789/816 antes e 792/819 depois**, com as mesmas **27 falhas** e nenhuma nova.
Os 10 testes de recuperação foram repetidos após o ajuste final da cópia SQLite
e limpeza das páginas livres, todos aprovados. Nenhuma publicação foi realizada.

As falhas gerais incluem mocks de componentes/hooks que não acompanham o código,
asserções estruturais antigas e regras de hooks/lint. Elas não equivalem a 27
defeitos funcionais confirmados. Somente os checks executados podem ser declarados
aprovados. Evidências locais em `.task-tools/priority-*-tests.log`,
`.task-tools/priority-lint.log` e `.task-tools/priority-build.log`.

## Grupo 2 — Alta necessidade: uso cotidiano e contratação

- **APK em aparelho físico:** atualização sem perder rascunhos, modo offline
  manual, perda de conexão, reconexão, retorno à aplicação e câmera/QR.
  Depende de aparelho disponível, não de novo provedor. Entrega real de push
  e retorno de provedores ficam fora deste recorte sem serviços externos.
- **Página comercial e contratação:** coerência entre recursos/ofertas/contratos,
  percurso até revisão manual, celular, teclado, foco, zoom e contraste.
- **Continuidade offline:** avaliar a indicação de validade do acesso e envios
  pendentes no painel, proposta no relatório de 13/10. Não marcar como implementada
  sem conferir a versão atual do APK e da ponte.

## Grupo 3 — Manutenção e eficiência

- **CSS:** separar gradualmente responsabilidades do arquivo global e remover
  sobreposições comprovadas, com evidência visual de cada bloco. A existência
  de arquivos CSS novos não significa que a dívida global esteja encerrada.
- **Desempenho:** medir consultas e carregamento com volume representativo,
  separando resultado local de latência real da hospedagem.
- **Indicadores:** validar os limiares da saúde de células e a classificação
  de notificações com usuários, sem tratar heurística como diagnóstico definitivo.
- **Documentação:** conciliar estados históricos contraditórios. Este inventário
  passa a orientar a ordem atual; relatórios anteriores continuam como evidência
  da data em que foram escritos.

## Fora do recorte atual

Integrações WhatsApp/Booking/Airbnb, pagamento online, geração por IA externa,
ativação/configuração de serviços Google, migração dos serviços de autenticação,
entrega real de push, leitores de placa e cancelas. MFA ainda está bloqueado pelo
contrato de provedor atual; uma alternativa local exigiria projeto específico de
autenticação e recuperação, não apenas ativar um botão.

## Ordem de execução

1. Entregar recuperação local e correções comprovadas de concorrência.
2. Sanear a validação geral e completar a auditoria funcional dos acessos.
3. Validar APK com aparelho e revisar página comercial/contratação.
4. Refatorar CSS e melhorar desempenho em blocos pequenos, medidos e verificáveis.

Não há autorização implícita neste documento para reiniciar, apagar ou restaurar
dados reais. A atualização solicitada pelo proprietário permite desenvolver e
validar os blocos; operações de recuperação reais têm alvo e procedimento próprios.
