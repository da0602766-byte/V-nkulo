# Android — atualização, recuperação e promoção

## Instalar uma atualização

1. Confira versão, canal e link no manifesto `public/downloads/android-release.json`. O canal de homologação é destinado a testes acompanhados; o canal estável é o oferecido na instalação geral.
2. Mantenha o app instalado. Baixe o novo APK oficial e aceite a atualização do Android sobre a instalação existente. Não limpe os dados nem desinstale para resolver um erro de instalação.
3. Abra o app com a mesma conta e comunidade. Confira seus rascunhos e filas antes de novos envios. Permissões podem precisar ser confirmadas no fluxo correspondente.
4. Prepare as consultas/módulos com internet antes de usar offline. As cópias têm prazo de validade; reabrir após reinício do aparelho exige conexão e nova preparação.

Para verificar arquivos baixados: compare o SHA-256 e o tamanho publicados. A rotina de CI também verifica a assinatura do APK, que deve permanecer a mesma entre versões.

## Recuperar trabalho pendente

| Situação | Ação |
| --- | --- |
| Sem internet / aguardando envio | Reconecte e abra o aplicativo. O agendamento em segundo plano não tem prazo garantido. Aguarde o recibo; não recrie a mesma operação manualmente. |
| Sessão vencida / autorização suspensa | Entre com a mesma conta/comunidade e prepare novamente o módulo. Os registros permanecem vinculados ao contexto original. |
| Conflito ou recusa | Leia o motivo, confira o estado atual online e use o fluxo de revisão. Um registro com resultado incerto não deve ser apagado. |
| Processo foi encerrado durante envio | Reabra. A fila recupera o envio com o mesmo UUID; a confirmação atrasada de um worker anterior não pode sobrescrever a tentativa atual. |
| Erro ao atualizar | Preserve a instalação e os dados. Registre versão instalada, mensagem do Android e espaço livre. Correção de release usa código de versão maior e a mesma assinatura. |
| Troca de aparelho | Sincronize e confira os resultados antes. Rascunhos/filas cifrados não são transferíveis pelo backup Android; a chave permanece na instalação de origem. |
| Dados/chave apagados ou aparelho perdido | Conteúdo já confirmado permanece no servidor. Conteúdo exclusivamente local pode não ser recuperável. Não prometer restauração sem a chave original. |

## Homologação física necessária para promover à distribuição geral

Registrar modelo, Android/WebView, versão/hash do APK, data, rede, resultado e evidência de cada cenário. Usar conta/comunidade de teste autorizada; dados de teste não entram na comunidade real.

- Atualizar por cima de uma versão anterior com rascunho e fila pendente; conferir o conteúdo e o UUID após atualização e encerramento do processo.
- Preparar com sessão real, ativar modo avião, consultar, criar rascunhos e enfileirar. Reconectar e confirmar um único resultado no servidor.
- Testar expiração, reinício, perda de permissão e mudança de conta/comunidade; depois recuperar as pendências na conta original.
- Testar edições concorrentes entre dois aparelhos e o painel online, incluindo checklist e anotações.
- Confirmar login/OAuth, câmera/anexo e push com o app em primeiro plano, em segundo plano e fechado.
- Verificar TalkBack, fonte ampliada, teclado, botão/gesto Voltar e uso prolongado em aparelho modesto. Medir abertura e memória com as amostras definidas na arquitetura.

O registro de CI/emulador é complementar. A promoção não será registrada como concluída enquanto esses cenários físicos estiverem pendentes. A etapa 7 só encerra integralmente com esse resultado.

## Build e rastreabilidade

O build Android usa Gradle Wrapper 8.10.2 com checksum oficial, dependências travadas/verificadas e actions fixadas por SHA. Os dois jobs de geração produziram lockfile, checksums e Wrapper idênticos. A geração inicial de hashes registra os artefatos baixados dos repositórios configurados, não substitui auditoria de cada dependência. Novos hashes devem ser revisados e versionados antes do build final estrito; não regenerá-los automaticamente em todo release.

A CI testa a cadeia assinada de releases e, separadamente, dados pendentes com builds debug antigo/novo no emulador descartável. O segundo teste não instala instrumentos de teste no release. Arquivos de distribuição são conferidos por `node scripts/verify-android-release.mjs`.

Referências: [Wrapper/checksum do Gradle](https://docs.gradle.org/current/userguide/gradle_wrapper.html), [verificação de dependências](https://docs.gradle.org/current/userguide/dependency_verification.html), [travamento de versões](https://docs.gradle.org/current/userguide/dependency_locking.html), [regras de backup Android](https://developer.android.com/identity/data/autobackup).
