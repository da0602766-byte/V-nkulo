# Reforma offline — etapa 1: entrada e identidade visual

## Escopo autorizado

Primeira das três entregas propostas após a imagem enviada pelo proprietário:
entrada com funções à frente de configurações, identidade da plataforma e
status compacto. Sem mudança em armazenamento cifrado, permissões, consentimento,
expiração, filas, APIs, autenticação ou dados de produção.

## Implementação

- Seis cartões: Mural, Agenda, Minhas escalas, Meus pedidos, Visitantes e Mais
  funções. As quatro consultas abrem a aba correta e limpam apenas a busca;
  não preparam, consentem nem enviam nada automaticamente.
- Disponibilidade vinculada ao estado nativo. Conteúdo bloqueado/expirado ou
  não autorizado direciona a Gerenciar offline, sem indicação falsa de acesso.
- Cabeçalho com comunidade autorizada, removida ao bloquear/expirar; indicador
  de rede não confunde `navigator.onLine` com conectividade confirmada ao servidor.
- Última atualização e prazo de acesso resumidos. Textos de consentimento e
  limites preservados dentro da área expansível de preparação/privacidade.
- Paleta-base Moderno clara/escura da plataforma, tipografia Instrument Sans
  local (29.904 bytes, subset Latin já utilizado pela plataforma, licença OFL
  incluída) e ícones SVG locais. Sem CDN, pacote JS adicional ou nova biblioteca.
- Contraste/foco, alvos de 48 px, fonte ampliada, listas em lote, teclado e
  navegação Voltar continuam presentes.

## Limites deliberados desta entrega

O protocolo atual não transporta o tema personalizado da comunidade: nesta
primeira entrega aplica-se a paleta-base, com claro/escuro do aparelho. Sincronizar
preferência e paleta por contexto, sem reutilizar dados entre contas/comunidades,
fica para a próxima integração. A página ainda usa seções com atalhos; telas
dedicadas por módulo, proteção de preenchimento e central unificada de pendências
são etapas 2 e 3, não concluídas aqui.

## Validação

- 29 testes JavaScript locais aprovados, incluindo novos casos de atalhos sem
  consentimento, seleção de aba, perda de acesso, expiração, fontes e hierarquia.
- Playwright/Edge headless: 320, 390 e 600 px, temas claro e escuro; seis atalhos
  visíveis no viewport de teste 844 px, sem overflow horizontal, fonte 200%,
  alvos de 48 px, navegação, preparação não automática e remoção da identidade.
- Capturas locais em `.task-tools/offline-redesign-qa/`, com dados inteiramente
  fictícios de teste. Não são capturas de conta de produção ou aparelho físico.
- A inspeção das capturas detectou cabeçalho espremido a 200%, apesar de não
  haver overflow. Corrigido com quebra flexível do cabeçalho e cartões que
  passam a uma coluna quando necessário; teste agora exige largura legível.
- 35 testes web móveis e a suíte completa de 548 testes aprovados; build
  verificado e TypeScript aprovados. Nenhum código web de execução foi alterado.
- CI Android aprovado: fonte `24053ab8650d76a243e3da612296dc944c5133e8`,
  execução https://github.com/da0602766-byte/V-nkulo/actions/runs/36373706795.
  A rodada anterior detectou que o teste de título precisava distinguir a
  tela HTML da orientação nativa para WebView antigo. Captura/árvore confirmaram
  o fallback nativo funcionando; assertivas corrigidas, sem mudar o runtime.
  Também foi removido um CR final inserido no transporte do script para o
  repositório; o novo teste de LF impede que isso volte a chegar ao emulador.
  API 29 aprovada (15 testes + 5 ignorados por WebView antigo). Na API 35 houve
  uma falha intermitente do UiAutomator ao localizar o título inicial: tanto
  a captura como o XML da própria falha mostram o título correto e visível.
  Repetição apenas desse job aprovada, sem alterar fonte do APK ou relaxar
  assertivas. Resultado final: 29 JS, 8 Java, 20 instrumentados API35,
  15 aprovados + 5 ignorados API29 e três fases de atualização em cada API,
  preservando sete registros cifrados. Lint Android: 0 erros, 28 avisos.
- Candidato 1.15.0 / código 18: 621.085 bytes, SHA-256
  `1124db700bd019190af8dc8eec5a6c68b3623b335671f7f8a53db800b3b89b18`.
  Certificado original mantido: `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
  Artefato final 10950751477 da repetição API35. Estável 1.7.1 e candidato
  anterior 1.14.0 preservados. Publicação a registrar após o deploy.

Não promover para distribuição geral sem homologação física. Instalar por cima
da versão existente; não desinstalar nem limpar dados com rascunhos pendentes.
