export const COMMUNITY_MODULES = [
  {
    key: "events",
    label: "Eventos",
    description: "Agenda, confirmações e gestão de eventos.",
    dependencies: [],
    permissions: ["events.view", "events.rsvp", "events.manage"],
  },
  {
    key: "ministries",
    label: "Ministérios e escalas",
    description: "Integrantes, equipes, escalas, checklists e compartilhamento.",
    dependencies: [],
    permissions: [
      "ministries.view",
      "ministries.manage",
      "schedules.view",
      "schedules.respond",
      "schedules.manage",
    ],
  },
  {
    key: "diaconia",
    label: "Diaconia",
    description: "Equipes, checklist e relatórios da Diaconia.",
    dependencies: ["ministries"],
    permissions: [
      "diaconia.view",
      "diaconia.checklist.update",
      "diaconia.manage",
      "diaconia.report",
    ],
  },
  {
    key: "visitors",
    label: "Visitantes e acompanhamento",
    description: "Cadastro, categorias e histórico de acompanhamento.",
    dependencies: ["cells"],
    permissions: [
      "visitors.view",
      "visitors.create",
      "visitors.edit",
      "visitors.deactivate",
      "visitor.categories.manage",
      "followups.view",
      "followups.manage",
    ],
  },
  {
    key: "cells",
    label: "Células",
    description: "Células, responsáveis e vínculos de pessoas.",
    dependencies: [],
    permissions: ["cells.view", "cells.manage"],
  },
  {
    key: "parking",
    label: "Estacionamento",
    description: "Operação, responsáveis, ocorrências e relatórios.",
    dependencies: ["ministries"],
    permissions: [
      "parking.view",
      "parking.entry",
      "parking.exit",
      "parking.edit",
      "parking.configure",
      "parking.helpers.manage",
      "parking.report",
      "parking.delete",
    ],
  },
  {
    key: "people",
    label: "Pessoas e oficiais",
    description: "Diretório de membros, funções e oficiais da comunidade.",
    dependencies: [],
    permissions: ["people.view", "officials.view", "officials.manage"],
  },
  {
    key: "networks",
    label: "Redes e unidades",
    description: "Sedes, afiliadas e supervisão regional quando habilitadas.",
    dependencies: [],
    permissions: [
      "networks.view",
      "networks.manage",
      "networks.commercial.manage",
    ],
  },
] as const;

export type CommunityModuleKey = (typeof COMMUNITY_MODULES)[number]["key"];

export const DEFAULT_COMMUNITY_MODULES: CommunityModuleKey[] = [
  "events",
  "ministries",
  "visitors",
  "cells",
  "people",
];

const MODULE_KEYS = new Set<string>(COMMUNITY_MODULES.map((item) => item.key));

export function normalizeCommunityModules(
  value: unknown,
  fallback: CommunityModuleKey[] = DEFAULT_COMMUNITY_MODULES,
): CommunityModuleKey[] {
  const requested = Array.isArray(value)
    ? value.map(String).filter((item): item is CommunityModuleKey => MODULE_KEYS.has(item))
    : fallback;
  const selected = new Set<CommunityModuleKey>(requested);
  let changed = true;
  while (changed) {
    changed = false;
    for (const moduleDefinition of COMMUNITY_MODULES) {
      if (!selected.has(moduleDefinition.key)) continue;
      for (const dependency of moduleDefinition.dependencies) {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      }
    }
  }
  return COMMUNITY_MODULES.map((item) => item.key).filter((key) => selected.has(key));
}

export function toggleCommunityModule(
  current: CommunityModuleKey[],
  key: CommunityModuleKey,
  enabled: boolean,
) {
  const next = new Set(normalizeCommunityModules(current, []));
  if (enabled) {
    next.add(key);
    return normalizeCommunityModules([...next], []);
  }
  next.delete(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (const moduleDefinition of COMMUNITY_MODULES) {
      if (
        next.has(moduleDefinition.key) &&
        moduleDefinition.dependencies.some((dependency) => !next.has(dependency))
      ) {
        next.delete(moduleDefinition.key);
        changed = true;
      }
    }
  }
  return COMMUNITY_MODULES.map((item) => item.key).filter((item) => next.has(item));
}

export function filterPermissionsForCommunityModules(
  permissions: string[],
  modules: CommunityModuleKey[],
) {
  const enabled = new Set(normalizeCommunityModules(modules, []));
  const disabledPermissions = new Set(
    COMMUNITY_MODULES.filter((module) => !enabled.has(module.key)).flatMap(
      (module) => [...module.permissions],
    ),
  );
  return permissions.filter((permission) => !disabledPermissions.has(permission));
}

export function communityModuleLabel(key: CommunityModuleKey) {
  return COMMUNITY_MODULES.find((item) => item.key === key)?.label || key;
}
