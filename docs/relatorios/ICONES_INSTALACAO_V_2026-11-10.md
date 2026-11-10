# Ícones V para PWA e Android — 10/11/2026

Solicitação: substituir os ícones de instalação pela mesma marca V transparente já usada na plataforma. Publicação autorizada pelo proprietário na conversa.

## Implementação

- Base preservada: fonte publicada no Sites 473, commit `7e46ed565c63747c2b14a1cf9870fbb2fefa075f`. Alterações em checkout isolado; demais funcionalidades mantidas.
- PWA: PNGs transparentes 192/512, Apple 180 e favicon 32, derivados da marca existente, com URLs versionadas. Manifest mantém início/escopo `/` e explicita a identidade `/`. `purpose: any` preserva a arte transparente; não se declara uma arte maskable sem a margem exigida.
- As URLs antigas public/vinkulo-app-icon-{192,512}.png também servem o mesmo V para compatibilidade. Todos os links internos de APK foram atualizados.
- Cache do service worker atualizado para buscar os novos recursos. O funcionamento offline e as regras de cache de conteúdo privado foram preservados.
- Android: o recurso antigo `ic_launcher.xml` com cruz e fundo roxo foi substituído pelo PNG do V, mantendo o identificador de recurso, pacote e assinatura de atualização. APK 1.24.0, código 27.
- Aviso oferece a versão com o novo ícone para APKs anteriores a 1.24. A compatibilidade de política offline de 1.23 permanece válida.
- A distribuição atualiza o canal de homologação existente; o canal estável 1.7.1 não foi promovido nem alterado. O APK é instalado por cima da versão atual, sem apagar os dados.

## Proveniência Android

- Fonte: `da0602766-byte/V-nkulo`, branch `fix/vinkulo-launcher-v-icon`.
- Commit: `c1f36df5904f7670cc6e0216c53d7a48bc266765`.
- CI: https://github.com/da0602766-byte/V-nkulo/actions/runs/42869723233.
- Arquivo: `/downloads/VINKULO_ANDROID_1.24.0_HOMOLOGACAO.apk`, 732757 bytes.
- SHA-256: `b25189d36399dddf9410dd023556d90081a756a929be687ee851f239bad91b90`.
- Certificado esperado: `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.
- O PNG compilado `res/Cx.png` do APK foi decodificado e comparado pixel a pixel com a arte nativa e o PWA 512: idênticos, com transparência.

## Verificação

- Site: 999/999 testes aprovados, TypeScript e build Sites aprovados.
- Navegador: 7 cenários aprovados, incluindo arquivos de ícone reais com transparência, metadata/manifest, download/hash do APK, aviso para 1.23, ausência do aviso para 1.24, fechamento e controles de toque em 390/768/1864 px. Sem overflow ou erros de página.
- Testes shell Android: 53/53 aprovados, incluindo a transparência e remoção da cruz antiga.
- A primeira rodada da CI encontrou uma expectativa de versão 1.23 no teste de continuidade. Corrigida para 1.24; o APK dessa rodada não foi distribuído.
- Revisão React dos componentes alterados: mudanças limitadas a links/metadata e condição do aviso, com limpeza dos listeners preservada e sem nova dependência.
- O teste adicional de desconexão ao vivo falhou por validação de rede do emulador e por esperar modo offline enquanto a política pública estava desativada (`offlineEnabled: false`). A branch de ícones não executa esse teste dependente da configuração real; a branch funcional original o mantém. Essa transição de rede não está validada nesta entrega.
- CI final: sucesso em API 29/Android 10 e API 35/Android 15. Assinatura, cadeia de atualização release sem reinstalação, continuidade de dados com atualização/reabertura e suíte local aprovadas. API 29: 29 casos, 0 falhas, 7 ignorados por capacidade/seleção do ambiente.
- Publicação: o roteiro de navegador verifica novamente os ícones reais, metadata e hash do APK na URL de produção; evidência da execução posterior será registrada no fechamento local.

## Limites e instalação

Não houve teste em celular físico. O navegador e o launcher podem aplicar sua própria forma externa ao ícone. A imagem fornecida pelo projeto não contém fundo quadrado.

Ícones já instalados podem continuar em cache no aparelho. Atualize o APK por cima da instalação atual. Para um atalho antigo do navegador, remova somente o atalho da tela inicial e adicione novamente. Não limpe os dados do aplicativo nem desinstale se houver trabalho pendente. O APK não se instala automaticamente.

Referências oficiais: [ícones do manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons), [atualização da identidade PWA](https://developer.chrome.com/blog/improvements-to-web-app-updates?hl=en), [ícones Android](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
