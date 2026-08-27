export const TENANT_ROLES = Object.freeze([
  "MEMBRO",
  "LIDER",
  "PASTOR",
  "ADMIN_COMUNIDADE",
  "PROPRIETARIO_VISUALIZADOR",
  "SUPERADMIN",
]);

const ROLE_PERMISSIONS = Object.freeze({
  MEMBRO: Object.freeze([
    "dashboard.view",
    "community.view",
    "feed.view",
    "events.view",
    "events.rsvp",
    "ministries.view",
    "schedules.view",
    "schedules.respond",
    "parking.reserve",
    "profile.self.view",
    "profile.self.update",
  ]),
  PROPRIETARIO_VISUALIZADOR: Object.freeze([
    "dashboard.view",
    "community.view",
    "feed.view",
    "platform.admin.view",
    "platform.stats.view",
    "platform.feed.publish",
    "feature_flags.view",
  ]),
  LIDER: Object.freeze([
    "dashboard.view",
    "community.view",
    "community.theme.manage",
    "feed.view",
    "leadership.panel.view",
    "visitors.view",
    "followups.view",
    "followups.manage",
    "cells.view",
    "events.view",
    "events.rsvp",
    "ministries.view",
    "schedules.view",
    "schedules.respond",
    "parking.reserve",
    "profile.self.view",
    "profile.self.update",
  ]),
  PASTOR: Object.freeze([
    "dashboard.view",
    "community.view",
    "community.theme.manage",
    "feed.view",
    "leadership.panel.view",
    "pastoral.panel.view",
    "visitors.view",
    "visitors.create",
    "visitors.edit",
    "visitors.deactivate",
    "visitor.categories.manage",
    "followups.view",
    "followups.manage",
    "cells.view",
    "cells.manage",
    "events.view",
    "events.rsvp",
    "events.manage",
    "feed.publish",
    "feed.moderate",
    "community.feed.settings",
    "membership.requests.manage",
    "ministries.view",
    "ministries.manage",
    "schedules.view",
    "schedules.respond",
    "schedules.manage",
    "parking.view",
    "parking.reserve",
    "parking.report",
    "profile.self.view",
    "profile.self.update",
    "diaconia.view",
    "diaconia.checklist.update",
    "diaconia.manage",
    "diaconia.report",
    "people.view",
    "officials.view",
    "officials.manage",
  ]),
  ADMIN_COMUNIDADE: Object.freeze([
    "dashboard.view",
    "community.view",
    "community.theme.manage",
    "feed.view",
    "leadership.panel.view",
    "community.admin.view",
    "invites.manage",
    "visitors.view",
    "visitors.create",
    "visitors.edit",
    "visitors.deactivate",
    "visitor.categories.manage",
    "followups.view",
    "followups.manage",
    "cells.view",
    "cells.manage",
    "events.view",
    "events.rsvp",
    "events.manage",
    "feed.publish",
    "feed.moderate",
    "community.feed.settings",
    "membership.requests.manage",
    "ministries.view",
    "ministries.manage",
    "schedules.view",
    "schedules.respond",
    "schedules.manage",
    "parking.view",
    "parking.reserve",
    "parking.entry",
    "parking.exit",
    "parking.edit",
    "parking.configure",
    "parking.helpers.manage",
    "parking.report",
    "profile.self.view",
    "profile.self.update",
    "diaconia.view",
    "diaconia.checklist.update",
    "diaconia.manage",
    "diaconia.report",
    "people.view",
    "officials.view",
    "officials.manage",
  ]),
  SUPERADMIN: Object.freeze([
    "dashboard.view",
    "community.view",
    "community.theme.manage",
    "feed.view",
    "leadership.panel.view",
    "pastoral.panel.view",
    "community.admin.view",
    "platform.admin.view",
    "platform.stats.view",
    "platform.feed.publish",
    "invites.manage",
    "feature_flags.view",
    "networks.view",
    "networks.manage",
    "networks.commercial.manage",
    "visitors.view",
    "visitors.create",
    "visitors.edit",
    "visitors.deactivate",
    "visitor.categories.manage",
    "followups.view",
    "followups.manage",
    "cells.view",
    "cells.manage",
    "events.view",
    "events.rsvp",
    "events.manage",
    "feed.publish",
    "feed.moderate",
    "community.feed.settings",
    "membership.requests.manage",
    "ministries.view",
    "ministries.manage",
    "schedules.view",
    "schedules.respond",
    "schedules.manage",
    "parking.view",
    "parking.reserve",
    "parking.entry",
    "parking.exit",
    "parking.edit",
    "parking.configure",
    "parking.helpers.manage",
    "parking.report",
    "parking.delete",
    "profile.self.view",
    "profile.self.update",
    "diaconia.view",
    "diaconia.checklist.update",
    "diaconia.manage",
    "diaconia.report",
    "people.view",
    "officials.view",
    "officials.manage",
  ]),
});

export const OFFICIAL_PERMISSION_CATALOG = Object.freeze([
  "visitors.view",
  "visitors.create",
  "visitors.edit",
  "visitor.categories.manage",
  "followups.view",
  "followups.manage",
  "cells.view",
  "events.view",
  "events.manage",
  "ministries.view",
  "schedules.view",
  "schedules.manage",
  "diaconia.view",
  "diaconia.checklist.update",
  "diaconia.manage",
  "diaconia.report",
  "parking.view",
  "parking.reserve",
  "parking.report",
  "feed.publish",
]);

export function normalizeOfficialPermissions(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return [...new Set(items)].filter((item) =>
    OFFICIAL_PERMISSION_CATALOG.includes(item),
  );
}

export function normalizeTenantRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return TENANT_ROLES.includes(role) ? role : "MEMBRO";
}

export function permissionsForTenantRole(value) {
  return [...(ROLE_PERMISSIONS[normalizeTenantRole(value)] || [])];
}

export function tenantRoleHasPermission(role, permission) {
  return permissionsForTenantRole(role).includes(permission);
}

export function scopeRowsToCommunity(rows, activeCommunityId) {
  const tenantId = Number(activeCommunityId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) return [];
  return rows.filter((row) => Number(row.comunidade_id) === tenantId);
}

export function canSelectCommunity(memberships, requestedCommunityId) {
  const tenantId = Number(requestedCommunityId);
  return memberships.some(
    (membership) =>
      Number(membership.comunidade_id) === tenantId &&
      membership.status === "ATIVO",
  );
}
