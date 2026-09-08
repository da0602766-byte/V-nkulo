# Presença Comunitária — V4.7.2

## Objetivo

A Visão Geral privada da comunidade possui uma caixa lateral `Quem está online`.
Ela permite que usuários autenticados da comunidade ativa encontrem integrantes
recentemente ativos sem expor pessoas, vínculos ou horários de outra comunidade.

## Regras aprovadas

- localização: lateral direita da Visão Geral principal;
- visibilidade: todos os usuários autenticados e ativos da própria comunidade;
- estado `Online`: atividade registrada nos últimos cinco minutos;
- lista inicial: até oito pessoas, priorizando online;
- expansão: botão `Ver todos`;
- informação: nome, hierarquia e estado online ou última atividade relativa;
- privacidade: cada usuário pode ocultar a própria última atividade offline;
- o estado online atual continua visível enquanto houver atividade recente.

## Persistência

A tabela `presencas_comunidade` registra:

- usuário;
- comunidade;
- última atividade;
- preferência de exibição da última atividade.

O par usuário/comunidade é único. Dessa forma, a atividade registrada em uma
comunidade nunca torna a pessoa online em outra.

## Controle de acesso

- toda consulta exige sessão ativa e permissão para visualizar o painel;
- a comunidade é resolvida exclusivamente no servidor;
- visitantes e contas inativas não recebem a lista;
- o proprietário da plataforma em uma comunidade de terceiro permanece em modo
  somente feed e não acessa a presença interna;
- apenas vínculos ativos ou o proprietário real da comunidade entram na lista;
- IDs fornecidos pelo navegador não são usados para escolher comunidade ou usuário.

## Atualização

O navegador registra a atividade ao abrir a Visão Geral, a cada minuto enquanto
a página está visível e quando a pessoa retorna à aba. O servidor considera
online somente quem teve atividade nos cinco minutos anteriores.

Não há WebSocket ou rastreamento externo. Ao fechar o sistema, o estado pode
permanecer online por até cinco minutos.

## Interface

- painel compatível com temas claro, escuro e automático;
- avatar ou iniciais;
- ponto verde para online;
- horário relativo para offline, como `Visto há 20 min`;
- texto `Atividade oculta` quando a preferência estiver desativada;
- estado de carregamento, vazio e erro;
- no celular, o painel é empilhado junto aos demais cartões laterais.

## Validação

- build aprovado;
- lint sem erros;
- 43 testes automatizados aprovados;
- isolamento entre duas comunidades testado;
- privacidade testada com atividade offline;
- acesso anônimo bloqueado.
