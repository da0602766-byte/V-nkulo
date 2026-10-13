# Modo offline manual — 13/10/2026

O painel passa a oferecer uma entrada visível para trabalhar no aparelho mesmo com internet. No Android compatível, o link abre `/mobile-app/index.html?mode=manual`. Versões anteriores recebem o download da atualização, evitando abrir uma tela que redirecionaria imediatamente ao painel.

## Correção Android 1.22.0 (código 25)

- A volta automática ao online respeita o modo manual, inclusive na resposta assíncrona de navegação. A saída continua disponível no botão do espaço local.
- Abrir preparação, Visitantes ou outros formulários também mantém a navegação local ao reconectar.
- A ativação informa seu progresso. Uma resposta ausente deixa de desabilitar os controles indefinidamente; respostas atrasadas são ignoradas, sem reenviar automaticamente operações.
- Autorizações, expiração, isolamento por conta/comunidade, cifragem e confirmação de envios permanecem obrigatórios. Relatórios de células continuam como rascunhos locais.

Fonte Android: `cba1b724472b8449794d7b5be4c045527bd1df17`, branch `fix/manual-offline-20261013` no repositório `da0602766-byte/V-nkulo`.

## Verificação

- Interface local: 52 testes JavaScript, incluindo ativação, timeout, resposta atrasada e exibição dos formulários.
- Backend: 17 testes de cadastros e módulos passaram, incluindo operações reais em D1, repetição idempotente, permissões e isolamento.
- Web: TypeScript e compilação passaram. Entrada inspecionada no navegador em desktop e 390 × 844; capacidade Android simulada somente na página temporária de QA, removida antes da publicação.
- A validação física no aparelho do usuário permanece pendente. Atualizar por cima da instalação existente, preservando os rascunhos. Não desinstalar para atualizar.

## Uso

1. Atualizar o APK, entrar na conta e selecionar a comunidade.
2. No painel, tocar em **Abrir modo offline**, mantendo a internet ligada.
3. Ativar as funções desejadas e conferir o resultado de cada uma.
4. Abrir **Cadastrar visitante**, **Criar anotação** ou outra ação disponível.
5. Guardar um rascunho ou autorizar seu envio. Conferir a confirmação em **Meus registros salvos**.

Melhoria sugerida: mostrar no painel a validade do acesso offline e a quantidade de envios pendentes.
