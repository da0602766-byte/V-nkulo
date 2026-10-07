# Revisão integral do estacionamento — 07/10/2026

## Análise e implementação

Revisão feita no navegador com a aplicação compilada e uma base local fictícia, usando os perfis de membro, gestor e operador escalado. As oito áreas da gestão foram visitadas antes das alterações. O redesign de reservas do Sites 360 foi estendido às demais funções.

| Área | Problema encontrado | Resultado |
| --- | --- | --- |
| Navegação | Áreas escondidas em um seletor no celular | Oito atalhos com ícones e rótulos, área ativa destacada e explicação contextual |
| Vagas | Tabela com informações de igual peso | Resumo de ocupação, cartões com vaga/status, identificação do veículo presente e ações diretas |
| Entradas e saídas | Leitura de QR, entrada manual e saída pouco diferenciadas | Blocos por tarefa, busca por placa/pessoa/vaga e cartões de movimentação com entrada e saída separadas |
| Reservas | Padrão novo isolado do restante da aba | Mesma linguagem de status, ícones, filtros e ações; aprovação, check-in e detalhes preservados |
| Histórico | Movimentações em tabela pouco legível no celular | Cartões com placa, pessoa, localização e linha de horários; filtros e paginação preservados |
| Ocorrências | Relatos em lista sem hierarquia | Gravidade, situação, autor e horário identificáveis; formulário separado da consulta |
| Relatórios | Contagens e próxima ação pouco evidentes | Métricas agrupadas, responsável/período/resumo e orientação conforme o estado do relatório |
| Mapa e vagas | Modo de edição pouco claro e lista extensa de coordenadas | Legenda textual, estado de edição, filtro de setor no editor por campos e formulários agrupados |
| Equipe e configuração | Campos sem contexto da escala/equipe | Instruções de plantão, convite, lista de integrantes, configuração e manutenção em blocos distintos |
| Reserva pelo membro | Formulário extenso e reservas pouco diferenciadas | Etapas, grupos numerados de campos, revisão antes de enviar, cartões de reservas e comprovante recolhível |
| Garagem | Lista e cadastro pouco estruturados | Placa em destaque, descrição do veículo e aviso de armazenamento no aparelho junto ao cadastro |
| Operador | Contagens pouco visíveis e listas sem contexto | Resumo de plantão, placas nas reservas, cartões de entrada/saída e títulos orientados à tarefa |

Componentes compartilhados em `ParkingUi.tsx` centralizam títulos, estados vazios, métricas, movimentações e identificação de reserva. Estilos reutilizam os temas existentes. Microtransições respeitam a preferência de movimento reduzido; ícones são acompanhados de texto.

## Correção descoberta no percurso

Criar um setor retornava sucesso, mas o agrupamento era derivado apenas das vagas. Um setor sem vagas não aparecia no seletor, impedindo cadastrar suas primeiras vagas. A leitura da gestão agora inclui os setores ativos da própria comunidade para quem tem `parking.configure`; o agrupamento incorpora os setores vazios. O endpoint do membro não foi ampliado. Sem migração ou mudança de permissões.

Também foi ajustado o cronômetro anterior ao plantão para contar até o início, conforme seu rótulo.

## Validação

- `scripts/pre-publicacao.sh`: TypeScript limpo, lint sem erros (um aviso preexistente), build/Worker/manifesto válidos, **619 testes aprovados**.
- Teste de regressão real do endpoint: setor vazio disponível ao configurador, setores inativos e de outra comunidade excluídos, dados de configuração ausentes na disponibilidade do membro e cadastro das primeiras vagas concluído.
- `parking-workspace-qa.mjs`: **89 verificações**, oito áreas × dois temas × quatro larguras, membro e plantão, **39 capturas**, sem erros JS ou overflow nos elementos medidos.
- Ações verificadas na base fictícia: entrada manual, cancelamento e confirmação de saída, histórico filtrado, leitor e código inválido, ocorrência, confirmação e correção de relatório, posição por campos, criação de setor e vagas, configuração, convite de auxiliar, cancelamento da limpeza e garagem persistida/removida.
- `parking-visual-qa.mjs`: **28 casos**, incluindo solicitação → aprovação → entrada → saída e estado offline, sem overflow ou erros JS.
- `parking-interaction-qa.mjs`: **9 verificações**, teclado, mapa arrastável, reconexão, ampliação de 200%, cancelamento e nova solicitação.
- `parking-cards-qa.mjs`: **17 verificações**, cartões entre 320 e 1440 px, temas, filtros, detalhes por teclado, movimento reduzido e exclusão confirmada/cancelada.

Galeria local: `outputs/estacionamento-completo/avaliacao.html`. Capturas usam dados fictícios; as capturas de detalhe ocultam elementos fixos externos à área fotografada. A câmera física não faz parte da validação automatizada.

## Publicação

Publicado no Sites 361 em 07/10/2026 às 19h33 (Brasília), confirmado como succeeded. Fonte: a17887163f4b69f96fdde3828b906ac97e6727d0. Deployment: appgdep_6ac6c88432848191aa9c107e308ae1bd. URL: https://adote-gestao.da0602766.chatgpt.site. A primeira tentativa retornou Unauthorized; a nova tentativa da mesma versão, após reconfirmar o acesso de proprietário, foi concluída. Registro documental posterior à publicação.
