# Reforma V6 — proposta

Documento de sugestões, não de decisão. Cada item foi conferido contra o código
antes de ser escrito, porque na V5 seis itens do diagnóstico caíram ao serem
checados. O que já existe está marcado como **já existe**, e isso muda o custo
de várias coisas pedidas.

- **Base:** `a034cbf`, com a Reforma V5 integrada e aguardando publicação.
- **Decidido:** começar pela área do proprietário (seção 5); o mapa de
  visitantes será agregado por bairro, não por endereço (seção 1.2).
- **Estado:** seção 5.1 (coerência) e 5.2 (ambiente de ensaio) feitas.

## Registro de execução

### 5.1 Coerência da área do proprietário — feito

O que apareceu ao fazer, e que o diagnóstico não previa:

1. **`MenuIcon` não era exportado.** Vivia dentro de `PilotDashboard.tsx`. Foi
   extraído para `app/components/MenuIcon.tsx` em vez de duplicado, porque dois
   conjuntos de ícones viram duas verdades sobre o mesmo desenho.
2. **A prévia local elegia um pastor, não o superadmin.** A rota
   `/api/auth/preview` ordenava por papéis que não existem mais
   (`PROPRIETARIO`, `ADMIN`), então `SUPERADMIN` caía no `ELSE`. Efeito: a área
   do proprietário ficava inacessível justamente na prévia, que é onde se
   confere. Corrigido.
3. **O acento cobre nunca tinha chegado aqui.** Dezesseis pontos em roxo
   pré-reforma (`#694af1`, `#7157e8`, `#6544df`, `#6749df`, `#6546df`,
   `#6648de`) e dois verdes fora do token. Restaram três verdes, todos de
   estado ("Dados em tempo real", "Servidor protegido", "✓"), agora em
   `var(--green)`.

**Dívida aberta:** os marcadores de tipo de feedback (`✦ ↗ ⚑ !`) continuam
glifos. São classificação de conteúdo, não navegação, e trocá-los é outro
recorte.

### 5.2 Ambiente de ensaio — feito

Rascunho → alvo → publicação → reversão, na aba "Ensaio e publicação".

**A decisão que organizou tudo:** publicar é escrever, em `configuracoes`, a
chave de cada comunidade alvo (`community_theme:<id>`, `community_modules:<id>`).
Antes de escrever, o valor que estava lá é guardado comunidade por comunidade
em `anterior_json`, **no mesmo lote da escrita**. É esse retrato que torna a
reversão possível; sem ele, desfazer seria adivinhação.

Quatro regras que valem a pena registrar:

1. **Só rascunho publica.** Publicar duas vezes sobrescreveria o retrato do
   original com o valor que o próprio ensaio acabou de gravar.
2. **Só o último publicado de cada assunto é reversível.** Reverter um
   anterior apagaria o que veio depois. A checagem está no servidor, não só na
   interface — a lista da tela pode estar trinta segundos atrasada.
3. **Chave que não existia antes é apagada na reversão**, não gravada como a
   string `"null"`.
4. **Publicado não se apaga.** É o registro do que aconteceu, e apagá-lo
   levaria junto o retrato que permite reverter.

Escrever exige as duas coisas: a permissão `platform.admin.view` **e** a conta
de proprietário do sistema. A permissão sozinha existe para leitura.

**Verificado com o sistema rodando**, não só por teste de conteúdo: o ciclo
completo foi exercido contra o banco real, incluindo publicar sobre um valor
existente e reverter em cadeia — o valor voltou byte a byte ao original. Os
seis guardas (publicar duas vezes, descartar publicado, reverter duas vezes,
reverter fora de ordem, alvo vazio, assunto inválido) recusaram com o código
certo.

**Ainda não entregue:** a prévia renderizada. Hoje o rascunho mostra a paleta
em amostra, não a plataforma inteira aplicada. O "ver como uma comunidade vê",
em modo somente leitura, também segue pendente — é a peça (c) da seção 5.2.

## 0. O que já existe (e muda o preço do pedido)

