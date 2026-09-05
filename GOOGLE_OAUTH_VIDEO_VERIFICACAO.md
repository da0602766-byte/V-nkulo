# Roteiro do vídeo de verificação OAuth — VÍNKULO

Este é um roteiro para gravação, não o vídeo em si. Grave na tela cheia do
navegador, sem dados de outra pessoa visíveis (use uma conta de teste),
narre em português claro o que cada tela faz, e mantenha cada passo por
tempo suficiente para o Google conseguir pausar e ler.

Duração alvo: 3 a 5 minutos.

## 1. Abertura do VÍNKULO (0:00 – 0:20)

- Abra `https://adote-gestao.da0602766.chatgpt.site/`.
- Mostre a página inicial pública, sem estar logado.
- Narre: "Este é o VÍNKULO, uma plataforma de gestão para igrejas e
  comunidades. A página inicial é pública, sem necessidade de login."

## 2. Página inicial pública (0:20 – 0:35)

- Role até o rodapé.
- Clique em **Privacidade** — mostre a página carregando.
- Narre: "A Política de Privacidade explica, entre outras coisas, como a
  Conta Google e o Google Drive são usados."

## 3. Política de Privacidade (0:35 – 1:00)

- Role até a seção "5. Conta Google e Google Drive".
- Aponte o texto que diz que login e Drive são decisões separadas, e que
  o escopo do Drive é limitado aos arquivos do próprio app.
- Volte ao início e clique em **Exclusão de dados** no rodapé, mostrando
  rapidamente que existe uma página dedicada a isso.

## 4. Login (1:00 – 1:20)

- Volte à página inicial, clique em **Entrar no VÍNKULO**.
- Mostre a tela de login, com o botão **Entrar com Google** visível ao
  lado do login tradicional.
- Narre: "O login com Google é opcional — a plataforma também aceita
  e-mail e senha."

## 5. Clique em "Entrar com Google" (1:20 – 1:35)

- Clique no botão.
- Mostre a URL mudando para `accounts.google.com`.

## 6. Tela de consentimento do Google (1:35 – 2:00)

- Deixe a tela de consentimento do Google visível por alguns segundos,
  mostrando o nome do app (VÍNKULO), o logo e os escopos pedidos nesta
  etapa: **apenas** identificação básica (nome, e-mail, foto) — sem
  Drive.
- Narre: "Nesta etapa, o VÍNKULO pede apenas os dados básicos de
  identificação. O acesso ao Google Drive é uma etapa separada, pedida
  somente se o usuário decidir conectar o Drive depois."
- Autorize.

## 7. Login concluído (2:00 – 2:15)

- Mostre o redirecionamento de volta ao VÍNKULO, já autenticado, caindo
  no painel.
- Narre: "O login foi concluído e a conta foi criada automaticamente, sem
  vínculo a nenhuma comunidade até que o usuário seja convidado."

## 8. Área de integrações (Minha conta) (2:15 – 2:40)

- Navegue até **Minha conta → Privacidade e armazenamento**.
- Mostre a linha "Conta Google — Vinculada · [e-mail]" separada da seção
  do Google Drive, que aparece como "Não conectado".
- Narre: "Aqui o usuário vê claramente que a Conta Google está vinculada,
  mas o Google Drive ainda não foi autorizado — são estados
  independentes."

## 9. Conexão opcional do Google Drive (2:40 – 3:10)

- Clique em **Conectar Google Drive**.
- Mostre a nova tela de consentimento do Google, desta vez com o escopo
  adicional do Drive visível (arquivo por arquivo, não "todo o Drive").
- Narre: "Agora o Google mostra o escopo adicional: acesso limitado aos
  arquivos que o próprio VÍNKULO cria dentro do Drive do usuário."
- Autorize e volte ao VÍNKULO, mostrando "Conectado como [e-mail]".

## 10. Demonstração de uma função que usa o Drive (3:10 – 3:40)

- Vá a uma tela que grava arquivo (por exemplo, envio de uma foto de
  perfil ou um anexo de conversa).
- Envie um arquivo pequeno de teste.
- Abra o Google Drive do usuário de teste em outra aba e mostre a pasta
  "VÍNKULO — Arquivos pessoais" com o arquivo recém-criado.
- Narre: "O arquivo foi salvo diretamente no Google Drive do usuário — o
  VÍNKULO não mantém uma segunda cópia no próprio servidor."

## 11. Por que cada escopo é necessário (3:40 – 4:00)

- Volte à Política de Privacidade, seção 5, e leia em voz alta a
  justificativa: identificação básica para login; `drive.file` só para
  os arquivos que o próprio app cria, nunca o Drive inteiro.

## 12. Desconexão / revogação (4:00 – 4:25)

- Volte a **Minha conta → Privacidade e armazenamento**.
- Clique em **Desconectar Drive**, confirme o aviso.
- Mostre a tela voltando a "Não conectado".
- Narre: "O usuário pode desconectar o Drive a qualquer momento. Os
  arquivos que já estavam lá continuam na Conta Google dele — o VÍNKULO
  não os apaga."
- Opcional: mostre também o mesmo arquivo ainda existindo no Google Drive
  do usuário, na aba aberta anteriormente.

## 13. Encerramento (4:25 – 4:40)

- Volte à página inicial.
- Narre: "Isso resume o fluxo de login e integração com o Google Drive no
  VÍNKULO: login opcional, Drive opcional e separado, escopo mínimo, e
  controle total do usuário sobre desconectar quando quiser."

---

## Observações para quem for gravar

- Use uma **Conta Google de teste**, nunca uma conta real de usuário.
- Se o app ainda estiver em modo **Testing**, garanta que a conta de
  teste está na lista de Test users do Google Auth Platform antes de
  gravar — senão o Google barra o login na hora da gravação.
- Não é necessário gravar áudio profissional; narração clara já atende.
- Não mostre nenhuma tela com dados de outra pessoa (nome, e-mail,
  telefone) que não seja a própria conta de teste.
