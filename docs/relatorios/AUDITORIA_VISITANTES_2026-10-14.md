# Visitantes — auditoria de gestão e melhorias

Data: 14/10/2026. Escopo: cadastro e acompanhamento pastoral na área Visitantes, comparados à mensagem recebida pela equipe do Adote. Revisão sobre a versão remota c36bcd9991e76d45f05ae36efacd032ae53927de.

## Comparação com a solicitação

| Necessidade | Situação anterior | Entrega nesta revisão |
| --- | --- | --- |
| Nome, nascimento, idade, telefone e chegada | Já existiam | Datas reais validadas; idade e faixa etária calculadas a partir do nascimento |
| Adolescente ou adulto | Categorização por idade existente | Faixa explícita na ficha e exportação: criança até 11, adolescente de 12 a 17, adulto a partir de 18; ausência de nascimento não vira idade zero |
| Pessoas novas e antigas | Cadastro centrado em visitantes | Vínculo Visitante ou Membro na mesma ficha de cuidado |
| Batismo | Já existia | Preservado, com informação separada sobre recebimento do certificado |
| Encontro com Deus | Já existia | Preservado em cadastro, edição e exportação |
| Célula e ministério | Já existiam | Filtros e contadores para localizar quem ainda não está vinculado |
| Discipulado e discipulador | Ausentes na ficha | Participação e responsável, com validação quando a resposta for Sim |
| Contatos e visitas | Histórico de contatos existente | Canal Visita explícito; histórico paginado e consultável também após arquivamento |
| Responsável pelo acompanhamento | Havia quem recebeu e responsáveis por categoria | Campo próprio para o responsável pelo cuidado da pessoa |
| Doa a Doa | Ausente na ficha | Participação, necessidade de receber apoio e histórico descritivo de doações |
| Oficial e função | Não integrados à ficha de cuidado | Registro da condição e função; informar uma função é obrigatório quando Oficial = Sim |
| Observações e próximos passos | Observações e data de contato existentes | Ação descrita, prazo, responsável, conclusão e inclusão nas pendências do dia |
| Atualizar e recuperar cadastros | Edição e arquivamento existentes | Atualização parcial sem apagar campos omitidos; reativação preservando histórico |
| Login e acesso restrito | Autenticação, permissões e escopo de comunidade existentes | Novas rotas usam essas verificações; exportação restrita; conexão Google limitada a gestor permanente |
| Envio automático à planilha | Exportação manual existente | Integração com uma planilha Google existente, aba dedicada, fila persistente e estado de sincronização |

Os indicadores de integração são listas de trabalho. Estar sem ministério ou sem célula não é tratado como falha da pessoa. Respostas desconhecidas permanecem “Não informado” nos novos campos.

## Falhas corrigidas

1. **Perda de dados em edições parciais.** Alterar somente o status podia regravar outros campos com valores vazios ou antigos. A API agora preserva os campos omitidos, e as ações rápidas enviam somente a alteração necessária.
2. **Exportação incompleta.** A exportação dependia das pessoas carregadas na página. Agora consulta todas as fichas autorizadas da comunidade, inclusive arquivadas, sem aplicar os filtros visuais. Acima de 10.000 fichas, retorna erro explícito em vez de entregar arquivo truncado.
3. **Ficha que não abria fora da página atual.** As prioridades podiam apontar para alguém fora do lote de dez registros. O detalhe agora é buscado por ID e pelo escopo da comunidade.
4. **Histórico incompleto ou inacessível.** Incluídos carregamento de páginas anteriores e consulta de pessoas arquivadas; respostas atrasadas não misturam históricos.
5. **Regressão de pessoa integrada.** Registrar outro contato não retira mais automaticamente o status Integrado.
6. **Falsos duplicados.** Ter o mesmo familiar não impede mais cadastros distintos. Homônimos e contatos compartilhados exigem confirmação explícita ao criar, mantendo a consulta de possíveis duplicados.
7. **Categorias manuais substituídas.** A atualização automática por idade passa a preservar categorias escolhidas manualmente.
8. **Datas inválidas e respostas booleanas.** São recusadas datas inexistentes, nascimento ou chegada futuros; o texto “false” não é interpretado como verdadeiro.
9. **Aniversariantes limitados.** Removido o corte de cinco pessoas, para mostrar todos os aniversários do mês.
10. **Importação sem diagnóstico suficiente.** As linhas que falham ficam disponíveis para correção, com os primeiros motivos exibidos. A importação cria fichas; não é restauração integral de um backup.
11. **Controles sem função e experiência móvel.** Removido o falso seletor de colunas; ordenação identificada como da página; formulários e fichas com foco, Escape, rolagem e dimensões compatíveis com a escala de interface.

