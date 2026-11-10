# Escopo do carregamento V — 10/11/2026

Correção solicitada após a versão 474: a tela grande não deve interromper todas as abas. Mantê-la em Visitantes, abertura/troca da comunidade e nos fluxos que já solicitavam uma tela completa.

## Causa e correção

O controlador reconhecia indicadores locais de módulos, skeletons e qualquer `data-page-loading`. Também iniciava a animação em todo documento e capturava links, formulários e navegação genérica. Isso transformava a espera normal de cada aba em uma tela bloqueante.

O controlador agora começa inativo. A chegada é ativada na abertura inicial do painel da comunidade e de Visitantes. As mudanças locais de abas não remontam o controlador. Os carregamentos completos explícitos anteriores (`VinkuloLoading`), como autenticação, troca de comunidade, atalhos com `showLoading` e fallback de página, continuam integrados. Os indicadores específicos de Visitantes também continuam reconhecidos.

Indicadores locais de módulos, consultas, skeletons, links comuns e formulários comuns não acionam a tela grande. Os controles de recuperação, foco, retorno pelo histórico, movimento reduzido e revelação de dois segundos dos fluxos permitidos foram preservados. Os ícones PWA/APK e o feedback local de chat/feed/confirmações não foram alterados.

## Validação

- 999/999 testes do site aprovados; TypeScript e build Sites aprovados.
- Oito cenários do roteiro `scripts/qa/loading-scope-qa.mjs`, incluindo 19 tipos de indicador local que não bloqueiam a página, links/formulários comuns, entrada na comunidade e navegação real para Visitantes.
- Nove botões reais de abas da comunidade percorridos, sem início de carregamento global: Fio do dia, Início, Agenda, Pessoas, Ministérios, Pedidos, Estacionamento, Células e Central da Comunidade.
- Mais 14 cenários do roteiro de transição: animação do V, espera por dados, revelação de dois segundos, recuperação/foco, histórico, troca real de comunidade e falha de troca, proprietário, movimento reduzido e acesso sem JavaScript.
- Larguras 390/768/1864 px sem overflow e sem erros de página. Todos os dados usados na prévia pertencem ao banco sintético em memória.

Base publicada: Sites 474, `b0fb4442f4afd40fbf8b0e0079352d2a32ebbf40`. Publicação e verificação posterior registradas no fechamento local.
