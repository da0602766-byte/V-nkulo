-- Assinaturas Web Push por aparelho. O endpoint é único para impedir que um
-- mesmo navegador continue vinculado à conta anterior após novo login.
CREATE TABLE `notificacoes_push_dispositivos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `expiracao_em` text,
  `criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notificacoes_push_dispositivos_endpoint_unique`
  ON `notificacoes_push_dispositivos` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `notificacoes_push_dispositivos_usuario_atualizado_idx`
  ON `notificacoes_push_dispositivos` (`usuario_id`, `atualizado_em`);
