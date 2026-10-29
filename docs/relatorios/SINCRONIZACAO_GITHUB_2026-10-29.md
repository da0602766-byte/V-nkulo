# Sincronização do GitHub com o Sites — 29/10/2026

## Escopo e origem

Pedido: deixar o GitHub completo em relação ao Vínkulo publicado e verificar erros.

- Repositório: `da0602766-byte/V-nkulo`, branch `main`.
- Base anterior do GitHub: `21eb39c6daa0f2ddf7557215c82f1b8e5420e267`.
- Sites: versão **453**, implantação confirmada como `succeeded`.
- Fonte publicada: `1c75844d0c97164147c471121625839772dd0f8b`.
- Árvore da fonte: `8915c3fa060e65fef47ae7f4f8d3e394116526f6`.
- Commit de espelhamento no GitHub: `7b3052abe58fe8dcecc6f3aed5d895a76ee58a9d`.

O commit de espelhamento tem a mesma árvore Git da fonte publicada: **1.205 arquivos versionados**, com conteúdo, caminhos e modos idênticos. Foram conciliados 637 arquivos: 380 novos, 239 modificados e 18 removidos na evolução do Sites. A base antiga é ancestral da fonte publicada; não houve descarte de trabalho independente da branch principal. O histórico anterior do GitHub foi preservado. Os 138 commits posteriores do Sites estão representados pelo snapshot completo e pela proveniência acima.

Inclui aplicação, APIs, migrações, configurações versionadas, documentação, imagens e APKs. Não inclui dados operacionais do banco, uploads de usuários, segredos de produção ou dependências instaladas. Esses itens não são código-fonte a publicar no GitHub. A sincronização não é uma migração de hospedagem nem prova de prontidão para Hostinger.

## Correções da verificação

A primeira execução completa terminou com 920/927 testes aprovados. As sete falhas eram referências antigas em seis arquivos de teste, após mudanças já publicadas:

- Momentos usa adesão explícita e expiração em 24 horas; o teste antigo exigia o filtro anterior de destaques.
- Os controles de pausa e a região de toque do carrossel mudaram de classes CSS. Os testes comportamentais passaram a localizar os controles por atributos acessíveis e continuaram verificando pausa, retomada, teclado, foco e movimento reduzido.
- O campo de conversa mudou de texto; a verificação passou a usar os nomes acessíveis de mensagem e envio.
- O diretório e a janela de conversa foram extraídos para componentes próprios. As verificações agora acompanham a composição atual, preservando o teste de links estáveis e de separação por comunidade.

Nenhum teste foi ignorado ou removido. As verificações de autorização, isolamento, privacidade, retenção e validade dos momentos foram preservadas. Não foi necessário alterar o código da aplicação. O commit seguinte ao espelhamento contém apenas essas correções de testes e este relatório.

## Verificações

- Instalação limpa com lockfile: aprovada.
- `npm run build`: aprovado, incluindo validação do Worker ESM e do manifesto Sites.
- `tsc --noEmit`: aprovado.
- Testes direcionados após as correções: 43/43 aprovados.
- Suíte completa final: **927/927 aprovados**, zero falhas, cancelados ou ignorados (76,5 segundos).
- `git diff --check` das correções: aprovado.
- Navegador local: início → login → LOG1 carregaram e navegaram corretamente, sem envio de formulários nem uso de dados reais. Não houve erro da aplicação observado nessas páginas; o console apresentou somente mensagens da extensão do navegador.

A tentativa inicial de build sem terminal não produziu artefato utilizável; por isso a validação foi refeita em terminal e a suíte foi iniciada novamente somente depois da compilação concluída. A primeira execução de testes antes desse artefato foi descartada como inválida.

## Pendência de dependências e limites

`npm audit --omit=dev` não encontrou vulnerabilidades nas dependências classificadas como produção. A auditoria completa encontrou **três entradas moderadas da mesma cadeia**: `satori` → `@vercel/og` → `vinext`, associadas ao aviso [GHSA-wx4j-mvgx-mqwp](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp). Não houve alertas altos ou críticos. Não foram encontrados imports de Satori, `@vercel/og`, `next/og` ou `ImageResponse` no código da aplicação nem referências a Satori/`@vercel/og` no JavaScript compilado do servidor.

O reparo automático sugerido pelo npm envolve trocar Vinext de 0.0.50 para 1.4.0, uma mudança de versão principal. Essa atualização não foi aplicada junto ao espelhamento; exige avaliação de compatibilidade e validação própria. A ausência de referências observadas reduz o alcance encontrado, mas não equivale a uma garantia universal de segurança.

O build também emitiu avisos de sourcemaps e compatibilidade futura do carregamento da configuração Vite, sem impedir a compilação. Não foi feita nova homologação em aparelho Android físico, OAuth real do Google Drive, entrega externa de notificações ou teste manual de todas as telas autenticadas. A suíte cobre fluxos com banco de teste e serviços simulados. Nenhuma nova implantação de produção foi executada nesta tarefa.

**100% sincronizado refere-se ao código-fonte da versão 453 no GitHub; não significa ausência garantida de qualquer bug ou conclusão de funcionalidades planejadas.**
