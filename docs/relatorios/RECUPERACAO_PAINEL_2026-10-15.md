# Recuperação do painel após falha de conexão

## Evidência e diagnóstico

A falha original apareceu como `net::ERR_FAILED` no navegador, ao recarregar `/painel?view=visitantes&google=connected`. Os registros disponíveis não demonstram uma resposta 500 dessa navegação. Reabertura e recarregamentos posteriores tiveram sucesso. Não foi possível atribuir retrospectivamente o incidente a uma única causa.

A investigação do service worker encontrou e reproduziu dois defeitos independentes:

1. Se `fetch(request)` rejeitasse e `/offline.html` não estivesse no cache, a promessa entregue a `respondWith` resolvia com `undefined`. O navegador exige uma `Response`; isso produz um erro de rede, em vez da página de recuperação.
2. O carregamento de scripts e estilos dependia de `caches.open` e `cache.match` antes da rede. Uma falha no armazenamento impedia uma resposta de rede saudável.

Também havia dependência de todos os arquivos do `cache.addAll` para instalar o worker, incluindo a página inicial dinâmica, e nenhuma duração máxima para a tentativa de navegação.

Referências: [contrato de respondWith](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/respondWith), [falhas de cache.addAll](https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll).

## Correção

- Uma nova tentativa apenas para navegações GET com falha de transporte ou HTTP 502/503/504; cada tentativa tem limite de 12 segundos.
- Resposta HTML 503 válida e não armazenável, inclusive com cache vazio ou inacessível. O botão tenta o endereço atual, preservando a área Visitantes.
- Rede independente do cache para scripts e estilos; falhas de escrita no cache não interrompem a resposta. Atualizações de recursos ficam vinculadas ao tempo de vida do evento.
- Instalação tolera arquivos estáticos ausentes e armazenamento indisponível. A página inicial e o HTML autenticado não são armazenados.
- Limpeza dos caches antigos tolerante a falhas, seguida de ativação do worker corrigido.
- Textos de recuperação distinguem indisponibilidade temporária de confirmação de gravação. Não presumem que toda alteração pendente foi enviada.

O tratamento não intercepta APIs, requisições de alteração, serviços externos ou o pacote Android. Login, 401, 403 e 404 são preservados.

## Validação

- Os dois testes dos defeitos principais falham contra a versão anterior do service worker e passam contra a correção.
- 38 testes passaram: recuperação, duração máxima, repetição limitada, erros de armazenamento, preservação do login, cache, bootstrap Android e privacidade de notificações.
- Teste real no navegador, em servidor local isolado: conexão encerrada pelo servidor e caches apagados; a página de recuperação carregou. Depois da restauração, “Tentar novamente” abriu `/painel?view=visitantes` mantendo a rota.
- Compilação de produção concluída.

Essa correção cobre falhas dentro do service worker ativo. Não significa que uma indisponibilidade do navegador, da rede ou da hospedagem possa ser eliminada pelo site.
