-- A aba Célula passa a ter duas experiências no mesmo módulo: gestão (pastor,
-- presbítero e líder, no computador) e funcionalidade (o membro procurando uma
-- célula e acompanhando a própria, principalmente no celular). A tela do membro
-- precisa de dados que a tabela não guardava:
--
--   * `horario_reuniao` — a célula só registrava os dias ("QUA", "SAB"), então
--     o diretório não conseguia responder a pergunta que o membro faz primeiro:
--     que horas começa. Texto livre curto ("19h30") porque a hora de início é o
--     que se anuncia; a duração já vive na agenda de cada encontro.
--   * `rede` — agrupamento pastoral das células (Rede Centro, Rede Sul). Não
--     confundir com o módulo Redes do sistema, que é rede de igrejas. É o filtro
--     que o membro usa para achar uma célula perto do seu contexto.
--   * `tags` — temas da célula (Famílias, Jovens, Oração), em JSON, do mesmo
--     jeito que `dias_reuniao` e `membros` já são guardados aqui.
--   * `capa_url` — imagem de capa do perfil público, equivalente ao
--     `banner_url` que os ministérios já têm.
--
-- Todas entram com valor padrão para que as células existentes continuem
-- válidas sem backfill: célula sem horário, rede, tema ou capa apenas não
-- mostra esses trechos no perfil.
ALTER TABLE `celulas` ADD `horario_reuniao` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `celulas` ADD `rede` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `celulas` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `celulas` ADD `capa_url` text DEFAULT '' NOT NULL;
