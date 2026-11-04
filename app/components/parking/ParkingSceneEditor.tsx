"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCENE_KINDS,
  SCENE_LABELS,
  newSceneObject,
  parseParkingScene,
  sceneIssues,
  type ParkingScene,
  type SceneKind,
  type SceneObject,
} from "../../lib/parking-scene";
import type { Space } from "./types";
import ParkingSceneView from "./ParkingSceneView";

type Envelope = {
  draft: ParkingScene;
  published: ParkingScene | null;
  revision: number;
  fingerprint: string;
  history: { id: number; revisao: number; criado_em: string }[];
};
export default function ParkingSceneEditor({
  spaces,
  onPublished,
  onDirtyChange,
}: {
  spaces: Space[];
  onPublished: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<Envelope | null>(null),
    [scene, setScene] = useState<ParkingScene | null>(null),
    [saved, setSaved] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [move, setMove] = useState(false),
    [snap, setSnap] = useState(true),
    [kind, setKind] = useState<SceneKind>("space"),
    [query, setQuery] = useState("");
  const [past, setPast] = useState<ParkingScene[]>([]),
    [future, setFuture] = useState<ParkingScene[]>([]);
  const saving = useRef(false),
    mounted = useRef(true);
  const dirty = !!scene && JSON.stringify(scene) !== saved;
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pilot/estacionamento/cenario?editor=1", {
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error || "Não foi possível abrir o editor.");
      if (!mounted.current) return;
      setData(body);
      setScene(body.draft);
      setSaved(JSON.stringify(body.draft));
      setPast([]);
      setFuture([]);
      setSelected([]);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: MouseEvent) => {
      if (!dirty || !(e.target instanceof Element)) return;
      const target = e.target.closest(
        'a[href], .parking-experience-switch button[aria-pressed="false"]',
      );
      if (
        target &&
        !window.confirm(
          "Há alterações não salvas. Sair e descartar essas alterações locais?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, onDirtyChange]);
  const issues = useMemo(() => (scene ? sceneIssues(scene) : []), [scene]);
  function change(next: ParkingScene) {
    if (!scene || busy) return;
    setPast((p) => [...p.slice(-39), scene]);
    setFuture([]);
    setScene(next);
    setMessage("");
    setError("");
  }
  function patchObject(patch: Partial<SceneObject>) {
    if (!scene) return;
    change({
      ...scene,
      objects: scene.objects.map((o) =>
        selected.includes(o.id) ? { ...o, ...patch } : o,
      ),
    });
  }
  async function save(publish: boolean) {
    if (!scene || !data || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const checked = parseParkingScene(scene);
      const r = await fetch("/api/pilot/estacionamento/cenario", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: checked,
          revision: data.revision,
          fingerprint: data.fingerprint,
          publish,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Não foi possível salvar.");
      // A successful PUT is final even if the follow-up read fails. Keep the revision
      // to avoid replaying a publication with an obsolete version.
      setData((d) => (d ? { ...d, revision: body.revision } : d));
      setSaved(JSON.stringify(scene));
      setMessage(
        publish
          ? "Cenário publicado. As vagas foram sincronizadas."
          : "Rascunho salvo. Os usuários continuam vendo a versão publicada.",
      );
      const refreshed = await fetch(
        "/api/pilot/estacionamento/cenario?editor=1",
        { cache: "no-store" },
      );
      if (!refreshed.ok)
        throw new Error(
          "Salvo, mas não foi possível atualizar a versão. Recarregue antes de editar novamente.",
        );
      const next = await refreshed.json();
      if (mounted.current) {
        setData(next);
        setScene(next.draft);
        setSaved(JSON.stringify(next.draft));
        if (publish) {
          setPast([]);
          setFuture([]);
          onPublished();
        }
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  // Debounce local changes; never auto-publish or retry a conflict in a loop.
  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = setTimeout(() => void save(false), 5000);
    return () => clearTimeout(timer);
  });
  if (!scene || !data)
    return (
      <div className="parking-scene-editor">
        <p role={error ? "alert" : "status"}>{error || "Abrindo o editor…"}</p>
        {error && (
          <button type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        )}
      </div>
    );
  const object = scene.objects.find((o) => o.id === selected[0]);
  const selectedObjects = scene.objects.filter((o) => selected.includes(o.id));
  const pick = (id: string, add: boolean) => {
    setSelected((s) =>
      add ? (s.includes(id) ? s.filter((i) => i !== id) : [...s, id]) : [id],
    );
  };
  function add(count = 1) {
    if (!scene) return;
    if (kind === "space" && !scene.sectors.length) {
      setError("Adicione um setor antes de criar vagas.");
      return;
    }
    const used = new Set(
      scene.objects.filter((o) => o.kind === "space").map((o) => o.name),
    );
    let index = 1;
    const items = Array.from({ length: count }, (_, i) => {
      while (used.has(`A${String(index).padStart(2, "0")}`)) index++;
      const name = `A${String(index++).padStart(2, "0")}`;
      used.add(name);
      return {
        ...newSceneObject(
          kind,
          crypto.randomUUID(),
          5 + i * 3.5,
          Math.min(scene.depth - 4, 10),
        ),
        ...(kind === "space" ? { name, sectorId: scene.sectors[0].id } : {}),
      };
    });
    change({ ...scene, objects: [...scene.objects, ...items] });
    setSelected(items.map((o) => o.id));
  }
  function duplicate() {
    if (!scene) return;
    const codes = new Set(scene.objects.map((o) => o.name));
    const items = selectedObjects.map((o) => {
      let n = 1,
        name = o.name;
      while (codes.has(name))
        name =
          o.kind === "space"
            ? `N${String(n++).padStart(3, "0")}`
            : `${o.name.slice(0, 45)} ${n++}`;
      codes.add(name);
      const copy = { ...o };
      delete copy.spaceId;
      return {
        ...copy,
        id: crypto.randomUUID(),
        name,
        x: Math.min(scene.width - 2, o.x + 4),
        locked: false,
      };
    });
    change({ ...scene, objects: [...scene.objects, ...items] });
    setSelected(items.map((o) => o.id));
  }
  async function restore(id: string) {
    if (
      !id ||
      !window.confirm(
        "Carregar esta versão como rascunho? A publicação atual permanece igual.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/pilot/estacionamento/cenario?editor=1&history=${id}`,
        { cache: "no-store" },
      );
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setPast((p) => [...p.slice(-39), scene!]);
      setFuture([]);
      setScene(body.draft);
      setSelected([]);
      setMessage(
        "Versão carregada como rascunho. Revise e publique quando estiver pronta.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="parking-scene-editor">
      <header className="parking-scene-editor-heading">
        <div>
          <span className="parking-record-eyebrow">GESTÃO · CENÁRIO</span>
          <h2>
            {preview ? "Prévia do rascunho" : "Desenhe seu estacionamento"}
          </h2>
          <p>
            Rascunho salvo após 5 segundos sem editar. Somente Publicar altera o
            mapa dos usuários.
          </p>
        </div>
        <span className="parking-scene-version">
          Versão {data.revision} ·{" "}
          {dirty
            ? "Alterações não salvas"
            : data.revision
              ? "Rascunho salvo"
              : "Modelo inicial"}
        </span>
      </header>
      <div className="parking-scene-toolbar">
        <div>
          <button
            type="button"
            disabled={busy || !past.length}
            onClick={() => {
              setFuture((f) => [scene, ...f].slice(0, 40));
              setScene(past[past.length - 1]);
              setPast((p) => p.slice(0, -1));
            }}
          >
            Desfazer
          </button>
          <button
            type="button"
            disabled={busy || !future.length}
            onClick={() => {
              setPast((p) => [...p, scene].slice(-40));
              setScene(future[0]);
              setFuture((f) => f.slice(1));
            }}
          >
            Refazer
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "Voltar à edição" : "Prévia"}
          </button>
        </div>
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Descartar as alterações locais e recarregar o rascunho salvo?",
                )
              )
                void load();
            }}
          >
            Recarregar
          </button>
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save(false)}
          >
            Salvar rascunho
          </button>
          <button
            type="button"
            className="gestao-primary"
            disabled={busy || issues.length > 0}
            onClick={() => {
              if (
                window.confirm(
                  "Publicar este cenário para todos? Vagas removidas serão arquivadas; reservas e ocupações serão verificadas.",
                )
              )
                void save(true);
            }}
          >
            {busy ? "Salvando…" : "Publicar"}
          </button>
        </div>
      </div>
      {error && (
        <p className="parking-scene-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="parking-scene-success" role="status">
          {message}
        </p>
      )}
      {issues.length > 0 && (
        <details className="parking-scene-issues">
          <summary>
            {issues.length} ajustes necessários antes de publicar
          </summary>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
      {!preview && (
        <fieldset disabled={busy} className="parking-scene-tools">
          <label>
            Adicionar
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SceneKind)}
            >
              {SCENE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SCENE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => add()}>
            + Adicionar
          </button>
          {kind === "space" && (
            <button type="button" onClick={() => add(6)}>
              + Fileira de 6 vagas
            </button>
          )}
          <button
            type="button"
            aria-pressed={move}
            onClick={() => setMove((v) => !v)}
          >
            {move ? "Mover objetos" : "Selecionar objetos"}
          </button>
          <label className="parking-scene-check">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Encaixar na grade
          </label>
        </fieldset>
      )}
      <div className={`parking-scene-workbench${preview ? " is-preview" : ""}`}>
        <ParkingSceneView
          scene={scene}
          spaces={spaces}
          selected={selected}
          editing={!preview}
          move={move}
          snap={snap}
          disabled={busy}
          onSelect={pick}
          onMove={(id, x, y) => {
            const source = scene.objects.find((o) => o.id === id);
            if (!source) return;
            const group = selected.includes(id) ? selected : [id];
            change({
              ...scene,
              objects: scene.objects.map((o) =>
                group.includes(o.id) && !o.locked
                  ? {
                      ...o,
                      x: Math.max(0, o.x + x - source.x),
                      y: Math.max(0, o.y + y - source.y),
                    }
                  : o,
              ),
            });
            setSelected(group);
          }}
        />
        {!preview && (
          <aside className="parking-scene-properties">
            <fieldset disabled={busy}>
              <legend>
                {object
                  ? selected.length > 1
                    ? `${selected.length} elementos`
                    : object.name
                  : "Propriedades"}
              </legend>
              {object ? (
                <>
                  <label>
                    Nome / código
                    <input
                      maxLength={object.kind === "space" ? 12 : 60}
                      value={object.name}
                      disabled={selected.length > 1 || object.locked}
                      onChange={(e) =>
                        patchObject({
                          name:
                            object.kind === "space"
                              ? e.target.value.toUpperCase()
                              : e.target.value,
                        })
                      }
                    />
                  </label>
                  {object.kind === "space" && (
                    <>
                      <label>
                        Setor
                        <select
                          value={object.sectorId}
                          disabled={object.locked}
                          onChange={(e) =>
                            patchObject({ sectorId: e.target.value })
                          }
                        >
                          {scene.sectors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Tipo
                        <select
                          value={object.spaceType}
                          disabled={object.locked}
                          onChange={(e) =>
                            patchObject({ spaceType: e.target.value })
                          }
                        >
                          {["COMUM", "RESERVADA", "IDOSO", "PCD"].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <div className="parking-scene-fields">
                    {(
                      [
                        ["x", "Posição X"],
                        ["y", "Posição Y"],
                        ["width", "Largura"],
                        ["depth", "Comprimento"],
                        ["height", "Altura"],
                        ["rotation", "Rotação"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          step={key === "rotation" ? 5 : 0.1}
                          min={
                            key === "rotation" || key === "x" || key === "y"
                              ? 0
                              : 0.01
                          }
                          max={
                            key === "rotation"
                              ? 360
                              : key === "height"
                                ? 30
                                : 1400
                          }
                          value={Math.round(object[key] * 100) / 100}
                          disabled={object.locked}
                          onChange={(e) => {
                            if (e.target.value !== "")
                              patchObject({ [key]: Number(e.target.value) });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Cor
                    <input
                      type="color"
                      value={object.color}
                      disabled={object.locked}
                      onChange={(e) => patchObject({ color: e.target.value })}
                    />
                  </label>
                  <label className="parking-scene-check">
                    <input
                      type="checkbox"
                      checked={object.locked}
                      onChange={(e) =>
                        patchObject({ locked: e.target.checked })
                      }
                    />
                    Fixar objeto
                  </label>
                  <div className="parking-scene-actions">
                    <button type="button" onClick={duplicate}>
                      Duplicar
                    </button>
                    <button
                      type="button"
                      disabled={selectedObjects.some((o) => o.locked)}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remover ${selected.length} elemento(s) do rascunho?`,
                          )
                        ) {
                          change({
                            ...scene,
                            objects: scene.objects.filter(
                              (o) => !selected.includes(o.id),
                            ),
                          });
                          setSelected([]);
                        }
                      }}
                    >
                      Excluir
                    </button>
                    {selected.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => patchObject({ y: object.y })}
                        >
                          Alinhar horizontal
                        </button>
                        <button
                          type="button"
                          onClick={() => patchObject({ x: object.x })}
                        >
                          Alinhar vertical
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            let x = Math.min(
                              ...selectedObjects.map((o) => o.x),
                            );
                            change({
                              ...scene,
                              objects: scene.objects.map((o) => {
                                if (!selected.includes(o.id) || o.locked)
                                  return o;
                                const result = { ...o, x };
                                x += o.width + 0.5;
                                return result;
                              }),
                            });
                          }}
                        >
                          Distribuir
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p>Selecione um elemento no mapa ou na lista abaixo.</p>
              )}
            </fieldset>
            <details>
              <summary>Terreno e apresentação</summary>
              <fieldset disabled={busy}>
                <label>
                  Nome
                  <input
                    value={scene.name}
                    maxLength={80}
                    onChange={(e) => change({ ...scene, name: e.target.value })}
                  />
                </label>
                <div className="parking-scene-fields">
                  {(
                    [
                      ["width", "Largura"],
                      ["depth", "Comprimento"],
                      ["light", "Luz"],
                      ["angle", "Câmera inicial"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        step={key === "light" ? 0.1 : 1}
                        value={scene[key]}
                        onChange={(e) => {
                          if (e.target.value !== "")
                            change({ ...scene, [key]: Number(e.target.value) });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Cor do piso
                  <input
                    type="color"
                    value={scene.ground}
                    onChange={(e) =>
                      change({ ...scene, ground: e.target.value })
                    }
                  />
                </label>
              </fieldset>
            </details>
            <details>
              <summary>Setores ({scene.sectors.length})</summary>
              <fieldset disabled={busy}>
                {scene.sectors.map((s) => (
                  <div key={s.id} className="parking-scene-sector">
                    <label>
                      Nome do setor
                      <input
                        value={s.name}
                        maxLength={40}
                        onChange={(e) =>
                          change({
                            ...scene,
                            sectors: scene.sectors.map((t) =>
                              t.id === s.id
                                ? { ...t, name: e.target.value }
                                : t,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Cor
                      <input
                        type="color"
                        value={s.color}
                        onChange={(e) =>
                          change({
                            ...scene,
                            sectors: scene.sectors.map((t) =>
                              t.id === s.id
                                ? { ...t, color: e.target.value }
                                : t,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (scene.objects.some((o) => o.sectorId === s.id)) {
                          setError(
                            "Transfira ou remova as vagas deste setor antes de excluí-lo.",
                          );
                          return;
                        }
                        change({
                          ...scene,
                          sectors: scene.sectors.filter((t) => t.id !== s.id),
                        });
                      }}
                    >
                      Excluir setor
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    change({
                      ...scene,
                      sectors: [
                        ...scene.sectors,
                        {
                          id: crypto.randomUUID(),
                          name: `Setor ${scene.sectors.length + 1}`,
                          color: "#5b2fc4",
                        },
                      ],
                    })
                  }
                >
                  + Setor
                </button>
              </fieldset>
            </details>
            <details>
              <summary>Localizar / selecionar elementos</summary>
              <label>
                Buscar
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="parking-scene-object-picker">
                {scene.objects
                  .filter((o) =>
                    o.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((o) => (
                    <label className="parking-scene-check" key={o.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(o.id)}
                        onChange={() => pick(o.id, true)}
                      />
                      {o.name} · {SCENE_LABELS[o.kind]}
                    </label>
                  ))}
              </div>
            </details>
            <details>
              <summary>Versões publicadas</summary>
              <label>
                Restaurar como rascunho
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => void restore(e.target.value)}
                >
                  <option value="">Escolha uma versão</option>
                  {data.history.map((h) => (
                    <option key={h.id} value={h.id}>
                      Versão {h.revisao} · {h.criado_em}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Restaurar o desenho não desfaz entradas, saídas ou reservas.
              </p>
            </details>
          </aside>
        )}
      </div>
    </section>
  );
}
