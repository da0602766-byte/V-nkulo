# Vínkulo — contexto do produto e prompt para o Figma

Este arquivo tem duas partes independentes:

1. **Contexto do produto** — cole antes de qualquer pedido a uma IA, para ela
   entender o sistema.
2. **Prompt para o Figma** — cole no Figma (Make / First Draft) para gerar as
   telas da aba Célula.

Todos os valores aqui (cores, fontes, papéis, módulos) foram lidos do código do
sistema, não de memória.

---

# Parte 1 — Contexto do produto

## O que é

Plataforma de gestão para igrejas e comunidades, em português do Brasil, usada
tanto no computador quanto no celular. Cuida de comunicação, organização de
pessoas, ministérios, escalas, visitantes, células, eventos, pedidos de oração e
cuidado pastoral.

## Como se organiza

Cada comunidade (igreja) é um mundo fechado: nenhuma acessa dados operacionais de
outra. Uma pessoa pode pertencer a mais de uma comunidade e troca entre elas.
Existe ainda uma camada acima, do proprietário do sistema, com visão global,
auditoria e criação de comunidades. Há também agrupamento de igrejas em redes e
unidades.

Toda permissão é decidida no servidor, nunca só na tela.

## Quem usa e o que alcança

- **MEMBRO** — participa: vê o mural, a agenda, os ministérios em que está, as
  escalas em que foi chamado, reserva vaga no estacionamento e cuida do próprio
  cadastro.
- **LIDER** — tudo do membro, mais o acompanhamento do que lidera.
- **PASTOR**, **ADMIN_COMUNIDADE**, **SUPERADMIN** — administram a comunidade
  inteira.

Existe também uma hierarquia de títulos eclesiásticos (presbítero, pastor) que
pesa em algumas decisões.

**Regra prática:** o mesmo módulo costuma ter duas caras — a de quem participa e
a de quem administra — e quem decide qual aparece é o papel da pessoa somado ao
aparelho que ela está usando. No celular, mesmo quem administra recebe primeiro o
essencial do dia, não o painel completo.

## Módulos (as abas do painel)

Início · Fio do dia · Agenda · Ministérios · Pedidos · Visitantes · Células ·
Gestão (estacionamento) · Redes e unidades · Painel do membro · Painel de
liderança · Pessoas · Configurações · Continuidade.

## Sistema visual

**Um acento só, para ação:** cobre `#B25A33` no tema claro, `#D9784C` no escuro.
Verde (`#1B8F63`), âmbar (`#A96C10`) e rosa (`#B93E58`) significam exclusivamente
estado — nunca decoração.

**Neutros puxados para o acento**, nunca cinza puro:

| | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#F7F5FB` | `#0B0D10` |
| Superfície | `#FFFFFF` | `#15181D` |
| Borda | `#DCE4E8` | `#2E353E` |
| Texto | `#20313F` | `#EDF1F5` |
| Texto secundário | `#6B7C89` | `#98A3B0` |
| Acento suave | `#F9EBE3` | — |

**Tipografia em três papéis:** Bricolage Grotesque nos títulos, Instrument Sans
na interface, IBM Plex Mono em números, horas e placas.

**Ícones em traço SVG de 1,6px** — não usar emoji como ícone.

Claro e escuro são definidos por variável, nunca dentro de um bloco de tema, para
nenhuma cor ficar presa a um estado só. Cada comunidade pode trocar a cor
principal pela sua.

**Forma:** cantos de 16 a 18px em cartões, 10 a 12px em botões e campos, 999px em
etiquetas. Borda de 1px em repouso; sombra só em foco e hover. Espaçamento base
de 8px.

Há um elemento estrutural próprio, **"o fio"**: uma linha vertical contínua que
atravessa o dia da comunidade, marcando passado sólido, futuro tracejado e o
momento atual entre os dois. Não é enfeite — codifica a direção do tempo.

## Como escrever na interface

Português do Brasil, do lado de quem usa. Nomeie as coisas como a pessoa
reconhece, não como o sistema é construído. Voz ativa. Um botão diz exatamente o
que vai acontecer. Erro explica o que houve e como resolver, sem pedir desculpas
e sem vaguidade. Nada de texto de preenchimento: use conteúdo real de igreja
(nomes de células, ministérios, líderes, horários).

## Regras que não se quebram

- Uma comunidade nunca vê dado operacional de outra.
- Dado pessoal (e-mail, telefone) só aparece para quem tem função que justifique;
  o resto vê nome e função.
