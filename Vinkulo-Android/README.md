# Vínkulo para Android

Aplicativo Android conectado à plataforma oficial do Vínkulo.

Versão estável de distribuição geral: **1.7.1** (`versionCode 10`). Candidato para homologação: **1.15.0** (`versionCode 18`).

## Reforma offline — primeira entrega visual

Atalhos de Mural, Agenda, Escalas, Pedidos, Visitantes e Mais funções aparecem
antes dos controles de preparação. Consultas indicam disponibilidade real e
abrem a aba correspondente; ausência de acesso leva à preparação, sem consentir
nem enviar automaticamente. Status compacto, prazo e última atualização;
preparação/remoção ficam em Gerenciar offline, com avisos preservados.

Paleta-base Moderno clara/escura da plataforma, tipografia Instrument Sans
embutida (licença OFL incluída) e ícones SVG locais. Nenhuma dependência de CDN.
A escolha automática da paleta personalizada da comunidade ainda não é
transportada pelo protocolo offline; não confundir esta base visual com essa
integração. Telas dedicadas por módulo e central unificada de pendências são as
próximas entregas, sem mudança em criptografia, permissões ou filas nesta etapa.

Validação de navegador: `scripts/visual-shell.test.cjs` exige Playwright instalado;
aceita VINKULO_PLAYWRIGHT, VINKULO_BROWSER_CHANNEL e VINKULO_QA_DIR. Usa somente
fixtures de teste, nunca contas reais. Não substitui testes Android/TalkBack.

## Atualização e distribuição — candidato 1.15.0

Use `./gradlew` (ou `gradlew.bat`) com Java 17 e Android SDK 35. O Wrapper 8.10.2
tem checksum oficial de distribuição e JAR. Dependências ficam em
`app/gradle.lockfile` e `gradle/verification-metadata.xml`; o build de CI verifica
ambos em modo estrito e todas as actions externas estão fixadas por commit.
Os hashes iniciais vieram dos repositórios Google/Maven Central/Plugin Portal
no CI e foram revisados; fixar hashes não é uma auditoria de cada biblioteca.
O ambiente homologado é Linux do CI. Não há promessa de build bit a bit idêntico.

Atualize instalando por cima da versão existente, com o mesmo pacote e assinatura.
Não desinstale, limpe dados nem instale uma versão mais antiga para corrigir erro:
isso pode eliminar filas locais e a chave necessária para abrir rascunhos.
Antes de trocar de celular, sincronize e confira os recibos. Dados locais são
vinculados ao Keystore e explicitamente excluídos de backup/transferência Android.

Se um envio ficar pendente: reconecte, entre com a mesma conta/comunidade e
prepare novamente o módulo. A intenção mantém o UUID; aguarde a confirmação.
Se houver conflito ou recusa, confira a mensagem e use o fluxo de revisão.
Não refaça manualmente um envio cujo resultado ainda é desconhecido.
Erro de chave/armazenamento exige suporte antes de limpar dados; o aplicativo
não deve prometer recuperar conteúdo cifrado quando a chave foi perdida.

A CI verifica separadamente a cadeia de APKs release assinados e a atualização
de dados com builds debug da fonte anterior e atual. Neste segundo ensaio,
sete registros cifrados/estados são criados na 1.14.0, o processo é encerrado,
o APK é atualizado sem desinstalação e o teste verifica conteúdo, UUID,
cifragem, isolamento e recuperação de lease após atualização/reabertura.
Fixtures e runners de teste não integram o APK release.

O candidato exige homologação física de sessão, push, OAuth, câmera/anexos,
TalkBack, fonte/teclado, bateria e concorrência entre dois aparelhos antes da
promoção geral. AAB/Play depende de um canal Play configurado; o canal atual é APK.

## Fluidez e usabilidade — candidato 1.13.0

- A entrada local não pede mais notificação ao iniciar. No Android 13 ou
  superior, o pedido aparece somente quando a pessoa ativa alertas na área
  autenticada que precisa deles.
- Atalhos internos e histórico do documento tornam o botão Voltar previsível
  entre consultas, visitantes e módulos. O foco acompanha o destino sem apagar
  campos ou rascunhos; controles com teclado permanecem visíveis quando a área
  útil muda.
- Listas são montadas fora da árvore visível e anexadas em um único lote. Busca
  local agrupa eventos no próximo quadro, evitando reconstruções repetidas ao
  digitar. Atualizações iguais continuam sem redesenho.
- Regiões, listas, itens, estados e ações repetidas têm nomes explícitos para
  leitor de tela. Alvos mantêm pelo menos 48 px, texto usa unidades escaláveis,
  foco é visível e o layout é verificado com fonte a 200% sem rolagem lateral.
