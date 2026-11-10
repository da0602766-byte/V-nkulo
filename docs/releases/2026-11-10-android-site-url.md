# Correção da URL do aplicativo Android — 10/11/2026

O APK 1.24.0 abria `adote-gestao.da0602766.chatgpt.site`, mas o Site passou para `vinkulo.da0602766.chatgpt.site`.

A versão Android 1.24.1 (code 28) usa o novo endereço para abertura, navegação confiável, permissões nativas, consultas offline e controle remoto. A abertura compartilha a origem de NativePolicy. Histórico restaurado de outra origem volta à plataforma atual. A lista de origens não foi ampliada para outros domínios.

Fonte Android: `dcdd898c91d5aa251586b0eee5740ec63c2bd412`, branch `fix/vinkulo-site-url`.
CI: https://github.com/da0602766-byte/V-nkulo/actions/runs/42908725705
APK: `VINKULO_ANDROID_1.24.1_HOMOLOGACAO.apk`, 732717 bytes.
SHA-256: `6ec04f04991ddad36ffb347e44ee9ede94b61a48c1b7d6bb708114a743267e2b`.
Certificado original: `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`.

Os botões de instalação e orientações entregam a nova versão. O aviso alcança também o APK 1.24.0, sem revogar o contrato offline compatível da versão 1.23. Metadados de compartilhamento usam o novo domínio.

Validação web: TypeScript e build; testes de versão/ícones, política offline e privacidade do compartilhamento; aviso em 390/768/1864px, sem transbordamento, ações de 44px e fechamento funcional. SHA-256 do ZIP igual ao digest do Actions; origem nova presente no DEX e origem anterior ausente. Validação física em celular permanece pendente.

Para atualizar: abrir o novo endereço no navegador, baixar o APK e instalar sobre a versão existente, sem desinstalar. Uma nova sessão pode ser necessária no novo domínio. Atalhos PWA criados no domínio antigo devem ser recriados pelo novo site.
