"use client";

import {
  type CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Visitor = {
  id: number;
  nome_completo: string;
  data_nascimento: string | null;
  telefone: string | null;
  email: string | null;
  batizado: string;
  status: string;
  endereco: string | null;
  acompanhante: string | null;
  parente: string | null;
  encontro_com_deus: number;
  curso_membros: number;
  ministerio: string | null;
  data_entrada: string;
  observacoes: string | null;
  celula_id: number | null;
  celula_nome: string | null;
  categoria_id: number | null;
  categoria_nome: string | null;
  categoria_icone: string | null;
  categoria_cor: string | null;
  criado_por: string;
};

type VisitorCategory = {
  id: number;
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  ordem: number;
  responsavel_usuario_id: number | null;
  responsavel_nome: string | null;
  ministerio_id: number | null;
  ministerio_nome: string | null;
  total_visitantes: number;
  idade_minima: number | null;
  idade_maxima: number | null;
  migracao_automatica: number;
  exibir_dashboard: number;
};

type BirthdayVisitor = Pick<Visitor, "id" | "nome_completo" | "data_nascimento" | "telefone">;

type CategoryResponsible = { id: number; nome: string };
type CategoryMinistry = { id: number; nome: string };
type VisitorGrowth = { categoria_id: number; mes: string; novos: number };

const VISITOR_CATEGORY_ICONS = ["◎", "◇", "♡", "✦", "♙", "▣", "○", "△"];
const VISITOR_CATEGORY_COLORS = ["#7357e8", "#2f80ed", "#12a879", "#e09a21", "#df5b72", "#8d5bd2"];

type Cell = {
  id: number;
  nome: string;
  responsavel: string;
  observacoes: string | null;
  visitantes_ativos: number;
  dias_reuniao: string[];
  endereco_publico: string;
  descricao_publica: string;
  lider_usuario_id: number | null;
  lider_nome: string | null;
  vice_lider_usuario_id: number | null;
  vice_lider_nome: string | null;
  ultimo_relatorio_em: string | null;
  arquivada_em: string | null;
  ativo: number;
  can_operate: boolean;
  membros: Array<{
    id: string;
    kind: "COMMUNITY" | "EXTERNAL";
    userId?: number;
    name: string;
    note?: string;
    role?: "LEADER" | "VICE_LEADER" | "MEMBER";
  }>;
  agenda: Array<{ id: number; titulo: string; inicia_em: string; termina_em: string; lembrete: string; visibilidade: "PUBLICO" | "PRIVADO" }>;
  relatorios: Array<{ id: number; data_reuniao: string; aconteceu: number; presentes: number; visitantes: number; observacoes: string; enviado_por_nome: string | null }>;
  solicitacoes: Array<{ id: number; nome: string; contato: string; mensagem: string; criado_em: string }>;
};

type Followup = {
  id: number;
  tipo: string;
  resultado: string;
  descricao: string | null;
  proximo_contato: string | null;
  criado_em: string;
};

export function VisitorsWorkspace({
  permissions,
  communityName,
}: {
  permissions: string[];
  communityName: string;
}) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [categories, setCategories] = useState<VisitorCategory[]>([]);
  const [categoryResponsibles, setCategoryResponsibles] = useState<CategoryResponsible[]>([]);
  const [categoryMinistries, setCategoryMinistries] = useState<CategoryMinistry[]>([]);
  const [growth, setGrowth] = useState<VisitorGrowth[]>([]);
  const [growthMonths, setGrowthMonths] = useState<string[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayVisitor[]>([]);
  const [canManageCategories, setCanManageCategories] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [pressingCategoryId, setPressingCategoryId] = useState<number | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [duplicateMatches, setDuplicateMatches] = useState<Visitor[]>([]);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const registrationRef = useRef<HTMLDetailsElement>(null);
  const categoriesRef = useRef<VisitorCategory[]>([]);
  const categoryDragTimerRef = useRef<number | null>(null);
  const duplicateTimerRef = useRef<number | null>(null);
  const categoryDragRef = useRef<{
    active: boolean;
    categoryId: number;
    categoryName: string;
    pointerId: number;
    startX: number;
    startY: number;
    previousCategories: VisitorCategory[];
  } | null>(null);
  const canCreate = permissions.includes("visitors.create");
  const canEdit = permissions.includes("visitors.edit");
  const canDeactivate = permissions.includes("visitors.deactivate");
  const canFollowup = permissions.includes("followups.manage");
  const visibleCategories = useMemo(() => {
    const term = categorySearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return categories;
    return categories.filter((category) =>
      [category.nome, category.ministerio_nome, category.responsavel_nome]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [categories, categorySearch]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => () => {
    if (categoryDragTimerRef.current !== null) {
      window.clearTimeout(categoryDragTimerRef.current);
    }
    if (duplicateTimerRef.current !== null) {
      window.clearTimeout(duplicateTimerRef.current);
    }
  }, []);

  const loadVisitors = useCallback(
    async (cursor: number | null = null, append = false) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("busca", search.trim());
        if (categoryFilter !== "all") params.set("categoria", categoryFilter);
        if (cursor) params.set("cursor", String(cursor));
        const result = await apiJson<{
          visitantes: Visitor[];
          nextCursor: number | null;
          aniversariantes: BirthdayVisitor[];
        }>(`/api/pilot/visitantes?${params}`);
        setVisitors((current) =>
          append ? uniqueById([...current, ...result.visitantes]) : result.visitantes,
        );
        setNextCursor(result.nextCursor);
        if (!append) setBirthdays(result.aniversariantes || []);
      } catch (caught) {
        setError((caught as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [categoryFilter, search],
  );

  const loadCells = useCallback(async () => {
    try {
      const result = await apiJson<{ celulas: Cell[] }>("/api/pilot/celulas");
      setCells(result.celulas);
    } catch {
      setCells([]);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const result = await apiJson<{
        categorias: VisitorCategory[];
        crescimento: VisitorGrowth[];
        meses: string[];
        responsaveis: CategoryResponsible[];
        ministerios: CategoryMinistry[];
        canManage: boolean;
      }>("/api/pilot/visitante-categorias");
      setCategories(result.categorias || []);
      setGrowth(result.crescimento || []);
      setGrowthMonths(result.meses || []);
      setCategoryResponsibles(result.responsaveis || []);
      setCategoryMinistries(result.ministerios || []);
      setCanManageCategories(Boolean(result.canManage));
    } catch {
      setCategories([]);
      setGrowth([]);
      setGrowthMonths([]);
      setCategoryResponsibles([]);
      setCategoryMinistries([]);
      setCanManageCategories(false);
    } finally {
      setCategoriesLoaded(true);
    }
  }, []);

  const growthDashboard = useMemo(() => {
    const increments = new Map<string, number>();
    for (const item of growth) {
      increments.set(item.mes, (increments.get(item.mes) || 0) + Number(item.novos || 0));
    }
    const currentTotal = categories.reduce((sum, item) => sum + Number(item.total_visitantes || 0), 0);
    const periodAdds = growthMonths.reduce((sum, month) => sum + (increments.get(month) || 0), 0);
    const initial = Math.max(0, currentTotal - periodAdds);
    const points = growthMonths.reduce<Array<{ month: string; value: number }>>(
      (items, month) => {
        const previous = items.at(-1)?.value ?? initial;
        return [...items, { month, value: previous + (increments.get(month) || 0) }];
      },
      [],
    );
    return { points, max: Math.max(1, ...points.map((item) => item.value)), currentTotal };
  }, [categories, growth, growthMonths]);

  const categoryDashboards = useMemo(
    () => categories.filter((category) => Boolean(category.exibir_dashboard)),
    [categories],
  );

  function filterByCategory(categoryId: string) {
    setSearch("");
    setCategoryFilter(categoryId);
    window.requestAnimationFrame(() => {
      document.getElementById("visitor-directory")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadVisitors(), loadCells(), loadCategories()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories, loadCells, loadVisitors]);

  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  async function saveCategory(
    event: FormEvent<HTMLFormElement>,
    category?: VisitorCategory,
  ) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await apiJson(
        category
          ? `/api/pilot/visitante-categorias/${category.id}`
          : "/api/pilot/visitante-categorias",
        {
          method: category ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!category) form.reset();
      setMessage(category ? "Categoria atualizada." : "Categoria criada para esta comunidade.");
      await Promise.all([loadCategories(), loadVisitors()]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: VisitorCategory) {
    if (saving || !window.confirm(`Excluir a categoria “${category.nome}”?`)) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/visitante-categorias/${category.id}`, { method: "DELETE" });
      setMessage("Categoria excluída com validação de vínculos.");
      await loadCategories();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function persistCategoryOrder(
    reordered: VisitorCategory[],
    previousCategories: VisitorCategory[],
    categoryName: string,
  ) {
    if (saving) return;
    setCategories(reordered);
    categoriesRef.current = reordered;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson("/api/pilot/visitante-categorias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((item) => item.id) }),
      });
      setMessage(`Categoria “${categoryName}” reposicionada.`);
      await loadCategories();
    } catch (caught) {
      setCategories(previousCategories);
      categoriesRef.current = previousCategories;
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveCategory(category: VisitorCategory, direction: -1 | 1) {
    if (saving || categorySearch.trim()) return;
    const currentCategories = categoriesRef.current;
    const currentIndex = currentCategories.findIndex((item) => item.id === category.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentCategories.length) return;
    const previousCategories = [...currentCategories];
    const reordered = [...currentCategories];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    await persistCategoryOrder(reordered, previousCategories, category.nome);
  }

  function clearCategoryDragTimer() {
    if (categoryDragTimerRef.current !== null) {
      window.clearTimeout(categoryDragTimerRef.current);
      categoryDragTimerRef.current = null;
    }
  }

  function startCategoryDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    category: VisitorCategory,
  ) {
    if (saving || categorySearch.trim() || (event.pointerType === "mouse" && event.button !== 0)) return;
    clearCategoryDragTimer();
    event.currentTarget.setPointerCapture(event.pointerId);
    categoryDragRef.current = {
      active: false,
      categoryId: category.id,
      categoryName: category.nome,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previousCategories: [...categoriesRef.current],
    };
    setPressingCategoryId(category.id);
    categoryDragTimerRef.current = window.setTimeout(() => {
      const drag = categoryDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.active = true;
      setPressingCategoryId(null);
      setDraggedCategoryId(category.id);
      setDragOverCategoryId(category.id);
      navigator.vibrate?.(20);
    }, 320);
  }

  function updateCategoryDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = categoryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved > 9) {
        clearCategoryDragTimer();
        categoryDragRef.current = null;
        setPressingCategoryId(null);
      }
      return;
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-category-id]");
    const targetId = Number(target?.dataset.categoryId || 0);
    if (!targetId || targetId === drag.categoryId) return;
    const currentCategories = categoriesRef.current;
    const sourceIndex = currentCategories.findIndex((item) => item.id === drag.categoryId);
    const targetIndex = currentCategories.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const reordered = [...currentCategories];
    const [movedCategory] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedCategory);
    categoriesRef.current = reordered;
    setCategories(reordered);
    setDragOverCategoryId(targetId);
  }

  function finishCategoryDrag(event: React.PointerEvent<HTMLButtonElement>, commit: boolean) {
    const drag = categoryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    clearCategoryDragTimer();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    categoryDragRef.current = null;
    setPressingCategoryId(null);
    setDraggedCategoryId(null);
    setDragOverCategoryId(null);
    if (!drag.active) return;
    const reordered = [...categoriesRef.current];
    const changed = reordered.some((item, index) => item.id !== drag.previousCategories[index]?.id);
    if (!commit) {
      categoriesRef.current = drag.previousCategories;
      setCategories(drag.previousCategories);
      return;
    }
    if (changed) {
      void persistCategoryOrder(reordered, drag.previousCategories, drag.categoryName);
    }
  }

  useEffect(() => {
    if (!canCreate) return;
    const openRegistration = () => {
      const card = registrationRef.current;
      if (!card) return;
      card.open = true;
      window.requestAnimationFrame(() =>
        card.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    };
    window.addEventListener("vinkulo:new-visitor", openRegistration);
    return () =>
      window.removeEventListener("vinkulo:new-visitor", openRegistration);
  }, [canCreate]);

  async function loadFollowups(visitorId: number) {
    setSelectedId(visitorId);
    setFollowups([]);
    try {
      const result = await apiJson<{ acompanhamentos: Followup[] }>(
        `/api/pilot/acompanhamentos?visitanteId=${visitorId}`,
      );
      setFollowups(result.acompanhamentos);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function scheduleDuplicateCheck(form: HTMLFormElement) {
    if (duplicateTimerRef.current !== null) window.clearTimeout(duplicateTimerRef.current);
    duplicateTimerRef.current = window.setTimeout(async () => {
      const data = new FormData(form);
      const params = new URLSearchParams({ duplicidade: "1" });
      for (const key of ["nomeCompleto", "email", "telefone", "parente"]) {
        const value = String(data.get(key) || "").trim();
        if (value) params.set(key === "nomeCompleto" ? "nome" : key, value);
      }
      if (![...params.values()].some((value) => value !== "1" && value.length >= 3)) {
        setDuplicateMatches([]);
        return;
      }
      setDuplicateChecking(true);
      try {
        const result = await apiJson<{ duplicados: Visitor[] }>(`/api/pilot/visitantes?${params}`);
        setDuplicateMatches(result.duplicados || []);
      } catch {
        setDuplicateMatches([]);
      } finally {
        setDuplicateChecking(false);
      }
    }, 380);
  }

  function openExistingVisitor(visitor: Visitor) {
    setSearch(visitor.nome_completo);
    setCategoryFilter("all");
    setDuplicateMatches([]);
    registrationRef.current?.removeAttribute("open");
  }

  async function createVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (duplicateMatches.length) {
      setError("Abra a ficha encontrada ou ajuste os dados antes de criar outro cadastro.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await apiJson("/api/pilot/visitantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      form.reset();
      setDuplicateMatches([]);
      setMessage("Cadastro salvo somente na comunidade ativa.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function createFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await apiJson("/api/pilot/acompanhamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, visitanteId: selectedId }),
      });
      form.reset();
      setMessage("Acompanhamento registrado com trilha de auditoria.");
      await Promise.all([loadFollowups(selectedId), loadVisitors()]);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function markIntegrated(visitor: Visitor) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/visitantes/${visitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCompleto: visitor.nome_completo,
          dataNascimento: visitor.data_nascimento,
          telefone: visitor.telefone,
          email: visitor.email,
          endereco: visitor.endereco,
          acompanhante: visitor.acompanhante,
          parente: visitor.parente,
          encontroComDeus: Boolean(visitor.encontro_com_deus),
          cursoMembros: Boolean(visitor.curso_membros),
          ministerio: visitor.ministerio,
          batizado: visitor.batizado,
          status: "INTEGRADO",
          dataEntrada: visitor.data_entrada,
          observacoes: visitor.observacoes,
          celulaId: visitor.celula_id,
          categoriaId: visitor.categoria_id,
        }),
      });
      setMessage("Status atualizado para Integrado.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateVisitor(
    event: FormEvent<HTMLFormElement>,
    visitor: Visitor,
  ) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiJson(`/api/pilot/visitantes/${visitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage("Cadastro atualizado na comunidade ativa.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateVisitor(visitor: Visitor) {
    if (
      saving ||
      !window.confirm(
        `Desativar o cadastro de ${visitor.nome_completo}? O registro não será apagado.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/visitantes/${visitor.id}`, {
        method: "DELETE",
      });
      setSelectedId(null);
      setFollowups([]);
      setMessage("Cadastro desativado sem exclusão definitiva.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function permanentlyDeleteVisitor(visitor: Visitor) {
    if (
      saving ||
      !window.confirm(
        `Excluir definitivamente a ficha de ${visitor.nome_completo}? Esta ação também remove o histórico de acompanhamento e não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/visitantes/${visitor.id}?permanente=1`, { method: "DELETE" });
      setSelectedId(null);
      setFollowups([]);
      setMessage("Cadastro e histórico excluídos definitivamente.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="visitor-workspace-redesign">
      <header className="visitor-hero">
        <div>
          <p className="pilot-kicker">VISITANTES · {communityName}</p>
          <h1>Visitantes e acompanhamento</h1>
          <p>Organize cada contato, categoria e próximo cuidado em um único lugar.</p>
        </div>
        {canManageCategories && (
          <div className="visitor-settings">
            <button
              type="button"
              className="visitor-settings-trigger"
              aria-label="Configurações de visitantes"
              aria-expanded={settingsOpen}
              aria-controls="visitor-settings-panel"
              title="Configurações de visitantes"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </button>
            {settingsOpen && createPortal(
              <>
                <button
                  type="button"
                  className="visitor-settings-backdrop"
                  aria-label="Fechar configurações"
                  onClick={() => setSettingsOpen(false)}
                />
                <section
                  id="visitor-settings-panel"
                  className="visitor-settings-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="visitor-settings-title"
                >
                  <header>
                    <div>
                      <p className="pilot-kicker">CONFIGURAÇÕES DE VISITANTES</p>
                      <h2 id="visitor-settings-title">Categorias e responsáveis</h2>
                      <p>{categories.length} {categories.length === 1 ? "categoria" : "categorias"} · acesso restrito à gestão</p>
                    </div>
                    <button
                      type="button"
                      className="visitor-settings-close"
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Fechar configurações"
                    >
                      ×
                    </button>
                  </header>
                  <details className="visitor-category-create">
                    <summary><span>＋</span><strong>Nova categoria</strong><small>Nome, responsável e ministério</small></summary>
                    <form onSubmit={(event) => void saveCategory(event)}>
                      <CategoryFields responsibles={categoryResponsibles} ministries={categoryMinistries} />
                      <button disabled={saving}>{saving ? "Salvando…" : "Criar categoria"}</button>
                    </form>
                  </details>
                  <label className="visitor-settings-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      placeholder="Buscar categoria, ministério ou responsável"
                      aria-label="Buscar categorias"
                    />
                    {categorySearch && <button type="button" onClick={() => setCategorySearch("")} aria-label="Limpar busca">×</button>}
                  </label>
                  <div className="visitor-settings-list">
                    {visibleCategories.map((category) => {
                      const isEditing = editingCategoryId === category.id;
                      const isDragging = draggedCategoryId === category.id;
                      return (
                      <article
                        key={category.id}
                        data-category-id={category.id}
                        className={`${pressingCategoryId === category.id ? "is-pressing" : ""} ${isDragging ? "is-dragging" : ""} ${dragOverCategoryId === category.id && !isDragging ? "is-drag-over" : ""}`.trim()}
                        style={{ "--category-color": category.cor } as CSSProperties}
                      >
                        <div className="visitor-settings-category-row">
                          <button type="button" className="visitor-category-editor-toggle" aria-expanded={isEditing} onClick={() => setEditingCategoryId(isEditing ? null : category.id)}>
                            <span>{category.icone}</span>
                            <span>
                              <strong>{category.nome}</strong>
                              <small>{category.ministerio_nome || "Sem ministério"}{category.migracao_automatica ? ` · ${formatAgeRule(category)}` : ""}</small>
                            </span>
                            <b aria-hidden="true">›</b>
                          </button>
                          <button
                            type="button"
                            className="visitor-category-drag-handle"
                            disabled={saving || Boolean(categorySearch.trim())}
                            aria-label={`Segure e arraste para reorganizar ${category.nome}`}
                            aria-pressed={isDragging}
                            title={categorySearch.trim() ? "Limpe a busca para reorganizar" : "Segure e arraste"}
                            onPointerDown={(event) => startCategoryDrag(event, category)}
                            onPointerMove={updateCategoryDrag}
                            onPointerUp={(event) => finishCategoryDrag(event, true)}
                            onPointerCancel={(event) => finishCategoryDrag(event, false)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                event.preventDefault();
                                void moveCategory(category, event.key === "ArrowUp" ? -1 : 1);
                              }
                            }}
                          >
                            <span aria-hidden="true">⠿</span>
                          </button>
                        </div>
                        {isEditing && <form onSubmit={(event) => void saveCategory(event, category)}>
                          <CategoryFields category={category} responsibles={categoryResponsibles} ministries={categoryMinistries} />
                          <div>
                            <button disabled={saving}>Salvar alterações</button>
                            <button type="button" className="danger-link" onClick={() => void deleteCategory(category)} disabled={saving}>Excluir</button>
                          </div>
                        </form>}
                      </article>
                      );
                    })}
                    {!categories.length && categoriesLoaded && <p className="visitor-settings-empty">Nenhuma categoria criada nesta comunidade.</p>}
                    {Boolean(categories.length && !visibleCategories.length) && <p className="visitor-settings-empty">Nenhuma categoria encontrada para “{categorySearch}”.</p>}
                  </div>
                </section>
              </>,
              document.body,
            )}
          </div>
        )}
      </header>

      <div className="visitor-overview-grid">
      <section className="visitor-dashboard" aria-labelledby="visitor-growth-title">
        <header>
          <div><p className="pilot-kicker">DASHBOARD CRESCENTE · Acompanhamento por categoria</p><h2 id="visitor-growth-title">Crescimento dos acompanhamentos</h2></div>
          <strong>{categoriesLoaded ? growthDashboard.currentTotal : "—"}<small> visitantes ativos</small></strong>
        </header>
        <div className={`visitor-growth-chart ${!categoriesLoaded ? "is-loading" : ""}`} aria-label="Cadastros acumulados nos últimos seis meses" aria-busy={!categoriesLoaded}>
          {!categoriesLoaded && <p className="visitor-dashboard-loading">Carregando crescimento…</p>}
          {categoriesLoaded && growthDashboard.points.map((point) => (
            <div key={point.month}>
              <span><i style={{ height: `${Math.max(8, (point.value / growthDashboard.max) * 100)}%` }} /></span>
              <b>{point.value}</b>
              <small>{formatGrowthMonth(point.month)}</small>
            </div>
          ))}
          {categoriesLoaded && !growthDashboard.points.length && <p>O gráfico aparecerá após o primeiro cadastro.</p>}
        </div>
        <details className="visitor-category-dashboards" open>
          <summary>
            <span><strong>Categorias</strong><small>Clique para filtrar a lista</small></span>
            <b>{categoryDashboards.length}</b>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="visitor-category-filter-cards" aria-label="Filtros por categoria">
            <button
              type="button"
              className={categoryFilter === "all" ? "selected" : ""}
              onClick={() => filterByCategory("all")}
            >
              <span className="visitor-category-icon" aria-hidden="true">◎</span>
              <span><strong>Todas</strong><small>Todos os cadastros</small></span>
              <b>{growthDashboard.currentTotal}</b>
            </button>
            {!categoriesLoaded && <p className="visitor-dashboard-loading">Carregando categorias…</p>}
            {categoriesLoaded && categoryDashboards.map((category) => (
              <button
                type="button"
                key={category.id}
                className={categoryFilter === String(category.id) ? "selected" : ""}
                style={{ "--category-color": category.cor } as CSSProperties}
                onClick={() => filterByCategory(String(category.id))}
              >
                <span className="visitor-category-icon" aria-hidden="true">{category.icone}</span>
                <span><strong>{category.nome}</strong><small>{category.ministerio_nome || "Sem ministério"}</small></span>
                <b>{category.total_visitantes}</b>
              </button>
            ))}
            {categoriesLoaded && !categories.length && <div className="pilot-empty-state"><strong>Nenhuma categoria criada</strong><p>Crie a primeira categoria nas configurações de visitantes.</p></div>}
            {categoriesLoaded && categories.length > 0 && !categoryDashboards.length && <div className="pilot-empty-state"><strong>Nenhum cartão de categoria ativo</strong><p>Ative os cartões nas configurações de visitantes.</p></div>}
          </div>
        </details>
      </section>

      <section className="visitor-birthday-card" aria-labelledby="visitor-birthday-title">
        <header>
          <div><p className="pilot-kicker">ANIVERSÁRIOS DO MÊS</p><h2 id="visitor-birthday-title">Celebre com carinho</h2></div>
          <span>{birthdays.length}</span>
        </header>
        <div className="visitor-birthday-list">
          {birthdays.map((visitor) => (
            <article key={visitor.id}>
              <time dateTime={visitor.data_nascimento || ""}>{birthdayDay(visitor.data_nascimento)}</time>
              <div><strong>{visitor.nome_completo}</strong><small>{formatBirthday(visitor.data_nascimento)}</small></div>
              {visitor.telefone && birthdayWhatsappHref(visitor) ? (
                <a href={birthdayWhatsappHref(visitor) || undefined} target="_blank" rel="noreferrer" aria-label={`Enviar parabéns para ${visitor.nome_completo} pelo WhatsApp`}>WhatsApp</a>
              ) : <span>Sem contato</span>}
            </article>
          ))}
          {!birthdays.length && <p className="operations-muted">Nenhum aniversariante cadastrado neste mês.</p>}
        </div>
        <small>Exibindo até 5 pessoas com mensagem de parabéns pronta para envio.</small>
      </section>
      </div>

      {canCreate && (
        <details
          ref={registrationRef}
          id="visitor-registration-card"
          className="operations-form-card visitor-registration-card"
        >
          <summary>Cadastrar novo visitante</summary>
          <form className="pilot-form visitor-registration" onSubmit={createVisitor} onInput={(event) => scheduleDuplicateCheck(event.currentTarget)}>
            <details className="visitor-registration-section" open>
              <summary><span><b>1</b><strong>Informações pessoais</strong><small>Nome e formas de contato</small></span><i aria-hidden="true">⌄</i></summary>
              <fieldset>
                <legend>Dados pessoais</legend>
                <label>Nome completo*<input name="nomeCompleto" required maxLength={120} /></label>
                <label>Data de nascimento<input name="dataNascimento" type="date" /></label>
                <label>Telefone/WhatsApp<input name="telefone" inputMode="tel" maxLength={30} /></label>
                <label>E-mail<input name="email" type="email" maxLength={180} /></label>
                <label className="visitor-wide-field">Parente ou responsável<input name="parente" maxLength={120} placeholder="Nome do familiar ou responsável" /></label>
                <label className="visitor-wide-field">Endereço<input name="endereco" maxLength={250} /></label>
              </fieldset>
            </details>
            {(duplicateChecking || duplicateMatches.length > 0) && (
              <section className={`visitor-duplicate-check ${duplicateMatches.length ? "has-matches" : ""}`} aria-live="polite">
                <header><strong>{duplicateChecking ? "Verificando fichas…" : "Possível cadastro duplicado"}</strong><small>Comparamos nome, e-mail, telefone e parente.</small></header>
                {duplicateMatches.map((visitor) => (
                  <button key={visitor.id} type="button" onClick={() => openExistingVisitor(visitor)}>
                    <span><b>{visitor.nome_completo}</b><small>{visitor.email || visitor.telefone || visitor.parente || "Sem contato informado"}</small></span>
                    <strong>Abrir ficha</strong>
                  </button>
                ))}
              </section>
            )}
            <details className="visitor-registration-section">
              <summary><span><b>2</b><strong>Conexão espiritual</strong><small>Batismo e formação</small></span><i aria-hidden="true">⌄</i></summary>
              <fieldset>
                <legend>Informações espirituais</legend>
                <label>Batismo<select name="batizado" defaultValue="NAO_INFORMADO"><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>
                <label className="visitor-check"><input name="encontroComDeus" type="checkbox" />Já participou do Encontro com Deus</label>
                <label className="visitor-check"><input name="cursoMembros" type="checkbox" />Já concluiu o curso de membros</label>
              </fieldset>
            </details>
            <details className="visitor-registration-section">
              <summary><span><b>3</b><strong>Vínculo com a igreja</strong><small>Célula, categoria e ministério</small></span><i aria-hidden="true">⌄</i></summary>
              <fieldset>
                <legend>Conexão com a igreja</legend>
                <label>Célula<select name="celulaId" defaultValue=""><option value="">Sem célula</option>{cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.nome}</option>)}</select></label>
                <label>Categoria de acompanhamento<select name="categoriaId" defaultValue=""><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select><small>Com data de nascimento, uma faixa automática configurada terá prioridade.</small></label>
                <label>Quem recebeu<input name="acompanhante" maxLength={120} /></label>
                <label>Ministério de interesse<input name="ministerio" maxLength={120} /></label>
              </fieldset>
            </details>
            <details className="visitor-registration-section">
              <summary><span><b>4</b><strong>Finalização</strong><small>Entrada, status e observações</small></span><i aria-hidden="true">⌄</i></summary>
              <fieldset>
                <legend>Observações e finalização</legend>
                <label>Entrada*<input name="dataEntrada" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <label>Status<select name="status" defaultValue="NOVO"><option value="NOVO">Novo</option><option value="EM_CONTATO">Em contato</option><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="INTEGRADO">Integrado</option></select></label>
                <label className="visitor-wide-field">Observações<textarea name="observacoes" maxLength={1000} rows={3} /></label>
              </fieldset>
            </details>
            <button disabled={saving}>
              {saving ? "Salvando…" : "Salvar e continuar"}
            </button>
          </form>
        </details>
      )}

      <form
        id="visitor-directory"
        className="operations-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void loadVisitors();
        }}
      >
        <label htmlFor="visitor-search">Lista de cadastros</label>
        <input
          id="visitor-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nome, telefone ou e-mail"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filtrar visitantes por categoria"
        >
          <option value="all">Todas as categorias</option>
          <option value="sem-categoria">Sem categoria</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
        </select>
        <button disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
      </form>
      <OperationFeedback message={message} error={error} />

      <div className="visitor-directory">
        <div className="operations-list" aria-busy={loading}>
          {!loading && !visitors.length && (
            <div className="pilot-empty-state">
              <strong>Nenhum visitante encontrado</strong>
              <p>Use o cadastro acima para iniciar o acompanhamento nesta comunidade.</p>
            </div>
          )}
          {visitors.map((visitor) => (
            <details
              className={selectedId === visitor.id ? "selected" : ""}
              name="visitor-directory"
              key={visitor.id}
              style={{ "--category-color": visitor.categoria_cor || "var(--pilot-purple)" } as CSSProperties}
            >
              <summary
                className="operation-card-main"
                onClick={() => loadFollowups(visitor.id)}
                aria-label={`Abrir acompanhamento de ${visitor.nome_completo}`}
              >
                <span className="visitor-card-topline">
                  <span className={`status-pill status-${visitor.status.toLowerCase()}`}>
                    {statusLabel(visitor.status)}
                  </span>
                  <time dateTime={visitor.data_entrada}>Entrada em {formatDate(visitor.data_entrada)}</time>
                </span>
                <span className="visitor-card-identity">
                  <span className="visitor-card-avatar" aria-hidden="true">{visitor.categoria_icone || "○"}</span>
                  <strong>{visitor.nome_completo}</strong>
                </span>
                <span className="visitor-card-summary-meta">
                  {visitor.categoria_nome || "Sem categoria"} · {visitor.celula_nome || "Sem célula"}
                </span>
                <span className="visitor-card-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="visitor-card-collapsible" role="dialog" aria-modal="true" aria-label={`Ficha de ${visitor.nome_completo}`}>
                <header className="visitor-profile-dialog-header">
                  <div><small>FICHA DO VISITANTE</small><strong>{visitor.nome_completo}</strong></div>
                  <button
                    type="button"
                    className="visitor-profile-close"
                    aria-label={`Fechar ficha de ${visitor.nome_completo}`}
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      setSelectedId(null);
                    }}
                  >×</button>
                </header>
                <div className="visitor-inline-contact">
                  <span><b>Categoria</b><small>{visitor.categoria_nome || "Sem categoria"}</small></span>
                  <span><b>Célula</b><small>{visitor.celula_nome || "Sem célula"}</small></span>
                  <span><b>E-mail</b><small>{visitor.email || "Não informado"}</small></span>
                  <span><b>Telefone</b><small>{visitor.telefone || "Não informado"}</small></span>
                  {visitor.parente && <span><b>Parente</b><small>{visitor.parente}</small></span>}
                </div>
                <div className="operation-card-actions">
                  {visitor.telefone && whatsappHref(visitor.telefone) && (
                    <a
                      className="visitor-card-action visitor-whatsapp-link"
                      href={whatsappHref(visitor.telefone) || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Conversar com ${visitor.nome_completo} pelo WhatsApp`}
                    >
                      <span className="visitor-whatsapp-icon" aria-hidden="true">●</span>
                      <span><b>WhatsApp</b><small>Abrir conversa</small></span>
                    </a>
                  )}
                  {canEdit && visitor.status !== "INTEGRADO" && (
                    <button type="button" className="visitor-card-action visitor-card-action-primary" onClick={() => markIntegrated(visitor)}>
                      Integrar
                    </button>
                  )}
                  {canDeactivate && (
                    <button
                      type="button"
                      className="visitor-card-action visitor-card-action-danger"
                      onClick={() => deactivateVisitor(visitor)}
                    >
                      Desativar
                    </button>
                  )}
                  {canDeactivate && (
                    <button
                      type="button"
                      className="visitor-card-action visitor-card-action-delete"
                      onClick={() => permanentlyDeleteVisitor(visitor)}
                    >
                      Excluir cadastro
                    </button>
                  )}
                </div>
                {canEdit && (
                  <details className="visitor-edit-panel visitor-inline-section">
                    <summary>Editar cadastro</summary>
                    <form
                      className="pilot-form visitor-edit-form"
                      onSubmit={(event) => updateVisitor(event, visitor)}
                    >
                      <label>Nome completo*<input name="nomeCompleto" required maxLength={120} defaultValue={visitor.nome_completo} /></label>
                      <label>Data de nascimento<input name="dataNascimento" type="date" defaultValue={visitor.data_nascimento || ""} /></label>
                      <label>Telefone<input name="telefone" maxLength={30} defaultValue={visitor.telefone || ""} /></label>
                      <label>E-mail<input name="email" type="email" maxLength={180} defaultValue={visitor.email || ""} /></label>
                      <label>Endereço<input name="endereco" maxLength={250} defaultValue={visitor.endereco || ""} /></label>
                      <label>Quem recebeu<input name="acompanhante" maxLength={120} defaultValue={visitor.acompanhante || ""} /></label>
                      <label>Parente ou responsável<input name="parente" maxLength={120} defaultValue={visitor.parente || ""} /></label>
                      <label>Ministério<input name="ministerio" maxLength={120} defaultValue={visitor.ministerio || ""} /></label>
                      <label>Célula<select name="celulaId" defaultValue={visitor.celula_id || ""}><option value="">Sem célula</option>{cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.nome}</option>)}</select></label>
                      <label>Categoria<select name="categoriaId" defaultValue={visitor.categoria_id || ""}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select><small>Faixas etárias automáticas têm prioridade quando a data de nascimento está preenchida.</small></label>
                      <label>Batismo<select name="batizado" defaultValue={visitor.batizado}><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>
                      <label>Status<select name="status" defaultValue={visitor.status}><option value="NOVO">Novo</option><option value="EM_CONTATO">Em contato</option><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="INTEGRADO">Integrado</option></select></label>
                      <label>Entrada<input name="dataEntrada" type="date" required defaultValue={visitor.data_entrada} /></label>
                      <label className="visitor-check"><input name="encontroComDeus" type="checkbox" defaultChecked={Boolean(visitor.encontro_com_deus)} />Encontro com Deus</label>
                      <label className="visitor-check"><input name="cursoMembros" type="checkbox" defaultChecked={Boolean(visitor.curso_membros)} />Curso de membros</label>
                      <label className="visitor-wide-field">Observações<textarea name="observacoes" rows={3} maxLength={1000} defaultValue={visitor.observacoes || ""} /></label>
                      <button disabled={saving}>Salvar alterações</button>
                    </form>
                  </details>
                )}
                {selectedId === visitor.id && (
                  <section className="visitor-inline-followup" aria-label={`Acompanhamento de ${visitor.nome_completo}`}>
                    <header>
                      <div><strong>Acompanhamento</strong><small>Histórico e próximo cuidado desta pessoa</small></div>
                      <span>{followups.length}</span>
                    </header>
                    {canFollowup && (
                      <details className="visitor-inline-section visitor-followup-editor">
                        <summary>Registrar novo acompanhamento</summary>
                        <form className="pilot-form followup-form" onSubmit={createFollowup}>
                          <label>Canal<select name="tipo" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="TELEFONE">Telefone</option><option value="PRESENCIAL">Presencial</option><option value="EMAIL">E-mail</option><option value="OUTRO">Outro</option></select></label>
                          <label>Resultado<input name="resultado" required maxLength={160} /></label>
                          <label>Próximo contato<input name="proximoContato" type="date" /></label>
                          <label className="visitor-wide-field">Descrição<textarea name="descricao" rows={3} maxLength={1500} /></label>
                          <button disabled={saving}>Registrar acompanhamento</button>
                        </form>
                      </details>
                    )}
                    <div className="followup-history">
                      {followups.length ? followups.map((item) => (
                        <article key={item.id}>
                          <div><span>{item.tipo}</span><time>{formatDateTime(item.criado_em)}</time></div>
                          <strong>{item.resultado}</strong>
                          {item.descricao && <p>{item.descricao}</p>}
                          {item.proximo_contato && <small>Próximo: {formatDate(item.proximo_contato)}</small>}
                        </article>
                      )) : <p className="operations-muted">Sem acompanhamentos registrados.</p>}
                    </div>
                  </section>
                )}
              </div>
            </details>
          ))}
          {nextCursor && (
            <button
              className="load-more-button"
              disabled={loading}
              onClick={() => loadVisitors(nextCursor, true)}
            >
              Carregar mais
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function CellsWorkspace({
  permissions,
  communityName,
}: {
  permissions: string[];
  communityName: string;
}) {
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: number; nome: string; papel: string }>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"visao" | "integrantes" | "agenda" | "relatorio" | "solicitacoes">("visao");
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = permissions.includes("cells.manage");

  const loadCells = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ celulas: Cell[]; availableUsers?: Array<{ id: number; nome: string; papel: string }> }>("/api/pilot/celulas");
      setCells(result.celulas);
      setAvailableUsers(result.availableUsers || []);
      setSelectedId((current) => current && result.celulas.some((cell) => cell.id === current) ? current : result.celulas.find((cell) => cell.ativo)?.id || result.celulas[0]?.id || null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCells();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCells]);

  async function createCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { ...Object.fromEntries(data.entries()), diasReuniao: data.getAll("diasReuniao") };
    try {
      await apiJson("/api/pilot/celulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      form.reset();
      setCreateOpen(false);
      setMessage("Célula criada com os dias e a liderança definidos.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCell(cell: Cell) {
    if (
      saving ||
      !window.confirm(
        `Arquivar ${cell.nome}? A gestão pastoral poderá reativá-la depois.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, { method: "DELETE" });
      setMessage("Célula arquivada.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateCellMember(
    cell: Cell,
    action: "MEMBRO_ADICIONAR_INTERNO" | "MEMBRO_ADICIONAR_EXTERNO" | "MEMBRO_REMOVER",
    body: Record<string, unknown>,
    form?: HTMLFormElement,
  ) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: action, ...body }),
      });
      form?.reset();
      setMessage("Integrantes da célula atualizados sem recarregar a página.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function cellAction(cell: Cell, body: Record<string, unknown>, form?: HTMLFormElement) {
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      await apiJson(`/api/pilot/celulas/${cell.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      form?.reset();
      setMessage(body.acao === "RELATORIO_CRIAR" ? "Relatório enviado ao acompanhamento pastoral." : "Alteração salva.");
      await loadCells(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally { setSaving(false); }
  }

  const selected = cells.find((cell) => cell.id === selectedId) || null;
  const dayLabels: Record<string, string> = { DOM: "Dom", SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", SAB: "Sáb" };

  return (
    <section className="cells-workspace-v2" aria-busy={loading}>
      <header className="cells-hero-v2">
        <div><p className="pilot-kicker">CÉLULAS · {communityName}</p><h1>Comunidades menores, cuidado mais próximo</h1><p>Agenda, pessoas e relatórios em uma área compacta. Conteúdo privado continua restrito à liderança da célula.</p></div>
        {canManage && <button type="button" onClick={() => setCreateOpen(true)}>+ Nova célula</button>}
      </header>
      <OperationFeedback message={message} error={error} />
      <div className="cell-shell-v2">
        <aside className="cell-index-v2" aria-label="Células da comunidade">
          <header><strong>{cells.filter((cell) => cell.ativo).length} ativas</strong><small>{cells.filter((cell) => !cell.ativo).length} arquivadas</small></header>
          <div>
            {cells.map((cell) => <button type="button" key={cell.id} className={`${selectedId === cell.id ? "active" : ""}${!cell.ativo ? " archived" : ""}`} onClick={() => { setSelectedId(cell.id); setTab("visao"); }}><span>{cell.nome.slice(0, 1)}</span><div><strong>{cell.nome}</strong><small>{cell.membros.length} membros · {cell.visitantes_ativos} visitantes</small></div><i aria-hidden="true">›</i></button>)}
            {!loading && !cells.length && <p>Nenhuma célula cadastrada.</p>}
          </div>
        </aside>
        <main className="cell-detail-v2">
          {!selected && <div className="pilot-empty-state"><strong>Selecione uma célula</strong><p>Os detalhes aparecerão aqui.</p></div>}
          {selected && <>
            <header className="cell-detail-head-v2"><div><small>{selected.ativo ? "CÉLULA ATIVA" : "ARQUIVADA"}</small><h2>{selected.nome}</h2><p>{selected.descricao_publica || "Descrição pública ainda não informada."}</p></div><div className="cell-day-pills">{selected.dias_reuniao.map((day) => <span key={day}>{dayLabels[day] || day}</span>)}</div></header>
            <dl className="cell-metrics-v2"><div><dt>Membros</dt><dd>{selected.membros.filter((member) => member.kind === "COMMUNITY").length}</dd></div><div><dt>Visitantes</dt><dd>{selected.visitantes_ativos + selected.membros.filter((member) => member.kind === "EXTERNAL").length}</dd></div><div><dt>Liderança</dt><dd>{selected.vice_lider_nome ? "2" : "1"}</dd></div><div><dt>Próximos encontros</dt><dd>{selected.agenda.length}</dd></div></dl>
            <nav className="cell-tabs-v2" aria-label="Seções da célula">{([["visao","Visão geral"],["integrantes","Integrantes"],["agenda","Agenda"],["relatorio","Relatório semanal"],["solicitacoes",`Solicitações ${selected.solicitacoes.length || ""}`]] as const).map(([id,label]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
            {tab === "visao" && <section className="cell-overview-v2"><article><small>LÍDER</small><strong>{selected.lider_nome || selected.responsavel}</strong><p>{selected.vice_lider_nome ? `Vice-líder: ${selected.vice_lider_nome}` : "Vice-líder ainda não definido"}</p></article><article><small>LOCAL PÚBLICO</small><strong>{selected.endereco_publico || "A definir"}</strong><p>Visível para quem procura uma célula.</p></article><article><small>ÚLTIMO RELATÓRIO</small><strong>{selected.ultimo_relatorio_em ? new Date(selected.ultimo_relatorio_em).toLocaleDateString("pt-BR") : "Pendente"}</strong><p>Após 60 dias sem relatório, a célula é arquivada.</p></article>{canManage && <article className="cell-danger-v2"><small>GESTÃO PASTORAL</small>{selected.ativo ? <button type="button" onClick={() => void deactivateCell(selected)}>Arquivar célula</button> : <button type="button" onClick={() => void cellAction(selected, { acao: "REATIVAR" })}>Reativar célula</button>}</article>}</section>}
            {tab === "integrantes" && <section className="cell-members-v2"><div className="cell-member-list">{selected.membros.map((member) => <article key={member.id}><span aria-hidden="true">{member.name.slice(0,1)}</span><div><strong>{member.name}</strong><small>{member.role === "LEADER" ? "Líder" : member.role === "VICE_LEADER" ? "Vice-líder" : member.kind === "EXTERNAL" ? `Visitante${member.note ? ` · ${member.note}` : ""}` : "Membro"}</small></div>{selected.can_operate && member.role !== "LEADER" && <div className="cell-member-actions">{member.kind === "COMMUNITY" && member.role !== "VICE_LEADER" && <button type="button" onClick={() => void cellAction(selected, { acao: "MEMBRO_PROMOVER_VICE", membroId: member.id })}>Promover</button>}<button type="button" className="danger-link" onClick={() => void updateCellMember(selected, "MEMBRO_REMOVER", { membroId: member.id })}>Remover</button></div>}</article>)}</div>{selected.can_operate && <div className="cell-add-members-v2"><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_INTERNO",{usuarioId:Number(data.get("usuarioId"))},form); }}><label>Membro da comunidade<select name="usuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user)=><option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}</select></label><button disabled={saving}>Adicionar</button></form><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_EXTERNO",{nomeExterno:data.get("nomeExterno"),descricaoExterna:data.get("descricaoExterna")},form); }}><label>Visitante de fora<input name="nomeExterno" required placeholder="Nome completo" /></label><label>Observação<input name="descricaoExterna" placeholder="Contato ou contexto" /></label><button disabled={saving}>Registrar</button></form></div>}</section>}
            {tab === "agenda" && <section className="cell-agenda-v2"><div className="cell-agenda-list-v2">{selected.agenda.map((item) => <article key={item.id}><time>{new Date(item.inicia_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"short" })}</time><div><strong>{item.titulo}</strong><small>{new Date(item.inicia_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}–{new Date(item.termina_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })} · {item.visibilidade === "PUBLICO" ? "Público" : "Só liderança"}</small><p>{item.lembrete}</p></div></article>)}{!selected.agenda.length && <p>Nenhum encontro programado.</p>}</div>{selected.can_operate && <form className="pilot-form cell-agenda-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"AGENDA_CRIAR",...data},form); }}><h3>Programar sem publicar no feed</h3><label>Título<input name="titulo" required /></label><label>Início<input name="iniciaEm" type="datetime-local" required /></label><label>Término<input name="terminaEm" type="datetime-local" required /></label><label>Visibilidade<select name="visibilidade"><option value="PUBLICO">Público para a célula</option><option value="PRIVADO">Privado para liderança</option></select></label><label className="cell-wide-field">Lembrete<textarea name="lembrete" rows={2} /></label><button disabled={saving}>Verificar horários e salvar</button></form>}</section>}
            {tab === "relatorio" && <section className="cell-reports-v2">{selected.can_operate && <form className="pilot-form cell-report-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"RELATORIO_CRIAR",...data,aconteceu:data.aconteceu === "true"},form); }}><h3>Formulário do encontro</h3><label>Data<input name="dataReuniao" type="date" required /></label><label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label><label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label><label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label><label className="cell-wide-field">Observações<textarea name="observacoes" rows={2} /></label><button disabled={saving}>Enviar ao pastor</button></form>}<div className="cell-report-history-v2">{selected.relatorios.map((report) => <article key={report.id}><time>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time><strong>{report.aconteceu ? `${report.presentes} pessoas · ${report.visitantes} visitantes` : "Encontro não realizado"}</strong><small>{report.enviado_por_nome ? `Enviado por ${report.enviado_por_nome}` : "Relatório registrado"}</small></article>)}</div></section>}
            {tab === "solicitacoes" && <section className="cell-requests-v2">{!selected.can_operate && <p>As solicitações ficam disponíveis somente para a liderança.</p>}{selected.solicitacoes.map((request) => <article key={request.id}><div><strong>{request.nome}</strong><small>{request.contato || "Sem contato"}</small><p>{request.mensagem}</p></div><div><button type="button" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"APROVADA"})}>Aprovar</button><button type="button" className="danger-link" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"RECUSADA"})}>Recusar</button></div></article>)}</section>}
          </>}
        </main>
      </div>
      {createOpen && createPortal(<div className="cell-create-overlay-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><form className="pilot-form cell-create-dialog-v2" role="dialog" aria-modal="true" aria-label="Criar célula" onSubmit={createCell}><header><div><small>NOVA CÉLULA</small><h2>Informações essenciais</h2></div><button type="button" aria-label="Fechar" onClick={() => setCreateOpen(false)}>×</button></header><label>Nome da célula<input name="nome" required maxLength={100} /></label><label>Líder<select name="liderUsuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user)=><option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}</select></label><fieldset className="cell-days-field-v2"><legend>Dias de encontro (obrigatório)</legend>{Object.entries(dayLabels).map(([value,label]) => <label key={value}><input type="checkbox" name="diasReuniao" value={value} />{label}</label>)}</fieldset><label>Endereço público<input name="enderecoPublico" maxLength={240} /></label><label className="cell-wide-field">Descrição pública<textarea name="descricaoPublica" rows={2} maxLength={700} /></label><label className="cell-wide-field">Observações internas<textarea name="observacoes" rows={2} maxLength={1000} /></label><footer><button type="button" onClick={() => setCreateOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Criando…" : "Criar célula"}</button></footer></form></div>, document.body)}
    </section>
  );
}

function OperationFeedback({
  message,
  error,
}: {
  message: string;
  error: string;
}) {
  if (!message && !error) return null;
  return (
    <p
      className={`operations-feedback ${error ? "error" : ""}`}
      role="status"
    >
      {error || message}
    </p>
  );
}

function CategoryFields({
  category,
  responsibles,
  ministries,
}: {
  category?: VisitorCategory;
  responsibles: CategoryResponsible[];
  ministries: CategoryMinistry[];
}) {
  const [selectedIcon, setSelectedIcon] = useState(category?.icone || "◎");
  const [selectedColor, setSelectedColor] = useState(category?.cor || "#7357e8");
  const [automaticAge, setAutomaticAge] = useState(Boolean(category?.migracao_automatica));
  const colorOptions = VISITOR_CATEGORY_COLORS.includes(selectedColor)
    ? VISITOR_CATEGORY_COLORS
    : [...VISITOR_CATEGORY_COLORS, selectedColor];
  return (
    <>
      <label className="visitor-category-wide-field">
        Nome
        <input name="nome" required maxLength={80} defaultValue={category?.nome || ""} />
      </label>
      <label className="visitor-category-wide-field">
        Descrição
        <textarea name="descricao" maxLength={240} defaultValue={category?.descricao || ""} />
      </label>
      <label className="visitor-category-dashboard-toggle visitor-category-wide-field">
        <input type="hidden" name="exibirDashboard" value="false" />
        <input name="exibirDashboard" type="checkbox" defaultChecked={category ? Boolean(category.exibir_dashboard) : true} />
        <span><strong>Criar cartão desta categoria</strong><small>Exibe um dashboard compacto com total e evolução dos cadastros.</small></span>
      </label>
      <fieldset className="visitor-category-age-rule visitor-category-wide-field">
        <legend>Classificação e migração por idade</legend>
        <label className="visitor-category-auto-toggle">
          <input
            name="migracaoAutomatica"
            type="checkbox"
            checked={automaticAge}
            onChange={(event) => setAutomaticAge(event.target.checked)}
          />
          <span><strong>Aplicar automaticamente</strong><small>Classifica e migra a pessoa quando ela entrar em outra faixa etária.</small></span>
        </label>
        <div>
          <label>Idade mínima (inclusive)<input name="idadeMinima" type="number" min={0} max={130} disabled={!automaticAge} defaultValue={category?.idade_minima ?? ""} placeholder="Ex.: 17" /></label>
          <label>Idade máxima (inclusive)<input name="idadeMaxima" type="number" min={0} max={130} disabled={!automaticAge} defaultValue={category?.idade_maxima ?? ""} placeholder="Ex.: 16" /></label>
        </div>
        <small>Exemplo: TEEN até 16 anos; O2 a partir de 17. Faixas automáticas não podem se sobrepor.</small>
      </fieldset>
      <fieldset className="visitor-category-choice visitor-category-icon-choice">
        <legend>Ícone</legend>
        <input type="hidden" name="icone" value={selectedIcon} />
        <div role="radiogroup" aria-label="Ícone da categoria">
          {VISITOR_CATEGORY_ICONS.map((icon) => (
            <button key={icon} type="button" className={selectedIcon === icon ? "active" : ""} aria-pressed={selectedIcon === icon} onClick={() => setSelectedIcon(icon)}>{icon}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="visitor-category-choice visitor-category-color-choice">
        <legend>Cor</legend>
        <input type="hidden" name="cor" value={selectedColor} />
        <div role="radiogroup" aria-label="Cor da categoria">
          {colorOptions.map((color) => (
            <button key={color} type="button" className={selectedColor === color ? "active" : ""} aria-pressed={selectedColor === color} onClick={() => setSelectedColor(color)} style={{ "--choice-color": color } as CSSProperties}><span /></button>
          ))}
          <label className="visitor-custom-color" title="Escolher outra cor">
            <span aria-hidden="true">＋</span>
            <input type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} aria-label="Escolher outra cor" />
          </label>
        </div>
      </fieldset>
      {category && <input type="hidden" name="ordem" value={category.ordem} />}
      <label className="visitor-category-wide-field">
        Responsável
        <select name="responsavelUsuarioId" defaultValue={category?.responsavel_usuario_id || ""}>
          <option value="">Não definido</option>
          {responsibles.map((responsible) => (
            <option key={responsible.id} value={responsible.id}>{responsible.nome}</option>
          ))}
        </select>
      </label>
      <label className="visitor-category-wide-field">
        Ministério responsável
        <select name="ministerioId" defaultValue={category?.ministerio_id || ""}>
          <option value="">Não associado</option>
          {ministries.map((ministry) => (
            <option key={ministry.id} value={ministry.id}>{ministry.nome}</option>
          ))}
        </select>
      </label>
    </>
  );
}

async function apiJson<T = { ok: boolean }>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}

function uniqueById<T extends { id: number }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function statusLabel(status: string) {
  return (
    {
      NOVO: "Novo",
      EM_CONTATO: "Em contato",
      EM_ACOMPANHAMENTO: "Em acompanhamento",
      INTEGRADO: "Integrado",
    }[status] || status
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatAgeRule(category: VisitorCategory) {
  if (!category.migracao_automatica) return "Classificação manual";
  if (category.idade_minima !== null && category.idade_maxima !== null) {
    return `${category.idade_minima}–${category.idade_maxima} anos`;
  }
  if (category.idade_minima !== null) return `${category.idade_minima}+ anos`;
  return `Até ${category.idade_maxima} anos`;
}

function formatDateTime(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function whatsappHref(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 10 && digits.length <= 15
    ? `https://wa.me/${digits}`
    : null;
}

function birthdayWhatsappHref(visitor: BirthdayVisitor) {
  const base = whatsappHref(visitor.telefone);
  if (!base) return null;
  const firstName = visitor.nome_completo.trim().split(/\s+/)[0] || visitor.nome_completo;
  const message = `Parabéns, ${firstName}! 🎉 Que seu novo ciclo seja cheio de alegria, saúde e bênçãos. Com carinho, sua comunidade.`;
  return `${base}?text=${encodeURIComponent(message)}`;
}

function birthdayDay(value: string | null) {
  return value?.slice(8, 10) || "—";
}

function formatBirthday(value: string | null) {
  if (!value) return "Data não informada";
  const [, month, day] = value.slice(0, 10).split("-");
  return day && month ? `${day}/${month}` : value;
}

function formatGrowthMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}
