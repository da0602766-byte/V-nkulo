# Relatório de implementação — VÍNKULO

**Data:** 08/08/2026  
**Escopo:** atualização aprovada do guia de melhorias, preservando os módulos existentes.

## Resultado

- Identidade pública e privada consolidada como VÍNKULO.
- Categorias de visitantes isoladas por comunidade.
- Equipes independentes por ministério, com limite de participação e filtro de escalas.
- Públicos direcionados para pedidos e solicitações, com destinatários resolvidos no servidor.
- Chat privado com atalho, busca, presença recente, não lidas e confirmação de visualização.
- Navegação pública estabilizada para carregamento completo entre páginas no runtime do Sites.
- Migração de banco versionada sem exclusão de dados existentes.
- Registros demonstrativos arquivados de forma reversível, com auditoria por comunidade e sem exclusão física.
- Comentários públicos restaurados com autenticação, privacidade opcional e bloqueio por publicação.
- Publicações sem imagem renderizam somente o conteúdo real, sem capa fictícia.
- Chat rápido não bloqueia a interface, evita duplicidade de pessoas e mantém mensagens fora do sino de notificações.
- Área do Proprietário ganhou auditoria pesquisável, filtros, detalhes expansíveis e atalhos para listas completas.

## Segurança e isolamento

- Todas as novas rotas resolvem a comunidade pela sessão no servidor.
- Nenhum identificador enviado pelo frontend substitui o tenant autenticado.
- Equipes, categorias, escalas, solicitações e mensagens não cruzam comunidades.
- A interface não concede permissões; cada ação é novamente validada nas APIs.

## Automação

- A programação editorial autorizada permanece ativa conforme as políticas configuradas.
- Conteúdo proibido continua bloqueado.
- Geração livre por IA continua marcada como integração externa.

## Validação

- Build e artefato de hospedagem válidos.
- Migrações aplicadas em banco de teste.
- Suíte automatizada, lint e verificação de whitespace executados.
- 52 testes automatizados aprovados no conjunto completo.
- Lint executado sem erros; permanecem apenas os avisos já conhecidos de otimização de imagens e um hook legado fora deste escopo.
- Página inicial conferida visualmente na prévia local; o diretório depende da inicialização do D1 nesse ambiente efêmero, mas foi validado na integração com as migrações aplicadas.
- Hotfix V8.3 autorizado para publicação pelo proprietário.

## Hotfix V8.3

- Janela rápida de chat com controles horizontais responsivos.
- Integrantes dos ministérios exibem uso atual e saldo de escalas; o limite individual é configurável e validado no backend.
- Uma única ação de criação de escala por tela.
- Feed interno exibe autor, foto, função e comentários persistentes.
- Células aceitam membros ativos da comunidade e registros descritivos de pessoas externas.
- Listas e formulários críticos ficaram mais compactos, paginados e consistentes nos temas claro e escuro.
- Painéis pastoral e de líder foram unificados; líderes recebem somente o próprio escopo.
- A antiga exceção visual da Igreja Renascer em Cristo foi removida. O mesmo layout ministerial agora vale para comunidades atuais e futuras.
- Mutações atualizam apenas os dados afetados, sem recarregar toda a página.