| Achado | Onde | Consequência |
| --- | --- | --- |
| Seis paletas por comunidade, com claro e escuro, e um editor funcionando | `app/lib/community-theme.ts`, `CommunityThemeEditor.tsx`, em Configurações → Aparência | "Mais temas" é acrescentar **dados**, não construir sistema. Barato. |
| Painel pastoral por comunidade | `app/api/pilot/pastoral-dashboard/route.ts` | O dono já tem um painel. Falta o que ele mede, não o painel. |
| `proximo_contato` por visitante, já calculado e já pintado de vermelho quando atrasa | `app/api/pilot/visitantes/route.ts:76` | A pendência **existe e é visível** — só não avisa ninguém. |
| Estado de leitura por pessoa nas notificações | tabela `notificacoes_lidas` | Não precisa ser criado. |
| Presença registrada por culto | `presencas_comunidade` | Mas **só de membros**: visitante não tem presença. |
| Cinco áreas do proprietário, com 10 abas | `OwnerWorkspace` + 4 workspaces de plataforma | A área é grande; falta coerência e o ambiente de ensaio. |

E o que **não** existe, e é o buraco de verdade:

- **Não há `cron` nem handler `scheduled`** em `wrangler.toml`. Qualquer coisa
  "que avisa de madrugada" exige infraestrutura nova.
- **Rotas do painel não emitem notificação.** Conferido: `celulas` (0),
  `eventos` (0), `visitantes` (0). Quem emite são as rotas antigas
  `/api/cultos`, `/api/avisos`, `/api/usuarios`. **O sino não conta a vida da
  comunidade** — conta a de um sistema anterior.
- **Não há CEP.** O visitante tem `endereco` em texto livre, sem bairro, sem
  coordenada.
- **Não há registro de que o visitante voltou.** `data_entrada` é uma data só.

---

## 1. Visitantes — ferramentas de controle

### 1.1 A pendência que avisa

O dado já está pronto: a rota calcula `proximo_contato` e a tabela pinta de
vermelho quando venceu. O problema é que **ninguém abre a aba de visitantes
justamente na semana em que esqueceu dela.** A informação está no lugar onde só
chega quem já lembrou.

Proposta, em duas camadas:

1. **Cálculo na leitura, sem infraestrutura nova.** Quando alguém abre o
   painel, uma consulta devolve os visitantes com contato vencido e os que
   nunca receberam contato desde a entrada. Vira contador no trilho e entrada
   no Fio do dia. Custo baixo, entrega imediata.
2. **Aviso ativo, se valer a infraestrutura.** Um `scheduled` no Worker,
   diário, gerando notificação para o responsável de cada acompanhamento
   vencido. Exige `[triggers] crons` no `wrangler.toml` — decisão sua, porque
   muda o deploy.

Três regras que valem a pena, todas com dado que já existe:

- Contato vencido há mais de X dias → avisa o responsável.
- Visitante cadastrado há mais de 7 dias **sem nenhum acompanhamento** → o pior
  caso, porque é o esquecimento silencioso.
- Visitante em `EM_ACOMPANHAMENTO` parado há mais de 30 dias → ou avança, ou
  arquiva. Um funil que não anda é uma lista.

### 1.2 Região por CEP — com uma recomendação contrária ao pedido

Você pediu mapa de localização por CEP. Vou entregar o que pediu se você
mantiver, mas registro a objeção primeiro, uma vez:

**Não recomendo plotar a casa de cada visitante num mapa.** Dois motivos, e
nenhum deles é moralismo:

1. Endereço residencial de pessoa identificada é dado pessoal sob a LGPD. Um
   mapa de pinos numa tela que a liderança abre em reunião vaza fácil — print,
   projetor, celular emprestado.
2. **Ninguém decide nada olhando pinos de casas.** A decisão real é "de que
   bairros vem nossa gente e onde não temos célula". Isso é agregado, não
   individual.

O que proponho no lugar, mais útil e mais barato:

- Campo **CEP** no cadastro, preenchendo **bairro e cidade automaticamente** via
  ViaCEP (gratuito, sem chave, e o Worker faz `fetch` externo sem problema).
- **Mapa de calor por bairro**, não por endereço: quantos visitantes por
  bairro, sobreposto às células existentes. A pergunta "onde abrir a próxima
  célula" passa a ter resposta visual.
- **Encaminhamento por proximidade:** ao cadastrar com CEP, o diálogo sugere as
  células daquele bairro. Hoje `celula_id` existe e é escolha manual, às cegas.

Se quiser o mapa geográfico de verdade, o caminho honesto é geocodificar o
**centroide do bairro** (não o endereço), o que dá o mesmo mapa sem apontar
casas. Precisa de uma fonte de coordenadas — Nominatim/OSM com cache local
resolve, e o cache evita depender do serviço em cada carregamento.

### 1.3 Outras cinco, por ordem de utilidade

