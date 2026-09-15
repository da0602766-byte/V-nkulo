-- Contagem de requisições por rota e classe de status.
--
-- O log estruturado da rodada anterior tornou visível *uma* falha por vez, no
-- painel de logs. Ele não responde "a taxa de erro subiu?" nem "qual rota está
-- quebrando?", porque linha de log não é consultável pelo sistema. Esta tabela
-- é o agregado que responde isso, e é a fonte do painel da Área do
-- Proprietário.
--
-- Guarda contagem, nunca conteúdo: sem usuário, sem corpo, sem parâmetro de
-- busca. A rota entra normalizada (identificadores viram `:id`), então dois
-- acessos a comunidades diferentes caem na mesma linha e a tabela não vira
-- rastro de navegação de ninguém.
CREATE TABLE IF NOT EXISTS `metricas_requisicao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	-- Início da hora em UTC, no formato "YYYY-MM-DDTHH".
	`janela` text NOT NULL,
	`rota` text NOT NULL,
	-- "2xx", "3xx", "4xx" ou "5xx".
	`classe` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `metricas_requisicao_janela_unique` ON `metricas_requisicao` (`janela`,`rota`,`classe`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `metricas_requisicao_janela_idx` ON `metricas_requisicao` (`janela`);
