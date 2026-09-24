# Etapas 5 a 9 — evolução do Vínkulo

Revisão inicial em 24/09/2026. Este documento registra o escopo solicitado e os critérios de conclusão; não declara as etapas implementadas.

## Base preservada

- Central de integrações e Supabase existentes.
- Firebase/Android 1.7.1 implementado; proprietário confirmou funcionamento na sessão `01a0cebf-a5db-79b1-ac7d-b481c7d763fa`.
- Dashboard operacional entregue na versão 303, com atualização a cada 30 segundos.
- Correção PWA/chat publicada na versão 304 conforme relatório; confirmação posterior no aparelho ainda não registrada.
- CPF, LOG1, convites e planos já implementados. Revisar estes fluxos atuais em vez de retomar cadastro público antigo.

## 5 — Integrações visuais

Estado: revisão iniciada. Prioridade entre WhatsApp Business, Booking.com e Airbnb solicitada ao proprietário. O catálogo atual mantém esses conectores indisponíveis.

Entregar um conector por vez com preparação, conexão, teste, ativação, pausa/desconexão e diagnóstico pela interface. Mostrar escopo, permissões, última verificação e consequências da desconexão. Credenciais ficam no servidor. Falhas devem preservar a configuração anterior e orientar a recuperação. Acesso real à API e conta do provedor precisam ser confirmados antes da ativação.

Achado corrigido localmente: o teste Supabase utilizava `redirect: "error"`, incompatível com Request do Workers. Alterado para `manual`; respostas 3xx continuam rejeitadas pelos verificadores dos serviços. O teste novo usa Request nativa no Miniflare e criptografia real com chaves fictícias. Reproduziu a falha antes da correção e passou depois, cobrindo Auth, configurações públicas, REST e Storage. Nenhuma chamada a contas reais.

Validação desse bloco: build e artefato Sites aprovados; oito testes direcionados aprovados, incluindo exclusividade do proprietário, proteção dos segredos e estados do catálogo. Publicação não realizada nesta revisão.

Critério de encerramento: conectar, testar, ativar e desconectar a API escolhida pela interface, com falhas e permissões verificadas; validar a conexão real com autorização da conta correspondente.

## 6 — Comunidades

Estado: revisão completa ainda pendente. O código já contém os fluxos de acesso controlado.

Auditar entrada por convite individual e coletivo, aprovação, recusa, expiração, revogação, cotas, conta existente, perfis e troca de comunidade. Conferir a matriz membro/líder/pastor/administrador/proprietário em consultas e mutações. Medir paginação, busca e navegação com volume representativo em banco descartável.

Critério de encerramento: nenhum papel acessa dados ou ações de outra comunidade; limites de convite e plano se mantêm em concorrência; navegação validada no celular e desempenho medido antes/depois.

## 7 — Logins e segurança

Estado: segundo fator continua sem provedor implementado em `external-access-providers.ts`.

Revisar recuperação, associação CPF de contas existentes, Google, sessões revogadas, troca de contas e retorno nativo. Implementar segundo fator com cadastro, confirmação, desafio, limite de tentativas, recuperação e desativação protegida. Preservar acesso recuperável do proprietário e não confundir senha reconfirmada com segundo fator.

Critério de encerramento: sucesso e falhas testados no navegador e APK; recuperação exercitada; APIs protegidas também quando chamadas diretamente. Testes de navegador não substituem ensaios do APK em aparelho.

## 8 — Landing page

Estado: apresentação e planos já existem; auditoria comercial e medições ainda pendentes.

Revisar coerência entre ofertas publicadas, contratos e chamadas para contratação. Preservar o fluxo controlado LOG1. Medir carregamento, acessibilidade, navegação por teclado, zoom, temas e formulário em telas pequenas. Corrigir problemas encontrados com comparação antes/depois.

Critério de encerramento: contratação completa pelo celular com dados de homologação, textos coerentes com os recursos disponíveis, ausência de transbordamento e medições registradas.

## 9 — Desempenho e operação

Estado: dashboard e otimizações anteriores existentes; ensaio completo de restauração não comprovado.

Medir consultas, imagens e carregamento em fluxos reais; estabelecer diagnóstico de falhas e agendamentos. Definir inventário de dados, retenção e procedimento de backup/restauração. Executar restauração em ambiente isolado e verificar integridade, vínculos e recuperação do acesso. Organizar versão, assinatura, instalação e reversão do APK.

A sincronização Supabase atual copia comunidades, perfis mínimos e vínculos. Senhas, sessões e permissões especiais ficam no D1. Ela não equivale a backup completo. O JSON de reinicialização também não possui restauração automática, conforme `docs/REINICIAR_PLATAFORMA.md`.

Critério de encerramento: desempenho comparado antes/depois, restauração isolada bem-sucedida e documentada, monitoramento verificável e procedimento reproduzível de atualização do APK.
