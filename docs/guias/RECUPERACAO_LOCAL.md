# Recuperação local verificável

Atualizado em 24/10/2026. Este procedimento reconstrói os dados de um arquivo
`vinkulo-reset-v1` em **outro banco SQLite local**, sem chamar serviços externos.
Não restaura produção, não executa reinicialização e não substitui backup periódico.

## Entradas

- O JSON já exportado do histórico de reinicializações, mantido em pasta privada.
- Uma cópia SQLite consistente e confiável da mesma instalação, com o esquema
  correspondente ao arquivo, o catálogo atual de planos e a conta atual do
  proprietário, incluindo CPF e credenciais. Essa base pode conter dados: somente
  sua cópia de trabalho será reconstruída. Não precisa estar vazia.
- O e-mail atual do proprietário, conferido independentemente do JSON.
- Node compatível com o projeto e `node:sqlite`. Validação desta
  entrega: Node 24.19.0. Não requer instalação de biblioteca ou conta externa.

**Não reinicie a plataforma para criar um backup.** O arquivamento existente é
uma operação destrutiva. Use este procedimento somente com um arquivo já
disponível e cópias locais autorizadas. Se não houver arquivo ou base confiável,
o procedimento não deve ser executado com dados reais.

## Executar

Na raiz do projeto, usando caminhos locais privados e um nome de saída novo:

```powershell
npm run recovery:local -- --archive "C:\RecuperacaoPrivada\arquivo.json" --baseline "C:\RecuperacaoPrivada\base-atual.sqlite" --output "C:\RecuperacaoPrivada\recuperado.sqlite" --owner-email "proprietario@exemplo.com"
```

O relatório JSON vai para a saída padrão. Ele contém hash SHA-256 do arquivo,
contagens por tabela, exclusões, contas desativadas, anexos não recuperados e
resultado de integridade. Não contém linhas, senhas, CPF ou e-mails. Pode ser
salvo pelo operador; confira também o código de saída do comando.

O código de saída zero e `integrity: "ok"` confirmam a reconstrução local.
Qualquer falha impede a entrega do arquivo de saída. Uma saída existente nunca
é sobrescrita. O banco de base é aberto somente para leitura; a cópia usa
[`VACUUM INTO`](https://www.sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause),
que gera uma fotografia consistente sem alterar o banco original. Inclui as
transações já confirmadas no WAL. Não copie apenas o arquivo principal
de um banco ativo e descarte seu WAL.

## O que é preservado e o que muda

- Conta e identidade CPF atuais do proprietário vêm da base confiável, não do
  arquivo antigo. A senha atual é mantida; será necessário entrar novamente.
- Dados operacionais conhecidos são reconstruídos a partir do arquivo.
  Outros dados operacionais presentes somente na base não são mesclados.
- Catálogos de planos e contadores de proteção do login vêm da base atual.
- Outras pessoas são recuperadas **inativas e sem senha**. Suas fichas e vínculos
  ficam disponíveis para revisão técnica; reativação e emissão de credenciais
  exigem procedimento separado. Não use senhas padrão compartilhadas.
- Sessões, recuperação de senha, convites, links de cadastro/contratação,
  acessos temporários, autorizações offline, filas/dispositivos de push,
  conexões Google e configurações de integrações não são reativados.
- Tokens de compartilhamento de escalas e senhas de solicitações LOG1 são
  removidos. As configurações gerais também são excluídas nesta primeira versão;
  temas e preferências ali armazenados precisam ser reconfigurados.
- Os gatilhos do esquema confiável são reinstalados depois da importação.
  Durante a importação, não são produzidos avisos ou filas automáticas.
- Páginas livres da cópia final são compactadas para não reter resíduos das
  sessões e configurações excluídas.

## Verificações e limites

O processo confere inventário completo, colunas, tipos de valores, contagens,
restrições de unicidade, chaves estrangeiras, integridade SQLite e preservação da
identidade do proprietário. SQL presente no JSON nunca é executado. Tabelas
desconhecidas e versões incompatíveis exigem revisão; não há importação parcial
silenciosa. O arquivo tem o limite de 16 MiB do exportador atual.

O hash do relatório identifica o arquivo usado; **não é assinatura de origem**.
O operador deve obter o JSON e a base por meios confiáveis da mesma instalação.
No Windows, mantenha a pasta com acesso restrito à conta responsável. O banco
recuperado e o JSON contêm dados pessoais e não devem ser adicionados ao Git.

Esse arquivo não contém os binários de anexos nem conteúdos que já estejam
somente no Drive ou em outro armazenamento. O relatório informa a quantidade
de referências a anexos, não a disponibilidade deles. Dados cifrados dependem
das chaves originais; um banco estruturalmente íntegro não prova que esse conteúdo
pode ser decifrado. Não há recuperação automática desses serviços.

Antes de qualquer plano de retorno à produção, revisar dados, permissões,
agendamentos editoriais, referências de mídia, configurações e estratégia de
reativação de contas em ambiente isolado. A ferramenta não faz essa promoção.
O teste de login utiliza a configuração de proprietário e a chave de autenticação
da mesma instalação; tais segredos não estão no relatório nem são pedidos pelo CLI.

## Evidência automatizada

`tests/platform-recovery.test.mjs` cobre restauração real em SQLite, rejeição de
arquivo incompleto/adulterado, preservação das entradas, saída já existente,
SQL injetado no campo de esquema, tabela desconhecida, vínculos quebrados e
proprietário desativado. Um ensaio adicional usa o Worker compilado para gerar
e exportar o arquivo em banco descartável, recuperá-lo, recusar a sessão antiga
e entrar novamente com a senha atual do proprietário.

Para reproduzir, compile antes de executar:

```text
node --test tests/platform-recovery.test.mjs
```

Essa evidência usa dados fictícios; não declara recuperação homologada de uma
base real, de arquivos externos ou de aparelhos.