- O que é público (perfil da comunidade, diretório de células) é escolha explícita
  de quem preenche, com aviso de que vai para a internet.
- Foto e arquivo ficam no armazenamento conectado da comunidade ou só no aparelho
  — nunca em endereço externo solto.
- Interface funciona igualmente no computador e no celular, com alvo de toque de
  no mínimo 44px.

---

# Parte 2 — Prompt para o Figma

Copie daqui para baixo e cole no Figma.

---

Crie o design de uma aba chamada "Célula" para o Vínkulo, um sistema de gestão de
igrejas em português do Brasil. A aba tem duas experiências distintas e eu quero
as duas desenhadas, em 4 frames.

## Sistema visual (crie como variáveis/estilos reutilizáveis)

Cores — tema claro:

- Acento: `#B25A33` (cobre) · Acento suave: `#F9EBE3`
- Fundo da página: `#F7F5FB` · Superfície dos cartões: `#FFFFFF`
- Borda: `#DCE4E8` · Texto: `#20313F` · Texto secundário: `#6B7C89`
- Sucesso: `#1B8F63` · Atenção: `#A96C10` · Erro/risco: `#B93E58`

Cores — tema escuro (crie como modo alternativo das mesmas variáveis):

- Acento: `#D9784C` · Fundo: `#0B0D10` · Superfície: `#15181D`
- Borda: `#2E353E` · Texto: `#EDF1F5` · Texto secundário: `#98A3B0`

Tipografia em três papéis: **Bricolage Grotesque** nos títulos, **Instrument
Sans** na interface, **IBM Plex Mono** em números, horas e contadores. Escala:
28/22/20/18/16/15/14/13/12 px. Títulos com entrelinha justa e leve espaçamento
negativo. Rótulos em caixa alta, 12px, peso 800, espaçamento entre letras de
0,05em.

Forma: cantos de 16 a 18px nos cartões, 10 a 12px nos botões e campos, 999px nas
etiquetas. Bordas de 1px. Sombra apenas no estado de foco/hover — os cartões em
repouso usam borda, não sombra. Espaçamento base de 8px; respiro interno dos
cartões entre 15 e 18px; espaço entre cartões de 12 a 14px.

Ícones: traço SVG de 1,6px, coerentes entre si. Nada de emoji como ícone.

## Frame 1 — Gestão, computador (1440 x 1400)

Cabeçalho: rótulo "CÉLULAS · COMUNIDADE VIDEIRA CENTRAL", título grande "Grupos
que aproximam pessoas", uma linha de apoio, e à direita dois botões: "Ver como
participante" (contornado) e "＋ Criar célula" (sólido, cor de acento).

Abaixo, uma faixa de 6 cartões de número, cada um com um quadrado de ícone de
40px em cor suave, rótulo pequeno em caixa alta, número grande e uma linha de
apoio menor:

- Total de células · 18 · "3 arquivadas" (cobre)
- Ativas · 15 · "9 próximos encontros" (azul)
- Pendentes · 4 · "solicitações aguardando decisão" (âmbar)
- Sem relatório · 2 · "há mais de 3 semanas" (vermelho, com a borda do cartão
  também em vermelho suave para sinalizar alerta)
- Pessoas nas células · 214 · "membros e visitantes ativos" (verde)
- Prontas p/ multiplicar · 3 · "média de 15+ presentes" (turquesa)

Barra de filtros: campo de busca com lupa ("Buscar célula, líder ou bairro"), um
seletor de três estados (Todas / Ativas / Arquivadas) e uma fileira de etiquetas
arredondadas com contador: "Saúde: todas", "Sem relatório 2", "Atenção 1",
"Prontas p/ multiplicar 3", "Saudáveis 9".

Grade de cartões de célula, 3 por linha, cada cartão com:

