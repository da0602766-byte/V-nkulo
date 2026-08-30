# Reforma Visual V5 — especificação

Documento de referência para a reforma de UI/UX do VÍNKULO. Aprovado pelo
proprietário em 30/08/2026 como direção; a implementação ainda não começou.

- **Base:** `1c6d447` — "Exibe ações essenciais e orienta remoções".
- **Prévias navegáveis:** duas páginas publicadas fora do repositório, com as
  telas e os formulários desenhados. Os links estão com o proprietário.
- **Estado:** especificação. Nenhuma tela foi implementada.

## 1. Diagnóstico

O problema não é estético, é de acúmulo: três reformas se sobrepuseram sem que
a anterior fosse retirada.

| Achado | Evidência |
| --- | --- |
| Duas paletas empilhadas | `app/globals.css:3-40` define `--ink`, `--muted` e `--line` na paleta violeta e redefine as três, vinte linhas abaixo, em navy/teal. As duas convivem no mesmo `:root`. |
| Três acentos disputando | Verde na barra lateral, roxo no botão principal, ciano no gradiente do título da recepção. |
| Ícones são caracteres de texto | `app/components/PilotDashboard.tsx:73-85` usa `◇ ▣ ✣ ♡ ◎ ⬡`, com alturas e pesos que nenhuma fonte garante. |
| Navegação com itens duplicados | `app/components/PilotDashboard.tsx:327-337`: "Início" e "Mural" apontam para a mesma view; "Ministérios" e "Escalas" também. |
| CSS sem divisão | `app/globals.css` tem 29.537 linhas e 1.634 classes num arquivo só. |

## 2. Sistema visual

**Um acento.** Cobre (`#B25A33` no claro, `#D9784C` no escuro) para ação.
Verde, âmbar e rosa passam a significar exclusivamente estado — nunca
decoração. Estrutura da barra lateral em índigo escuro.

**Neutros enviesados ao acento**, não cinza puro.

**Tipografia em três papéis:** Newsreader nos títulos, Instrument Sans na
interface, IBM Plex Mono em números, horas e placas. As duas últimas já estão
em `.vinext/fonts/`.

**Ícones em SVG** com traço de 1,6 px, substituindo os glifos tipográficos.

**Claro e escuro definidos por token**, nunca dentro de bloco de tema, para que
nenhuma cor fique presa a um só estado.

## 3. O fio

O dispositivo estrutural vem do nome do produto: vínculo → fio. Uma linha
vertical contínua que atravessa o dia da comunidade. Não é ornamento — codifica
a direção do tempo: passado sólido, futuro tracejado, marcador "agora" entre os
dois.

### Fio do dia — página nova

Primeiro item da barra de navegação, em `/painel/fio`. Reúne numa página só o
que hoje está espalhado por nove: culto, presença, visitantes, pedidos,
escalas, estacionamento, células e diaconia.

- Cabeçalho com a data e quatro indicadores do dia.
- Filtro por camada: cultos, pessoas, operação, cuidado.
- Cartões expansíveis com o detalhe de cada registro.
- Coluna lateral com ocupação do salão, visitantes por categoria e o que ainda
  vai acontecer.

**Esta é a única parte da reforma que exige migração de banco.** Precisa de uma
tabela `fio_registros` para os lançamentos manuais — o que o sistema não capta
sozinho, como uma visita pastoral ou um imprevisto. Todo o resto do fio é
agregação de dados que já existem.

## 4. Navegação

Três seções fixas no lugar da lista corrida atual:

- **Dia** — Fio do dia, Mural, Agenda.
- **Comunidade** — Pessoas, Visitantes, Pedidos, Células, Ministérios,
  Estacionamento, Diaconia.
- **Gestão** — Notificações, Configurações, Área do proprietário.

Contadores no trilho apenas para pendências que exigem ação.

## 5. Módulos

