# Auditoria técnica — 26/10/2026

Base: Sites 440, fonte `1a59c65dfb3939d6f97a1ba786467d981477cd61`. Trabalho executado em checkout isolado para preservar alterações existentes na pasta principal.

## Resultado e alcance

A sequência foi: limpeza comprovada por referências e TypeScript; análise de carregamento das páginas; reprodução de defeitos e correções. Inventário final: 553 arquivos TypeScript, 28 páginas, 172 rotas de API e 209 entradas reconhecidas pelo analisador. O inventário de APIs não equivale a uma revisão manual linha a linha de todos os endpoints.

- Removidos dois arquivos sem referências e 17 declarações, importações ou parâmetros locais sem uso.
- Eliminada a consulta do mural na abertura de 17 outras abas do painel. A Visão geral continua recebendo o mural no servidor e buscando atualizações ao ser montada.
- Diretório de Visitantes: 20 → 11 consultas preparadas por requisição no cenário local, resposta idêntica de 302 bytes.
- Corrigidos isolamento assíncrono do chat, exposição pública de publicações restritas, bloqueio indevido de gestão de categorias e incompatibilidade da recuperação com armazenamento pessoal.
- Dependências: seis pacotes com alertas continuam pendentes; detalhados abaixo. Não foram atualizados automaticamente junto à refatoração.

Não houve mudança de schema, operação em dados reais, envio de mensagens, restauração de produção ou atualização de APK.

## 1. Limpeza de código morto

### Removido

| Arquivo/área | Evidência e alteração |
| --- | --- |
| `app/components/MemberCellsExperience.tsx` | Nenhuma importação ou chamada fora do próprio arquivo. Tela antiga, sem entrada no painel atual; removidas 307 linhas. |
| `app/lib/birthdays.ts` | `ensureTodayBirthdayNotices` não tinha chamadas; removidas 33 linhas. As rotinas atuais de aniversários em Visitantes permanecem. |
| AccessPortal, OwnerConsoleShell, RequestsWorkspace, SecretaryMinisterialWorkspace | Removidas propriedades desestruturadas e não lidas; contratos de props mantidos para compatibilidade dos chamadores. |
| LandingPageExperience, LoginCustomizationWorkspace, PeopleWorkspace | Removidos `loginHref`, import de SafeImage e array TITLES obsoleto. |
| PilotDashboard | Removido argumento `slot` de openMobileShortcut e chamadas correspondentes; edição dos atalhos preservada. |
| TenantOperations | Removidos useMemo e dois formatadores sem chamadas. |
| visitors/Views | Removidos alias de idade, import age, estilo btnGhost, tipo View e duas propriedades notify não utilizadas. |

O parâmetro `conversationId` do envio do chat parecia morto, mas indicava a ausência de uma verificação necessária. Ele passou a validar a conversa ativa.

### Candidatos mantidos para revisão de contratos

O grafo estático ainda aponta 12 arquivos sem caminho a partir das entradas de execução:

- `app/chatgpt-auth.ts`: contrato de integração, sem consumidor local; conferir consumidores externos antes de remover.
- `app/lib/external-access-providers.ts`: extensão explicitamente documentada.
- `app/lib/notice-image.ts` e `app/lib/visitor-csv.ts`: usados por verificações/testes; migrar seus contratos antes de retirar.
- `CreateCommunityShortcut`, `PublicMobileNav`, `DiaconiaWorkspace`, `LoginPortal`, `MinistriesWorkspace`, `PlatformPlansWorkspace`, `ReceptionExperience` e `TenantOperations`: componentes legados com referências em testes históricos ou entre si. Consolidar esses testes nas telas efetivamente usadas antes da remoção.

Isso é uma pendência de limpeza, não uma afirmação de que todo o código morto foi eliminado. O grafo reconhece imports literais e convenções de entrada; não demonstra ausência de consumidores externos ou carregadores calculados. Alguns testes inspecionam código de telas legadas, podendo passar sem validar a tela atual.

## 2. Desempenho por página

As recomendações abaixo são derivadas do código, não de medições de navegação em produção. Priorizar por volume e custo observado, sem adicionar cache compartilhado a sessões ou permissões.