| Ferramenta | Por que vale | Custo |
| --- | --- | --- |
| **Aniversários da semana** | O contato mais fácil que existe, e `data_nascimento` já tem índice próprio (`visitantes_comunidade_nascimento_idx`) — alguém já pensou nisso e não terminou | baixo |
| **"Voltou?" — presença do visitante** | Hoje não há como saber se ele veio de novo. Sem isso o funil mede cadastro, não acolhimento. Uma marcação por culto basta | médio, migração |
| **Origem: quem convidou** | Saber que metade vem por convite de membro muda a estratégia inteira. `acompanhante` e `parente` existem, mas como texto solto | baixo |
| **Responsável explícito com carga visível** | Quantos acompanhamentos cada pessoa carrega. Evita o padrão de uma pessoa com 40 e três com nenhum | baixo |
| **Motivo do arquivamento** | "Sumiu", "mudou de cidade", "entrou para outra igreja" e "virou membro" são coisas diferentes, e hoje todas viram `ativo = 0` | baixo |

---

## 2. Aparência

### 2.1 Cartões transparentes

Precisa de auditoria antes de proposta — vou medir onde há `rgba`/`backdrop-filter`
em superfície e qual o contraste resultante. O princípio que proponho:

> Transparência só onde há sobreposição real — modal, folha móvel, popover.
> Cartão em fluxo é superfície opaca.

Transparência em cartão de conteúdo custa contraste e não compra nada: o que
está atrás é outro cartão.

### 2.2 Mais temas por comunidade

Barato, porque a estrutura existe: cada paleta é um objeto com `light` e `dark`
completos. Proponho **seis novas**, escolhidas para cobrir identidades que as
seis atuais não cobrem:

| Nome | Ideia |
| --- | --- |
| Terra | Terracota e areia — comunidade de bairro |
| Oceano | Azul-petróleo e areia clara |
| Floresta | Verde profundo e madeira |
| Vinho | Bordô e creme — tradicional |
| Grafite | Neutro puro, sem matiz — quem não quer cor |
| Aurora | Índigo e coral — jovem |

Cada uma validada por contraste (AA) nos dois temas antes de entrar. E proponho
uma sétima opção: **cor livre**, em que a comunidade escolhe o acento e o
sistema deriva o resto — é o que evita o pedido infinito de "mais um tema".

### 2.3 Tema claro em todas as abas

Isto é auditoria, não desenho. Já tenho a ferramenta: a varredura que percorre
as abas medindo cor computada. Vou estendê-la para medir **contraste texto/fundo
por elemento** e listar tudo abaixo de AA, aba por aba, no tema claro. O
resultado é uma lista de defeitos concretos, não uma opinião.

---

## 3. Notificações — reconstrução

O diagnóstico é objetivo e é grave: **criar uma célula, criar um evento ou
cadastrar um visitante pelo painel não gera notificação nenhuma.** O sino está
ligado às rotas de uma geração anterior do sistema.

Reconstrução em quatro partes:

1. **Cobrir os produtores.** Toda ação que muda a vida de outra pessoa emite:
   célula criada e relatório atrasado, evento publicado ou alterado, visitante
   cadastrado e acompanhamento vencido, escala montada e substituição pedida,
   pedido recebido e respondido.
2. **Assunto, não cronologia.** O bloco 4 agrupou por dia. Falta agrupar por
   assunto: cinco confirmações da mesma escala são **um** acontecimento.
3. **Preferência por pessoa.** Hoje todo mundo recebe tudo. Uma tabela de
   preferência por área resolve, e é o que impede o sino de virar ruído
   ignorado — que é o destino de todo sino que avisa demais.
4. **Ação na própria notificação.** Confirmar escala, marcar contato feito e
   aprovar entrada sem sair do sino.

E uma decisão de produto que precisa ser sua: **resumo ou item a item?** Um
digest diário respeita mais o tempo da liderança; item a item chega antes.
Minha recomendação: item a item para o que exige ação, digest para o resto.

---

## 4. O dono da comunidade recebendo informação de tudo

O painel pastoral já existe e já traz: membros, visitantes, publicações de 30
dias, próximos eventos, ministérios, células, séries mensais e os últimos 30
relatórios de célula.

**O que ele mede é criação, não saúde.** Todas as métricas contam coisas
cadastradas. Nenhuma responde "como está indo".

Proponho acrescentar seis leituras, todas com dado que já existe:

