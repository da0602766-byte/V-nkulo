import { loadDestinationMemberships, loadSourceMemberships, MembershipCatalogError, sameMembership } from "./supabase-membership-catalog";
import { previewProfiles } from "./supabase-profile-catalog";
import { previewTenantCatalog } from "./supabase-tenant-catalog";

type Sample = { d1Ms: number; supabaseMs: number; matching: boolean };
export type ReadBenchmark = {
  measuredAt: string;
  sourceCount: number;
  destinationCount: number;
  matching: boolean;
  d1MedianMs: number;
  supabaseMedianMs: number;
  samples: Sample[];
  recommendation: "KEEP_D1" | "INSPECT_FRESHNESS";
};

const round = (value: number) => Math.round(value * 100) / 100;
function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return round(ordered[Math.floor(ordered.length / 2)]);
}

export async function benchmarkMembershipRead(): Promise<ReadBenchmark> {
  const [profiles, tenants] = await Promise.all([previewProfiles(), previewTenantCatalog()]);
  if (!profiles.ready || !tenants.ready) {
    throw new MembershipCatalogError("Perfis ou comunidades estão diferentes entre D1 e Supabase. Reconcilie a réplica antes de medir.", 409);
  }

  const samples: Sample[] = [];
  let sourceCount = 0;
  let destinationCount = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const d1Start = performance.now();
    const source = await loadSourceMemberships();
    const d1Ms = round(performance.now() - d1Start);
    const supabaseStart = performance.now();
    const destination = await loadDestinationMemberships();
    const supabaseMs = round(performance.now() - supabaseStart);
    sourceCount = source.length;
    destinationCount = destination.length;
    const byId = new Map(destination.map(item => [Number(item.legacy_d1_id), item]));
    const matching = source.length === destination.length && byId.size === destination.length
      && source.every(item => {
        const remote = byId.get(item.legacy_d1_id);
        return remote !== undefined && sameMembership(item, remote);
      });
    samples.push({ d1Ms, supabaseMs, matching });
    if (!matching) break;
  }
  const matching = samples.length === 3 && samples.every(sample => sample.matching);
  const d1MedianMs = median(samples.map(sample => sample.d1Ms));
  const supabaseMedianMs = median(samples.map(sample => sample.supabaseMs));
  // O destino não contém sessões nem permissões complementares. Tempo menor,
  // sozinho, não torna segura uma troca da fonte de autorização.
  return { measuredAt: new Date().toISOString(), sourceCount, destinationCount, matching,
    d1MedianMs, supabaseMedianMs, samples,
    recommendation: !matching || d1MedianMs <= supabaseMedianMs ? "KEEP_D1" : "INSPECT_FRESHNESS" };
}
