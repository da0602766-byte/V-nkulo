-- Redesenho da aba Células em duas experiências (Gestão / Participação, ver
-- app/components/cells/). A aba de Configurações da célula (Frame 2 do
-- design aprovado) ganha campos que ainda não existiam: rede, um texto livre
-- de horário (além dos dias já gravados em `dias_reuniao`), temas/etiquetas
-- e uma foto de capa opcional. Nenhuma coluna existente muda de tipo ou
-- perde dado.
ALTER TABLE `celulas` ADD `rede` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `horario_texto` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `temas` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `celulas` ADD `foto_capa` text;
