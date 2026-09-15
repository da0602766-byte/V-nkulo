-- Segundo fator (TOTP) para as operações críticas.
--
-- O ESTADO_DO_PROJETO.md registrava MFA como dependência externa, e a
-- aprovação crítica de continuidade devolvia 423 por causa disso. O TOTP do
-- RFC 6238 não precisa de serviço nenhum: é HMAC-SHA1 sobre um contador de
-- tempo, calculado no próprio Worker (ver app/lib/totp.mjs). O usuário guarda
-- o segredo no aplicativo autenticador que já usa.
--
-- O segredo nunca é gravado em claro: entra cifrado em AES-GCM com chave
-- derivada do AUTH_SECRET, mesmo padrão dos refresh tokens do Google
-- (app/lib/google-integration.ts). Quem ler o banco não consegue gerar
-- códigos.
CREATE TABLE IF NOT EXISTS `usuario_mfa` (
	`usuario_id` integer PRIMARY KEY NOT NULL,
	`segredo_ciphertext` text NOT NULL,
	`segredo_iv` text NOT NULL,
	-- Nulo enquanto o usuário iniciou o cadastro mas ainda não provou que o
	-- aplicativo leu o segredo. Só vale como segundo fator depois de
	-- confirmado.
	`confirmado_em` text,
	-- Anti-replay: último passo TOTP consumido por este usuário. Sem isso um
	-- código interceptado continuaria valendo pelos 90 segundos da janela de
	-- tolerância.
	`ultimo_passo` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Códigos de recuperação: a saída para quem perdeu o aparelho. Guardados como
-- SHA-256 e de uso único, exibidos em claro uma única vez, na confirmação.
CREATE TABLE IF NOT EXISTS `usuario_mfa_recuperacao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`codigo_hash` text NOT NULL,
	`usado_em` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `usuario_mfa_recuperacao_codigo_unique` ON `usuario_mfa_recuperacao` (`usuario_id`,`codigo_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usuario_mfa_recuperacao_usuario_idx` ON `usuario_mfa_recuperacao` (`usuario_id`,`usado_em`);
