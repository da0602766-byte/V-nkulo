# Revisão comercial e contratação — 24/10/2026

Base: Sites 431. Publicação autorizada pelo proprietário após validação. APK físico adiado.

## Correções

- Aceite vinculado ao token, plano e versão da proposta. Trocar de plano desmarca a confirmação; mudança de versão não reaproveita aceite anterior. O envio verifica o campo real, sem inventar aceite.
- Solicitação LOG1 e contratação bloqueiam reenvio concorrente e edição dos dados durante a requisição. Erros e confirmação recebem foco, com anúncio acessível e dados preservados na falha.
- Termos e privacidade nos formulários abrem em nova aba, com indicação textual, para preservar o preenchimento. Validade do link exibe horário de Brasília de forma consistente no servidor e navegador.
- Página inicial oferece caminho ao catálogo. A prévia dos planos continua exclusiva do proprietário, e sua chamada de solicitação aponta ao LOG1. A chamada de configurar planos mantém a área administrativa.
- Retirados números de igrejas, membros, retenção, avaliação e depoimentos estáticos sem origem verificável no código. O destaque comercial deixou de ser chamado de “Mais popular”. Nenhum preço ou condição comercial foi inventado ou modificado.

## Evidências

Três regressões de componente falharam no código anterior e passaram após as correções. A suíte completa passou: **859/859 testes**, TypeScript e build aprovados, lint **zero erros e 38 avisos preexistentes**; diff sem problemas de espaços. Logs em .task-tools/commercial-{tests,types,build}.log e commercial-lint.json.

O teste integrado altera um plano entre abertura e envio: a versão antiga recebe 409, falta de aceite recebe 400, o link permanece utilizável e o contrato aprovado para análise guarda preço, duração e condições da versão atual. Nenhuma conta é criada antes da aprovação. Casos existentes cobrem expiração, revogação, concorrência, uso único e isolamento. Não foi necessário alterar o servidor, esquema ou dados de produção.

Navegador com banco fictício em memória: página inicial → catálogo → LOG1; proposta com duas opções, nome longo, mudança por seta do teclado e desmarcação do aceite. LOG1 e proposta conferidos em 390/768/1864 px; reflow da proposta também em 320 px. Sem rolagem horizontal da página nos tamanhos medidos. Campos a 16 px, ação principal com alvo superior a 44 px, foco visível e temas claro/escuro inspecionados. Nenhum erro de console no percurso. Envio completo coberto pelo Worker em teste isolado, sem contratar em produção.

## Limites e continuidade

Verificação visual e de contraste amostral, sem certificação integral de acessibilidade; zoom nativo e leitor de tela ainda precisam de avaliação específica. O reflow a 320 px não equivale a testar o zoom do navegador. Não foram acionados pagamentos, mensagens, serviços externos ou aparelho físico. Próximo bloco independente: continuidade offline (validade de acesso e envios pendentes), preservando o adiamento do APK físico.

## Publicação

Publicado no Sites 432 em 24/10/2026 às 17h00 (Brasília), status succeeded. Fonte 39abe090768eb19dcfdd390bdb70f721c894e4a5; deployment appgdep_6add0e609b0881918fd357eed8e233d2; URL https://adote-gestao.da0602766.chatgpt.site. Audiência pública preservada, sem migração ou alteração de dados reais. Registro documental posterior ao deploy.
