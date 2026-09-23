# Firebase Android — cadastro pelo celular

## Entrega

O proprietário pode abrir `/proprietario?tab=integrations`, escolher **Configurar Firebase**, selecionar o JSON da conta de serviço do projeto `vinkulo-256e8` e autorizar o envio. O servidor valida o formato, o projeto, a chave RSA e o acesso real ao FCM antes de substituir uma configuração anterior. `google-services.json` continua sendo a configuração do APK; não autentica o servidor.

O APK **1.7.1**, código 10, registra seu token pela ponte restrita à origem do Vínkulo e à janela principal. `/api/push-native` exige sessão ativa e origem correta, associa o aparelho à sessão e renova o vínculo quando a conta muda. Logout/revogação de sessão remove o dispositivo no servidor; o aplicativo limpa o vínculo local e os avisos ao sair. Respostas atrasadas do cliente são descartadas.

A fila durável existente passa a encaminhar Web Push e FCM separadamente. Itens FCM aguardam configuração sem consumir tentativas. O envio FCM usa OAuth de curta duração, cache em memória, tempo limite, reenvio com espera progressiva e limite de tentativas. Só `UNREGISTERED` remove um token após resposta 404. Mensagens contêm identificadores e rota interna; o aplicativo mostra texto genérico, sem conteúdo privado na tela bloqueada.

## Proteção da credencial

- Acesso exclusivo ao proprietário ativo, proteção de origem e confirmação explícita de cadastro/desconexão.
- JSON até 16 KB; corpo da requisição limitado durante leitura, inclusive sem `Content-Length`.
- URLs OAuth/FCM fixas; nenhuma URL do arquivo é executada.
- Armazenamento AES-GCM com nonce aleatório e dados autenticados, em `configuracoes`. Chave derivada do `AUTH_SECRET` existente; não há migração nova.
- GET, catálogo e auditoria devolvem somente metadados. Chave, JWT e token OAuth não são registrados nem enviados ao navegador.
- Alterar/perder o `AUTH_SECRET` impede decifrar a configuração: cadastrar novamente a credencial. Revogação da chave no Google exige nova chave válida.
- O botão de teste limita o destinatário à conta autenticada do proprietário. Aceite do FCM não comprova exibição no aparelho.

## Evidências

- Android: commit `f5e1a06dad7147511f1ec3711d3b2e326c100ea1`, [workflow 35910594270](https://github.com/da0602766-byte/V-nkulo/actions/runs/35910594270), `testDebugUnitTest`, `lintRelease` e `assembleRelease` aprovados; 5 testes, zero falhas; lint sem erros e 14 avisos (compatibilidade, versões de dependências, orientação e recomendações Android).
- Assinatura de produção preservada: certificado SHA-256 `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
- APK: 382.230 bytes; SHA-256 `901e1d4e73bdc990d7d5d500ef10a422636777155cb821b6980e0cd083da7e8e`.
- ZIP de produção conferido com o digest do GitHub: `3c8cce48771fbf97c1eb29b8fd77a0d2e901189bed146cff0aa6c2bd8b661fbb`.
- Testes web cobrem criptografia real, assinatura RSA do JWT, recusa de projeto/arquivo/origem/usuário, preservação de credencial anterior após erro, fila FCM, troca de token, logout, permissão e descarte de resposta atrasada. Google/FCM são simulados nesses testes; não houve envio real com uma credencial do usuário.
- Verificador de segredos preservado. O reconhecimento do envelope PEM foi ajustado para extrair seu corpo e conferir o rótulo de fechamento, eliminando o falso positivo causado pelo marcador literal de formato.
- Lint da aplicação: zero erros e 43 avisos preexistentes. O script geral também percorre o checkout Android em `.task-tools`, contabilizando 84 avisos combinados.
- Tela local conferida no navegador em 390/1440 px claro e 320 px escuro, sem transbordamento horizontal. O teste de seleção do arquivo pela automação não foi concluído: a autorização da ferramenta foi dispensada. A API de upload foi validada por testes automatizados.

## Ativação pelo celular e homologação restante

1. Em [Contas de serviço](https://console.firebase.google.com/project/vinkulo-256e8/settings/serviceaccounts/adminsdk), gerar a chave privada e salvar o JSON em Downloads. Se o botão não aparecer, rolar a página ou usar a opção de site para computador do navegador.
2. Na Central de integrações do proprietário, selecionar o arquivo, marcar a autorização e tocar em **Verificar e salvar**. Não enviar a chave por chat nem colocá-la no código.
3. Instalar `/downloads/VINKULO_ANDROID_1.7.1.apk`, permitir notificações e entrar na conta. Abrir a configuração dentro do APK para registrar o aparelho e enviar o teste.
4. Confirmar notificação em primeiro plano, com aplicativo em segundo plano e fora da lista de recentes. Conferir toque no aviso, logout, troca de conta, ausência de rede e recuperação. Esse ensaio exige aparelho físico; não foi executado nesta entrega.

O Android pode impedir mensagens após **Forçar parada** até o aplicativo ser reaberto. O servidor usa mensagens de dados para a validação do vínculo pelo serviço nativo; campanhas de notificação enviadas diretamente pelo Firebase Console não seguem esse fluxo. A atualização não promete execução permanente nem ignora as restrições de bateria do sistema.

Referências: [HTTP v1 e autorização](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [validação sem envio](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send), [recebimento no Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).

## Publicação

Validação final e publicação registradas após a confirmação do deploy. A chave administrativa e a entrega física continuam pendentes de ativação pelo proprietário.
