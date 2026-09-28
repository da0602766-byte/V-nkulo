# Reforma offline — etapa 2: telas, formulários e paleta

## Escopo

Autorização do proprietário: “Pode prosseguir”, após a publicação da etapa 1.
Esta entrega cria navegação local por telas, protege a saída de formulários e
transporta a paleta da comunidade. Central unificada de pendências é etapa 3.
Não altera filas, banco/schema, criptografia, permissões ou registros de produção.

## Implementação

- Início, preparação, consultas, visitantes, menu de funções e módulos têm
  destinos próprios. Apenas uma tela aparece por vez. Voltar usa histórico local
  do documento; foco acompanha o título, sem saltar inadvertidamente ao online.
- O menu apresenta Pedidos, Anotações, Acompanhamentos, Ministérios/checklists,
  Células e Estacionamento; não depende de um seletor escondido no fim da página.
- Instruções de acesso ficam recolhidas após a preparação; permanecem disponíveis
  e voltam a abrir quando o módulo fica bloqueado. Salvar e enviar continuam
  ações distintas, com confirmação nativa de persistência e fila inalterada.
- Alterações não salvas têm aviso. Navegar, abrir outro rascunho, preparar de
  novo ou bloquear exige confirmar o descarte. Cancelar preserva os campos.
  Operações de escrita aguardando confirmação impedem navegação. A resposta de
  um salvamento anterior não marca edições posteriores como já salvas.
- Bloqueio/expiração e segundo plano continuam limpando o formulário por
  privacidade; rascunhos persistidos permanecem cifrados. Não há autosave nem
  promessa de recuperar campos após minimizar, fechar ou matar o processo.
- `X-Vinkulo-Theme: palette-1` é uma extensão opcional do protocolo 3. A resposta
  inclui somente versão, ID de paleta e nove cores hexadecimais por modo, obtidas
  dos mesmos tokens e cálculo de contraste da plataforma. Sem mídias, URLs,
  sombras CSS livres ou preferências privadas adicionais. Clientes anteriores
  recebem a estrutura original, sem o campo opcional.
- O Android valida a estrutura e salva a paleta na mesma linha cifrada da
  consulta autorizada; aplica isolamento, validade e bloqueio existentes.
  Remover identidade remove também as cores do documento. Preparações antigas
  usam Moderno até atualizar. Claro/escuro segue o aparelho, não a preferência
  manual guardada pela interface online. Logo/papel de parede não são baixados.

## Validação local

- 549 testes web aprovados, incluindo opt-in do tema, isolamento por comunidade,
  compatibilidade anterior, cores sem URLs e fallback de configuração inválida.
- TypeScript, build verificado e lint dos arquivos web alterados aprovados.
- 34 testes JavaScript do APK: navegação, foco, cancelamento, descarte, operação
  em andamento, seleção indisponível, cores/reset e regressões anteriores.
- Playwright/Edge headless com fixtures: 320/390/600 px, claro/escuro, fontes
  locais, fonte 200%, alvos 48 px, ausência de overflow; falha e edição durante
  salvamento, cancelamento de navegação e descarte sem envio. Capturas em
  `.task-tools/offline-redesign2-qa/`; revisão visual realizada. Sem conta real.

## Validação Android e publicação

CI aprovado: candidato 1.16.0/code19, fonte `4665ba228347b4d2e43560aa10d66ff69177d46a`,
workflow https://github.com/da0602766-byte/V-nkulo/actions/runs/36422336593.
34 JS, 8 Java, 21 instrumentados API35; API29 tem 16 aprovados e 5 ignorados por
WebView antigo. Três fases de upgrade aprovadas em cada API, preservando sete
registros cifrados após atualização/reabertura. Tema cifrado, isolamento,
rejeição de CSS inválido e navegação protegida também testados nativamente.

Artefato API35 `10969484302`, 625.254 bytes, SHA-256
`fdf7da2ed4ea75043d5fe469431dea7e1a9625ea25561542cafddacb958bd685`.
Certificado original `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
Cadeia de APKs assinados até 1.15→1.16 conferida. Estável 1.7.1 preservado.
Uma rodada anterior recebeu HTTP500 ao baixar APK antigo; a rodada final passou
integralmente sem enfraquecer assertivas ou remover verificações de atualização.
Publicado no **Sites 329**, fonte web `2d7a03019e1fadc48e2decc162807c906374a5dc`,
deployment `appgdep_6aba610998ac81918d6496f214a52037`, concluído em
28/09/2026 às **09h44 Brasília** (12:44:20 UTC).

[APK 1.16.0 de homologação](https://adote-gestao.da0602766.chatgpt.site/downloads/VINKULO_ANDROID_1.16.0_HOMOLOGACAO.apk)
baixado novamente da URL pública: 625.254 bytes e SHA-256 idêntico ao artefato
validado. Manifesto público correto, estável 1.7.1 preservado, instruções/login
HTTP200. Snapshot com cabeçalho de tema e sem sessão retorna HTTP401/no-store.
PR16 permanece em rascunho, sem merge da base web histórica. Este registro
documental é posterior ao deploy, cujo fonte permanece `2d7a030`.

Não promover à distribuição geral sem homologação física. Instalar por cima da
versão existente; não desinstalar nem limpar dados com trabalho pendente.
