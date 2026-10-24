# Pendências por grau de necessidade

Revisão de 24/10/2026, baseada no código local e em verificações desta tarefa.
“Sem serviços externos” significa que o desenvolvimento e a validação local
não exigem contratar ou configurar outro provedor. Não significa que toda a
plataforma funcione sem sua hospedagem e seus armazenamentos atuais.

## Grupo 1 — Crítico: proteção dos dados e dos acessos

| Trabalho | Situação atual | Critério de conclusão |
| --- | --- | --- |
| Recuperação verificável | Implementada ferramenta que reconstrói arquivo existente em outro SQLite, preserva a conta atual do proprietário e exclui acessos antigos; ensaio pelo Worker aprovado | Entrega local concluída; backup periódico completo, recuperação de mídia e homologação com base real ainda pendentes |
| Concorrência de convites | Dois defeitos reproduzidos e corrigidos: ultrapassar dez pendentes e duplicar links ativos para o mesmo e-mail | Transação única, testes de concorrência, substituição com cota cheia e rollback de auditoria aprovados; publicado no Sites 429 |
| Auditoria de comunidades e permissões | Matriz por perfil concluída neste recorte; corrigidos privilégios globais legados e gestão indevida de hierarquia. 849/849 testes e navegador com seis perfis aprovados; ver AUDITORIA_ACESSOS_2026-10-24.md | Medições com volume e validações externas permanecem separadas; publicação do bloco em preparação |
| Confiabilidade da validação geral | Bloco 2 publicado no Sites 430: 826/826 testes, TypeScript/build aprovados e lint com zero erros/38 avisos | Mocks e verificações históricas atualizados; carregamentos, preferências e referências corrigidos sem desativar regras; publicado no Sites 430 |

Validação do primeiro bloco: **52/52 testes críticos**, build, Worker/manifesto,
TypeScript e lint dos arquivos alterados aprovados. Comparação da suíte geral:
**789/816 antes e 792/819 depois**, com as mesmas **27 falhas** e nenhuma nova.
Os 10 testes de recuperação foram repetidos após o ajuste final da cópia SQLite
e limpeza das páginas livres, todos aprovados. Primeiro bloco publicado no Sites
429, fonte `25621f96d8b9e52d08052b464bc18e18d7dd1311`.

As falhas gerais incluem mocks de componentes/hooks que não acompanham o código,
asserções estruturais antigas e regras de hooks/lint. Elas não equivalem a 27
defeitos funcionais confirmados. Somente os checks executados podem ser declarados
aprovados. Evidências locais em `.task-tools/priority-*-tests.log`,
`.task-tools/priority-lint.log` e `.task-tools/priority-build.log`.

Segundo bloco publicado no Sites **430**, fonte `08d9cd2afa7bff7e12b8cae0bad22956a76f2276`,
deployment `appgdep_6add0604ed508191be9981e4884fbb85`, confirmado em
24/10/2026 às 16h25 (Brasília). URL: https://adote-gestao.da0602766.chatgpt.site.
Este registro documental é posterior ao deploy.

Segundo bloco: eliminadas as 27 falhas anteriores e os 47 erros de lint.
Sete novos testes verificam snapshot de servidor, sincronização de preferências,
armazenamento bloqueado, resposta atrasada, recuperação de erro e mudança de
comunidade. Favoritos, menu e larguras de colunas usam assinaturas do armazenamento;
carregamentos iniciais não repetem os resets das ações manuais. Consultas de abas
cancelam respostas substituídas e fichas descartam históricos obsoletos.

Validação final: **826/826 testes**, **zero erros/38 avisos de lint**, TypeScript,
build e Worker/manifesto aprovados. Executar os testes que importam `dist/` **após**
o build, nunca enquanto ele reconstrói o diretório. O simulador Workers/D1 requer
acesso ao localhost. Evidências em `.task-tools/block2-verified-tests.log`,
`block2-final-lint.json`, `block2-types.log` e `block2-final-build.log`.

Prévia de Visitantes com banco fictício em memória conferida em **390, 768 e
1864 px**: vários registros, busca com um resultado, vazio, ficha/histórico,
seleção limpa ao trocar filtro, teclado para redimensionar colunas, restauração
e persistência do menu/colunas após recarregar. Sem overflow horizontal da página
ou erros de console nesse percurso. Isso não substitui a matriz completa de
perfis em todas as telas nem os testes em APK físico.

## Grupo 2 — Alta necessidade: uso cotidiano e contratação

- **APK em aparelho físico — adiado por pedido expresso em 24/10/2026:** atualização sem perder rascunhos, modo offline
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
3. Revisar página comercial/contratação; retomar APK físico quando solicitado.
4. Refatorar CSS e melhorar desempenho em blocos pequenos, medidos e verificáveis.

Não há autorização implícita neste documento para reiniciar, apagar ou restaurar
dados reais. A atualização solicitada pelo proprietário permite desenvolver e
validar os blocos; operações de recuperação reais têm alvo e procedimento próprios.
