# Redesign da leitura de reservas — 07/10/2026

A captura enviada pelo usuário mostrava um registro móvel com informações de igual peso, período reservado misturado à movimentação real e dados secundários ocupando grande parte da tela.

## Implementação

A listagem existente agora usa cartões responsivos: uma coluna em espaços estreitos, duas ou três conforme a largura disponível. Vaga e status têm destaque, seguidos por atividade, responsável e placa. O período reservado está em um bloco separado de entrada e saída; timestamps continuam usando America/Sao_Paulo. Horários ausentes são identificados como não registrados.

Os seis estados têm texto, símbolo e cor, com orientação contextual. No local e Encerrada são distinguidos pela saída efetiva. Contatos, documento mascarado e ações secundárias ficam em detalhes recolhíveis. Aprovação e entrada mantêm destaque; permissões, confirmações e chamadas de API permanecem. Exclusão continua restrita aos registros permitidos pela implementação anterior.

Filtros ativos exibem seus valores e podem ser removidos individualmente. A consulta e a paginação continuam no servidor. Não há totais inferidos da página atual. Animações são discretas e desativadas com preferência por movimento reduzido. Paginação móvel reserva espaço inferior para o controle flutuante de ajuda.

## Verificação

- Pré-publicação: TypeScript aprovado, lint sem erros e um aviso preexistente, build/Worker/manifesto aprovados, 618 testes aprovados.
- Compilação final repetida após separar o texto do símbolo no status e ajustar a margem inferior móvel; lint dos arquivos alterados aprovado.
- Matriz existente: 24 combinações de tela/tema (320, 390, 430, 768, 1024 e 1440 px; claro/escuro) e quatro fluxos: solicitação, aprovação/entrada, saída e aviso offline.
- Nove interações existentes: teclado, mapa, reconexão, reserva e cancelamento, entre outras.
- 17 verificações dos cartões: 12 combinações de tela/tema, zoom de 200%, teclado/movimento reduzido, remoção do filtro, desistência da exclusão e exclusão confirmada com estado vazio.
- Sem erros JavaScript ou transbordamento horizontal nos cenários executados.

[Galeria de 13 screenshots](../../outputs/reservas-redesign/avaliacao.html). Capturas usam aplicação compilada e banco sintético em memória. O script parking-preview.mjs só inclui os seis exemplos extras com PARKING_QA_CARDS=1. Nenhum dado de demonstração foi adicionado à aplicação publicada. Nas capturas isoladas de componentes, o cabeçalho fixo foi ocultado apenas durante a captura para evitar sobreposição.

A validação usa navegador desktop com larguras móveis. APK/aparelho físico, câmera e leitor de tela não foram testados nesta alteração. Sem migração, alteração de API ou nova dependência.

## Publicação

Publicado no Sites 360 em 07/10/2026 às 15h13 (Brasília), confirmado como succeeded. Fonte 5a3e0649079921b38b81a311507df065319e7a6f; deployment appgdep_6ac68bb486ac8191a7835f407e39df75; URL https://adote-gestao.da0602766.chatgpt.site. Sem migração ou alteração de API. Registro documental posterior ao deploy.
