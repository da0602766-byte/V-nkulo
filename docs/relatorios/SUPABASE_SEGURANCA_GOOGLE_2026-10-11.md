# Supabase: segurança e preparação de contas pelo Google

Data: 11/10/2026. Base: Sites 378, fonte `6405e05d22935bd9d098c0518613c56e24c6125b`.

## Resultado

As funções `vinkulo_current_tenant_id()` e `vinkulo_is_system_owner()` apenas leem claims do JWT. A migração `20261011220436_harden_claim_helpers.sql`, criada com Supabase CLI 2.120.0, muda ambas para SECURITY INVOKER e fixa search_path em pg_catalog/pg_temp. Os resultados, assinaturas e permissões de execução foram preservados. A alteração já foi aplicada no projeto `erdyearvkahtwdmpcvgc`; os quatro avisos de execução com privilégios elevados desapareceram do Security Advisor.

O vínculo progressivo de contas passa a atender também o login Google validado, tanto no navegador quanto no retorno Android. Antes da criação, confere conta ativa no D1, sub Google salvo, e-mail do cadastro, perfil remoto e metadado administrativo de identidade legada. Um e-mail coincidente sem identidade legada correspondente não autoriza assumir uma conta existente.

A criação Google usa a API administrativa Auth sem senha, sem importar hash PBKDF2, sem mensagem de convite e sem alterar senha existente. O caminho já existente de CPF/senha, primeiro acesso ou redefinição poderá sincronizar uma senha validada posteriormente. A rotina compartilha a trava de limpeza e as verificações de projeto/integração. Retoma uma criação interrompida, trata duplicidade concorrente e registra falhas sem impedir o login atual ou expor erro remoto/credenciais.

Consentimento exclusivo para Google Drive não inicia vínculo Auth. A opção de pausar vínculos continua valendo para ambos os tipos de login. O texto do painel foi atualizado para explicar o alcance real.

## Verificação

- Banco real: testes transacionais sob anon e authenticated confirmaram que user_metadata não concede propriedade/comunidade, app_metadata válido conserva os resultados e UUID inválido retorna nulo. Nenhum dado de usuário foi alterado por esses testes.
- Security Advisor após a migração: nenhum aviso de SECURITY DEFINER publicamente executável; restam cinco informações de RLS sem políticas e um aviso de proteção de senhas vazadas.
- Build/artefato Worker e TypeScript aprovados.
- Nove testes comportamentais novos aprovados: criação sem senha, CPF posterior na mesma conta, repetição, retomada, concorrência, identidade inválida/conflitante, projeto alterado/inativo, falha remota, sessão web, retorno Android e exclusão do fluxo Drive.
- Suíte completa: 737 testes, 729 aprovados, oito falhas preexistentes. As oito foram reproduzidas em extração limpa da fonte base: testes estáticos de interface em v189, v190, v197 e v198, relacionados a textos/componentes de imagens, navegação, fio, configurações e menu móvel. Os testes existentes de CPF, primeiro acesso, redefinição, revogação de sessão, proteção dos catálogos e integração Supabase passaram.
- Painel real do componente conferido em prévia isolada com dados fictícios; consulta apresentou o estado esperado. Captura: `../supabase-auth-previa.png` no diretório da tarefa. Não é captura do banco de produção.
- A sessão de membro estava aberta no site. A área administrativa exigiu nova autenticação de proprietário; não foi contornada. Não foi realizado login Google de uma pessoa real para criar conta apenas como teste.

## Estado e limites

O projeto está no plano Free. A proteção nativa contra senhas vazadas exige Pro ou superior, conforme https://supabase.com/docs/guides/auth/password-security. Nenhum plano foi contratado ou alterado.

As cinco tabelas de preparação permanecem com RLS habilitada e sem políticas para clientes, conforme decisão da migração 0010. Não abrir acesso apenas para eliminar avisos informativos. O índice sem uso foi mantido, pois a migração operacional ainda não está em uso.

Na inspeção inicial: quatro comunidades, 16 perfis, 21 vínculos, 16 detalhes cadastrais, uma conta Auth ligada e 70 objetos em bucket privado. O Cron estava ativo a cada cinco minutos. Esses totais não substituem uma comparação atual com D1.

Esta etapa prepara contas e reduz privilégios desnecessários. **Não conclui a migração da autenticação**: provedor OAuth no Supabase, emissão/renovação/revogação integrada das sessões, recuperação e testes completos de troca do provedor continuam pendentes. O aplicativo segue usando sessões e autorização D1. Os demais módulos operacionais e o corte de mídia também continuam no plano de migração. Contas ausentes serão preparadas em logins válidos quando a política de vínculo estiver ativa; não houve criação em massa.

## Publicação

Código validado e pronto para publicação. Registrar abaixo o resultado confirmado do Sites após o envio.

Referências: https://supabase.com/docs/guides/database/functions e https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0.
