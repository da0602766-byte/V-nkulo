"use client";

import { FormEvent, useState } from "react";
import PdfComposer from "./PdfComposer";
import NewsInteractions from "./NewsInteractions";
import { prepareImageDataUrl } from "../lib/client-image";

export type PortalData = {
  avisos: Record<string, unknown>[];
  louvor: Record<string, unknown>[];
  diaconias: Record<string, unknown>[];
  equipesDiaconia: Record<string, unknown>[];
  usuariosDiaconia: {
    id: number;
    nome: string;
    diaconia_equipe_id: number | null;
  }[];
  rankingDiaconia: {
    equipes: { id: number; nome: string; cor: string; pontos: number }[];
    pessoas: { nome: string; equipe: string; cor: string; pontos: number }[];
  };
  rankingPublicado: boolean;
  modulos: Record<string, unknown>[];
  registros: Record<string, unknown>[];
  blocosTexto: Record<string, unknown>[];
};

type Section = "louvor" | "diaconia" | "avisos" | "modulos";
type ModuleBlockType = "titulo" | "texto" | "imagem" | "grafico" | "checklist";
type ModuleBlock = {
  id: string;
  tipo: ModuleBlockType;
  titulo?: string;
  conteudo?: string;
  imagem?: string;
  dados?: { rotulo: string; valor: number }[];
  itens?: { texto: string; feito: boolean }[];
};

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Não foi possível concluir a operação.");
  if (options?.method === "POST" && typeof window !== "undefined")
    window.dispatchEvent(new Event("adote:refresh-notifications"));
  return body;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parsePeople(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nome, funcao = "Integrante"] = line
        .split("|")
        .map((part) => part.trim());
      return { nome, funcao };
    });
}

function parseSongs(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [titulo, tonalidade = "", vocal = ""] = line
        .split("|")
        .map((part) => part.trim());
      return { ordem: index + 1, titulo, tonalidade, vocal };
    });
}

function parseTasks(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [descricao, responsavel = "A definir"] = line
        .split("|")
        .map((part) => part.trim());
      return { descricao, responsavel, status: "PENDENTE" };
    });
}

function parseFields(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nome, tipo = "texto"] = line.split("|").map((part) => part.trim());
      return {
        nome,
        chave: nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_"),
        tipo,
      };
    });
}

function parseChartData(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rotulo, rawValue = "0"] = line.split("|").map((part) => part.trim());
      return { rotulo, valor: Math.max(0, Number(rawValue) || 0) };
    });
}

function parseChecklistData(
  value: string,
  current: { texto: string; feito: boolean }[] = [],
) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((texto) => ({
      texto,
      feito: current.find((item) => item.texto === texto)?.feito || false,
    }));
}

function peopleToText(value: unknown) {
  return parseJson<{ nome: string; funcao: string }[]>(value, [])
    .map((item) => `${item.nome} | ${item.funcao}`)
    .join("\n");
}

function songsToText(value: unknown) {
  return parseJson<{ titulo: string; tonalidade: string; vocal: string }[]>(
    value,
    [],
  )
    .map(
      (item) =>
        `${item.titulo} | ${item.tonalidade || ""} | ${item.vocal || ""}`,
    )
    .join("\n");
}

function tasksToText(value: unknown) {
  return parseJson<{ descricao: string; responsavel: string }[]>(value, [])
    .map((item) => `${item.descricao} | ${item.responsavel}`)
    .join("\n");
}

