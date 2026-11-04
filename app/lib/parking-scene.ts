/** Shared, serializable scene model. Coordinates are drawing units, not surveyed metres. */
export const SCENE_KINDS = [
  "space",
  "road",
  "tree",
  "planter",
  "lamp",
  "sign",
  "gate",
  "building",
  "wall",
  "crosswalk",
  "arrow",
] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
export const SCENE_LABELS: Record<SceneKind, string> = {
  space: "Vaga",
  road: "Piso / corredor",
  tree: "Árvore",
  planter: "Canteiro",
  lamp: "Poste",
  sign: "Placa",
  gate: "Entrada / saída",
  building: "Construção",
  wall: "Muro",
  crosswalk: "Faixa de pedestres",
  arrow: "Seta",
};
export type SceneObject = {
  id: string;
  kind: SceneKind;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: string;
  locked: boolean;
  sectorId?: string;
  spaceId?: number;
  spaceType?: string;
};
export type SceneSector = {
  id: string;
  dbId?: number;
  name: string;
  color: string;
};
export type ParkingScene = {
  schema: 1;
  name: string;
  width: number;
  depth: number;
  ground: string;
  light: number;
  angle: number;
  sectors: SceneSector[];
  objects: SceneObject[];
};
export type SceneSpace = {
  id: number;
  codigo: string;
  tipo: string;
  setor_id: number;
  setor_nome: string;
  setor_cor: string;
  posicao_x: number;
  posicao_y: number;
  scene_key?: string | null;
};
const color = /^#[0-9a-f]{6}$/i;
const key = /^[a-zA-Z0-9_-]{1,80}$/;
export function newSceneObject(
  kind: SceneKind,
  id: string,
  x = 12,
  y = 12,
): SceneObject {
  const sizes: Record<SceneKind, number[]> = {
    space: [3, 5.5, 0.04],
    road: [14, 7, 0.03],
    tree: [3, 3, 5],
    planter: [7, 2, 0.4],
    lamp: [0.35, 0.35, 6],
    sign: [2, 0.25, 2.5],
    gate: [5, 0.3, 1.5],
    building: [9, 7, 4],
    wall: [8, 0.4, 1.5],
    crosswalk: [5, 3, 0.05],
    arrow: [1.2, 3, 0.06],
  };
  const [width, depth, height] = sizes[kind];
  return {
    id,
    kind,
    name: SCENE_LABELS[kind],
    x,
    y,
    width,
    depth,
    height,
    rotation: 0,
    color:
      kind === "tree" || kind === "planter"
        ? "#54864b"
        : kind === "road"
          ? "#454a55"
          : "#e4e7ee",
    locked: false,
    ...(kind === "space" ? { spaceType: "COMUM" } : {}),
  };
}
export function seedParkingScene(
  spaces: SceneSpace[],
  sectors: { id: number; nome: string; cor: string }[] = [],
): ParkingScene {
  const groups = new Map<number, SceneSector>();
  sectors.forEach((s) =>
    groups.set(s.id, {
      id: `s${s.id}`,
      dbId: s.id,
      name: s.nome,
      color: s.cor,
    }),
  );
  spaces.forEach((s) =>
    groups.set(s.setor_id, {
      id: `s${s.setor_id}`,
      dbId: s.setor_id,
      name: s.setor_nome,
      color: s.setor_cor || "#5b2fc4",
    }),
  );
  const objects: SceneObject[] = [];
  let offset = 8,
    extent = 40;
  for (const sector of groups.values()) {
    const rows = spaces.filter((s) => s.setor_id === sector.dbId);
    const custom =
      new Set(rows.map((s) => `${s.posicao_x},${s.posicao_y}`)).size ===
      rows.length;
    let bottom = offset + 12;
    rows.forEach((s, i) => {
      const x = custom ? s.posicao_x * 0.1 + 8 : 8 + (i % 8) * 4;
      const y = custom
        ? s.posicao_y * 0.1 + offset
        : offset + Math.floor(i / 8) * 13;
      objects.push({
        ...newSceneObject("space", `v${s.id}`, x, y),
        name: s.codigo,
        spaceId: s.id,
        sectorId: sector.id,
        spaceType: s.tipo,
      });
      bottom = Math.max(bottom, y + 8);
      extent = Math.max(extent, x + 8);
    });
    offset = bottom + 8;
  }
  const width = Math.min(1400, extent),
    depth = Math.min(1400, Math.max(32, offset));
  // A light, editable perimeter gives imported layouts context without moving bays.
  for (let y = 6; y < depth - 5; y += 12)
    for (const x of [2.5, width - 2.5]) {
      objects.push({
        ...newSceneObject("planter", `garden-${objects.length}`, x, y),
        width: 3,
        depth: 7,
        color: "#b8c0b8",
      });
      objects.push({
        ...newSceneObject("tree", `tree-${objects.length}`, x, y),
        width: 2.8,
        depth: 2.8,
      });
    }
  objects.push(
    {
      ...newSceneObject("gate", "entry", width / 2, depth - 2),
      name: "ENTRADA",
      color: "#ece6cf",
    },
    {
      ...newSceneObject("crosswalk", "walk", width / 2, depth - 6),
      width: 6,
      depth: 2,
    },
  );
  for (const x of [6, width - 6])
    objects.push({
      ...newSceneObject("lamp", `lamp-${objects.length}`, x, depth - 5),
      color: "#596477",
    });
  return {
    schema: 1,
    name: "Estacionamento",
    width,
    depth,
    ground: "#424753",
    light: 1,
    angle: 35,
    sectors: [...groups.values()],
    objects,
  };
}
export function sceneBounds(o: SceneObject) {
  const r = (o.rotation * Math.PI) / 180;
  return {
    x:
      (Math.abs(Math.cos(r)) * o.width) / 2 +
      (Math.abs(Math.sin(r)) * o.depth) / 2,
    y:
      (Math.abs(Math.sin(r)) * o.width) / 2 +
      (Math.abs(Math.cos(r)) * o.depth) / 2,
  };
}
function overlaps(a: SceneObject, b: SceneObject) {
  // Separating-axis test: rotated bays may touch, but must not overlap.
  const axes = [a.rotation, a.rotation + 90, b.rotation, b.rotation + 90].map(
    (d) => ({
      x: Math.cos((d * Math.PI) / 180),
      y: Math.sin((d * Math.PI) / 180),
    }),
  );
  const radius = (o: SceneObject, v: { x: number; y: number }) => {
    const r = (o.rotation * Math.PI) / 180;
    return (
      (Math.abs(v.x * Math.cos(r) + v.y * Math.sin(r)) * o.width) / 2 +
      (Math.abs(-v.x * Math.sin(r) + v.y * Math.cos(r)) * o.depth) / 2
    );
  };
  return axes.every(
    (v) =>
      Math.abs((a.x - b.x) * v.x + (a.y - b.y) * v.y) <
      radius(a, v) + radius(b, v) - 0.02,
  );
}
export function sceneIssues(scene: ParkingScene): string[] {
  const errors: string[] = [];
  const bays = scene.objects.filter((o) => o.kind === "space");
  for (const o of scene.objects) {
    const b = sceneBounds(o);
    if (
      o.x - b.x < 0 ||
      o.y - b.y < 0 ||
      o.x + b.x > scene.width ||
      o.y + b.y > scene.depth
    )
      errors.push(`${o.name}: fora dos limites do terreno.`);
  }
  for (let i = 0; i < bays.length; i++)
    for (let j = i + 1; j < bays.length; j++)
      if (overlaps(bays[i], bays[j]))
        errors.push(`Vagas ${bays[i].name} e ${bays[j].name} sobrepostas.`);
  return errors.slice(0, 30);
}
export function parseParkingScene(value: unknown): ParkingScene {
  if (!value || typeof value !== "object") throw new Error("Cenário inválido.");
  const s = value as ParkingScene;
  const number = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  if (
    s.schema !== 1 ||
    !text(s.name, 80) ||
    !number(s.width, 10, 1400) ||
    !number(s.depth, 10, 1400) ||
    !color.test(s.ground) ||
    !number(s.light, 0.4, 2) ||
    !number(s.angle, 0, 360) ||
    !Array.isArray(s.sectors) ||
    s.sectors.length > 100 ||
    !Array.isArray(s.objects) ||
    s.objects.length > 1500
  )
    throw new Error(
      "Revise o terreno e o limite de 1.500 elementos / 100 setores.",
    );
  const sectors = new Set<string>(),
    dbSectors = new Set<number>();
  for (const t of s.sectors) {
    if (
      !key.test(t.id) ||
      sectors.has(t.id) ||
      !text(t.name, 40) ||
      !color.test(t.color) ||
      (t.dbId !== undefined &&
        (!Number.isSafeInteger(t.dbId) || t.dbId <= 0 || dbSectors.has(t.dbId)))
    )
      throw new Error("Setor inválido ou repetido.");
    sectors.add(t.id);
    if (t.dbId) dbSectors.add(t.dbId);
  }
  if (
    new Set(s.sectors.map((t) => t.name.trim().toLocaleLowerCase())).size !==
    s.sectors.length
  )
    throw new Error("Os nomes dos setores devem ser únicos.");
  const ids = new Set<string>(),
    codes = new Set<string>(),
    dbIds = new Set<number>();
  let count = 0;
  for (const o of s.objects) {
    if (
      !key.test(o.id) ||
      ids.has(o.id) ||
      !SCENE_KINDS.includes(o.kind) ||
      !text(o.name, 60) ||
      !number(o.x, 0, 1400) ||
      !number(o.y, 0, 1400) ||
      !number(o.width, 0.1, 1400) ||
      !number(o.depth, 0.1, 1400) ||
      !number(o.height, 0.01, 30) ||
      !number(o.rotation, 0, 360) ||
      !color.test(o.color) ||
      typeof o.locked !== "boolean"
    )
      throw new Error("Elemento inválido ou repetido.");
    ids.add(o.id);
    if (o.kind === "space") {
      count++;
      if (
        !o.sectorId ||
        !sectors.has(o.sectorId) ||
        !["COMUM", "RESERVADA", "IDOSO", "PCD"].includes(o.spaceType || "") ||
        !/^[A-Z0-9-]{1,12}$/.test(o.name) ||
        codes.has(o.name) ||
        (o.spaceId !== undefined &&
          (!Number.isSafeInteger(o.spaceId) ||
            o.spaceId <= 0 ||
            dbIds.has(o.spaceId)))
      )
        throw new Error("Revise código único, tipo e setor das vagas.");
      codes.add(o.name);
      if (o.spaceId) dbIds.add(o.spaceId);
    }
  }
  if (count > 500) throw new Error("Use até 500 vagas por cenário.");
  // Copy only supported properties; never persist arbitrary user input.
  return {
    schema: 1,
    name: s.name.trim(),
    width: s.width,
    depth: s.depth,
    ground: s.ground,
    light: s.light,
    angle: s.angle,
    sectors: s.sectors.map((t) => ({
      id: t.id,
      ...(t.dbId ? { dbId: t.dbId } : {}),
      name: t.name.trim(),
      color: t.color,
    })),
    objects: s.objects.map((o) => ({
      id: o.id,
      kind: o.kind,
      name: o.name.trim(),
      x: o.x,
      y: o.y,
      width: o.width,
      depth: o.depth,
      height: o.height,
      rotation: o.rotation,
      color: o.color,
      locked: o.locked,
      ...(o.kind === "space"
        ? {
            sectorId: o.sectorId,
            spaceType: o.spaceType,
            ...(o.spaceId ? { spaceId: o.spaceId } : {}),
          }
        : {}),
    })),
  };
}