- A CI compara 20 amostras do renderizador anterior e do renderizador em lote,
  com 100 registros no mesmo WebView/emulador, e retém os valores brutos. Essa
  comparação não substitui métricas de abertura, bateria e TalkBack em aparelho
  físico.

## Meus pedidos — bloco 5A / candidato 1.11.0

Consulta opcional de até 50 pedidos criados pela própria pessoa, com título,
texto (até 2.000 caracteres), tipo, situação e datas. Nunca inclui caixa de
atendimento, pedidos recebidos, destinatários, contatos ou notas da equipe.
Ativação separada: **Incluir meus pedidos nas consultas offline**. O
consentimento antigo das consultas não habilita pedidos automaticamente.

Protocolo `android-read-3` e cabeçalho nativo de opt-in; o servidor revalida
acesso/plano de Pedidos. Protocolos anteriores continuam compatíveis. Cópia
AES-GCM substituída integralmente, até 8 horas; bloqueio/reinício/troca de
sessão exigem nova preparação. Pedidos concluídos há mais de 30 dias ficam
fora da cópia, sem apagar registros no servidor. Situação é histórica,
nunca promessa de atendimento atual. Remover consultas não apaga a fila de
visitantes. Criação/envio/respostas de pedidos continuam online.

Este é somente o primeiro bloco da etapa 5, não a conclusão de todos os
módulos. Demais capacidades precisam de contrato e testes próprios. Não
promover à distribuição geral sem homologação física.

## Rascunhos e fila de visitantes — candidato 1.10.0

Ativação separada e explícita, somente para quem pode cadastrar visitantes. Nome,
telefone/e-mail opcionais e data de entrada; detalhes adicionais ficam online.
Salvar confirma persistência cifrada no Room/schema 2; colocar na fila é outra
ação explícita. Campos ainda não salvos são limpos ao ocultar a tela.

- Um registro cifrado contém payload, UUID e estado, sem uma segunda gravação
  para criar a intenção de envio. Limite de 200 registros operacionais; não
  apagar automaticamente pendências ou permitir descartar resultado incerto.
- `POST /api/mobile/write-bootstrap` autoriza `visitor.create` por até 8h.
  Token restrito cifrado nativamente, vinculado a sessão/comunidade/instalação;
  `POST /api/mobile/visitors` exige token e sessão própria ainda autorizada.
  Credenciais nunca chegam ao JavaScript. Não é atestado de hardware.
- WorkManager com rede, backoff/jitter e respeito a Retry-After. Recibo/UUID
  impede duplicação após resposta perdida; conflito exige revisão online.
  Worker atrasado não sobrescreve resultado de uma reserva mais recente.
- Sair/bloquear/expirar preserva trabalho e impede novas operações. Preparar
  novamente com a mesma conta/comunidade recupera as pendências. Uma requisição
  já aceita pelo servidor não pode ser desfeita pelo logout.
- Leituras de status locais em primeiro plano; listas inalteradas não são
  redesenhadas. Criação da chave Keystore serializada entre leitor e worker.

Testes sintéticos não substituem homologação física autenticada de modo avião,
morte do processo, bateria do fabricante, TalkBack, OAuth e notificações. Não
desinstalar ou fazer downgrade de um aparelho com trabalho pendente.

## Consultas offline — candidato 1.9.0

Entrada local com ativação explícita de mural, agenda (eventos e compromissos próprios) e designações próprias em escalas publicadas. Os workspaces completos continuam online. APK 1.8.0 introduziu a fundação; esta versão acrescenta somente leitura, não rascunhos/outbox.

- Backend `/api/mobile/snapshot`, protocolo 2; o bootstrap de protocolo 1 permanece disponível para APKs anteriores.
- Transporte HTTPS nativo com sessão/origem/desafio, sem instalar concessões recebidas de JavaScript. Snapshot autenticado, não um token de API.
- Uma cópia substituída atomicamente, cifrada com AES-GCM/Android Keystore no Room/schema 2; limite 1 MiB, validade até 8h ou expiração da sessão. Cookies não são enviados à ponte JavaScript.
- Troca de sessão/comunidade, reboot, relógio alterado, bloqueio e 401/403 impedem leitura. Sem rede, revogação remota só é limitada pelo vencimento da cópia.
- Máximos: 50 publicações, 100 eventos, 100 compromissos e 100 designações; agenda/escalas de agora menos 24h aos próximos 30 dias. Sem mídias, diretório de pessoas, lista de inscritos, tokens de compartilhamento ou chat.
- Atualizar manualmente na entrada local, ou ao abrir o painel após consentimento no mesmo vínculo. Sem sincronização operacional em segundo plano. Desativar remove a cópia consultável, mas não encerra a sessão online.
- Testes de homologação: testes Java/JS, armazenamento cifrado, migração, limites, expiração, troca de vínculo, leitura local/recriação e cadeia de atualização assinada 1.7.1 → 1.8.0 → 1.9.0 em emuladores API 29/35. WebView antigo sem ponte segura só oferece atualização do WebView e sistema online.

