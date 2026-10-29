# Ações de imagens — 03/10/2026

Correção dos controles espalhados abaixo das imagens do feed. O componente agora agrupa a visualização e as três opções de armazenamento na mesma grade, isolada dos seletores antigos conflitantes. Ícones SVG do sistema existente, rótulos curtos, foco visível e botões com área mínima de 48px. Duas colunas em cartões estreitos e quatro a partir de 560px de largura disponível. O botão de download preparado ocupa a mesma posição, sem criar uma quinta ação. Demais usos de FileSaveActions mantêm seus rótulos e fluxo.

Validação: TypeScript e ESLint dos componentes aprovados; sete testes de arquivos aprovados; build verificado com Worker/manifesto aprovados. Prévia local com os componentes React reais e CSS compilado: desktop, 390px e 320px; grade sem transbordamento horizontal e controles com pelo menos 48px. Ampliação/fechamento, preparação do download e orientação de Drive desconectado conferidos. Prévia usa preferências simuladas, sem gravações em contas de produção. Captura local em `.task-tools/acoes-imagem-celular.png`.

Publicação confirmada: Sites 354, fonte `e9e00e86944cc6a964eea4035dbeaec87931fb6f`, deployment `appgdep_6ac1981966ac81919a2816f4d68b5da8`, status succeeded em 03/10/2026 às 21h05 Brasília. URL: https://adote-gestao.da0602766.chatgpt.site. Registro documental posterior ao deploy.
