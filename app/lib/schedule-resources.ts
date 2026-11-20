export type ScheduleResourceLink = {
  id: string | number;
  tipo: string;
  titulo: string;
  url: string;
};

export type ScheduleResourceGroup = {
  title: string;
  links: ScheduleResourceLink[];
};

export function groupScheduleResources(
  repertoire: string[],
  links: ScheduleResourceLink[],
) {
  const titles = [...new Set(repertoire.map((item) => item.trim()).filter(Boolean))];
  const groups: ScheduleResourceGroup[] = titles.map((title) => ({ title, links: [] }));
  const unmatched: ScheduleResourceLink[] = [];

  for (const link of links) {
    if (!isSafeResourceUrl(link.url)) continue;
    const linkTitle = normalizeResourceTitle(link.titulo);
    const exactIndex = groups.findIndex(
      (group) => normalizeResourceTitle(group.title) === linkTitle,
    );
    const relatedIndex = exactIndex >= 0
      ? exactIndex
      : groups.findIndex((group) => {
          const groupTitle = normalizeResourceTitle(group.title);
          return Boolean(groupTitle && linkTitle) &&
            (groupTitle.includes(linkTitle) || linkTitle.includes(groupTitle));
        });

    if (relatedIndex >= 0) {
      groups[relatedIndex].links.push(link);
    } else if (groups.length === 1) {
      groups[0].links.push(link);
    } else {
      unmatched.push(link);
    }
  }

  return { groups, unmatched };
}

export function mergeScheduleResourceLinks(
  ...collections: ScheduleResourceLink[][]
) {
  const seen = new Set<string>();
  const merged: ScheduleResourceLink[] = [];
  for (const link of collections.flat()) {
    if (!isSafeResourceUrl(link.url)) continue;
    const key = link.url.trim().toLocaleLowerCase("pt-BR");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(link);
  }
  return merged;
}

function isSafeResourceUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizeResourceTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}
