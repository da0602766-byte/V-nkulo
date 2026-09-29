# Modo offline — comportamento e proposta visual

## Wireframe da tela quando não há internet

```text
┌ VÍNKULO                              ● Sem internet ┐
│ ACESSO LOCAL                                        │
│ Seu espaço salvo                                    │
│                                                     │
│ ┌ ícone ─ Sem acesso à internet ────────────────┐   │
│ │ O que foi salvo neste aparelho segue protegido.│   │
│ └───────────────────────────────────────────────┘   │
│                                                     │
│ ┌ Estado da preparação                              │
│ │ Aparelho preparado · Igreja ...                   │
│ │ Cópia consultável até ...                          │
│ │ Gerenciar acesso offline                           │
│ └───────────────────────────────────────────────────┘
│                                                     │
│ ┌ Mural ───────┐ ┌ Agenda ───────┐                  │
│ └──────────────┘ └───────────────┘                  │
│ ┌ Escalas ─────┐ ┌ Meus pedidos ─┐                  │
│ └──────────────┘ └───────────────┘                  │
│ ┌ Visitantes ──┐ ┌ Mais funções ─┐                  │
│ └──────────────┘ └───────────────┘                  │
│                                                     │
│ ┌ Central de pendências ────────────────────────→ ┐ │
│ │ 2 em revisão · 3 na fila · 1 rascunho           │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│             [ Tentar conexão novamente ]             │
└─────────────────────────────────────────────────────┘
```

Na Central de pendências, os filtros separam tudo, revisão, fila, rascunhos e
confirmações. Cada cartão apresenta título, módulo, situação e última alteração.
“Aguardando nova tentativa” e “Aguardando confirmação” ficam distintos de
“Confirmado no servidor”; apenas o último mostra recibo. Módulos sem autorização
informam que a consulta está indisponível, sem expor dados ou contagens.

## Comportamento de entrada

- Na inicialização normal, o Android abre `/painel` quando a rede ativa tem as
  capacidades `INTERNET` e `VALIDATED` do próprio sistema. A tela local não é a
  página inicial quando o Android confirma internet.
- Sem rede validada, o app abre o espaço local. Se uma navegação online falha,
  ele só troca para a tela local depois de confirmar que não existe uma rede
  validada. Uma falha de servidor com internet ativa não é apresentada como
  “sem internet”.
- Quando Android valida novamente a internet, o app retorna ao painel. A
  navegação local pede a proteção existente antes de sair de campos alterados;
  cancelar mantém a edição aberta.
- A página offline do navegador continua sendo somente fallback de uma
  navegação que falhou na rede no service worker. Ela não é adicionada à rota
  normal nem ao shell inicial.

## Princípios visuais

1. Cabeçalho curto com marca à esquerda e estado da rede à direita.
2. Um título e uma mensagem offline imediatamente compreensíveis, com ícone e
   contraste moderado. A mensagem confirma que itens já salvos permanecem.
3. Estado de preparação separado da conexão: autorização e prazo não se
   confundem com disponibilidade da internet.
4. Ações principais em cartões no mesmo ritmo e alinhamento; acessos pessoais
   permanecem distintos das funções operacionais.
5. Central de pendências como resumo secundário na entrada e lista detalhada
   quando aberta. Confirmação, tentativa, rascunho e revisão têm rótulos
   diferentes.
6. Tipografia escalável, espaçamento em múltiplos de 4/8 px, foco visível,
   áreas de toque de ao menos 48 px e suporte ao modo claro/escuro.

## Estado da implementação

O fluxo de entrada/retorno e o aviso de estado de conexão foram alterados no
checkout Android auxiliar `.task-tools/android-p3/Vinkulo-Android`. A tela de
fallback web `public/offline.html` foi redesenhada para tema claro/escuro,
hierarquia mais curta, estado, segurança dos dados salvos e ação de tentar
novamente. A regra de navegação do service worker existente já mostra esse
fallback apenas após falha da navegação online.

O fluxo nativo Android e os avisos locais foram publicados no candidato
**1.18.0** (homologação), mantendo a 1.7.1 estável intacta. A tela local passa
a ser inicial somente sem internet validada pelo Android; reconexão retorna ao
sistema online respeitando formulários não salvos. A CI 36508309325 passou nas
APIs 29 e 35, incluindo instalação sobre 1.17.0, teste instrumentado da tela
offline e captura acessível. Hash/tamanho definitivos estão no manifesto
`public/downloads/android-release.json`. A experiência em aparelhos físicos
segue pendente antes de qualquer promoção do canal estável.
