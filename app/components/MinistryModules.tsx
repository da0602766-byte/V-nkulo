"use client";

import { FormEvent, useState } from "react";
import type { PortalData } from "./PortalModules";
import PdfComposer from "./PdfComposer";

type Item = Record<string, unknown>;
type ModalName = "louvor" | "equipe" | "servico" | "checklist" | null;
type Person = { nome: string; funcao: string };
type ChecklistItem = { nome: string; cumpriu: boolean };
type TaskStatus = "PENDENTE" | "FEITA" | "AUSENTE" | "SUBSTITUTO";
type ServiceTask = {
  descricao: string;
  responsavel?: string;
  status?: TaskStatus;
  motivoAusencia?: string;
  substitutoUsuarioId?: number | null;
  substitutoNome?: string;
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

function lines<T>(
  value: string,
  mapper: (parts: string[], index: number) => T,
) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) =>
      mapper(
        line.split("|").map((part) => part.trim()),
        index,
      ),
    );
}

function parsePeople(value: string): Person[] {
  return lines(value, ([nome, funcao = "Integrante"]) => ({ nome, funcao }));
}

function parseSongs(value: string) {
  return lines(value, ([titulo, tonalidade = "", vocal = ""], index) => ({
    ordem: index + 1,
    titulo,
    tonalidade,
    vocal,
  }));
}

function parseTasks(value: string) {
  return lines(value, ([descricao, responsavel = "A definir"]) => ({
    descricao,
    responsavel,
    status: "PENDENTE" as TaskStatus,
    motivoAusencia: "",
    substitutoUsuarioId: null,
    substitutoNome: "",
  }));
}