| Leitura | Pergunta que responde |
| --- | --- |
| Presença por culto, com tendência | A casa está enchendo ou esvaziando? |
| Taxa de confirmação de escala | A liderança pode contar com quem escalou? |
| Conversão do funil de visitantes | Acolher está virando pertencer? |
| Saúde das células (já construída na V5) | Quais pararam de reportar? |
| Membros sem atividade há 60 dias | Quem sumiu sem avisar? |
| Pedidos abertos e tempo de resposta | O cuidado está acontecendo ou acumulando? |

Mais duas entregas:

- **Resumo semanal** para o dono, por notificação e opcionalmente e-mail: cinco
  linhas com o que mudou e o que precisa dele.
- **Comparação com o período anterior** em toda métrica. Número sem comparação
  não informa: "42 visitantes" não diz nada; "42, contra 31" diz tudo.

---

## 5. Área do proprietário

### 5.1 Coerência

A área tem 10 abas com ícones em glifo tipográfico (`▦ ◫ ◇ ◎ ✓ ! ✦ ▥ ↻ ⚙`) — a
V5 substituiu exatamente isso no painel e **não chegou aqui**. As 10 abas também
pedem agrupamento: hoje "Otimização", "IA Editorial" e "Estatísticas" convivem
no mesmo nível de "Solicitações", que é fila de trabalho.

Proposta de três grupos: **Operação** (Solicitações, Comunidades, Pessoas,
Feedback), **Plataforma** (Aparência, Publicações, Módulos, Configurações) e
**Evidência** (Estatísticas, Auditoria, Otimização).

### 5.2 O ambiente simulado — o pedido central

Este é o item mais valioso da lista e o mais delicado, porque é o único que
pode quebrar todas as comunidades de uma vez. Proponho três peças:

**a) Rascunho, prévia e publicação por alvo.**

Toda configuração de plataforma passa a ter estado: `RASCUNHO` → `PRÉVIA` →
`PUBLICADA`. O proprietário edita em rascunho sem afetar ninguém, vê a prévia
renderizada de verdade (a própria plataforma carregada com o rascunho aplicado,
num contexto isolado), e publica escolhendo o alvo:

- todas as comunidades;
- uma lista específica;
- um grupo por critério (plano, tamanho, data de criação).

**b) Reversão em um clique.** Cada publicação vira uma versão com autor, data e
alvo. Voltar à anterior é um botão. **Isto é o que torna o resto seguro** — sem
reversão, publicar para todas as comunidades é uma aposta.

**c) "Ver como" — leitura, nunca escrita.** O proprietário abre a plataforma
como uma comunidade específica a vê, em modo somente leitura, com faixa
permanente na tela dizendo em nome de quem está olhando e trilha de auditoria
obrigatória. É o ambiente simulado mais honesto: mostra o real, sem poder
alterá-lo por engano.

Modelo de dados sugerido: uma tabela `plataforma_configuracoes` com `chave`,
`valor_json`, `estado`, `alvo_tipo`, `alvo_json`, `publicado_em`,
`publicado_por` e histórico por versão.

---

## 6. Ordem sugerida

Em ordem de valor por esforço, não de tamanho:

| # | Bloco | Por que primeiro |
| --- | --- | --- |
| 1 | Notificações: cobrir os produtores | É defeito, não melhoria. O sino mente hoje |
| 2 | Pendência de visitante na leitura | Dado pronto, entrega imediata |
| 3 | Novas paletas + cor livre | Barato, visível, sem risco |
| 4 | Auditoria de contraste no tema claro | Produz lista de defeitos concretos |
| 5 | Painel do dono: as seis leituras | Muda a decisão de quem lidera |
| 6 | CEP, bairro e encaminhamento por proximidade | Precisa de migração e serviço externo |
| 7 | Área do proprietário: coerência e ícones | Dívida da V5 |
| 8 | Ambiente simulado com rascunho e reversão | O maior, e o que exige mais cuidado |

Cartões transparentes e presença de visitante entram depois da auditoria do
item 4, porque é ela que diz o tamanho real de cada um.

## 7. O que precisa de decisão sua

1. **Mapa de visitantes:** agregado por bairro (recomendo) ou pinos por
   endereço?
2. **`cron` no Worker:** vale a infraestrutura para avisos ativos, ou o cálculo
   na leitura basta por enquanto?
3. **Notificação:** item a item, digest, ou o misto que recomendo?
4. **Ordem:** a da seção 6, ou outra?
