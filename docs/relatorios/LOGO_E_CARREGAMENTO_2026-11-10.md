# Logo e carregamento do Vínkulo

Implementação local em 10/11/2026. **Sem publicação.**

## Estratégia implementada

1. Usar o PNG transparente enviado pelo proprietário como marca oficial. O arquivo já continha canal alfa; o desenho e suas cores foram preservados. A URL versionada `/vinkulo-symbol-v2.png` evita reutilizar o quadrado antigo do cache.
2. Centralizar a apresentação em `VinkuloMark`, com fundo transparente, sem borda, sombra ou recorte arredondado. A marca é renderizada no HTML inicial e pré-carregada. Login, acesso e console do proprietário, cabeçalhos públicos e espaços da comunidade compartilham o componente.
3. Manter uma única camada global de carregamento no layout. A própria letra V se desenha em tamanho grande: primeiro o braço esquerdo desce, depois o direito sobe. Uma flutuação suave acompanha o desenho e um brilho fica restrito à transparência da arte. O ciclo se repete enquanto houver espera. Os carregadores de entrada, Suspense e das áreas sinalizam quando ainda há trabalho pendente.
4. Esperar a página e seus carregadores de primeiro plano. Usar uma espera mínima de 1.800 ms para que o V possa completar seu desenho mesmo com a página em cache. Após a prontidão, mover o símbolo até uma marca realmente visível no cabeçalho ou menu e revelar o conteúdo durante **2.000 ms**. O período de rede necessário se soma à transição; o relógio não declara os dados prontos.
5. Usar a mesma camada em links, formulários nativos, login, entrada em áreas e troca de comunidade. A troca de comunidade preserva a navegação de documento completo, para que o servidor reavalie sessão, permissões e contexto.
6. Preservar o feedback local de comentários, salvamentos, paginação e atualizações periódicas. Esses trabalhos não iniciam a animação global.
7. Atualizar favicon, manifesto PWA, imagem das notificações e página offline; manter as URLs antigas de imagens também com a arte transparente. Versionar os caches públicos do service worker.

## Defeitos encontrados e corrigidos

- O PNG anterior era opaco; a marca agora usa o original com transparência real.
- Estilos anteriores colocavam moldura, fundo, sombra e cantos arredondados no carregamento. Essas regras foram removidas. Os estilos específicos da marca impedem que regras de imagens comuns voltem a enquadrá-la.
- `SafeImage` deixava a marca invisível até a hidratação. A imagem local da marca agora pode aparecer diretamente no HTML inicial.
- Carregamentos separados competiam entre si, e a troca de comunidade tinha um indicador diferente. Uma única camada acompanha os sinalizadores de prontidão.
- A troca de comunidade podia esperar indefinidamente. A requisição agora possui limite de 20 segundos e mensagem de falha; impede também repetir a comunidade ativa ou iniciar outra troca enquanto a primeira está pendente.
- O console do proprietário não tinha uma marca visível no cabeçalho móvel. O V foi acrescentado nesse cabeçalho.
- O aviso automático de armazenamento podia abrir como diálogo nativo acima da animação. Sua abertura agora aguarda o fim do carregamento.
- Links para âncoras, downloads, outros destinos e cliques com modificadores preservam seu comportamento.
- O retorno pelo cache do navegador libera a camada de saída. Observadores, eventos, temporizadores, animações e atributos temporários possuem limpeza.
- Esperas acima de 25 segundos oferecem nova tentativa ou retorno à tela. Sem JavaScript, a camada não bloqueia o formulário; se a hidratação não acontecer, uma proteção no HTML libera a tela após 25 segundos.
- A preferência por movimento reduzido elimina o desenho progressivo, a flutuação, o brilho e o deslocamento, preservando a marca completa e a revelação suave. Na ausência de uma marca visível, a logo se dissolve no centro.

## Verificação realizada

- Compilação de produção local concluída com `vinext build`.
- Artefato validado: manifesto JSON e exportação ESM `default.fetch` presentes.
- TypeScript sem erros; lint dos componentes e utilitários alterados sem ocorrências.
- 106 testes de regressão aprovados: login, proprietário, navegação, recuperação, concorrência das leituras, ciclo de carregamento, comunidades, imagens e Visitantes.
- Os 14 testes de ciclo de vida/navegação também passaram após atualizar o ambiente simulado para conferir o novo evento de início do carregamento.
- QA de navegador com Edge, banco exclusivamente em memória e usuários sintéticos. Nenhum erro de JavaScript registrado.
- Login, acesso do proprietário e página pública em larguras de 390, 768 e 1864 px: marca carregada, transparente, sem arredondamento e sem rolagem horizontal.
- Console do proprietário em 390 e 1864 px com destino visível para a marca.
- Troca real de sessão entre duas comunidades e falha simulada de troca, com liberação da tela atual.
- Teste com relógio controlado: aguarda os dados e mantém a revelação por pelo menos 2.000 ms. No navegador real, a animação de deslocamento tem 2.000 ms e o conteúdo tem transição de opacidade de 2 s.
- Recuperação de espera prolongada, restauração do foco, links de âncora, retorno pelo cache do navegador, movimento reduzido e login sem JavaScript.
- Transparência verificada no PNG oficial e nas versões legadas de 192 e 512 px.
- Após o pedido para animar o próprio V: build, tipos, lint, 24 testes de regressão e 14 cenários de navegador passaram. Capturas em três momentos confirmam que os braços se desenham progressivamente; o brilho usa a mesma arte como máscara. A transição até o cabeçalho continua com 2 segundos. Nenhum erro de JavaScript no QA.
- Prévia em GIF do ciclo de carregamento: `outputs/logo-transition/v-animado.gif`, renderizada a partir da implementação CSS real. O GIF é apenas para revisão; o site usa CSS e a imagem transparente original.

A suíte completa terminou com **961 testes aprovados em 964**, e três falhas já presentes em `tests/visitor-sheets-ui.test.mjs`: seu `require` simulado rejeita `../lib/google-authorization-client`, importado por `VisitorSheetSettings.tsx`. Nenhum desses dois arquivos foi alterado nesta tarefa. Essa limitação da suíte de Planilhas/Google permanece registrada; não se declara a suíte inteira aprovada.

Scripts reproduzíveis: `scripts/qa/logo-transition-preview.mjs` e `scripts/qa/logo-transition-qa.mjs`. O QA aceita o caminho do Playwright em `VINKULO_PLAYWRIGHT_MODULE`. Capturas e resultados ficam em `outputs/logo-transition/`; os logs de build, tipos, lint e regressão ficam em `outputs/logo-*.log`.

## Limites e publicação

Os testes visuais foram executados no Edge com tamanhos de tela emulados. Não equivalem a uma validação de todos os aparelhos físicos ou de todos os navegadores. O trabalho foi feito no site; nenhum APK foi recompilado. Uma instalação já existente pode depender da atualização do manifesto pelo sistema para renovar seu ícone externo.

As mudanças estão somente no workspace. A publicação depende de autorização explícita do proprietário. Alterações anteriores do workspace foram preservadas.