export default function PortalModules({
  section,
  title,
  initialData,
  onDataChange,
  can,
  notify,
}: {
  section: Section;
  title?: string;
  initialData: PortalData;
  onDataChange?: (data: PortalData) => void;
  can: (permission: string) => boolean;
  notify: (text: string) => void;
}) {
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState<Section | "record" | null>(null);
  const [selectedModule, setSelectedModule] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedItem, setSelectedItem] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [pdfItem, setPdfItem] = useState<Record<string, unknown> | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<number | null>(
    Number(initialData.modulos[0]?.id) || null,
  );
  const [moduleBlocks, setModuleBlocks] = useState<ModuleBlock[]>([]);

  const activeModule =
    data.modulos.find((item) => Number(item.id) === activeModuleId) ||
    data.modulos[0] ||
    null;

  function openModuleEditor(item: Record<string, unknown> | null) {
    setSelectedModule(item);
    setModuleBlocks(parseJson<ModuleBlock[]>(item?.conteudo, []));
    setModal("modulos");
  }

  function addModuleBlock(tipo: ModuleBlockType) {
    setModuleBlocks((current) => [
      ...current,
      {
        id: `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipo,
        titulo: tipo === "titulo" ? "Novo título" : "",
        conteudo: "",
        imagem: "",
        dados: tipo === "grafico" ? [{ rotulo: "Item", valor: 1 }] : undefined,
        itens: tipo === "checklist" ? [{ texto: "Nova tarefa", feito: false }] : undefined,
      },
    ]);
  }

  function updateModuleBlock(id: string, values: Partial<ModuleBlock>) {
    setModuleBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, ...values } : block)),
    );
  }

  function moveModuleBlock(index: number, direction: -1 | 1) {
    setModuleBlocks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateData(updater: (current: PortalData) => PortalData) {
    setData((current) => {
      const next = updater(current);
      onDataChange?.(next);
      return next;
    });
  }

  async function refresh(target: Section) {
    const endpoint =
      target === "louvor"
        ? "/api/louvor"
        : target === "diaconia"
          ? "/api/diaconia"
          : target === "avisos"
            ? "/api/avisos"
            : "/api/modulos";
    const body = await api(endpoint);
    const key =
      target === "louvor"
        ? "escalas"
        : target === "diaconia"
          ? "diaconias"
          : target === "avisos"
            ? "avisos"
            : "modulos";
    updateData((current) =>
      target === "modulos"
        ? { ...current, modulos: body.modulos, registros: body.registros }
        : {
            ...current,
            [target === "diaconia" ? "diaconias" : target]: body[key],
          },
    );
  }

  async function submitWorship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        musicas: parseSongs(String(form.get("musicas") ?? "")),
        integrantes: parsePeople(String(form.get("integrantes") ?? "")),
      };
      if (selectedItem)
        await api(`/api/louvor/${selectedItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/louvor", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await refresh("louvor");
      setModal(null);
      setSelectedItem(null);
      notify(
        selectedItem ? "Escala atualizada." : "Escala do louvor publicada.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitDeaconry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        integrantes: parsePeople(String(form.get("integrantes") ?? "")),
        tarefas: parseTasks(String(form.get("tarefas") ?? "")),
      };
      if (selectedItem)
        await api(`/api/diaconia/${selectedItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/diaconia", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await refresh("diaconia");
      setModal(null);
      setSelectedItem(null);
      notify(
        selectedItem
          ? "Serviço atualizado."
          : "Serviço de diaconia cadastrado.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const file = (
        event.currentTarget.elements.namedItem(
          "imagemArquivo",
        ) as HTMLInputElement
      ).files?.[0];
      let imagem = String(form.get("imagem") || "").trim();
      if (file) imagem = await prepareImageDataUrl(file);
      else if (form.get("removerImagem") === "on") imagem = "";
      else if (!imagem && selectedItem?.imagem)
        imagem = String(selectedItem.imagem);
      const payload = {
        titulo: form.get("titulo"),
        tipo: form.get("tipo"),
        prioridade: form.get("prioridade"),
        resumo: form.get("resumo"),
        conteudo: form.get("conteudo"),
        imagem,
      };
      if (selectedItem)
        await api(`/api/avisos/${selectedItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/avisos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await refresh("avisos");
      setModal(null);
      setSelectedItem(null);
      notify(selectedItem ? "Publicação atualizada." : "Notícia publicada.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteNotice(id: number) {
    if (
      !window.confirm(
        "Excluir esta notícia ou aviso? Esta ação não pode ser desfeita.",
      )
    )
      return;
    try {
      await api(`/api/avisos/${id}`, { method: "DELETE" });
      updateData((current) => ({
        ...current,
        avisos: current.avisos.filter((item) => Number(item.id) !== id),
      }));
      notify("Notícia excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteItem(target: "louvor" | "diaconia", id: number) {
    if (
      !window.confirm("Excluir este registro? Esta ação não pode ser desfeita.")
    )
      return;
    try {
      await api(`/api/${target}/${id}`, { method: "DELETE" });
      await refresh(target);
      notify("Registro excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        campos: parseFields(String(form.get("campos") ?? "")),
        conteudo: moduleBlocks,
        cor: String(form.get("cor") || "#17877f"),
        ativo: form.get("ativo") === "on",
      };
      if (selectedModule)
        await api(`/api/modulos/${selectedModule.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/modulos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await refresh("modulos");
      setModal(null);
      setSelectedModule(null);
      setModuleBlocks([]);
      notify("Aba personalizada salva.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModule) return;
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        moduloId: selectedModule.id,
        dados: Object.fromEntries(form.entries()),
      };
      if (selectedRecord)
        await api(`/api/registros/${selectedRecord.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      else
        await api("/api/registros", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      await refresh("modulos");
      setModal(null);
      setSelectedModule(null);
      setSelectedRecord(null);
      notify(
        selectedRecord ? "Registro atualizado." : "Registro salvo no módulo.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteModule(id: number) {
    if (
      !window.confirm(
        "Excluir esta aba personalizada e todos os seus registros?",
      )
    )
      return;
    try {
      await api(`/api/modulos/${id}`, { method: "DELETE" });
      await refresh("modulos");
      if (activeModuleId === id) setActiveModuleId(null);
      notify("Aba excluída.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function deleteRecord(id: number) {
    if (!window.confirm("Excluir este registro?")) return;
    try {
      await api(`/api/registros/${id}`, { method: "DELETE" });
      await refresh("modulos");
      notify("Registro excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function renameModule(item: Record<string, unknown>, value: string) {
    const nome = value.trim();
    if (!nome || nome === String(item.nome)) return;
    try {
      await api(`/api/modulos/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome,
          descricao: item.descricao,
          icone: item.icone,
          campos: parseJson<unknown[]>(item.campos, []),
          conteudo: parseJson<unknown[]>(item.conteudo, []),
          cor: item.cor || "#17877f",
          ativo: Boolean(item.ativo),
        }),
      });
      await refresh("modulos");
      notify(`Aba alterada para “${nome}”.`);
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function toggleModuleChecklist(
    item: Record<string, unknown>,
    blockId: string,
    itemIndex: number,
  ) {
    const blocks = parseJson<ModuleBlock[]>(item.conteudo, []);
    const nextBlocks = blocks.map((block) => {
      if (block.id !== blockId) return block;
      return {
        ...block,
        itens: (block.itens || []).map((entry, index) =>
          index === itemIndex ? { ...entry, feito: !entry.feito } : entry,
        ),
      };
    });
    updateData((current) => ({
      ...current,
      modulos: current.modulos.map((module) =>
        Number(module.id) === Number(item.id)
          ? { ...module, conteudo: JSON.stringify(nextBlocks) }
          : module,
      ),
    }));
    try {
      await api(`/api/modulos/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: item.nome,
          descricao: item.descricao,
          icone: item.icone,
          campos: parseJson<unknown[]>(item.campos, []),
          conteudo: nextBlocks,
          cor: item.cor || "#17877f",
          ativo: Boolean(item.ativo),
        }),
      });
    } catch (error) {
      await refresh("modulos");
      notify((error as Error).message);
    }
  }

  if (section === "louvor")
    return (
      <>
        <PageHeader
          eyebrow="MINISTÉRIO"
          title={title || "Equipe de Louvor"}
          description="Organize repertório, tons, vozes e quem servirá em cada instrumento."
          action={
            can("LOUVOR_GERENCIAR") ? (
              <button
                className="primary-button"
                onClick={() => {
                  setSelectedItem(null);
                  setModal("louvor");
                }}
              >
                ＋ Nova escala
              </button>
            ) : null
          }
        />
        <div className="ministry-grid">
          {data.louvor.length ? (
            data.louvor.map((item) => (
              <WorshipCard
                key={String(item.id)}
                item={item}
                canManage={can("LOUVOR_GERENCIAR")}
                onPdf={() => setPdfItem(item)}
                onEdit={() => {
                  setSelectedItem(item);
                  setModal("louvor");
                }}
                onDelete={() => deleteItem("louvor", Number(item.id))}
              />
            ))
          ) : (
            <Empty text="Nenhuma escala de louvor publicada." />
          )}
        </div>
        {modal === "louvor" && (
          <Modal
            title={
              selectedItem ? "Editar escala de louvor" : "Nova escala de louvor"
            }
            onClose={() => {
              setModal(null);
              setSelectedItem(null);
            }}
          >
            <form className="form-grid" onSubmit={submitWorship}>
              <label className="span-2">
                Título do culto*
                <input
                  name="titulo"
                  required
                  placeholder="Culto de Celebração"
                  defaultValue={String(selectedItem?.titulo || "")}
                />
              </label>
              <label>
                Data*
                <input
                  type="date"
                  name="dataCulto"
                  required
                  defaultValue={String(selectedItem?.data_culto || "")}
                />
              </label>
              <label>
                Horário
                <input
                  type="time"
                  name="horario"
                  defaultValue={String(selectedItem?.horario || "")}
                />
              </label>
              <label className="span-2">
                Local
                <input
                  name="local"
                  placeholder="Templo principal"
                  defaultValue={String(selectedItem?.local || "")}
                />
              </label>
              <label className="span-2">
                Músicas — uma por linha
                <textarea
                  name="musicas"
                  rows={5}
                  defaultValue={songsToText(selectedItem?.musicas)}
                  placeholder="Nome da música | Tom | Vocal principal"
                />
              </label>
              <label className="span-2">
                Integrantes — um por linha
                <textarea
                  name="integrantes"
                  rows={5}
                  defaultValue={peopleToText(selectedItem?.integrantes)}
                  placeholder="Nome | Instrumento ou função"
                />
              </label>
              <label className="span-2">
                Observações
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={String(selectedItem?.observacoes || "")}
                />
              </label>
              <Actions
                close={() => {
                  setModal(null);
                  setSelectedItem(null);
                }}
                label={selectedItem ? "Salvar alterações" : "Publicar escala"}
              />
            </form>
          </Modal>
        )}
        {pdfItem && (
          <PdfComposer
            baseUrl={`/api/louvor/${pdfItem.id}/pdf`}
            initialTitle={`ADOTE - ${String(pdfItem.titulo)}`}
            onClose={() => setPdfItem(null)}
          />
        )}
      </>
    );

  if (section === "diaconia")
    return (
      <>
        <PageHeader
          eyebrow="SERVIÇO"
          title={title || "Controle de Diaconia"}
          description="Defina responsáveis, integrantes e tarefas de cada serviço."
          action={
            can("DIACONIA_GERENCIAR") ? (
              <button
                className="primary-button"
                onClick={() => {
                  setSelectedItem(null);
                  setModal("diaconia");
                }}
              >
                ＋ Novo serviço
              </button>
            ) : null
          }
        />
        <div className="ministry-grid">
          {data.diaconias.length ? (
            data.diaconias.map((item) => (
              <DeaconryCard
                key={String(item.id)}
                item={item}
                canManage={can("DIACONIA_GERENCIAR")}
                onEdit={() => {
                  setSelectedItem(item);
                  setModal("diaconia");
                }}
                onDelete={() => deleteItem("diaconia", Number(item.id))}
              />
            ))
          ) : (
            <Empty text="Nenhum serviço de diaconia cadastrado." />
          )}
        </div>
        {modal === "diaconia" && (
          <Modal
            title={
              selectedItem
                ? "Editar serviço de diaconia"
                : "Novo serviço de diaconia"
            }
            onClose={() => {
              setModal(null);
              setSelectedItem(null);
            }}
          >
            <form className="form-grid" onSubmit={submitDeaconry}>
              <label className="span-2">
                Título*
                <input
                  name="titulo"
                  required
                  placeholder="Organização do culto"
                  defaultValue={String(selectedItem?.titulo || "")}
                />
              </label>
              <label>
                Data*
                <input
                  type="date"
                  name="dataServico"
                  required
                  defaultValue={String(selectedItem?.data_servico || "")}
                />
              </label>
              <label>
                Responsável*
                <input
                  name="responsavel"
                  required
                  defaultValue={String(selectedItem?.responsavel || "")}
                />
              </label>
              <label>
                Status
                <select
                  name="status"
                  defaultValue={String(selectedItem?.status || "PLANEJADA")}
                >
                  <option value="PLANEJADA">Planejada</option>
                  <option value="EM_ANDAMENTO">Em andamento</option>
                  <option value="CONCLUIDA">Concluída</option>
                </select>
              </label>
              <label className="span-2">
                Integrantes — um por linha
                <textarea
                  name="integrantes"
                  rows={4}
                  defaultValue={peopleToText(selectedItem?.integrantes)}
                  placeholder="Nome | Função"
                />
              </label>
              <label className="span-2">
                Serviços — um por linha
                <textarea
                  name="tarefas"
                  rows={5}
                  defaultValue={tasksToText(selectedItem?.tarefas)}
                  placeholder="Descrição do serviço | Responsável"
                />
              </label>
              <label className="span-2">
                Observações
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={String(selectedItem?.observacoes || "")}
                />
              </label>
              <Actions
                close={() => {
                  setModal(null);
                  setSelectedItem(null);
                }}
                label={selectedItem ? "Salvar alterações" : "Salvar serviço"}
              />
            </form>
          </Modal>
        )}
      </>
    );

  if (section === "avisos")
    return (
      <>
        <PageHeader
          eyebrow="COMUNICAÇÃO"
          title={title || "Notícias e avisos"}
          description="Central de informações importantes para toda a equipe."
          action={
            can("AVISOS_PUBLICAR") ? (
              <button
                className="primary-button"
                onClick={() => {
                  setSelectedItem(null);
                  setModal("avisos");
                }}
              >
                ＋ Publicar aviso
              </button>
            ) : null
          }
        />
        <div className="news-grid">
          {data.avisos.length ? (
            data.avisos.map((item) => (
              <article
                className={`news-card priority-${String(item.prioridade).toLowerCase()} type-${String(item.tipo).toLowerCase()}`}
                key={String(item.id)}
              >
                <div className="news-meta">
                  <span>{String(item.tipo)}</span>
                  <time>
                    {new Date(String(item.publicado_em)).toLocaleDateString(
                      "pt-BR",
                    )}
                  </time>
                </div>
                {item.imagem ? (
                  <img
                    className="news-image"
                    src={String(item.imagem)}
                    alt={`Imagem da publicação ${String(item.titulo)}`}
                    loading="lazy"
                  />
                ) : null}
                <h2>{String(item.titulo)}</h2>
                <p>{String(item.resumo)}</p>
                {item.conteudo ? (
                  <details>
                    <summary>Ler mais</summary>
                    <p>{String(item.conteudo)}</p>
                  </details>
                ) : null}
                <NewsInteractions
                  notice={item}
                  onChanged={() => refresh("avisos")}
                  notify={notify}
                />
                {can("AVISOS_PUBLICAR") && (
                  <div className="content-actions">
                    <button
                      className="table-action"
                      onClick={() => {
                        setSelectedItem(item);
                        setModal("avisos");
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => deleteNotice(Number(item.id))}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <Empty text="Nenhuma notícia publicada." />
          )}
        </div>
        {modal === "avisos" && (
          <Modal
            title={
              selectedItem
                ? "Editar notícia ou aviso"
                : "Publicar notícia ou aviso"
            }
            onClose={() => {
              setModal(null);
              setSelectedItem(null);
            }}
          >
            <form className="form-grid" onSubmit={submitNotice}>
              <label className="span-2">
                Título*
                <input
                  name="titulo"
                  required
                  defaultValue={String(selectedItem?.titulo || "")}
                />
              </label>
              <label>
                Tipo
                <select
                  name="tipo"
                  defaultValue={String(selectedItem?.tipo || "AVISO")}
                >
                  <option>AVISO</option>
                  <option>NOTICIA</option>
                  <option>COMUNICADO</option>
                </select>
              </label>
              <label>
                Prioridade
                <select
                  name="prioridade"
                  defaultValue={String(selectedItem?.prioridade || "NORMAL")}
                >
                  <option>NORMAL</option>
                  <option>IMPORTANTE</option>
                  <option>URGENTE</option>
                </select>
              </label>
              <label className="span-2">
                Resumo*
                <textarea
                  name="resumo"
                  required
                  rows={3}
                  defaultValue={String(selectedItem?.resumo || "")}
                />
              </label>
              <label className="span-2">
                Conteúdo completo
                <textarea
                  name="conteudo"
                  rows={6}
                  defaultValue={String(selectedItem?.conteudo || "")}
                />
              </label>
              <label className="span-2">
                Foto da notícia
                <input
                  name="imagemArquivo"
                  type="file"
                  accept="image/*"
                />
                <small>Imagem original de até 50 MB, convertida automaticamente para WebP.</small>
              </label>
              <label className="span-2">
                Ou endereço de uma imagem
                <input
                  name="imagem"
                  type="url"
                  placeholder="https://.../foto.jpg"
                  defaultValue={
                    String(selectedItem?.imagem || "").startsWith("http")
                      ? String(selectedItem?.imagem)
                      : ""
                  }
                />
              </label>
              {selectedItem?.imagem ? (
                <label className="check-line span-2">
                  <input name="removerImagem" type="checkbox" />
                  Remover a foto atual
                </label>
              ) : null}
              <Actions
                close={() => {
                  setModal(null);
                  setSelectedItem(null);
                }}
                label={selectedItem ? "Salvar alterações" : "Publicar"}
              />
            </form>
          </Modal>
        )}
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="CONSTRUTOR DE PÁGINAS"
        title={title || "Outras áreas"}
        description="Organize novas páginas com títulos, textos, fotos, gráficos, checklists e campos personalizados."
        action={
          can("MODULOS_GERENCIAR") ? (
            <button
              className="primary-button"
              onClick={() => openModuleEditor(null)}
            >
              ＋ Nova aba
            </button>
          ) : null
        }
      />
      <div className="custom-area-shell">
        {data.modulos.length ? (
          <>
            <nav className="custom-area-tabs" aria-label="Páginas de Outras áreas">
              {data.modulos.map((item) => (
                <button
                  type="button"
                  key={String(item.id)}
                  className={Number(activeModule?.id) === Number(item.id) ? "active" : ""}
                  style={{ "--module-color": String(item.cor || "#17877f") } as React.CSSProperties}
                  onClick={() => setActiveModuleId(Number(item.id))}
                >
                  <span>{String(item.icone || "◇")}</span>
                  <strong>{String(item.nome)}</strong>
                </button>
              ))}
            </nav>
            {activeModule && (
              <article
                className="custom-area-workspace"
                style={{ "--module-color": String(activeModule.cor || "#17877f") } as React.CSSProperties}
              >
                <header className="custom-area-header">
                  <span className="custom-area-icon">{String(activeModule.icone || "◇")}</span>
                  <div>
                    {can("MODULOS_GERENCIAR") ? (
                      <input
                        className="custom-area-title-input"
                        key={String(activeModule.nome)}
                        defaultValue={String(activeModule.nome)}
                        aria-label={`Editar nome da aba ${String(activeModule.nome)}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={(event) => {
                          const value = event.currentTarget.value.trim();
                          if (value && value !== String(activeModule.nome)) renameModule(activeModule, value);
                          else event.currentTarget.value = String(activeModule.nome);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            event.currentTarget.value = String(activeModule.nome);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <h2>{String(activeModule.nome)}</h2>
                    )}
                    <p>{String(activeModule.descricao || "Página personalizada da igreja")}</p>
                  </div>
                  {can("MODULOS_GERENCIAR") && (
                    <div className="custom-area-admin-actions">
                      <button className="secondary-button" onClick={() => openModuleEditor(activeModule)}>
                        Editar página
                      </button>
                      <button className="cell-delete-button" onClick={() => deleteModule(Number(activeModule.id))}>
                        Excluir aba
                      </button>
                    </div>
                  )}
                </header>

                <div className="custom-content-grid">
                  {parseJson<ModuleBlock[]>(activeModule.conteudo, []).length ? (
                    parseJson<ModuleBlock[]>(activeModule.conteudo, []).map((block) => (
                      <CustomAreaBlock
                        key={block.id}
                        block={block}
                        canManage={can("MODULOS_GERENCIAR")}
                        onToggle={(index) => toggleModuleChecklist(activeModule, block.id, index)}
                      />
                    ))
                  ) : (
                    <div className="custom-area-empty-content">
                      <span>＋</span>
                      <div>
                        <strong>Esta página está pronta para receber conteúdo</strong>
                        <p>Adicione textos, imagens, gráficos ou uma lista de tarefas.</p>
                      </div>
                      {can("MODULOS_GERENCIAR") && (
                        <button className="secondary-button" onClick={() => openModuleEditor(activeModule)}>
                          Montar página
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <section className="custom-records-section">
                  <header>
                    <div>
                      <h3>Registros desta área</h3>
                      <p>Use os campos personalizados para guardar informações organizadas.</p>
                    </div>
                    {parseJson<unknown[]>(activeModule.campos, []).length > 0 && (
                      <button
                        className="primary-button"
                        onClick={() => {
                          setSelectedModule(activeModule);
                          setSelectedRecord(null);
                          setModal("record");
                        }}
                      >
                        ＋ Novo registro
                      </button>
                    )}
                  </header>
                  {parseJson<unknown[]>(activeModule.campos, []).length ? (
                    <ModuleRecords
                      module={activeModule}
                      records={data.registros}
                      canManage={can("MODULOS_GERENCIAR")}
                      onEdit={(record) => {
                        setSelectedModule(activeModule);
                        setSelectedRecord(record);
                        setModal("record");
                      }}
                      onDelete={(record) => deleteRecord(Number(record.id))}
                    />
                  ) : (
                    <p className="module-record-empty">Nenhum campo de registro configurado.</p>
                  )}
                </section>
              </article>
            )}
          </>
        ) : (
          <div className="custom-area-onboarding">
            <span>⊞</span>
            <h2>Crie um espaço do seu jeito</h2>
            <p>Você pode montar páginas para eventos, projetos, cursos, departamentos ou qualquer outra necessidade da igreja.</p>
            {can("MODULOS_GERENCIAR") && (
              <button className="primary-button" onClick={() => openModuleEditor(null)}>
                Criar primeira aba
              </button>
            )}
          </div>
        )}
      </div>
      {modal === "modulos" && (
        <Modal
          title={selectedModule ? "Editar aba" : "Criar nova aba"}
          onClose={() => {
            setModal(null);
            setSelectedModule(null);
            setModuleBlocks([]);
          }}
        >
          <form className="form-grid" onSubmit={submitModule}>
            <label>
              Nome da aba*
              <input
                name="nome"
                required
                defaultValue={String(selectedModule?.nome ?? "")}
              />
            </label>
            <label>
              Ícone
              <input
                name="icone"
                defaultValue={String(selectedModule?.icone ?? "◇")}
                maxLength={2}
              />
            </label>
            <label className="span-2">
              Descrição
              <input
                name="descricao"
                defaultValue={String(selectedModule?.descricao ?? "")}
                placeholder="Explique para que esta página será usada"
              />
            </label>
            <label>
              Cor de destaque
              <input
                name="cor"
                type="color"
                defaultValue={String(selectedModule?.cor ?? "#17877f")}
              />
            </label>
            <div className="custom-block-builder span-2">
              <header>
                <div>
                  <strong>Conteúdo da página</strong>
                  <small>Adicione blocos e arraste a ideia da página para a ordem certa.</small>
                </div>
                <div className="block-toolbox">
                  <button type="button" onClick={() => addModuleBlock("titulo")}>＋ Título</button>
                  <button type="button" onClick={() => addModuleBlock("texto")}>＋ Texto</button>
                  <button type="button" onClick={() => addModuleBlock("imagem")}>＋ Imagem</button>
                  <button type="button" onClick={() => addModuleBlock("grafico")}>＋ Gráfico</button>
                  <button type="button" onClick={() => addModuleBlock("checklist")}>＋ Checklist</button>
                </div>
              </header>
              <div className="block-editor-list">
                {moduleBlocks.length ? moduleBlocks.map((block, index) => (
                  <article className="block-editor-card" key={block.id}>
                    <header>
                      <strong>{blockTypeLabel(block.tipo)}</strong>
                      <div>
                        <button type="button" onClick={() => moveModuleBlock(index, -1)} disabled={index === 0} aria-label="Mover bloco para cima">↑</button>
                        <button type="button" onClick={() => moveModuleBlock(index, 1)} disabled={index === moduleBlocks.length - 1} aria-label="Mover bloco para baixo">↓</button>
                        <button type="button" className="remove-block" onClick={() => setModuleBlocks((current) => current.filter((item) => item.id !== block.id))}>Remover</button>
                      </div>
                    </header>
                    {block.tipo === "titulo" && (
                      <label>
                        Texto do título
                        <input value={block.titulo || ""} onChange={(event) => updateModuleBlock(block.id, { titulo: event.target.value })} />
                      </label>
                    )}
                    {block.tipo === "texto" && (
                      <>
                        <label>
                          Título opcional
                          <input value={block.titulo || ""} onChange={(event) => updateModuleBlock(block.id, { titulo: event.target.value })} />
                        </label>
                        <label>
                          Texto
                          <textarea rows={5} value={block.conteudo || ""} onChange={(event) => updateModuleBlock(block.id, { conteudo: event.target.value })} />
                        </label>
                      </>
                    )}
                    {block.tipo === "imagem" && (
                      <>
                        <label>
                          Legenda ou título
                          <input value={block.titulo || ""} onChange={(event) => updateModuleBlock(block.id, { titulo: event.target.value })} />
                        </label>
                        <label>
                          Endereço da imagem
                          <input type="url" value={block.imagem?.startsWith("http") ? block.imagem : ""} placeholder="https://..." onChange={(event) => updateModuleBlock(block.id, { imagem: event.target.value })} />
                        </label>
                        <label>
                          Ou enviar uma imagem — original de até 50 MB
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              try {
                                updateModuleBlock(block.id, { imagem: await prepareImageDataUrl(file) });
                              } catch (error) {
                                notify((error as Error).message);
                              }
                            }}
                          />
                        </label>
                      </>
                    )}
                    {block.tipo === "grafico" && (
                      <>
                        <label>
                          Título do gráfico
                          <input value={block.titulo || ""} onChange={(event) => updateModuleBlock(block.id, { titulo: event.target.value })} />
                        </label>
                        <label>
                          Dados — um por linha: nome | número
                          <textarea
                            rows={5}
                            value={(block.dados || []).map((item) => `${item.rotulo} | ${item.valor}`).join("\n")}
                            onChange={(event) => updateModuleBlock(block.id, { dados: parseChartData(event.target.value) })}
                            placeholder="Concluídos | 12&#10;Pendentes | 4"
                          />
                        </label>
                      </>
                    )}
                    {block.tipo === "checklist" && (
                      <>
                        <label>
                          Título da lista
                          <input value={block.titulo || ""} onChange={(event) => updateModuleBlock(block.id, { titulo: event.target.value })} />
                        </label>
                        <label>
                          Itens — um por linha
                          <textarea
                            rows={5}
                            value={(block.itens || []).map((item) => item.texto).join("\n")}
                            onChange={(event) => updateModuleBlock(block.id, { itens: parseChecklistData(event.target.value, block.itens) })}
                            placeholder="Confirmar equipe&#10;Revisar materiais"
                          />
                        </label>
                      </>
                    )}
                  </article>
                )) : (
                  <p className="block-builder-empty">Use os botões acima para adicionar o primeiro bloco. Você pode misturar todos os tipos.</p>
                )}
              </div>
            </div>
            <label className="span-2">
              Campos para registros — um por linha
              <textarea
                name="campos"
                rows={7}
                defaultValue={parseJson<{ nome: string; tipo: string }[]>(
                  selectedModule?.campos,
                  [],
                )
                  .map((field) => `${field.nome} | ${field.tipo}`)
                  .join("\n")}
                placeholder="Nome do campo | texto&#10;Data do evento | data&#10;Responsável | texto"
              />
            </label>
            <p className="field-help span-2">
              Esses campos criam formulários e registros dentro da página. Tipos aceitos: texto, data, número e texto longo.
            </p>
            {selectedModule && (
              <label className="checkbox-line span-2">
                <input
                  type="checkbox"
                  name="ativo"
                  defaultChecked={Boolean(selectedModule.ativo)}
                />
                Aba ativa
              </label>
            )}
            <Actions
              close={() => {
                setModal(null);
                setSelectedModule(null);
                setModuleBlocks([]);
              }}
              label="Salvar página"
            />
          </form>
        </Modal>
      )}
      {modal === "record" && selectedModule && (
        <Modal
          title={`${selectedRecord ? "Editar" : "Novo"} registro — ${String(selectedModule.nome)}`}
          onClose={() => {
            setModal(null);
            setSelectedModule(null);
            setSelectedRecord(null);
          }}
        >
          <form className="form-grid" onSubmit={submitRecord}>
            {parseJson<{ nome: string; chave: string; tipo: string }[]>(
              selectedModule.campos,
              [],
            ).map((field) => (
              <DynamicField
                key={field.chave}
                field={field}
                value={
                  parseJson<Record<string, unknown>>(selectedRecord?.dados, {})[
                    field.chave
                  ]
                }
              />
            ))}
            <Actions
              close={() => {
                setModal(null);
                setSelectedModule(null);
                setSelectedRecord(null);
              }}
              label={selectedRecord ? "Salvar alterações" : "Salvar registro"}
            />
          </form>
        </Modal>
      )}
    </>
  );
}

function blockTypeLabel(type: ModuleBlockType) {
  return (
    {
      titulo: "Título",
      texto: "Texto",
      imagem: "Imagem",
      grafico: "Gráfico",
      checklist: "Checklist",
    } as const
  )[type];
}

function CustomAreaBlock({
  block,
  canManage,
  onToggle,
}: {
  block: ModuleBlock;
  canManage: boolean;
  onToggle: (index: number) => void;
}) {
  if (block.tipo === "titulo")
    return <h2 className="custom-block-title">{block.titulo || "Título"}</h2>;

  if (block.tipo === "texto")
    return (
      <section className="custom-content-block custom-text-block">
        {block.titulo && <h3>{block.titulo}</h3>}
        <p>{block.conteudo || "Texto ainda não preenchido."}</p>
      </section>
    );

  if (block.tipo === "imagem")
    return (
      <figure className="custom-content-block custom-image-block">
        {block.imagem ? (
          <img src={block.imagem} alt={block.titulo || "Imagem da página"} loading="lazy" />
        ) : (
          <div className="custom-image-placeholder">Imagem não adicionada</div>
        )}
        {block.titulo && <figcaption>{block.titulo}</figcaption>}
      </figure>
    );

  if (block.tipo === "grafico") {
    const data = block.dados || [];
    const max = Math.max(1, ...data.map((item) => item.valor));
    return (
      <section className="custom-content-block custom-chart-block">
        <h3>{block.titulo || "Gráfico"}</h3>
        <div className="custom-chart-list">
          {data.length ? data.map((item) => (
            <div key={item.rotulo}>
              <span>{item.rotulo}</span>
              <div><i style={{ width: `${Math.max(4, (item.valor / max) * 100)}%` }} /></div>
              <strong>{item.valor}</strong>
            </div>
          )) : <p>Nenhum dado informado.</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="custom-content-block custom-checklist-block">
      <header>
        <h3>{block.titulo || "Checklist"}</h3>
        <span>{(block.itens || []).filter((item) => item.feito).length}/{(block.itens || []).length}</span>
      </header>
      <div>
        {(block.itens || []).length ? (block.itens || []).map((item, index) => (
          <label className={item.feito ? "done" : ""} key={`${item.texto}-${index}`}>
            <input
              type="checkbox"
              checked={item.feito}
              disabled={!canManage}
              onChange={() => onToggle(index)}
            />
            <span>{item.texto}</span>
          </label>
        )) : <p>Nenhum item informado.</p>}
      </div>
    </section>
  );
}

function WorshipCard({
  item,
  canManage,
  onPdf,
  onEdit,
  onDelete,
}: {
  item: Record<string, unknown>;
  canManage: boolean;
  onPdf: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const songs = parseJson<
    { titulo: string; tonalidade: string; vocal: string }[]
  >(item.musicas, []);
  const people = parseJson<{ nome: string; funcao: string }[]>(
    item.integrantes,
    [],
  );
  return (
    <article className="ministry-card">
      <header>
        <div>
          <p className="eyebrow">
            {new Date(`${String(item.data_culto)}T12:00:00`).toLocaleDateString(
              "pt-BR",
            )}
          </p>
          <h2>{String(item.titulo)}</h2>
          <small>
            {String(item.horario || "Horário a definir")} ·{" "}
            {String(item.local || "Local a definir")}
          </small>
        </div>
        <span className="module-icon">♫</span>
      </header>
      <section>
        <h3>Repertório</h3>
        {songs.map((song, index) => (
          <div className="detail-row" key={`${song.titulo}-${index}`}>
            <strong>
              {index + 1}. {song.titulo}
            </strong>
            <span>{song.tonalidade || "—"}</span>
            <small>{song.vocal || "Vocal a definir"}</small>
          </div>
        ))}
      </section>
      <section>
        <h3>Equipe escalada</h3>
        <div className="people-chips">
          {people.map((person) => (
            <span key={`${person.nome}-${person.funcao}`}>
              <strong>{person.nome}</strong>
              {person.funcao}
            </span>
          ))}
        </div>
        <button className="secondary-button download-button" onClick={onPdf}>
          Editar e visualizar PDF
        </button>
        {canManage && (
          <div className="content-actions">
            <button className="table-action" onClick={onEdit}>
              Editar escala
            </button>
            <button className="danger-button" onClick={onDelete}>
              Excluir
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

function DeaconryCard({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: Record<string, unknown>;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const people = parseJson<{ nome: string; funcao: string }[]>(
    item.integrantes,
    [],
  );
  const tasks = parseJson<{ descricao: string; responsavel: string }[]>(
    item.tarefas,
    [],
  );
  return (
    <article className="ministry-card">
      <header>
        <div>
          <p className="eyebrow">
            {new Date(
              `${String(item.data_servico)}T12:00:00`,
            ).toLocaleDateString("pt-BR")}
          </p>
          <h2>{String(item.titulo)}</h2>
          <small>Responsável: {String(item.responsavel)}</small>
        </div>
        <span className="role-pill">
          {String(item.status).replaceAll("_", " ")}
        </span>
      </header>
      <section>
        <h3>Serviços</h3>
        {tasks.map((task) => (
          <div
            className="task-row"
            key={`${task.descricao}-${task.responsavel}`}
          >
            <span>✓</span>
            <strong>{task.descricao}</strong>
            <small>{task.responsavel}</small>
          </div>
        ))}
      </section>
      <section>
        <h3>Integrantes</h3>
        <div className="people-chips">
          {people.map((person) => (
            <span key={`${person.nome}-${person.funcao}`}>
              <strong>{person.nome}</strong>
              {person.funcao}
            </span>
          ))}
        </div>
        {canManage && (
          <div className="content-actions">
            <button className="table-action" onClick={onEdit}>
              Editar serviço
            </button>
            <button className="danger-button" onClick={onDelete}>
              Excluir
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

function DynamicField({
  field,
  value,
}: {
  field: { nome: string; chave: string; tipo: string };
  value?: unknown;
}) {
  const long = field.tipo.toLowerCase().includes("longo");
  return (
    <label className={long ? "span-2" : ""}>
      {field.nome}
      {long ? (
        <textarea
          name={field.chave}
          rows={4}
          defaultValue={String(value || "")}
        />
      ) : (
        <input
          name={field.chave}
          defaultValue={String(value || "")}
          type={
            field.tipo === "data"
              ? "date"
              : field.tipo === "numero" || field.tipo === "número"
                ? "number"
                : "text"
          }
        />
      )}
    </label>
  );
}

function ModuleRecords({
  module,
  records,
  canManage,
  onEdit,
  onDelete,
}: {
  module: Record<string, unknown>;
  records: Record<string, unknown>[];
  canManage: boolean;
  onEdit: (record: Record<string, unknown>) => void;
  onDelete: (record: Record<string, unknown>) => void;
}) {
  const related = records
    .filter((record) => Number(record.modulo_id) === Number(module.id))
    .slice(0, 10);
  if (!related.length)
    return <p className="module-record-empty">Nenhum registro cadastrado.</p>;
  return (
    <div className="module-records">
      {related.map((record) => {
        const values = Object.values(
          parseJson<Record<string, unknown>>(record.dados, {}),
        ).filter((value) => String(value).trim());
        return (
          <div key={String(record.id)}>
            <strong>{String(values[0] ?? "Registro")}</strong>
            <span>
              {values.slice(1, 3).map(String).join(" · ") ||
                new Date(String(record.criado_em)).toLocaleDateString("pt-BR")}
            </span>
            {canManage && (
              <span className="record-actions">
                <button className="table-action" onClick={() => onEdit(record)}>
                  Editar
                </button>
                <button
                  className="danger-button"
                  onClick={() => onDelete(record)}
                >
                  Excluir
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="topbar page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">PORTAL ADOTE</p>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Actions({ close, label }: { close: () => void; label: string }) {
  return (
    <div className="form-actions span-2">
      <button type="button" className="secondary-button" onClick={close}>
        Cancelar
      </button>
      <button className="primary-button">{label}</button>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="panel empty-state">
      <span>◇</span>
      <p>{text}</p>
    </div>
  );
}