| Aba | Mudança |
| --- | --- |
| Criar feed | Deixa de ser aba e vira o composer no topo do Mural, com o tipo escolhido por aba (publicação, aviso, evento, pedido). |
| Agenda | Camadas ligáveis sobre a mesma grade; a escala de cada evento aparece na própria linha. |
| Pessoas | Filtros por situação, ações reveladas na linha sob o cursor, remoção sempre com motivo registrado. |
| Visitantes | O funil vira o assunto da página; a tabela vem depois dele. |
| Pedidos | Triagem por urgência; pedido confidencial não mostra o corpo na listagem. |
| Estacionamento | Mapa de vagas clicável no lugar da lista. |
| Células | De lista de nomes para mapa de saúde: relatórios em dia, frequência das últimas oito semanas e prontidão para multiplicar. |
| Notificações | Agrupadas por dia e origem, com aba "precisa de você". Mensagens privadas seguem fora do sino. |
| Configurações | Navegação por assunto no lugar do balde único. |
| Área do proprietário | Trilho mais escuro e faixa de escopo permanente. |

### Ministérios

A aba lista os ministérios em cartões que respondem à pergunta real da
liderança: tem gente suficiente e a próxima escala está fechada?

Dentro de um ministério, seis abas. Hoje são cinco
(`app/components/MinistriesWorkspace.tsx:168`: `visao`, `escalas`, `recursos`,
`participantes`, `historico`) e **Equipes vive dentro de Participantes**. Na
reforma ela sobe ao mesmo nível:

**Visão · Equipes · Integrantes · Escalas · Recursos · Histórico**

## 6. Formulários

Cinco regras, válidas para todo diálogo de criação:

1. **O rodapé diz a consequência.** Nenhum diálogo termina só com "Salvar".
   Cada um informa quem será notificado, quantas pessoas passam a ver e o que
   fica registrado.
2. **Obrigatório é exceção.** Um visitante se cadastra em pé, na porta, com fila
   atrás: só o nome é obrigatório, e o diálogo diz isso em vez de bloquear.
3. **Público e interno nunca se misturam.** Em Nova célula, `enderecoPublico` e
   `descricaoPublica` ficam em seção separada e avisada — hoje aparecem no meio
   dos campos internos, e é assim que endereço residencial acaba publicado.
4. **Rascunho antes de notificar.** Escalas nascem em `RASCUNHO`; publicar é um
   segundo ato deliberado. A diferença entre montar uma escala e convocar doze
   pessoas precisa ser um clique consciente.
5. **Destrutivo mostra o que sobrevive.** Desvincular alguém lista o que se
   perde e o que fica: histórico, publicações e a conta pessoal. Motivo
   obrigatório, autor registrado, reversível por 30 dias.

Os campos desenhados saíram de `db/schema.ts` e das rotas em `app/api/pilot/`.
Com a exceção do Fio do dia, **a reforma não exige migração de banco** — o que
muda é ordem, agrupamento e texto.

## 7. Ordem sugerida

A reforma é grande demais para um commit. Sugestão de recorte, cada bloco com
build, testes e evidências próprios:

1. **Fundação** — colapsar as duas paletas, definir os tokens, quebrar o
   `globals.css`. Sem mudança visível de layout.
2. **Ícones e navegação** — jogo de SVG, três seções, fim dos itens duplicados.
3. **Fio do dia** — migração `fio_registros`, rota agregadora, página.
4. **Módulos**, um por vez, na ordem da tabela da seção 5.
5. **Formulários**, aplicando as cinco regras.
6. **Superfície pública** — recepção, login, perfil da comunidade.

## 8. Validação da base

Executada em 30/08/2026 sobre `1c6d447`:

- `npm run build` — build concluído e artefato do Sites validado.
- `node --test tests/*.test.mjs` — 206 de 206 passando.
- `npm run lint` — 0 erros, 47 avisos, todos de `@next/next/no-img-element`.

Observação para quem for validar: 39 testes de integração dependem de
`dist/server/index.js`. Rodar a suíte sem o build antes produz 39 falsas
falhas. O `npm test` do projeto já encadeia build e testes na ordem correta.
