-- Limitação de requisições por origem nos endpoints de autenticação.
--
-- O bloqueio que já existia (`usuarios.tentativas_login` / `bloqueado_ate`)
-- protege uma conta específica contra 3 erros de senha. Ele não enxerga uma
-- mesma origem tentando muitas contas diferentes, porque cada requisição
-- incrementa o contador de um usuário distinto. Esta tabela guarda o contador
-- por origem + finalidade e complementa aquele bloqueio, sem substituí-lo.
--
-- `chave` nunca guarda o IP em texto: armazena o SHA-256 do IP combinado com
-- o AUTH_SECRET do ambiente (ver app/lib/rate-limit.ts), então a tabela não
-- constitui um registro de endereços de quem acessou a plataforma.
-- Linhas vencidas são apagadas pela própria rotina de verificação; o
-- otimizador da Área do Proprietário continua com a lista fechada de tarefas.
CREATE TABLE IF NOT EXISTS `limites_autenticacao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`escopo` text NOT NULL,
	`chave` text NOT NULL,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`janela_inicio` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`bloqueado_ate` text,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `limites_autenticacao_escopo_chave_unique` ON `limites_autenticacao` (`escopo`,`chave`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `limites_autenticacao_expiracao_idx` ON `limites_autenticacao` (`atualizado_em`);