| Página | Observação / melhoria |
| --- | --- |
| `/` | **Aplicado:** planos e identidade visual carregam em paralelo após a sessão. Medir TTFB antes de adotar cache público com invalidação. |
| `/acesso/[token]` | Relógio, concessão, sessão e auditoria têm passos sequenciais. Paralelizar apenas leituras independentes; preservar expiração e auditoria antes do conteúdo. |
| `/acesso-negado` | Conteúdo pequeno, sem consultas próprias. Maior custo potencial vem do layout global. |
| `/ativar-admin` | Entrada de redirecionamento; não justifica otimização própria. |
| `/cadastro-membro/[token]` | Uma consulta de formulário por token. Manter validação sem cache; medir componente de cadastro se houver lentidão real. |
| `/compartilhar/publicacao/[id]` | Metadados e página consultam a publicação separadamente. Considerar deduplicação limitada à requisição, preservando autorização. **Aplicada correção de privacidade.** |
| `/comunidades` | Carrega todas as comunidades e filtra/ordena em memória. Prioridade: busca, ordenação e paginação no SQL, com consulta separada de cidades. |
| `/comunidades/[slug]` | Eventos, células, vínculo e história já usam Promise.all. Evitar repetir a consulta de comunidade entre metadados e página; limitar listas grandes. |
| `/contato` | Conteúdo estático; reduzir recursos globais antes de micro-otimizar o componente. |
| `/contratacao/[token]` | Planos dependem da proposta validada. Preservar sequência e versão aceita; evitar consulta de catálogo completo. |
| `/convite/[token]` | Consulta por hash, status e validade, com LIMIT 1. Sem gargalo local demonstrado; manter consumo atômico no endpoint. |
| `/escala/[token]` | Consulta acesso e depois detalhes. Para equipes grandes, agrupar designações uma vez por equipe; manter bloqueio por validade antes de carregar detalhes. |
| `/exclusao-de-dados` | Estática; oportunidade no layout global, sem consulta própria. |
| `/log1` | Formulário cliente; manter validação no servidor e evitar carregar catálogo administrativo nessa entrada. |
| `/login` | Sessão, vínculos ou configuração são condicionais. Não antecipar consultas de vínculos de visitantes anônimos. Evitar carregar recursos de módulos internos pelo layout. |
| `/login/google-concluido` | Retorno curto com parâmetros. Preservar encaminhamento seguro; nenhuma otimização isolada necessária. |
| `/painel` | **Aplicado:** feed consultado somente no início. Demais leituras já paralelas. Medir bundle comum e mover componentes exclusivos para suas abas. |
| `/painel/modulos/[id]` | Consulta contexto e definição. Avaliar paralelização após autenticação; componente já trata cancelamento/respostas antigas. |
| `/painel/visitantes` | **Aplicado:** diretório reutiliza contexto autorizado. Próxima prioridade: paginação dos contatos e contagem por categoria em uma passagem. |
| `/planos` | Catálogo compacto; considerar cache somente do catálogo público com invalidação ao editar. |
| `/primeiro-acesso` | Formulário e parâmetros, sem consulta própria na página. Validação/uso único permanecem no endpoint. |
| `/privacidade` | Estática; revisar custo de CSS e controladores globais. |
| `/proprietario` | Funcionalidades e identidade já paralelas; o contexto completo é resolvido para descobrir a comunidade. Avaliar consulta mínima sem perder validação de vínculo. |
| `/proprietario/acesso` | Sessão e formulário curto; manter isolamento da entrada do proprietário. |
| `/redefinir-senha` | Formulário por token, sem leitura antecipada de dados privados. Sem gargalo demonstrado. |
| `/sem-comunidade` | Sessão e perfil cliente; perfil já cancela leitura anterior. Avaliar carregamento progressivo das opções secundárias. |
| `/termos` | Estática; não requer memoização ou consultas novas. |
| `/vincular-cpf` | Formulário cliente; manter as operações sensíveis no servidor e carregar somente o necessário. |

### Abas do painel