function parseLinks(value: string) {
  return lines(value, ([rotulo = "Link", endereco = ""]) => {
    let url: URL;
    try {
      url = new URL(endereco);
    } catch {
      throw new Error(
        `O link “${rotulo}” não é válido. Use o endereço completo, começando por https://`,
      );
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error(
        `O link “${rotulo}” precisa começar por http:// ou https://`,
      );
    return { rotulo, url: url.toString() };
  });
}

function peopleText(value: unknown) {
  return parseJson<Person[]>(value, [])
    .map((item) => `${item.nome} | ${item.funcao}`)
    .join("\n");
}

function songsText(value: unknown) {
  return parseJson<{ titulo: string; tonalidade?: string; vocal?: string }[]>(
    value,
    [],
  )
    .map(
      (item) =>
        `${item.titulo} | ${item.tonalidade || ""} | ${item.vocal || ""}`,
    )
    .join("\n");
}

function tasksText(value: unknown) {
  return parseJson<{ descricao: string; responsavel?: string }[]>(value, [])
    .map((item) => `${item.descricao} | ${item.responsavel || ""}`)
    .join("\n");
}

function serviceTasks(item: Item | null): ServiceTask[] {
  if (!item) return [];
  return parseJson<ServiceTask[]>(item.tarefas, []).map((task) => ({
    ...task,
    status: task.status || "PENDENTE",
  }));
}

function linksText(value: unknown) {
  return parseJson<{ rotulo: string; url: string }[]>(value, [])
    .map((item) => `${item.rotulo} | ${item.url}`)
    .join("\n");
}

function serviceChecklist(item: Item | null): ChecklistItem[] {
  if (!item) return [];
  const saved = parseJson<ChecklistItem[]>(item.checklist, []);
  if (saved.length) return saved;
  return parseJson<Person[]>(item.integrantes, []).map((person) => ({
    nome: person.nome,
    cumpriu: false,
  }));
}

function formatDate(value: unknown) {
  if (!value) return "Data a definir";
  return new Date(`${String(value)}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function MinistryModules({
  section,
  title,
  initialData,
  onDataChange,
  can,
  notify,
}: {
  section: "louvor" | "diaconia";
  title?: string;
  initialData: PortalData;
  onDataChange?: (data: PortalData) => void;
  can: (permission: string) => boolean;
  notify: (text: string) => void;
}) {
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState<ModalName>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [pdfItem, setPdfItem] = useState<Item | null>(null);
  const [publishing, setPublishing] = useState(false);

  function update(next: PortalData) {
    setData(next);
    onDataChange?.(next);
  }

  async function refreshLouvor() {
    const body = await api("/api/louvor");
    update({ ...data, louvor: body.escalas });
  }

  async function refreshDiaconia() {
    const body = await api("/api/diaconia");
    update({
      ...data,
      diaconias: body.diaconias,
      equipesDiaconia: body.equipes,
      usuariosDiaconia: body.usuarios,
      rankingDiaconia: body.ranking,
      rankingPublicado: body.rankingPublicado,
    });
  }

  async function saveWorship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        musicas: parseSongs(String(form.get("musicas") || "")),
        integrantes: parsePeople(String(form.get("integrantes") || "")),
        links: parseLinks(String(form.get("links") || "")),
      };
      await api(selected ? `/api/louvor/${selected.id}` : "/api/louvor", {
        method: selected ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await refreshLouvor();
      setModal(null);
      setSelected(null);
      notify(selected ? "Escala atualizada." : "Escala do louvor publicada.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const usuarioIds = data.usuariosDiaconia
        .filter((user) => form.get(`usuario_${user.id}`) === "on")
        .map((user) => user.id);
      const payload = {
        nome: form.get("nome"),
        cor: form.get("cor"),
        responsavelUsuarioId: form.get("responsavelUsuarioId"),
        usuarioIds,
      };
      await api(
        selected
          ? `/api/diaconia/equipes/${selected.id}`
          : "/api/diaconia/equipes",
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      await refreshDiaconia();
      setModal(null);
      setSelected(null);
      notify(selected ? "Equipe atualizada." : "Equipe criada.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const team = data.equipesDiaconia.find(
      (item) => Number(item.id) === Number(form.get("equipeId")),
    );
    const people = parseJson<Person[]>(team?.integrantes, []);
    const previous = serviceChecklist(selected);
    const checklist = people.map((person) => ({
      nome: person.nome,
      cumpriu:
        previous.find((item) => item.nome === person.nome)?.cumpriu || false,
    }));
    const previousTasks = serviceTasks(selected);
    const tasks = parseTasks(String(form.get("tarefas") || "")).map((task) => {
      const saved = previousTasks.find(
        (item) =>
          item.descricao === task.descricao &&
          item.responsavel === task.responsavel,
      );
      return saved
        ? {
            ...task,
            status: saved.status,
            motivoAusencia: saved.motivoAusencia,
            substitutoUsuarioId: saved.substitutoUsuarioId,
            substitutoNome: saved.substitutoNome,
          }
        : task;
    });
    try {
      const payload = {
        ...Object.fromEntries(form.entries()),
        responsavel: String(form.get("responsavel") || team?.responsavel || ""),
        integrantes: people,
        tarefas: tasks,
        checklist,
        cumprida: Boolean(selected?.cumprida),
      };
      await api(selected ? `/api/diaconia/${selected.id}` : "/api/diaconia", {
        method: selected ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await refreshDiaconia();
      setModal(null);
      setSelected(null);
      notify(
        selected
          ? "Escala da diaconia atualizada."
          : "Escala da diaconia criada.",
      );
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function saveChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const tarefas = serviceTasks(selected).map((task, index) => ({
      status: String(form.get(`status_${index}`) || task.status || "PENDENTE"),
      motivoAusencia: String(form.get(`motivo_${index}`) || ""),
      substitutoUsuarioId: Number(form.get(`substituto_${index}`) || 0) || null,
    }));
    try {
      await api(`/api/diaconia/${selected.id}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ tarefas }),
      });
      await refreshDiaconia();
      setModal(null);
      setSelected(null);
      notify("Checklist salvo e ranking recalculado.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function remove(
    path: string,
    question: string,
    refresh: () => Promise<void>,
  ) {
    if (!window.confirm(question)) return;
    try {
      await api(path, { method: "DELETE" });
      await refresh();
      notify("Registro excluído.");
    } catch (error) {
      notify((error as Error).message);
    }
  }

  async function toggleRanking() {
    setPublishing(true);
    try {
      const next = !data.rankingPublicado;
      await api("/api/diaconia/ranking", {
        method: "PATCH",
        body: JSON.stringify({ publicado: next }),
      });
      update({ ...data, rankingPublicado: next });
      notify(
        next
          ? "Ranking publicado para as pessoas autorizadas."
          : "Ranking retirado da publicação.",
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  if (section === "louvor")
    return (
      <>
        <PageHeader
          eyebrow="MINISTÉRIO"
          title={title || "Equipe de Louvor"}
          description={
            can("LOUVOR_GERENCIAR")
              ? "Crie escalas, repertórios e links de apoio. Quem tiver apenas permissão de visualização não poderá alterar nada."
              : "Consulte as escalas, músicas, funções e links liberados pela liderança."
          }
          action={
            can("LOUVOR_GERENCIAR") ? (
              <button
                className="primary-button"
                onClick={() => {
                  setSelected(null);
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
                  setSelected(item);
                  setModal("louvor");
                }}
                onDelete={() =>
                  remove(
                    `/api/louvor/${item.id}`,
                    "Excluir esta escala de louvor?",
                    refreshLouvor,
                  )
                }
              />
            ))
          ) : (
            <Empty text="Nenhuma escala de louvor publicada." />
          )}
        </div>
        {modal === "louvor" && (
          <Modal
            title={
              selected ? "Editar escala de louvor" : "Nova escala de louvor"
            }
            onClose={() => {
              setModal(null);
              setSelected(null);
            }}
          >
            <form className="form-grid" onSubmit={saveWorship}>
              <label className="span-2">
                Título do culto*
                <input
                  name="titulo"
                  required
                  defaultValue={String(selected?.titulo || "")}
                />
              </label>
              <label>
                Data*
                <input
                  type="date"
                  name="dataCulto"
                  required
                  defaultValue={String(selected?.data_culto || "")}
                />
              </label>
              <label>
                Horário
                <input
                  type="time"
                  name="horario"
                  defaultValue={String(selected?.horario || "")}
                />
              </label>
              <label className="span-2">
                Local
                <input
                  name="local"
                  defaultValue={String(selected?.local || "")}
                />
              </label>
              <label className="span-2">
                Músicas — uma por linha
                <textarea
                  name="musicas"
                  rows={5}
                  defaultValue={songsText(selected?.musicas)}
                  placeholder="Nome da música | Tom | Vocal principal"
                />
              </label>
              <label className="span-2">
                Integrantes — um por linha
                <textarea
                  name="integrantes"
                  rows={5}
                  defaultValue={peopleText(selected?.integrantes)}
                  placeholder="Nome | Instrumento ou função"
                />
              </label>
              <label className="span-2">
                Caixas de links — uma por linha
                <textarea
                  name="links"
                  rows={4}
                  defaultValue={linksText(selected?.links)}
                  placeholder="Cifra da música | https://...&#10;Vídeo no YouTube | https://..."
                />
              </label>
              <p className="field-help span-2">
                Esses links ficarão fixados no cartão desta escala para consulta
                rápida.
              </p>
              <label className="span-2">
                Observações
                <textarea
                  name="observacoes"
                  rows={3}
                  defaultValue={String(selected?.observacoes || "")}
                />
              </label>
              <Actions
                close={() => {
                  setModal(null);
                  setSelected(null);
                }}
                label={selected ? "Salvar alterações" : "Publicar escala"}
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

  const showRanking =
    can("DIACONIA_RANKING_PUBLICAR") ||
    (data.rankingPublicado && can("DIACONIA_RANKING_VER"));
  return (
    <>
      <PageHeader
        eyebrow="SERVIÇO"
        title={title || "Diaconia"}
        description="Organize equipes por cor, escalas e checklists de cumprimento."
        action={
          can("DIACONIA_GERENCIAR") ? (
            <div className="header-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setSelected(null);
                  setModal("equipe");
                }}
              >
                ＋ Nova equipe
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setSelected(null);
                  setModal("servico");
                }}
              >
                ＋ Nova escala
              </button>
            </div>
          ) : null
        }
      />

      <section className="section-block">
        <div className="section-title">
          <div>
            <p className="eyebrow">EQUIPES PERMANENTES</p>
            <h2>Grupos por cor</h2>
          </div>
        </div>
        <div className="team-grid">
          {data.equipesDiaconia.length ? (
            data.equipesDiaconia.map((team) => (
              <TeamCard
                key={String(team.id)}
                team={team}
                canManage={can("DIACONIA_GERENCIAR")}
                onEdit={() => {
                  setSelected(team);
                  setModal("equipe");
                }}
                onDelete={() =>
                  remove(
                    `/api/diaconia/equipes/${team.id}`,
                    `Excluir a equipe ${String(team.nome)}? As escalas serão preservadas sem o vínculo da equipe.`,
                    refreshDiaconia,
                  )
                }
              />
            ))
          ) : (
            <Empty text="Nenhuma equipe criada. O administrador pode montar o primeiro grupo por cor." />
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <div>
            <p className="eyebrow">ESCALAS</p>
            <h2>Serviços da diaconia</h2>
          </div>
        </div>
        <div className="ministry-grid">
          {data.diaconias.length ? (
            data.diaconias.map((item) => (
              <ServiceCard
                key={String(item.id)}
                item={item}
                canManage={can("DIACONIA_GERENCIAR")}
                canChecklist={can("DIACONIA_CHECKLIST_GERENCIAR")}
                onChecklist={() => {
                  setSelected(item);
                  setModal("checklist");
                }}
                onEdit={() => {
                  setSelected(item);
                  setModal("servico");
                }}
                onDelete={() =>
                  remove(
                    `/api/diaconia/${item.id}`,
                    "Excluir esta escala da diaconia?",
                    refreshDiaconia,
                  )
                }
              />
            ))
          ) : (
            <Empty text="Nenhuma escala de diaconia cadastrada." />
          )}
        </div>
      </section>

      {showRanking && (
        <RankingPanel
          ranking={data.rankingDiaconia}
          publicado={data.rankingPublicado}
          canPublish={can("DIACONIA_RANKING_PUBLICAR")}
          publishing={publishing}
          onToggle={toggleRanking}
        />
      )}

      {modal === "equipe" && (
        <Modal
          title={selected ? "Editar equipe" : "Nova equipe de diaconia"}
          onClose={() => {
            setModal(null);
            setSelected(null);
          }}
        >
          <form className="form-grid" onSubmit={saveTeam}>
            <label>
              Nome da equipe*
              <input
                name="nome"
                required
                defaultValue={String(selected?.nome || "")}
                placeholder="Equipe Azul"
              />
            </label>
            <label className="color-picker-card">
              Cor da equipe
              <input
                type="color"
                name="cor"
                defaultValue={String(selected?.cor || "#17877f")}
              />
            </label>
            <label className="span-2">
              Responsável cadastrado*
              <select
                name="responsavelUsuarioId"
                required
                defaultValue={String(
                  selected?.responsavel_usuario_id ||
                    data.usuariosDiaconia.find(
                      (user) =>
                        user.nome === String(selected?.responsavel || ""),
                    )?.id ||
                    "",
                )}
              >
                <option value="">Selecione uma pessoa</option>
                {data.usuariosDiaconia.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.nome}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="member-picker span-2">
              <legend>Integrantes cadastrados</legend>
              <p className="field-help">
                Somente pessoas com cadastro ativo podem entrar na equipe. A
                participação também aparecerá na ficha da pessoa.
              </p>
              <div>
                {data.usuariosDiaconia.map((user) => (
                  <label key={user.id}>
                    <input
                      type="checkbox"
                      name={`usuario_${user.id}`}
                      defaultChecked={
                        Number(user.diaconia_equipe_id) === Number(selected?.id)
                      }
                    />
                    <span>{user.nome}</span>
                    {user.diaconia_equipe_id &&
                    Number(user.diaconia_equipe_id) !== Number(selected?.id) ? (
                      <small>Em outra equipe</small>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
            <Actions
              close={() => {
                setModal(null);
                setSelected(null);
              }}
              label="Salvar equipe"
            />
          </form>
        </Modal>
      )}

      {modal === "servico" && (
        <Modal
          title={
            selected ? "Editar escala da diaconia" : "Nova escala da diaconia"
          }
          onClose={() => {
            setModal(null);
            setSelected(null);
          }}
        >
          <form className="form-grid" onSubmit={saveService}>
            <label className="span-2">
              Título*
              <input
                name="titulo"
                required
                defaultValue={String(selected?.titulo || "")}
                placeholder="Recepção do culto"
              />
            </label>
            <label>
              Data*
              <input
                type="date"
                name="dataServico"
                required
                defaultValue={String(selected?.data_servico || "")}
              />
            </label>
            <label>
              Equipe*
              <select
                name="equipeId"
                required
                defaultValue={String(selected?.equipe_id || "")}
              >
                <option value="">Selecione</option>
                {data.equipesDiaconia.map((team) => (
                  <option value={String(team.id)} key={String(team.id)}>
                    {String(team.nome)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsável*
              <input
                name="responsavel"
                required
                defaultValue={String(selected?.responsavel || "")}
                placeholder="Responsável desta escala"
              />
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={String(selected?.status || "PLANEJADA")}
              >
                <option value="PLANEJADA">Planejada</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="CONCLUIDA">Concluída</option>
              </select>
            </label>
            <label className="span-2">
              Serviços — um por linha
              <textarea
                name="tarefas"
                rows={6}
                defaultValue={tasksText(selected?.tarefas)}
                placeholder="Organizar entrada | Nome do responsável"
              />
            </label>
            <p className="field-help span-2">
              Os integrantes são puxados automaticamente da equipe escolhida e
              podem ser alterados no cartão da equipe.
            </p>
            <label className="span-2">
              Observações
              <textarea
                name="observacoes"
                rows={3}
                defaultValue={String(selected?.observacoes || "")}
              />
            </label>
            <Actions
              close={() => {
                setModal(null);
                setSelected(null);
              }}
              label="Salvar escala"
            />
          </form>
        </Modal>
      )}

      {modal === "checklist" && selected && (
        <Modal
          title={`Checklist — ${String(selected.titulo)}`}
          onClose={() => {
            setModal(null);
            setSelected(null);
          }}
        >
          <form className="form-grid" onSubmit={saveChecklist}>
            <p className="field-help span-2">
              Atualize cada tarefa. As opções concluídas alimentam o ranking
              automaticamente; em ausência, informe o motivo, e em substituição,
              escolha uma pessoa cadastrada.
            </p>
            <div className="task-checklist span-2">
              {serviceTasks(selected).map((task, index) => (
                <article
                  className={`task-check-card task-${String(task.status || "PENDENTE").toLowerCase()}`}
                  key={`${task.descricao}-${index}`}
                >
                  <header>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{task.descricao}</strong>
                      <small>
                        Responsável: {task.responsavel || "A definir"}
                      </small>
                    </div>
                  </header>
                  <div className="task-check-fields">
                    <label>
                      Situação
                      <select
                        name={`status_${index}`}
                        defaultValue={task.status || "PENDENTE"}
                      >
                        <option value="PENDENTE">Pendente</option>
                        <option value="FEITA">Feita</option>
                        <option value="AUSENTE">Ausente</option>
                        <option value="SUBSTITUTO">Feita por substituto</option>
                      </select>
                    </label>
                    <label>
                      Motivo da ausência
                      <input
                        name={`motivo_${index}`}
                        defaultValue={task.motivoAusencia || ""}
                        placeholder="Preencha quando escolher Ausente"
                      />
                    </label>
                    <label>
                      Substituto cadastrado
                      <select
                        name={`substituto_${index}`}
                        defaultValue={String(task.substitutoUsuarioId || "")}
                      >
                        <option value="">
                          Selecione quando houver substituição
                        </option>
                        {data.usuariosDiaconia.map((user) => (
                          <option value={user.id} key={user.id}>
                            {user.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
            {!serviceTasks(selected).length && (
              <p className="empty-inline span-2">
                Adicione tarefas na edição da escala antes de preencher o
                checklist.
              </p>
            )}
            <Actions
              close={() => {
                setModal(null);
                setSelected(null);
              }}
              label="Salvar checklist e recalcular ranking"
            />
          </form>
        </Modal>
      )}
    </>
  );
}

function WorshipCard({
  item,
  canManage,
  onPdf,
  onEdit,
  onDelete,
}: {
  item: Item;
  canManage: boolean;
  onPdf: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const songs = parseJson<
    { titulo: string; tonalidade?: string; vocal?: string }[]
  >(item.musicas, []);
  const people = parseJson<Person[]>(item.integrantes, []);
  const links = parseJson<{ rotulo: string; url: string }[]>(item.links, []);
  return (
    <article className="ministry-card worship-card">
      <header>
        <div>
          <p className="eyebrow">{formatDate(item.data_culto)}</p>
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
        {songs.length ? (
          songs.map((song, index) => (
            <div className="detail-row" key={`${song.titulo}-${index}`}>
              <strong>
                {index + 1}. {song.titulo}
              </strong>
              <span>{song.tonalidade || "—"}</span>
              <small>{song.vocal || "Vocal a definir"}</small>
            </div>
          ))
        ) : (
          <p className="empty-inline">Repertório ainda não informado.</p>
        )}
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
      </section>
      {links.length > 0 && (
        <section>
          <h3>Links fixados</h3>
          <div className="resource-links">
            {links.map((link, index) => (
              <a
                className="resource-link-card"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                key={`${link.url}-${index}`}
              >
                <span>
                  {link.url.includes("youtube") || link.url.includes("youtu.be")
                    ? "▶"
                    : "↗"}
                </span>
                <strong>{link.rotulo}</strong>
                <small>Abrir site</small>
              </a>
            ))}
          </div>
        </section>
      )}
      <section>
        <button className="secondary-button download-button" onClick={onPdf}>
          Visualizar e baixar PDF
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

function TeamCard({
  team,
  canManage,
  onEdit,
  onDelete,
}: {
  team: Item;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const people = parseJson<Person[]>(team.integrantes, []);
  return (
    <article
      className="team-card"
      style={
        { "--team-color": String(team.cor || "#17877f") } as React.CSSProperties
      }
    >
      <span className="team-stripe" />
      <header>
        <span className="team-color" />
        <div>
          <h3>{String(team.nome)}</h3>
          <p>
            Responsável: <strong>{String(team.responsavel)}</strong>
          </p>
        </div>
      </header>
      <div className="people-chips">
        {people.map((person) => (
          <span key={`${person.nome}-${person.funcao}`}>
            <strong>{person.nome}</strong>
            {person.funcao}
          </span>
        ))}
      </div>
      {!people.length && (
        <p className="empty-inline">Nenhum integrante cadastrado.</p>
      )}
      {canManage && (
        <div className="content-actions">
          <button className="table-action" onClick={onEdit}>
            Editar equipe
          </button>
          <button className="danger-button" onClick={onDelete}>
            Excluir
          </button>
        </div>
      )}
    </article>
  );
}

function ServiceCard({
  item,
  canManage,
  canChecklist,
  onChecklist,
  onEdit,
  onDelete,
}: {
  item: Item;
  canManage: boolean;
  canChecklist: boolean;
  onChecklist: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tasks = serviceTasks(item);
  const completed = tasks.filter(
    (task) => task.status === "FEITA" || task.status === "SUBSTITUTO",
  ).length;
  return (
    <article
      className="ministry-card service-card"
      style={
        {
          "--team-color": String(item.equipe_cor || "#17877f"),
        } as React.CSSProperties
      }
    >
      <span className="team-stripe" />
      <header>
        <div>
          <p className="eyebrow">{formatDate(item.data_servico)}</p>
          <h2>{String(item.titulo)}</h2>
          <small>
            <span className="team-dot" />{" "}
            {String(item.equipe_nome || "Equipe não definida")} · Responsável:{" "}
            {String(item.responsavel)}
          </small>
        </div>
        <span className={`role-pill ${item.cumprida ? "complete" : ""}`}>
          {item.cumprida
            ? "CUMPRIDA"
            : String(item.status || "PLANEJADA").replaceAll("_", " ")}
        </span>
      </header>
      <section>
        <h3>Serviços</h3>
        {tasks.map((task, index) => (
          <div
            className={`task-row task-result task-${String(task.status || "PENDENTE").toLowerCase()}`}
            key={`${task.descricao}-${index}`}
          >
            <span>
              {task.status === "FEITA"
                ? "✓"
                : task.status === "AUSENTE"
                  ? "!"
                  : task.status === "SUBSTITUTO"
                    ? "↔"
                    : "○"}
            </span>
            <div>
              <strong>{task.descricao}</strong>
              <small>
                {task.responsavel || "A definir"}
                {task.status === "AUSENTE" && task.motivoAusencia
                  ? ` · Motivo: ${task.motivoAusencia}`
                  : ""}
                {task.status === "SUBSTITUTO" && task.substitutoNome
                  ? ` · Substituto: ${task.substitutoNome}`
                  : ""}
              </small>
            </div>
            <b>
              {task.status === "FEITA"
                ? "Feita"
                : task.status === "AUSENTE"
                  ? "Ausente"
                  : task.status === "SUBSTITUTO"
                    ? "Substituto"
                    : "Pendente"}
            </b>
          </div>
        ))}
      </section>
      <section>
        {canChecklist && (
          <>
            <div className="checklist-summary">
              <strong>
                {completed}/{tasks.length}
              </strong>
              <span>tarefas concluídas</span>
            </div>
            <button className="secondary-button" onClick={onChecklist}>
              Preencher checklist
            </button>
          </>
        )}
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

function RankingPanel({
  ranking,
  publicado,
  canPublish,
  publishing,
  onToggle,
}: {
  ranking: PortalData["rankingDiaconia"];
  publicado: boolean;
  canPublish: boolean;
  publishing: boolean;
  onToggle: () => void;
}) {
  const teams = ranking?.equipes || [];
  const people = ranking?.pessoas || [];
  return (
    <section className="ranking-panel">
      <div className="ranking-header">
        <div>
          <p className="eyebrow">CUMPRIMENTO DAS ESCALAS</p>
          <h2>Ranking da diaconia</h2>
          <p>
            {publicado
              ? "Publicado para as pessoas que têm permissão de visualizar o ranking."
              : "Modo rascunho: somente quem pode publicar está vendo este resultado."}
          </p>
        </div>
        {canPublish && (
          <button
            className={publicado ? "secondary-button" : "primary-button"}
            onClick={onToggle}
            disabled={publishing}
          >
            {publishing
              ? "Salvando…"
              : publicado
                ? "Ocultar ranking"
                : "Publicar ranking"}
          </button>
        )}
      </div>
      <div className="ranking-grid">
        <RankingList
          title="Equipes"
          rows={teams.map((item) => ({
            name: item.nome,
            subtitle: "escalas cumpridas",
            color: item.cor,
            points: item.pontos,
          }))}
        />
        <RankingList
          title="Pessoas"
          rows={people.map((item) => ({
            name: item.nome,
            subtitle: item.equipe,
            color: item.cor,
            points: item.pontos,
          }))}
        />
      </div>
    </section>
  );
}

function RankingList({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; subtitle: string; color: string; points: number }[];
}) {
  return (
    <div className="ranking-list">
      <h3>{title}</h3>
      {rows.length ? (
        rows.map((row, index) => (
          <div className="ranking-row" key={`${row.name}-${index}`}>
            <strong className="ranking-position">{index + 1}º</strong>
            <span className="ranking-color" style={{ background: row.color }} />
            <div>
              <strong>{row.name}</strong>
              <small>{row.subtitle}</small>
            </div>
            <b>
              {row.points} {row.points === 1 ? "ponto" : "pontos"}
            </b>
          </div>
        ))
      ) : (
        <p className="empty-inline">
          O ranking aparecerá após o primeiro checklist cumprido.
        </p>
      )}
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
