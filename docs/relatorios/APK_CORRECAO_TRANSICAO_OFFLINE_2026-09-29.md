# APK Android — correção da transição para o modo offline

Data: 29/09/2026. Candidato: 1.19.0 (`versionCode 22`).

## Falha reproduzida pelo usuário

Com o aplicativo aberto na plataforma online, desligar a internet podia deixar
visível a página padrão de erro do WebView em `/painel` (`net::ERR_FAILED`) em
vez do espaço local do Vínkulo.

## Causa

No candidato 1.18.0, o callback de perda de rede apenas atualizava o estado
quando a página local já estava aberta. A troca de `/painel` para a página
empacotada dependia de um erro de navegação e de o Android já ter removido a
capacidade `VALIDATED` naquele mesmo instante. Durante a transição, essas
ocorrências podem chegar em outra ordem. Um toque em ação online ou uma
notificação também podia tentar carregar a plataforma sem rede.

## Correção

- A Activity reconcilia mudanças nas capacidades e perda da rede padrão com o
  estado atual do Android; sem internet validada, abre o espaço local mesmo
  quando o usuário já está em `/painel`. Uma segunda conferência após `onLost`
  cobre o breve atraso na atualização da rede ativa.
- Erro do quadro principal sem internet abre o espaço local. Com internet
  validada, uma página local distinta explica a falha do sistema e oferece
  nova tentativa, sem mostrar o erro padrão do WebView nem chamar a falha do
  servidor de ausência de internet. Se um WebView antigo ficar preso em um
  carregamento parcial sem emitir erro, a mesma página aparece após 20 segundos.
- Ações online tocadas sem rede ficam no espaço local. Uma notificação tocada
  nesse estado mantém seu destino seguro para a reconexão. A navegação Voltar
  no início offline não reabre a página online quebrada.
- O retorno ao sistema online continua respeitando a confirmação de descarte
  de alterações não salvas nos formulários locais. Não há mudança em cifra,
  permissões, banco, payloads nem no envio de filas.

## Validação

- Testes JS do leitor local: 39/39 aprovados no checkout de desenvolvimento.
- O teste instrumentado `NetworkTransitionTest` liga a rede, abre a plataforma,
  desliga Wi-Fi e dados móveis com o app aberto, verifica a página local e a
  ausência do erro do WebView, então reconecta e verifica o retorno online.
- A CI [36596425395](https://github.com/da0602766-byte/V-nkulo/actions/runs/36596425395)
  passou nas APIs 29 e 35. O teste de perda e recuperação da conexão com o
  app aberto passou em ambos os emuladores, além da atualização direta de
  1.18.0 para 1.19.0 sem perda dos registros cifrados de teste, da cadeia
  de APKs desde a estável e dos demais testes Android.
- O APK de homologação tem 633037 bytes e SHA-256
  `5de256f4a31de275c7656ed05013e205a32d0c9907d44dcd2a1fa640c7154cc3`.
  A CI confirmou o certificado original SHA-256
  `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
  Código-fonte Android: `f299d2b70b20c939b0c030c31af3c9310c27b678`.

Publicação do download público: pendente nesta fase.

A versão geral 1.7.1 permanece separada; homologação em aparelhos físicos e
decisão de promoção continuam pendentes.
