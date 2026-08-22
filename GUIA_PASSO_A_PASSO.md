# Guia passo a passo — Sistema ADOTE

## 1. Primeiro acesso

1. Abra o endereço do ADOTE no computador ou no navegador do celular.
2. Escolha **Entrar com ChatGPT**.
3. Entre com a sua conta.
4. O primeiro usuário que entrar será criado como **ADMIN**.
5. O painel abrirá com os indicadores e os gráficos ainda zerados.

## 2. Cadastrar o primeiro visitante

1. No painel, clique em **Novo visitante**.
2. Preencha o nome completo e a data de entrada.
3. Informe telefone, e-mail, batismo, célula, acompanhante e ministério quando existirem.
4. Selecione o status atual da pessoa.
5. Clique em **Salvar visitante**.

O cadastro aparecerá na lista de visitantes e será considerado automaticamente nos gráficos.

## 3. Registrar um acompanhamento

1. Entre em **Visitantes** ou **Acompanhamentos**.
2. Localize a pessoa.
3. Clique em **Registrar contato**.
4. Escolha ligação, WhatsApp, presencial ou outro.
5. Descreva o resultado e, se necessário, defina a data do próximo contato.
6. Salve o acompanhamento.

## 4. Criar usuários e escolher permissões

1. Entre em **Usuários e permissões**.
2. Clique em **Adicionar usuário**.
3. Digite o nome e exatamente o e-mail da conta que a pessoa utilizará para entrar.
4. Escolha o perfil: Administração, Recepção, Acompanhante ou Líder de célula.
5. Marque somente as permissões necessárias.
6. Salve.

Permissões disponíveis:

- Visualizar visitantes.
- Cadastrar visitantes.
- Editar visitantes.
- Inativar visitantes.
- Registrar acompanhamentos.
- Visualizar relatórios.
- Gerenciar usuários e permissões.

Todas as permissões são verificadas no servidor. Esconder um botão na tela não é a única proteção.

## 5. Senha errada e redefinição

O ADOTE não guarda senhas. A autenticação e a proteção contra tentativas incorretas são feitas pelo provedor de acesso.

1. Se a senha for digitada incorretamente repetidas vezes, siga a verificação apresentada na tela de login.
2. Use **Esqueci minha senha** na página de acesso.
3. Conclua a redefinição pelo e-mail da conta.
4. Volte ao endereço do ADOTE e entre novamente.

Um administrador do ADOTE pode inativar o acesso ou alterar permissões, mas nunca consegue descobrir a senha de outra pessoa.

## 6. Entender os gráficos

No painel, use os botões:

- **Semana**: cadastros nos últimos sete dias.
- **Mês**: cadastros agrupados por semana do mês atual.
- **Ano**: cadastros agrupados por mês do ano atual.

Os valores são atualizados com os registros reais do banco.

## 7. Acessar pelo celular

1. Abra o mesmo endereço do sistema no Chrome, Edge ou Safari.
2. Entre com a conta autorizada.
3. No menu do navegador, escolha **Adicionar à tela inicial**.
4. Um atalho do ADOTE aparecerá junto dos aplicativos.

O sistema adapta o menu, tabelas, formulários e gráficos à tela do celular.

## 8. Segurança e LGPD

- Cadastre somente dados necessários para o acompanhamento.
- Não compartilhe observações sensíveis com pessoas sem permissão.
- Inative usuários que saírem da equipe.
- Revise as permissões periodicamente.
- Evite compartilhar capturas de tela com dados pessoais.

## 9. Estrutura técnica

- `app/page.tsx`: entrada protegida do sistema.
- `app/components/`: painel, formulários, tabelas e gráficos.
- `app/api/`: operações de visitantes, usuários e acompanhamentos.
- `app/lib/access.ts`: usuários, perfis e autorizações.
- `db/schema.ts`: modelagem do banco.
- `drizzle/`: migrações SQL aplicadas na hospedagem.

## 10. Manutenção

Antes de alterar permissões ou excluir registros, confirme o usuário e o cadastro correto. Visitantes são inativados para preservar o histórico; não são apagados diretamente pela interface.
