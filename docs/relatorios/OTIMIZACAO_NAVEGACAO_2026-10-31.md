# Otimização de navegação, formulários e carregamento — 31/10/2026

Base comparada: publicação Sites 460, commit `416d24ed867971449133d02ca12faf24a714ef60`.
As mudanças desta entrega atuam no painel, Visitantes, Ministérios, perfil e central de notificações.

## Evidência reproduzível de requisições

O roteiro executa os callbacks e efeitos dos componentes TSX, tanto do commit anterior quanto do código atualizado, com respostas de API controladas. Não é uma simulação de números definidos manualmente nem um benchmark de navegador: as requisições são contadas no `fetch`/cliente de API chamado pelos componentes reais. Os filhos visuais são substituídos por elementos de teste.

| Ação | Antes | Depois | Resultado |
| --- | ---: | ---: | --- |
| Quatro trocas de subaba em Visitantes, após carregar a lista | 8 GET adicionais | 0 | Elimina as leituras de snapshot e armazenamento a cada troca |
| Entrada no catálogo de Ministérios | 3 GET | 2 | Biblioteca/checklists são solicitados ao abrir um ministério |
| Abrir “Novo ministério” após carregar o catálogo | 3 GET | 1 | Atualiza somente ministérios e candidatos à liderança |
| Salvar o próprio perfil, depois do PATCH confirmado | 1 GET adicional | 0 | Aplica os campos normalizados retornados pelo servidor |

Reprodução, na raiz do repositório com as dependências instaladas:

```text
node scripts/audit/workspace-performance.mjs 416d24ed867971449133d02ca12faf24a714ef60
node --test tests/workspace-performance.test.mjs
```

O primeiro comando grava `outputs/workspace-performance.json`. O segundo valida também falhas de gravação, revogação de acesso, respostas atrasadas, cancelamento ao sair e economia de dados. A contagem de entrada no catálogo não inclui os recursos e equipes que serão necessários ao abrir os detalhes; eles foram adiados, não removidos.

## Arquivos de produção

Tamanhos medidos nos arquivos gerados pelo build. Gzip calculado localmente com `node:zlib`, sem pressupor o algoritmo utilizado pela CDN.

| Arquivo | Antes, bytes | Depois, bytes | Antes gzip | Depois gzip |
| --- | ---: | ---: | ---: | ---: |
| JavaScript principal de Ministérios | 151.839 | 130.061 | 36.976 | 31.492 |
| JavaScript do painel | 179.155 | 180.673 | 48.155 | 48.555 |
| CSS global | 1.790.241 | 1.790.241 | 275.219 | 275.219 |

O JavaScript principal de Ministérios diminuiu **14,34%** em bytes e **14,83%** em gzip. Repertório pessoal, modelos de checklist e assistente de criação de escala passaram a arquivos separados, carregados quando usados. Isso reduz o trabalho de entrada; não significa reduzir nessa proporção todo o JavaScript da plataforma. O painel cresceu 1.518 bytes por incluir o pré-carregamento dos módulos; o CSS global permanece um ponto para uma etapa futura com inspeção visual disponível.

Arquivos desta versão:

- `SecretaryMinisterialWorkspace-CNSZydpH.js`, SHA-256 `286cf0a8d7371f488c0055a53db295ae6f317b62f4dc2a4713acd1ba97925e56`.
- `PilotDashboard-Dkwr4iqm.js`, SHA-256 `7cc29d460809216225773edf9e3d2e048ba877eeaad369f9f31d6c2c8be1d57e`.
- `index-Bv60S59K.css`, SHA-256 `72ff8fa1642d6ca9d3f6f783eb0d655dee333d3bc8f529e94b6defbd4dddd037`.

## Comportamento e revisão

- Visitantes reutiliza apenas o estado da instância montada. Entrar/sair do diretório de listas, atualização manual e a atualização periódica continuam verificando dados e permissões. Não foi criado cache compartilhado de contatos ou armazenamento persistente de respostas privadas.
- O servidor continua autorizando e auditando a gravação do perfil. A resposta acrescenta somente os campos normalizados gravados para o usuário autenticado, com `Cache-Control: no-store`. Falha de gravação preserva o formulário. Alterar hierarquia/permissões continua recarregando a consulta completa.
- Ministérios usa uma política explícita de dependências para recarregar os conjuntos afetados por cada ação. Respostas de escala atualizam também os agregados ministeriais. Ações desconhecidas conservam a atualização completa. Foi removida a segunda recarga idêntica depois de responder a uma escala.
- Menus antecipam código ao receber foco/ponteiro. Não antecipam dados privados; respeitam economia de dados do Vínkulo, `saveData` e conexões 2G. Importações que falham podem ser tentadas novamente.
- O indicador artificial de 280 ms foi removido. Os indicadores dos módulos e requisições continuam refletindo o carregamento real; isso não equivale a demonstrar um ganho de 280 ms na rede.
- Eventos simultâneos da central de notificações reutilizam sua requisição em andamento. Ações que mudam dados forçam uma nova leitura. Os pollings independentes do chat e do fallback Android não foram centralizados nesta entrega.
- Na revisão foram corrigidas disputas em que uma consulta antiga poderia substituir o perfil salvo, reintroduzir notificações não lidas ou atualizar equipes depois de sair/trocar de ministério.

## Validação e limites

- Build de produção e validação do artefato Worker: aprovados.
- Suíte completa: **957 testes aprovados, zero falhas e zero ignorados**. Os oito novos testes de desempenho/ciclo de vida também foram executados após a última proteção de cancelamento.
- TypeScript: aprovado; lint: zero erros, um aviso preexistente em `ChatEmoji.tsx` sobre `<img>`.
- A primeira rodada encontrou uma verificação textual antiga que não aceitava `AbortSignal` no fetch de escalas; foi atualizada e a suíte completa passou.
- Nenhuma migração de banco, alteração de ambiente ou dependência foi necessária.
- O controle local de navegador retornou `Local browser use is disabled in Work settings`. Portanto não houve captura de tela, inspeção visual em 390/768/1864 px nem medição real de INP/LCP ou tempo de salvamento autenticado. Layouts existentes foram preservados; o novo estado de espera usa estilos locais.
- As evidências demonstram menos leituras e menor arquivo de entrada de Ministérios. Não demonstram um percentual de aceleração de toda a plataforma, tempo de rede/Drive ou melhoria de latência do banco em produção.

A publicação utiliza o artefato validado e o mesmo commit enviado ao GitHub. O recibo nativo e a conferência HTTP dos hashes ficam em `outputs/performance-publication.json` e `outputs/performance-live-check.json` na cópia de trabalho, após a publicação.
