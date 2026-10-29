# Segurança e legados — 26/10/2026

Base publicada: Sites 441. Escopo autorizado: corrigir os seis alertas de produção, revisar os 12 candidatos, testar e publicar. Trabalho em checkout isolado, preservando alterações locais de outras tarefas.

## Dependências

`npm audit --omit=dev --json`: **6 → 0 pacotes vulneráveis**. Auditoria completa, incluindo desenvolvimento: **26 → 0**. Conferência em 26/10/2026; o resultado considera os avisos conhecidos pelo registro nessa data. Nenhum aviso de segurança foi suprimido.

| Pacote | Antes | Agora |
| --- | --- | --- |
| next | 16.2.11 | 16.4.3 |
| xlsx | 0.18.5 | 0.20.3 |
| sharp | 0.35.3 | 0.35.5 |
| nanoid | 3.3.16 | 3.3.20 |
| source-map-js | 1.2.1 | 1.2.2 |
| baseline-browser-mapping | 2.10.30 | 2.11.33 |

SheetJS usa o [tarball oficial recomendado pelo fabricante](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), com URL versionada e integridade no lockfile. O pacote antigo no npm não oferecia a correção.

React, React DOM e React Server Components foram alinhados em 19.2.9; ESLint Config Next acompanha Next 16.4.3. Vite 8.3.5, Cloudflare Vite Plugin 1.65.0, Wrangler 4.153.0, Drizzle Kit 0.31.11 e atualizações transitivas compatíveis fecharam os alertas de ferramentas. Vinext permanece 0.0.50, com override de image-size 2.0.4, evitando mudar o framework. Outros overrides corrigem o esbuild do loader do Drizzle (0.25.12), Undici (7.30.1) e unificam Wrangler com a versão direta. `npm ls --all --json` não aponta dependências inválidas.

Cloudflare passou a trazer Miniflare 5 beta como dependência transitiva. Nove testes que configuravam a API 4 agora usam o conversor oficial `convertV4MiniflareOptions`. Continuam executando transações D1, criptografia, integrações e SQLite no workerd real, sem mocks substitutos ou testes ignorados.

## Candidatos revisados e removidos

Conferidos imports estáticos/dinâmicos, rotas, Worker, configuração, testes e documentação. Todos os 12 arquivos estavam fora do grafo de execução; o pacote privado não os exporta como biblioteca externa.

| Arquivo | Substituição ou evidência |
| --- | --- |
| app/chatgpt-auth.ts | Helpers sem chamadas. Autenticação ativa em local-auth e nas rotas existentes; não era entrada nem rota. |
| app/components/CreateCommunityShortcut.tsx | Único consumidor era PublicMobileNav, também órfão. Fluxo atual: LOG1, contratação e aprovação. |
| app/components/PublicMobileNav.tsx | Sem consumidor; navegação ativa em PublicHeader e LandingPageExperience. |
| app/components/LoginPortal.tsx | Login monta AccessPortal. Testes migrados para CPF, retorno, recuperação, tema e convites. Drive permanece na conta. |
| app/components/MinistriesWorkspace.tsx | Painel monta SecretaryMinisterialWorkspace. Testes de escalas, histórico e relógio transferidos. |
| app/components/DiaconiaWorkspace.tsx | Aba aposentada por decisão anterior. Checklist atual no ministério; autorização e exclusão no backend preservadas. |
| app/components/PlatformPlansWorkspace.tsx | OwnerWorkspace importa CommercialPlansWorkspace. Testes agora verificam o editor ativo. |
| app/components/ReceptionExperience.tsx | Página inicial usa LandingPageExperience; teste de ícones transferido. |
| app/components/TenantOperations.tsx | Visitantes usa VisitorApp; células usam CellManagementConsole e cells/format. Saúde e separação de campos públicos/internos permanecem testadas. |
| app/lib/external-access-providers.ts | Interfaces e provedores nulos sem consumidores. Documentação atualizada; webhook continua 503, sem ativar pagamentos. |
| app/lib/notice-image.ts | Somente teste textual. Garantia transferida ao validador ativo parseFeedPostPayload, com casos executáveis. |
| app/lib/visitor-csv.ts | Somente teste antigo. Proteção e teste transferidos à exportação real. |

Removidas **5.135 linhas** nesses arquivos. Inventário: 553 → 541 fontes, mantendo 209 entradas de execução e as mesmas 28 páginas. Nenhum outro candidato inalcançável no grafo final. Essa conclusão não pretende provar ausência de toda declaração local ou regra CSS sem uso.

## Falha corrigida ao migrar os testes

A proteção contra fórmulas em CSV era testada no helper morto, enquanto Visitantes exportava diretamente com SheetJS. O exportador ativo agora neutraliza textos e cabeçalhos que podem virar fórmulas em CSV, incluindo `=`, `+`, `-`, `@` e caracteres de controle. Números negativos reais e datas continuam tipados; XLSX mantém o texto original.

O teste grava CSV com a biblioteca atual e verifica BOM, acentos, aspas, quebras de linha, telefone, fórmulas, cabeçalhos e números. Também confere a preservação do XLSX. O teste de imagens executa o validador ativo com base64, JavaScript, URL externa e caminho permitido.

## Validação

- **889/889 testes passaram**, nenhum cancelado ou ignorado. Cobrem permissões, isolamento, revogação, compartilhamento, mensagens, recuperação, planilhas e armazenamento.
- TypeScript com noUnusedLocals/noUnusedParameters aprovado; build e artefato Sites (Worker ESM/manifesto) aprovados.
- Lint completo: **zero erros, 35 avisos**. Avisos de hooks, navegação, imagens e variáveis de testes. A nova configuração acrescentou regras de navegação; não foram silenciadas. Não são alertas do npm audit.
- Navegador local: login, abrir/fechar recuperação e navegar até LOG1 funcionaram. Chave sintética local removida após o teste; sem envio de formulários.
- Instalação limpa de 532 pacotes aprovada. O instalador ganhou caminho Windows com lock exclusivo, npm ci, tempo limite e impressão digital do lockfile; o caminho Linux foi preservado.
- Não houve nova inspeção manual de todas as telas autenticadas ou teste em APK físico. Os fluxos autenticados foram cobertos pela suíte com dados fictícios.

Sem migração de banco, alteração remota de configuração ou dados reais. Audiência pública preservada. Versão/commit finais registrados na coordenação após publicação.