- avatar quadrado de 44px com a inicial, em acento suave
- etiqueta de situação ("Ativa") em caixa alta pequena
- nome da célula em destaque
- descrição em duas linhas, cortada com reticências
- linha de saúde: etiqueta colorida ("Saudável" verde / "Atenção" âmbar / "Sem
  relatório há 4 semanas" vermelho / "Pronta p/ multiplicar" turquesa), um
  minigráfico de 8 barrinhas verticais (semanas de relatório) e o texto
  "7/8 relatórios"
- rodapé separado por linha, em duas colunas: "Encontros: Qua, Sáb" /
  "Pessoas: 21" / "Liderança: Marta Oliveira" e, embaixo, "Gerenciar →" em cobre
- quando houver pedidos pendentes, um selo circular âmbar com o número no canto
  superior direito

Use estes nomes reais: Célula Esperança, Célula Alto da Serra, Célula Vila Nova,
Célula Recanto Feliz, Célula Campo Belo, Célula Bela Vista (esta última
arquivada, com 60% de opacidade).

## Frame 2 — Gestão, célula aberta (1440 x 1400)

Página inteira, não um modal. Botão "← Voltar às células" no topo. Cabeçalho com
rótulo "DETALHES DA CÉLULA", nome grande, etiqueta verde "Ativa", descrição e uma
fileira de etiquetas de dias ("Encontros: Qua, Sáb").

Faixa de 4 números em caixas: Membros 17 / Visitantes 4 / Liderança 2 / Próximos
encontros 2.

Abaixo, um corpo de duas colunas: à esquerda, uma barra lateral de 180px com
navegação vertical numerada (01 Visão geral, 02 Integrantes, 03 Agenda,
04 Relatório semanal, 05 Solicitações, 06 Configurações), o item ativo com fundo
em acento suave. À direita, o conteúdo de "Visão geral": três cartões (Liderança,
Local público, Último relatório).

Mostre também, como segundo estado, a aba "Configurações": formulário em duas
colunas com Nome, Horário do encontro, Rede, Dias de encontro (caixas de seleção
arredondadas), Endereço público, Temas, Descrição pública, Observações internas,
uma área de envio de foto de capa, e no fim um bloco de "Área de risco" com borda
e fundo avermelhados contendo o botão "Arquivar célula".

## Frame 3 — Participação, computador (1440 x 1500)

Cabeçalho: título "Célula", apoio "Descubra, acompanhe e solicite entrada em uma
célula", e à direita um cartão citando Mateus 18:20 em fundo de acento suave.

Faixa de 4 cartões de número, mesmo formato do Frame 1: Minha célula (Célula
Esperança · "Rede Centro • 12 membros"), Minhas solicitações (1), Próximos
encontros (2), Células disponíveis (6).

Filtros: busca, "Todas as redes", "Todos os dias", "Todas as situações".

Corpo em duas colunas:

- **Esquerda:** lista de células em linhas. Cada linha tem avatar com iniciais,
  nome, uma linha secundária "Jardim das Flores • Seg, 19h30 • Rede Centro", o
  líder, a contagem de membros e uma etiqueta de situação — "Já participo"
  (cobre), "Solicitação pendente" (âmbar) ou "Aberta" (verde). A linha
  selecionada tem fundo suave e uma barra de 3px na borda esquerda.
- **Direita:** painel de perfil fixo, com capa de 150px em degradê do acento (do
  cobre escuro ao claro) com o nome da célula sobreposto em branco e uma etiqueta
  de situação no canto; abaixo, quatro caixinhas (Líder, Encontro, Local,
  Pessoas), a descrição, etiquetas de tema, um bloco destacado "Próximo
  encontro", uma fileira de pessoas da célula em pílulas com iniciais, e os
  botões "Solicitar entrada" (sólido) e "Falar com o líder" (contornado).

No rodapé, três cartões lado a lado: "Minhas solicitações", "Próximos encontros"
e "Como funciona" (este com 4 passos numerados em círculos).

## Frame 4 — Participação, celular (412 x 1600)

Mesma tela em uma coluna: cabeçalho sem a citação bíblica, os 4 cartões de número
empilhados, busca em largura cheia com os seletores em duas colunas abaixo, e a
lista de células compacta (avatar, nome, linha secundária e etiqueta de situação
— sem as colunas de líder e contagem).

Faça também o segundo estado: a ficha da célula aberta como página cheia, com uma
barra superior fixa ("← Perfil da célula"), a capa, os dados, e — no fim — um
bloco separado por linha chamado "O essencial no celular", visível só para quem
lidera aquela célula, com:

- um formulário curto "Relatório do encontro" (Data, Aconteceu?, Presentes,
  Visitantes) e botão sólido "Enviar relatório"
- uma lista "Pedidos para entrar 1" com o nome, o contato, a mensagem e dois
  botões (Aprovar / Recusar)
- uma linha final em texto pequeno: "Integrantes, agenda e configurações da
  célula ficam no computador."

## Importante

- Use conteúdo real em português, nunca texto de preenchimento.
- Não invente recursos que o produto não tem: não existe "célula lotada",
  contagem de vagas, nem visualização em mapa.
- Todos os alvos de toque no celular com no mínimo 44px de altura.
- Entregue os dois temas (claro e escuro) trocando apenas as variáveis de cor.
