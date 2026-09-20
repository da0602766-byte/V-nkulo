-- Fio do Ministério: a linha de checkpoints que responde "está tudo certo
-- para o dia?" dentro de cada escala (ver app/components/SecretaryMinisterialWorkspace.tsx).
--
-- O ministério guarda apenas o MODELO das etapas (`fio_etapas`, uma lista de
-- títulos) e se o recurso está ligado (`fio_habilitado`, escolhido na hora de
-- criar o ministério e editável depois nas configurações). Cada escala guarda
-- as PRÓPRIAS etapas, semeadas do modelo mas livres para variar escala a
-- escala, com o estado de cada uma — por isso `escalas_ministerio.fio_etapas`
-- é uma lista de objetos, e não de títulos.
ALTER TABLE `ministerios_comunidade` ADD `fio_habilitado` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ministerios_comunidade` ADD `fio_etapas` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `escalas_ministerio` ADD `fio_etapas` text DEFAULT '[]' NOT NULL;