## Organização da interface

- Painel de prioridades com atalhos para célula, discipulado, ministério, certificado e apoio social.
- Ficha com resumo do cuidado, próximos passos e informações de integração antes dos formulários de edição.
- Novos campos agrupados em integração, Doa a Doa e plano de acompanhamento.
- Cadastro permite começar pelo nome e complementar depois; detalhes condicionais evitam combinações inconsistentes.
- Diálogos nativos isolam o foco e devolvem-no ao controle de origem. No celular, a ficha ocupa a tela, respeitando também a escala configurada no painel.
- Configuração da planilha mostra destino, funcionamento, última atualização, erros, sincronização manual e pausa.

## Funcionamento e limites da planilha

A escolha confirmada foi **usar uma planilha Google existente**. Nenhuma planilha real foi conectada nesta revisão, pois o link ainda não foi fornecido e a autorização da conta Google precisa ser concluída.

Após a conexão, o sistema cria a aba **Vínkulo — Pessoas**, preservando as outras abas. Se já houver uma aba com esse nome sem vínculo conhecido, exige renomeá-la antes de continuar, evitando sobrescrita acidental. A exportação contém 35 colunas e inclui as fichas arquivadas.

A sincronização é **do Vínkulo para o Google**. Alterações manuais na aba dedicada serão substituídas. O banco do sistema continua sendo a fonte dos cadastros. Modificações de fichas, acompanhamentos e nomes de células/categorias marcam a comunidade como pendente; o Worker tenta atualizar após as operações e retoma falhas durante o tráfego posterior. Não foi configurado um agendamento independente: se não houver uso do sistema após uma falha, a tentativa depende do próximo acesso ou do botão Sincronizar agora.

As atualizações da aba são atômicas e os valores são enviados como texto, inclusive quando começam com sinais de fórmula. Linhas removidas da origem são limpas na próxima sincronização. Falhas do Google não desfazem o cadastro. Uma trava temporária evita gravações concorrentes e alterações ocorridas durante um envio continuam pendentes.

Antes de enviar, o sistema verifica os compartilhamentos do arquivo e recusa acesso público ou para todo um domínio. Pessoas e grupos explicitamente autorizados são aceitos. A equipe deve manter a composição desses grupos correta; as permissões do site não revogam cópias ou acessos já concedidos no Google. Ao pausar ou trocar a integração, a cópia anterior permanece no Drive.

O responsável pela integração precisa continuar ativo e com acesso de gestão à comunidade. A classificação “oficial” na ficha é uma informação pastoral; não concede permissões de login nem substitui a gestão de usuários.

Para ativar:

1. Informar o link da planilha existente e manter o compartilhamento restrito à equipe.
2. Um gestor permanente abre Visitantes → Pessoas → Planilha Google e autoriza sua conta.
3. A configuração OAuth da plataforma precisa permitir os escopos de Planilhas e leitura dos metadados de compartilhamento; a API Google Sheets deve estar habilitada no projeto Google.
4. Conectar o link e confirmar a primeira atualização exibida na interface.

Documentação técnica consultada: [escopos do Sheets](https://developers.google.com/workspace/sheets/api/scopes), [valores em planilhas](https://developers.google.com/workspace/sheets/api/guides/values) e [compartilhamentos do Drive](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

## Validação e alterações técnicas

- **83 testes passaram**, cobrindo Visitantes, navegação de Pessoas, autenticação, permissões, isolamento entre comunidades, operações móveis e integração Google.
- Casos novos executam o Worker compilado contra SQLite isolado, com todas as migrações. Os testes Google simulam respostas de API, inclusive erro, retomada, compartilhamento público, remoção de linhas e perda de acesso do gestor. Não equivalem a uma primeira sincronização real da planilha da igreja.
- Compilação de produção e verificação TypeScript concluídas. O comando de build direto do vinext foi usado porque o auxiliar de build encontrou um problema no executável npm do ambiente Windows.
- Conferência visual de painel, ficha e cadastro em desktop e celular de 390 × 844; edição de discipulado e criação de ficha verificadas com dados fictícios na prévia local.
- Migrações aditivas `0085_visitor_care.sql` e `0086_visitor_sheets.sql`; não apagam cadastros existentes nem ativam envio ao Google por conta própria.
- O teste antigo de privacidade de mídia foi atualizado para acompanhar a extração prévia de `FeedImageActions`, preservando as verificações de visualização e download. Nenhum código do feed foi alterado nesta revisão.

O campo Doações realizadas é um registro descritivo, com data/item/valor em linhas. Não foram implementados estoque, recibos, conciliação ou contabilidade financeira. O nome do discipulador e do responsável é textual; não cria automaticamente uma conta ou atribuição de permissão.
