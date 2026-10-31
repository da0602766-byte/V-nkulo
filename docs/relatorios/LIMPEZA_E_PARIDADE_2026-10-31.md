# Comparação GitHub/Sites e limpeza — 31/10/2026

## Comparação verificada

- GitHub inicial: `main`, `58a5cc29ceb0644793a94ecfcf5b9fc26f31ca61`.
- Esse estado continha a fonte do Sites **453**, mais correções de testes e documentação.
- Publicação vigente: Sites **459**, fonte `59aa1000ae72378ab243973385b711b4bc97f8c9`.
- Implantação `appgdep_6ae5e3f26e408191a183ab2fe78b9b31`: `succeeded`, concluída em 31/10/2026 às 12:51 UTC.
- URL: https://adote-gestao.da0602766.chatgpt.site.

**As versões não eram iguais.** O intervalo 453 → 459 alterou 41 arquivos:
retorno Google/Android e Drive, conversas, notificações, repertório pessoal,
modelos de checklist, exclusão de solicitações e migração 0093.

A fonte foi obtida pelo conector Sites e pelo helper oficial, em diretório
isolado. A integração em três vias preservou as correções exclusivas do GitHub,
sem conflitos. O commit `4bbc594` contém a sincronização: `app/`, `db/`,
`drizzle/`, `worker/`, `build/`, `public/`, manifesto e lockfile coincidem com
a fonte publicada nesse ponto. A limpeza e correções posteriores são avanços
do repositório sobre a publicação 459.

O trabalho foi feito em worktree separado. Alterações não commitadas da pasta
original foram preservadas. Não houve deploy, migração remota, alteração de
segredos ou de dados operacionais. Portanto, a publicação continua na 459.

## Remoções e organização

Conferidos imports estáticos/dinâmicos, entradas do framework e referências no
código e testes. Removidas nove exportações sem consumidores e duas funções
privadas usadas somente por elas, em nove módulos (131 linhas):

- `syncVisitorCell`, `updateMembers` e `parseMembers` do antigo vínculo de células;
- `communityModuleLabel`;
- `listDriveFiles`;
- `generateTemporaryPassword`;
- `LAB_TEMPLATES`;
- `getPublicPlatformEvents`, do antigo agregado público;
- `notifySuperadmins` e seu import exclusivo;
- `getActiveTemporaryAccessForUser`;
- `SHARING_RETENTION_DAYS`, que não controlava a retenção real.

Removidos `public/file.svg`, `globe.svg` e `window.svg`, ícones do template sem
referências. Preservados rotas, migrações aplicadas, APKs e recursos ativos.

`outputs/`, `dist/`, `work/` e ferramentas locais deixaram de entrar em
TypeScript/lint. A cópia de comparação antes duplicava a análise e provocava
conflitos de tipos globais. O inventário final analisa **559 fontes**, com
**213 entradas**, sem arquivos inteiros inalcançáveis em `app/`. Isso não é
prova de ausência de toda declaração ou regra CSS sem uso.

Os comandos npm agora funcionam em PowerShell sem Bash. Linux mantém os scripts
de instalação/build existentes. A validação do Worker foi centralizada em
`scripts/validate-artifact.mjs`; o build Windows mantém tempo limite e encerra
somente sua árvore de processos. Adicionados `typecheck` e `audit:source`,
instruções de uso e exclusão de arquivos de publicação locais no `.gitignore`.

## Erros corrigidos e segunda revisão

1. **Backup:** a recuperação recusava o esquema publicado porque não conhecia
   três tabelas novas. Músicas pessoais e modelos de checklist agora são
   recuperados; autorizações de compartilhamento são descartadas, assim como
   sessões e integrações. Regressão verifica dados reais em SQLite isolado,
   proprietário preservado e compartilhamentos não reativados.
2. **Migrações:** a documentação ainda indicava 0093 como livre. Corrigida para
   0094, sem renomear migrações já publicadas nem afrouxar o teste de colisões.
3. **Google:** o teste de planilhas não carregava o novo cliente de autorização.
   Passou a executar o cliente real com rede simulada, mantendo verificações de
   preservação do link, cancelamento e conexão única.
4. **React:** corrigidos estados síncronos nos efeitos, escrita de refs durante
   renderização e dependências de efeitos. Cargas adiadas têm cancelamento;
   respostas antigas de modelos não substituem a lista de outro ministério.
   Alertas de conversa são invalidados e filtrados pela comunidade atual.
5. **Testes:** variáveis `module` renomeadas e uma verificação textual de acesso
   temporário transferida da função morta para a rota ativa. Confirmação da
   designação e identidade do beneficiário continuam obrigatórias.

A primeira suíte teve **933/947 aprovados** (14 falhas). Após as correções, a
segunda teve **946/947**: revelou a referência textual à função removida.
Essa referência foi corrigida e a suíte foi executada novamente. Nenhum teste
foi desativado. Acrescentadas duas regressões de cancelamento/respostas tardias.

## Validação final

- Instalação limpa pelo novo comando Windows: 532 pacotes, concluída.
- Build e validação do Worker ESM/manifesto: aprovados.
- TypeScript, incluindo variáveis e parâmetros sem uso: aprovado.
- Lint: **zero erros**, um aviso preexistente sobre `<img>` em ícones SVG locais.
- `npm test`: **949/949 testes aprovados**, zero falhas, cancelamentos ou testes
  ignorados; suíte em 40,7 segundos, após o build do código final.
- `git diff --check`: aprovado; nenhum conflito pendente.
- HTTP de produção: `/`, `/login` e `/manifest.webmanifest` responderam **200**.
- Revisão dos componentes seguiu as skills locais de densidade/listas e a
  checklist React. Não foram alteradas regras CSS nesta limpeza.

## Alertas e limites

`npm audit --omit=dev`: **zero vulnerabilidades**. Auditoria incluindo ferramentas:
**19 entradas moderadas**, zero altas/críticas, em duas cadeias de dependências:
[Minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) e
[Satori](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp).

As correções publicadas são Minimatch 11.0.1 e Satori 0.33.5. O lockfile usa
Minimatch 3.1.5 e 10.2.6 em consumidores diferentes. Forçar uma versão global
altera a API esperada pelos consumidores CommonJS. O npm também sugere trocar
Vinext 0.0.50 por 1.4.0. Essas migrações não foram aplicadas nesta limpeza; os
alertas continuam abertos, sem supressões. A classificação como desenvolvimento
não equivale a uma garantia de segurança de todo artefato compilado.

O controle do navegador está desativado nas configurações desta sessão. Não
foi possível fazer nova inspeção visual em 390/768/1864 px. Testes de componentes,
APIs e dados fictícios não substituem homologação manual completa. Também não
houve teste em APK físico, OAuth real ou entrega externa de notificações.

Os logs detalhados ficam no diretório local ignorado `outputs/`. A ausência de
erros nos checks executados não garante ausência absoluta de bugs.
