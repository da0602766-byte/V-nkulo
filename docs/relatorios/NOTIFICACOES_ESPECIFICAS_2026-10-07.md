# Notificações específicas — 07/10/2026

## Problema e correção

A sincronização web, a resolução autenticada do push e as duas entradas nativas do Android substituíam o conteúdo por um texto genérico. Alterar somente o site não corrigiria os aplicativos já instalados.

O site preserva o título e a mensagem registrados para cada notificação. Mensagens de conversa resolvem remetente e prévia somente depois das verificações de acesso. Um formatador compartilhado normaliza espaços e limita o tamanho por caracteres Unicode, sem dividir emojis. Identificadores, destinos e controle de avisos já exibidos são preservados.

O Android 1.20.0 passa título e mensagem pela ponte web. Para FCM, um Worker busca o conteúdo pela rota autenticada, com a sessão e o vínculo atuais. Falhas temporárias têm tentativas limitadas; vínculos revogados, avisos lidos e sessões inválidas não geram aviso. O conteúdo não é gravado na fila do Worker nem enviado no payload dos provedores. A notificação expandida mostra a mensagem e mantém `VISIBILITY_PRIVATE`.

## Verificação

- Site: 622 testes aprovados, TypeScript limpo, lint sem erros e um aviso preexistente; build e artefato Worker válidos.
- Regressões: três avisos distintos na ponte e no navegador, normalização Unicode, deduplicação, sessão/destinatário incorretos e conteúdo de chat autorizado.
- Android: 39 testes JavaScript e 10 testes unitários Java aprovados. CI final 37706298961 aprovada nas APIs 29 e 35. Inclui lint, assinatura, atualização e preservação de dados, além de três notificações sintéticas na bandeja e rejeição após revogar o vínculo.
- Ajustes na validação: a primeira execução revelou a versão 1.19.0 ainda fixada no teste de atualização; a segunda confirmou os conteúdos da bandeja, mas a gravação da captura violava o armazenamento delimitado do Android. A versão esperada foi atualizada e o teste passou a usar `OfflineUiEvidence`, helper já existente; nenhuma asserção funcional foi removida.

## Distribuição e limites

Fonte Android final: `dd921245f44fb3a7b528dd54f194a46d6982e14f`. A versão 1.20.0/code23 será distribuída no canal de homologação; estável 1.7.1 preservado. APK: 634565 bytes, SHA-256 `545048ed3e986f7146407fb5ccf46e6695db54bc948281c3a311bdb34a0fb520`. ZIP da API35 conferido com o digest do GitHub `7dc8d091079a2cc8a5cd2180c3f5632ee5e774215e646d2ddc004a1f7310db90`. Assinatura continua com certificado SHA-256 `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`. CI concluída com sucesso; publicação em preparação.

O aparelho precisa receber a atualização do APK. Avisos antigos já presentes na bandeja não são reescritos. Testes usam dados sintéticos e não enviam mensagens reais. Validação em aparelho físico e entrega real pelo provedor permanecem pendentes.

A observação da bandeja no teste aguarda publicação/cancelamento assíncronos, com prazo de cinco segundos. Todas as asserções de título, corpo, mensagem expandida, privacidade e rejeição após revogação passaram na execução final.

