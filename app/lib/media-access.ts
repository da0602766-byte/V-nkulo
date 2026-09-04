import { canViewMinistry } from "./ministry-access";
import { getD1 } from "../../db";
import type { AppUser } from "./access";
import { getActiveTenantContext } from "./tenant";
import { canReadMedia } from "./media-access-policy.mjs";

/** The address locates a file; only current resource state authorizes delivery. */
export async function authorizeMedia(url: string, user: AppUser | null) {
  const tenant = user?.ativo ? await getActiveTenantContext(user) : null;
  if (!(await canReadMedia(getD1(), url, user?.ativo ? user : null, tenant?.context || null))) return false;
  const ministry = await getD1().prepare("SELECT id FROM ministerios_comunidade WHERE banner_url = ? LIMIT 1").bind(url).first<{ id: number }>();
  if (ministry) return Boolean(user?.ativo && tenant?.context && await canViewMinistry(getD1(), tenant.context, user.id, ministry.id));
  return true;
}