| Aba/área | Avaliação e próxima melhoria |
| --- | --- |
| Início/mural | Paginação e limite de 60 posts já existem; primeira página é lida no servidor e novamente no cliente. Futuro: fornecer cursor inicial e política explícita de atualização. |
| Fio | Leitura por dia e filtros memoizados. Medir volume de itens; cancelar requisição quando trocar dia. |
| Eventos | Filtros e busca de inscritos memoizados. Paginar eventos/inscritos no servidor quando o volume justificar. |
| Ministérios | Ministerios, escalas e recursos iniciam juntos, mas o lote completo cresce. Carregar detalhes/recursos ao selecionar o ministério e criar índices em memória por ID para filtros repetidos. |
| Células/membro | Carregamento em componente separado. Separar resumo de relatórios/membros; paginação antes de virtualização. |
| Estacionamento | Reservas e movimentações já têm limites. Manter resumo do mapa separado das páginas da fila e medir atualização de disponibilidade. |
| Redes | Seleções derivadas usam useMemo. Separar lista de redes dos detalhes/unidades quando crescer. |
| Liderança | Consultas possuem cancelamento. Carregar resumo pastoral somente quando a seção correspondente estiver aberta. |
| Comunidade, relatórios e avisos | CommunityCentral cancela a consulta anterior e elimina dados da comunidade anterior. Manter agregações no SQL e limitar detalhes. |
| Pessoas | Otimização de paginação/enriquecimento da versão 435 preservada. Testes de volume anteriores não são ganhos produzidos por esta auditoria. |
| Solicitações | Leituras paralelas, filtros memoizados e consultas operacionais com cancelamento já existem. Evitar duplicar carga inicial e carga filtrada. |
| Mensagens | **Aplicado:** impedir sondagens sobrepostas da mesma conversa e resultados obsoletos. Próximo: paginação de contatos/conversas, hoje limitados no servidor. |
| Conta | Consulta de perfil usa AbortController. Sem nova camada de cache para dados privados. |
| Configurações | Carregar integrações e formulários secundários sob demanda, preservando isolamento de credenciais. |
| Continuidade | Preservar cancelamento, timeout e reconexão já existentes. Teste de aparelho físico continua necessário. |
| Editor visual | Carregamento sob demanda já existente; não carregá-lo para perfis sem edição. |

`app/layout.tsx` importa muitos estilos de áreas distintas e monta controladores globais em todas as páginas. Separar CSS por área pode reduzir entrega, mas exige comparação visual de cascata em celular/tablet/desktop; não foi feita uma divisão arriscada sem essa validação.

### Medição reproduzível

`node scripts/audit/measure-directory.mjs` executa duas requisições de aquecimento e cinco amostras contra o Worker compilado, com SQLite em memória e um compartilhamento fictício.

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Consultas preparadas por requisição | 20 | 11 |
| Bytes da resposta | 302 | 302 |
| Resoluções do contexto da comunidade na rota | 2 | 1 |

Redução de 45% na contagem de consultas desse cenário. Não é uma promessa de 45% menos tempo de carregamento. Tempos locais variaram com build/testes concorrentes; não são usados como evidência de latência em produção. A alteração não compartilha autorização entre requisições.

## 3. Defeitos reproduzidos e correções

| Prioridade | Problema | Correção / evidência |
| --- | --- | --- |
| Alta | URL pública aceitava qualquer publicação PUBLICADA, inclusive audiência de ministérios e conteúdo COMUNIDADE. Podia expor conteúdo e metadados sem login. | Página exige PLATAFORMA, PUBLICO, comunidade ativa e feed público habilitado. Comentários públicos também verificam audiência. Teste com Worker retornava 200 indevido antes; agora exige 404 sem título, conteúdo ou imagem privada. |
| Alta | Recuperação recusava qualquer banco contendo visitante_pessoal_storage, mesmo vazio. | Tabela revisada e classificada como excluída da restauração. Pastas, arquivos, hashes e vínculo de armazenamento não são reativados. Teste usa dados fictícios preenchidos; desconhecidas continuam recusadas. |
| Média | Chat aplicava mensagens de A sobre B após troca rápida; envio e erro tardios também atingiam B. | Identidade da visita à conversa invalida resultados, inclusive A → B → A. Flags de envio e editor são reiniciados ao trocar. |
| Média | Sondagem anterior ao envio podia apagar uma mensagem já confirmada da tela. | Revisão da leitura invalidada após confirmação; não acumula consultas sobrepostas. |
| Média | Abrir contato não tratava rejeição de rede e duas aberturas podiam inverter a escolha. | Erro tratado, nova tentativa permitida e somente a abertura mais recente aplicada. |
| Média | Categoria explicitamente autorizada continuava bloqueada mesmo com compartilhamento EDIT. | Exige simultaneamente EDIT e visitor.categories.manage. Sem compartilhamento, com READ ou após revogar qualquer requisito, retorna 403. |
| Baixa | Hooks de Visitantes disparavam atualização síncrona no efeito e liam Date.now a cada renderização do histórico. | Inicialização cancelável e relógio de histórico atualizado a cada minuto. Sem redesign ou mudança de armazenamento. |
| Baixa | Documento de migrações anunciava 0089 como livre, já ocupado. | Próximo número corrigido para 0093; nenhum arquivo SQL renumerado. |

