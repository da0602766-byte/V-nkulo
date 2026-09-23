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
- `scripts/pre-publicacao.sh` aprovado no commit publicado: TypeScript limpo, build/artefato aprovados e **470 testes web aprovados, zero falhas**.
- Tela local conferida no navegador em 390/1440 px claro e 320 px escuro, sem transbordamento horizontal. O teste de seleção do arquivo pela automação não foi concluído: a autorização da ferramenta foi dispensada. A API de upload foi validada por testes automatizados.

## Ativação pelo celular e homologação restante

1. Em [Contas de serviço](https://console.firebase.google.com/project/vinkulo-256e8/settings/serviceaccounts/adminsdk), gerar a chave privada e salvar o JSON em Downloads. Se o botão não aparecer, rolar a página ou usar a opção de site para computador do navegador.
2. Na Central de integrações do proprietário, selecionar o arquivo, marcar a autorização e tocar em **Verificar e salvar**. Não enviar a chave por chat nem colocá-la no código.
3. Instalar `/downloads/VINKULO_ANDROID_1.7.1.apk`, permitir notificações e entrar na conta. Abrir a configuração dentro do APK para registrar o aparelho e enviar o teste.
4. Confirmar notificação em primeiro plano, com aplicativo em segundo plano e fora da lista de recentes. Conferir toque no aviso, logout, troca de conta, ausência de rede e recuperação. Esse ensaio exige aparelho físico; não foi executado nesta entrega.

O Android pode impedir mensagens após **Forçar parada** até o aplicativo ser reaberto. O servidor usa mensagens de dados para a validação do vínculo pelo serviço nativo; campanhas de notificação enviadas diretamente pelo Firebase Console não seguem esse fluxo. A atualização não promete execução permanente nem ignora as restrições de bateria do sistema.

Referências: [HTTP v1 e autorização](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [validação sem envio](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send), [recebimento no Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).

## Publicação

Publicada a **versão 301**, commit `c3e63ce0126accd0b8c3b797630deb5107947eac`, em [Vínkulo](https://adote-gestao.da0602766.chatgpt.site), em 23/09/2026 às 17h03 (Brasília). Deploy `appgdep_6ab4307d0a888191a61dbb51593bf121` concluído com sucesso. Público anterior preservado.

Conferência em produção: home e APK HTTP 200; APK com tamanho e SHA-256 idênticos ao artefato validado; API Firebase e registro nativo retornam HTTP 401 sem sessão. Console autenticado abre a configuração e mostra **Aguardando credencial / 0 aparelhos**, estado real esperado antes da ativação. Supabase continua conectado, com agendamento confirmado.

A chave administrativa e a entrega física continuam pendentes de ativação pelo proprietário. PR Android [#15](https://github.com/da0602766-byte/V-nkulo/pull/15) atualizado e mantido em rascunho; sem merge.

## Correção do cadastro — 23/09/2026

O proprietário relatou erro ao salvar o JSON. Logs do PATCH `/api/proprietario/integracoes/firebase` confirmaram respostas 503 no navegador e no APK, incluindo 17h25min34 (Brasília), requisição `c6eb57d92b17814c2d13e07279661251`. Nenhum corpo de requisição ou credencial foi coletado.

Causa reproduzida no Workerd: `Request` rejeita `redirect: "error"` com TypeError. Os testes anteriores simulavam `fetch` no Node e não construíam a Request real do Workers, deixando essa incompatibilidade passar. O erro acontecia na chamada OAuth antes de o Google validar a chave.

As duas chamadas Firebase agora usam `redirect: "manual"`, compatível com Workers. Respostas de redirecionamento continuam recusadas; JWT e token não são encaminhados para o endereço de Location. O limite de tempo do FCM passa a começar após a obtenção do token OAuth, dando a cada etapa seu próprio prazo.

Novo teste executado no Miniflare/Workerd com a data e flags do build valida criptografia, construção nativa de Request, chamadas OAuth/FCM simuladas e rejeição de redirecionamentos nas duas etapas. A chave usada é efêmera e fictícia, sem acesso ao projeto. Sete testes direcionados e **471 testes da suíte completa** passaram. TypeScript/build/artefato aprovados; lint sem erros, 86 avisos combinados (inclui checkout e dois avisos de probes descartáveis em `.task-tools`); arquivos de código/teste alterados sem avisos.

Correção publicada na **versão 302**, commit `3c0341decdf1bd32928cf262a34b5406a1481005`, deploy `appgdep_6ab438035a008191a446b4a4c7d91c8d` concluído em 23/09/2026 às 17h35 (Brasília). Home HTTP 200, API Firebase sem sessão HTTP 401. Nenhuma alteração no APK ou nos segredos do ambiente.

O usuário deve atualizar a página e selecionar novamente o mesmo arquivo JSON já baixado. A ativação com a chave real e a entrega no celular ainda exigem essa ação do proprietário.