Distribuição geral depende de testes físicos autenticados e integrações e desempenho medido. A consolidação do Wrapper/checksum, dependências verificadas/travadas e actions fixadas está descrita na etapa 7 acima. Não prometer funcionamento majoritariamente offline nem build bit a bit reproduzível.

## Melhorias da versão 1.7.0

- Ponte `WebMessageListener` restrita à origem oficial e ao frame principal. O adaptador JavaScript mantém os métodos usados pela plataforma, sem `addJavascriptInterface`.
- Remove o timer nativo duplicado de 20 segundos; a plataforma mantém uma consulta em primeiro plano e recebe um evento ao retomar o aplicativo. Timers e WebView são pausados quando o app sai de uso.
- Downloads do site pelo DownloadManager, preservando a sessão em relatórios autenticados. Em Android 10+, os arquivos vão para Downloads; em versões anteriores, para a pasta de downloads do aplicativo, acessível pela notificação do download.
- Área segura considera teclado, barras do sistema e recorte da câmera. Restauração de tela com fallback e seletor de arquivos com tratamento de indisponibilidade.
- Notificações nativas com texto genérico, visibilidade privada e sem repetir som para a mesma tag.
- R8 e redução de recursos ativados; build inclui testes da política de origem/links, lint e comparação do certificado com o APK 1.5.1.

Os recursos da ponte exigem Android System WebView com `WEB_MESSAGE_LISTENER` e `DOCUMENT_START_SCRIPT`. Se não estiverem disponíveis, o app orienta atualizar o WebView e mantém a navegação web, sem reinstalar uma ponte insegura.

O FCM usa mensagens de dados vinculadas à sessão. O arquivo `google-services.json` fica fora do repositório e é fornecido pelo segredo `VINKULO_GOOGLE_SERVICES_JSON`. O token é registrado pela página oficial autenticada; troca de token/conta e logout invalidam o vínculo local. O servidor revalida sessão, usuário e aviso antes do envio. O serviço exibe somente texto genérico e ignora mensagens de vínculos antigos. O envio depende da credencial cadastrada em Proprietário → Integrações → Firebase. É necessário instalar, abrir, entrar na conta e permitir notificações; encerramento forçado e restrições do Android podem impedir a entrega. Homologação em aparelho real ainda necessária.

O backend deve usar apenas mensagens FCM `data` com `bindingId`, `notificationId` e rota interna. Mensagens `notification` enviadas pelo Console Firebase podem ser exibidas automaticamente pelo SDK sem passar pela validação de vínculo; não use campanhas do console para conteúdo de usuários. Use o teste autenticado da plataforma.

## Login e Google Drive

O Google abre em uma aba segura sobre o aplicativo, como exigido pelo provedor. Ao concluir ou cancelar, o endereço `vinkulo://google-login-complete` devolve o usuário automaticamente ao app e a WebView finaliza o login ou a conexão do Drive.

## Permissões

- **Câmera:** solicitada quando o recurso da página oficial precisar dela, sem pedido automático na abertura.
- **Microfone:** concedido apenas quando um recurso da página solicitar áudio.
- **Notificações:** solicitada somente quando a pessoa ativa alertas na área
  autenticada que usa esse recurso, em Android 13 ou superior.

## Compartilhamento no WhatsApp

O botão do WhatsApp usa uma ponte nativa protegida pelo domínio oficial do Vínkulo. No aplicativo Android, ele abre diretamente a escolha de conversa ou grupo no WhatsApp ou WhatsApp Business.

## Gerar o APK de produção

O aplicativo de produção usa uma chave PKCS#12 estável com alias `vinkulo-release`.
O GitHub Actions recebe a chave exclusivamente pelos segredos
`ANDROID_SIGNING_KEYSTORE_BASE64` e `ANDROID_SIGNING_PASSWORD`, executa
`assembleRelease` e entrega `app-release.apk`. A chave, a senha e seus backups
nunca devem ser adicionados ao repositório.

Para o FCM, cadastre também o segredo `VINKULO_GOOGLE_SERVICES_JSON` com o conteúdo integral do arquivo baixado no Firebase Console. Ele deve corresponder ao pacote `com.vinkulo.app` do projeto `vinkulo-256e8`.

A versão 1.3.0 pública usava um certificado de depuração. Por isso, a primeira
instalação da versão 1.5.0 de produção exige remover a versão anterior uma única
vez. Depois dessa troca, as próximas versões assinadas pela mesma chave poderão
ser instaladas como atualização normal.

## Endereço conectado

`https://adote-gestao.da0602766.chatgpt.site`
