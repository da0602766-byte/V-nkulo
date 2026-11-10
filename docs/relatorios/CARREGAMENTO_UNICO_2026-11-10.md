# Uma transição até a página pronta — 10/11/2026

Correção sobre Sites 475: a navegação mostrava o carregamento de saída e reiniciava a animação ao montar o novo documento. A revelação também podia terminar antes de consultas iniciais, especialmente a verificação das listas de Visitantes.

O estado temporário de uma transição ativa agora continua entre documentos na mesma aba, com validade de 30 segundos, sem reiniciar o tempo da animação. Um bootstrap no head mantém o destino coberto desde o primeiro quadro, inclusive antes de baixar o JavaScript. Ao terminar, o estado é apagado; valores inválidos, futuros ou antigos são ignorados. O estado no DOM preserva a abertura inicial quando o armazenamento está indisponível.

O controlador aguarda os indicadores de prontidão dos módulos e os dados iniciais de Visitantes antes de revelar o conteúdo. As consultas de listas disponíveis, compartilhamento e armazenamento possuem marcadores explícitos. Esses indicadores somente prolongam um carregamento que já está ativo; não iniciam telas grandes nas demais abas. O escopo definido na versão 475 permanece: Visitantes, entrada/troca da comunidade e os carregamentos completos explícitos anteriores.

## Verificação

- 1002 testes aprovados, incluindo validação/expiração do estado e bootstrap anterior à página. TypeScript e build aprovados.
- Sete cenários específicos aprovados: etapas consecutivas de módulo/dados com uma revelação, destino coberto antes de hidratar, continuidade do tempo, limpeza ao concluir, consultas lentas de pessoas e listas, atualização posterior sem novo carregamento global e falha inicial com erro liberado.
- Oito cenários de escopo aprovados, incluindo nove abas reais da comunidade e 19 indicadores locais sem novo carregamento global.
- Quatorze cenários de animação, recuperação, foco, histórico, entrada/troca de comunidade, falha de troca, proprietário, movimento reduzido e acesso sem JavaScript aprovados.
- Verificação responsiva em 390/768/1864 px sem overflow ou erros de página. Prévia com dados sintéticos em memória; nenhum cadastro real alterado.
- Revisão React: guardas de geração e limpeza dos efeitos mantidos; os marcadores não provocam novas consultas nem alteram permissões, formulários ou densidade das listas.

Fonte de base: `e8b89d1efc703d6c70943975068829140b60c26a`. Publicação e checagens no endereço público registradas no fechamento local. Ícones, APK e feedback local de ações preservados.