**Mudança visível de segurança:** o compartilhamento externo do mural fica disponível apenas para publicações destinadas ao público da plataforma. Links antigos para conteúdo interno/restrito deixam de entregar conteúdo público. A leitura interna e suas permissões continuam nas rotas autenticadas.

### Segurança das dependências — pendente

`npm audit --omit=dev --json`, consultado em 26/10/2026, retornou **6 pacotes afetados: 1 crítico, 4 altos e 1 moderado**. São classificações do catálogo; não são seis explorações demonstradas no site.

| Pacote instalado | Catálogo | Avaliação e ação proposta |
| --- | --- | --- |
| next 16.2.11 | Crítico | Vários avisos de execução remota, SSRF, cache e negação de serviço. Registro recomenda 16.4.3. Site usa Vinext/Worker, sem next/image ou next/og no código da aplicação; isso reduz caminhos aparentes, mas não comprova ausência de exposição transitiva. Validar atualização junto com Vinext e ferramentas de build. |
| xlsx 0.18.5 | Alto | Importação de arquivos escolhidos pelo usuário está ativa no navegador: prioridade alta para substituição. O npm público não oferece correção; usar distribuição oficial corrigida com integridade no lock e repetir testes de Excel/CSV, datas e campos personalizados. |
| sharp 0.35.3 | Alto | Avisos de bibliotecas nativas de imagem. Atualizar o override para versão corrigida e validar build/artefato; não há uso direto identificado no código da aplicação. |
| nanoid 3.3.16 | Alto | Aviso relacionado a geradores personalizados com tamanho zero. Sem import direto encontrado; atualizar a resolução transitiva e validar consumidores. |
| source-map-js 1.2.1 | Alto | Negação de serviço ao interpretar mapas malformados. Atualizar para versão corrigida e conferir ferramentas que consomem mapas. |
| baseline-browser-mapping 2.10.30 | Moderado | Encerramento de processo por entrada inválida. Atualizar a resolução transitiva; parece ligado à cadeia de ferramentas. |

Fontes: [aviso oficial do Next para servidores Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [instalação oficial do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [aviso de xlsx](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).

O aviso específico do Next sobre Windows descreve servidor hospedado em filesystem Windows; a produção deste projeto é Worker. Não foi demonstrada execução remota neste ambiente. A atualização das dependências permanece uma pendência real, não um risco declarado resolvido.

## Validação

- Suíte completa: **889/889 testes aprovados**, sem pulados. O ajuste final para limpar erro após reenvio foi revalidado nos nove testes de chat.
- TypeScript estrito, incluindo `--noUnusedLocals --noUnusedParameters`: aprovado.
- Build Vinext e validação de Worker ESM/manifesto Sites: aprovados.
- Lint completo: zero erros, 28 avisos para triagem; nenhuma regra desativada para aceitar as mudanças.
- Chat: seis regressões falhavam antes da correção; nove cenários passam depois, incluindo reenvio, rede lenta e seleção rápida.
- Carregamento: quatro testes exercitam páginas reais com dependências simuladas; preservam início, redirecionamentos e paralelismo.
- Compartilhamento: Worker/SQLite verifica audiência, visibilidade, rascunho, comunidade arquivada, feed desativado, ausência de metadados privados e restauração do acesso público.
- Backup: mantém rejeição de schema/tabelas/colunas desconhecidas, proprietário inalterado e credenciais desativadas; inclui dados fictícios da tabela pessoal.
- Permissões: testes preservam revogação na próxima requisição, separação de comunidades e necessidade de autorização explícita.

Primeira execução da suíte encontrou restrições do sandbox a loopback/hardlinks, três fixtures/documentos desatualizados e a incompatibilidade real da recuperação. Foram corrigidos os problemas de fonte/fixtures sem enfraquecer as expectativas de autorização. Testes com workerd e arquivos temporários são executados fora dessa restrição, usando dados fictícios.

**Limites:** ferramenta de controle de navegador não disponível nesta sessão. Não houve nova inspeção visual em 390/768/1864 px, teste de aparelho físico, medição de Web Vitals, carga concorrente de produção ou pentest completo. A aprovação automatizada não certifica ausência de todos os bugs. As dependências e os candidatos legados acima continuam pendentes.

## Reproduzir

```text
node scripts/audit/source-inventory.mjs
node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters --incremental false
npm run build
node --test tests/*.test.mjs
node scripts/audit/measure-directory.mjs
npm audit --omit=dev --json
```

Artefatos locais de evidência: `.task-tools/audit-*.log` e `.task-tools/audit-*.json` na pasta principal. Contêm resultados de testes fictícios e auditoria de pacotes; não contêm credenciais de publicação.
