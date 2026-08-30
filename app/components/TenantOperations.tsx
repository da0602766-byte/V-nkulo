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
  ativo: number;
  criado_em: string;
  atualizado_em: string;
  ultimo_contato: string | null;
  proximo_contato: string | null;
  responsavel_email: string | null;
  acompanhamentos_total: number;
};

type VisitorVision =
  | "visitantes"
  | "acompanhamentos"
  | "pendencias"
  | "encaminhamentos"
  | "historico"
  | "arquivados";

type VisitorCounts = Record<VisitorVision, number>;

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
  membros_total: number;
  membros: Array<{
    id: string;
    kind: "COMMUNITY" | "EXTERNAL";
    userId?: number;
    name: string;
    note?: string;
    role?: "LEADER" | "VICE_LEADER" | "MEMBER";
    email?: string;
    telefone?: string | null;
    fotoPerfil?: string | null;
    papelComunidade?: string;
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

type VisitorImportRow = {
  nomeCompleto: string;
  telefone: string;
  email: string;
  parente: string;
  categoriaId: string;
  categoriaNome: string;
  ministerio: string;
  status: string;
  dataEntrada: string;
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
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<VisitorImportRow[]>([]);
  const [activeVision, setActiveVision] = useState<VisitorVision>("visitantes");
  const [counts, setCounts] = useState<VisitorCounts>({
    visitantes: 0,
    acompanhamentos: 0,
    pendencias: 0,
    encaminhamentos: 0,
    historico: 0,
    arquivados: 0,
  });
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const categoriesRef = useRef<VisitorCategory[]>([]);
  const categoryDragTimerRef = useRef<number | null>(null);
  const duplicateTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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
        params.set("visao", activeVision);
        if (cursor) params.set("cursor", String(cursor));
        const result = await apiJson<{
          visitantes: Visitor[];
          nextCursor: number | null;
          aniversariantes: BirthdayVisitor[];
          contagens: VisitorCounts;
        }>(`/api/pilot/visitantes?${params}`);
        setVisitors((current) =>
          append ? uniqueById([...current, ...result.visitantes]) : result.visitantes,
        );
        setNextCursor(result.nextCursor);
        setCounts((current) => result.contagens || current);
        if (!append) setBirthdays(result.aniversariantes || []);
      } catch (caught) {
        setError((caught as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [activeVision, categoryFilter, search],
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
      void loadVisitors();
    }, search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadVisitors, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadCells(), loadCategories()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories, loadCells]);

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
    const openRegistration = () => setRegistrationOpen(true);
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
    setRegistrationOpen(false);
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
      setRegistrationOpen(false);
      setMessage("Cadastro salvo somente na comunidade ativa.");
      await Promise.all([loadVisitors(), loadCategories()]);
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

  function visitorPayload(visitor: Visitor, overrides: Record<string, unknown> = {}) {
    return {
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
      status: visitor.status,
      dataEntrada: visitor.data_entrada,
      observacoes: visitor.observacoes,
      celulaId: visitor.celula_id,
      categoriaId: visitor.categoria_id,
      ...overrides,
    };
  }

  async function updateVisitorField(visitor: Visitor, overrides: Record<string, unknown>) {
    if (saving || !canEdit) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apiJson(`/api/pilot/visitantes/${visitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visitorPayload(visitor, overrides)),
      });
      setMessage("Ficha atualizada.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedVisitors() {
    if (!canDeactivate || saving || !selectedRows.length) return;
    if (!window.confirm(`Arquivar ${selectedRows.length} cadastro(s) selecionado(s)?`)) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      for (const id of selectedRows) {
        await apiJson(`/api/pilot/visitantes/${id}`, { method: "DELETE" });
      }
      setSelectedRows([]);
      setMessage("Cadastros arquivados.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function permanentlyDeleteSelectedVisitors() {
    if (!canDeactivate || saving || !selectedRows.length) return;
    if (!window.confirm(`Excluir definitivamente ${selectedRows.length} cadastro(s) e seus históricos? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      for (const id of selectedRows) {
        await apiJson(`/api/pilot/visitantes/${id}?permanente=1`, { method: "DELETE" });
      }
      setSelectedRows([]);
      setMessage("Cadastros selecionados foram excluídos definitivamente.");
      await loadVisitors();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function exportVisitors() {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const rows = visitors.map((visitor) => ({
        Nome: visitor.nome_completo,
        Telefone: visitor.telefone || "",
        "E-mail": visitor.email || "",
        Parente: visitor.parente || "",
        Categoria: visitor.categoria_nome || "",
        Ministério: visitor.ministerio || "",
        Status: statusLabel(visitor.status),
        "Data de entrada": visitor.data_entrada || "",
        "Próximo contato": visitor.proximo_contato || "",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows, {
        header: ["Nome", "Telefone", "E-mail", "Parente", "Categoria", "Ministério", "Status", "Data de entrada", "Próximo contato"],
      });
      worksheet["!cols"] = [
        { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 20 },
        { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Visitantes");
      XLSX.writeFile(workbook, `visitantes-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } catch (caught) {
      setError(`Não foi possível gerar a planilha: ${(caught as Error).message}`);
    }
  }

  async function prepareVisitorImport(file: File) {
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false });
      const normalizedCategories = new Map(categories.map((category) => [normalizeSpreadsheetKey(category.nome), category]));
      const normalizedRows = rawRows.map((raw) => {
        const values = new Map(Object.entries(raw).map(([key, value]) => [normalizeSpreadsheetKey(key), String(value ?? "").trim()]));
        const read = (...keys: string[]) => keys.map((key) => values.get(normalizeSpreadsheetKey(key)) || "").find(Boolean) || "";
        const categoriaNome = read("Categoria", "Categoria de acompanhamento");
        const categoria = normalizedCategories.get(normalizeSpreadsheetKey(categoriaNome));
        return {
          nomeCompleto: read("Nome", "Nome completo"),
          telefone: read("Telefone", "Telefone/WhatsApp", "WhatsApp"),
          email: read("E-mail", "Email"),
          parente: read("Parente", "Parente ou responsável", "Responsável"),
          categoriaId: categoria ? String(categoria.id) : "",
          categoriaNome,
          ministerio: read("Ministério", "Ministerio"),
          status: importStatus(read("Status")),
          dataEntrada: spreadsheetDate(read("Data de entrada", "Entrada")),
        } satisfies VisitorImportRow;
      }).filter((row) => row.nomeCompleto);
      if (!normalizedRows.length) throw new Error("A primeira planilha não contém uma coluna Nome com cadastros válidos.");
      setImportRows(normalizedRows);
      setImportFileName(file.name);
    } catch (caught) {
      setImportRows([]);
      setImportFileName("");
      setError(`Não foi possível ler a planilha: ${(caught as Error).message}`);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function confirmVisitorImport() {
    if (!importRows.length || importing) return;
    setImporting(true);
    setError("");
    let imported = 0;
    let ignored = 0;
    try {
      for (const row of importRows) {
        try {
          await apiJson("/api/pilot/visitantes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...row,
              batizado: "NAO_INFORMADO",
              dataEntrada: row.dataEntrada || new Date().toISOString().slice(0, 10),
            }),
          });
          imported += 1;
        } catch {
          ignored += 1;
        }
      }
      setImportRows([]);
      setImportFileName("");
      setMessage(`${imported} cadastro(s) importado(s). Categorias encontradas na planilha foram vinculadas ou criadas na comunidade.${ignored ? ` ${ignored} linha(s) foram ignoradas por duplicidade ou dados inválidos.` : ""}`);
      await Promise.all([loadVisitors(), loadCategories()]);
    } finally {
      setImporting(false);
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

  const selectedVisitor = visitors.find((visitor) => visitor.id === selectedId) || null;
  const visibleVisitors = [...visitors].sort((left, right) => {
    const comparison = left.nome_completo.localeCompare(right.nome_completo, "pt-BR");
    return sortDirection === "asc" ? comparison : -comparison;
  });

  function changeVision(vision: VisitorVision) {
    setActiveVision(vision);
    setSelectedRows([]);
    setSelectedId(null);
    setFollowups([]);
  }

  // O funil é o assunto da página: quantos chegaram e quantos avançaram. A
  // tabela responde "quem"; isto responde "como está indo", que é a pergunta
  // que a liderança faz primeiro. Os estágios já existem como status.
  const funnelStages = ([
    ["NOVO", "Recebidos"],
    ["EM_CONTATO", "Contatados"],
    ["EM_ACOMPANHAMENTO", "Em acompanhamento"],
    ["INTEGRADO", "Integrados"],
  ] as const).map(([id, label]) => ({
    id,
    label,
    total: visitors.filter((visitor) => visitor.status === id).length,
  }));
  const funnelTotal = funnelStages.reduce((soma, etapa) => soma + etapa.total, 0);

  return (
    <section className="visitor-workspace-redesign">
      <header className="visitor-hero">
        <div>
          <p className="pilot-kicker">VISITANTES · {communityName}</p>
          <h1>Relacionamento</h1>
          <p>Acompanhe pessoas, contatos e próximos cuidados em uma única ficha.</p>
        </div>
        <div className="visitor-hero-actions-v2">
          {canCreate && <button type="button" className="visitor-hero-new-v2" onClick={() => setRegistrationOpen(true)}>＋ Novo visitante</button>}
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
        </div>
      </header>
      <section className="visitor-funnel-v5" aria-label="Funil de acolhimento">
        {funnelStages.map((etapa) => {
          const proporcao = funnelTotal ? Math.round((etapa.total / funnelTotal) * 100) : 0;
          return (
            <article key={etapa.id} data-etapa={etapa.id}>
              <small>{etapa.label}</small>
              <strong>{etapa.total}</strong>
              <span className="visitor-funnel-bar-v5" aria-hidden="true">
                <i style={{ width: `${proporcao}%` }} />
              </span>
              <em>{proporcao}% do total</em>
            </article>
          );
        })}
      </section>

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

      {canCreate && <button type="button" className="visitor-registration-launch" onClick={() => setRegistrationOpen(true)}><span aria-hidden="true">＋</span><span><strong>Cadastrar novo visitante</strong><small>Abrir ficha completa em uma janela protegida</small></span><i aria-hidden="true">›</i></button>}
      <details className="visitor-registration-compat" aria-hidden="true"><summary>Cadastrar novo visitante</summary></details>
      {canCreate && registrationOpen && createPortal(
        <div className="visitor-registration-backdrop" role="presentation">
        <section id="visitor-registration-card" className="visitor-registration-dialog" role="dialog" aria-modal="true" aria-labelledby="visitor-registration-title">
          <header><div><p className="pilot-kicker">NOVO VISITANTE</p><h2 id="visitor-registration-title">Cadastrar visitante</h2><p>Preencha a ficha sem perder o contexto da lista.</p></div><button type="button" aria-label="Fechar cadastro" onClick={() => !saving && setRegistrationOpen(false)}>×</button></header>
          <form className="pilot-form visitor-registration" onSubmit={createVisitor} onInput={(event) => scheduleDuplicateCheck(event.currentTarget)}>
            <section className="visitor-registration-section visitor-registration-form-section">
              <header><span><b>1</b><strong>Informações pessoais</strong><small>Nome e formas de contato</small></span></header>
              <fieldset>
                <legend>Dados pessoais</legend>
                <label>Nome completo*<input name="nomeCompleto" required maxLength={120} /></label>
                <label>Data de nascimento<input name="dataNascimento" type="date" /></label>
                <label>Telefone/WhatsApp<input name="telefone" inputMode="tel" maxLength={30} /></label>
                <label>E-mail<input name="email" type="email" maxLength={180} /></label>
                <label className="visitor-wide-field">Parente ou responsável<input name="parente" maxLength={120} placeholder="Nome do familiar ou responsável" /></label>
                <label className="visitor-wide-field">Endereço<input name="endereco" maxLength={250} /></label>
              </fieldset>
            </section>
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
            <section className="visitor-registration-section visitor-registration-form-section">
              <header><span><b>2</b><strong>Conexão espiritual</strong><small>Batismo e formação</small></span></header>
              <fieldset>
                <legend>Informações espirituais</legend>
                <label>Batismo<select name="batizado" defaultValue="NAO_INFORMADO"><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></label>
                <label className="visitor-check"><input name="encontroComDeus" type="checkbox" />Já participou do Encontro com Deus</label>
                <label className="visitor-check"><input name="cursoMembros" type="checkbox" />Já concluiu o curso de membros</label>
              </fieldset>
            </section>
            <section className="visitor-registration-section visitor-registration-form-section">
              <header><span><b>3</b><strong>Vínculo com a igreja</strong><small>Célula, categoria e ministério</small></span></header>
              <fieldset>
                <legend>Conexão com a igreja</legend>
                <label>Célula<select name="celulaId" defaultValue=""><option value="">Sem célula</option>{cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.nome}</option>)}</select></label>
                <label>Categoria de acompanhamento<select name="categoriaId" defaultValue=""><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select><small>Com data de nascimento, uma faixa automática configurada terá prioridade.</small></label>
                <label>Quem recebeu<input name="acompanhante" maxLength={120} /></label>
                <label>Ministério de interesse<input name="ministerio" maxLength={120} /></label>
              </fieldset>
            </section>
            <section className="visitor-registration-section visitor-registration-form-section">
              <header><span><b>4</b><strong>Finalização</strong><small>Entrada, status e observações</small></span></header>
              <fieldset>
                <legend>Observações e finalização</legend>
                <label>Entrada*<input name="dataEntrada" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                <label>Status<select name="status" defaultValue="NOVO"><option value="NOVO">Novo</option><option value="EM_CONTATO">Em contato</option><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="INTEGRADO">Integrado</option></select></label>
                <label className="visitor-wide-field">Observações<textarea name="observacoes" maxLength={1000} rows={3} /></label>
              </fieldset>
            </section>
            <footer className="visitor-registration-actions"><button type="button" onClick={() => setRegistrationOpen(false)} disabled={saving}>Cancelar</button><button disabled={saving}>{saving ? "Salvando…" : "Salvar visitante"}</button></footer>
          </form>
        </section>
        </div>, document.body)}

      <section className="visitor-relations-v2" aria-label="Relacionamento com visitantes">
        <nav className="visitor-view-tabs-v2" aria-label="Visões de visitantes">
          {([
            ["visitantes", "Visitantes"],
            ["acompanhamentos", "Acompanhamentos"],
            ["pendencias", "Pendências"],
            ["encaminhamentos", "Encaminhamentos"],
            ["historico", "Histórico"],
            ["arquivados", "Arquivados"],
          ] as Array<[VisitorVision, string]>).map(([vision, label]) => (
            <button
              type="button"
              key={vision}
              className={activeVision === vision ? "active" : ""}
              aria-current={activeVision === vision ? "page" : undefined}
              onClick={() => changeVision(vision)}
            >
              <span>{label}</span><b>{counts[vision]}</b>
            </button>
          ))}
        </nav>

        <div className="visitor-category-strip-v2" aria-label="Categorias de visitantes">
          <button type="button" className={categoryFilter === "all" ? "active" : ""} onClick={() => setCategoryFilter("all")}>
            <span aria-hidden="true">◎</span><strong>Todos</strong><b>{counts.visitantes}</b>
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={categoryFilter === String(category.id) ? "active" : ""}
              style={{ "--category-color": category.cor } as CSSProperties}
              onClick={() => setCategoryFilter(String(category.id))}
            >
              <span aria-hidden="true">{category.icone}</span><strong>{category.nome}</strong><b>{category.total_visitantes}</b>
            </button>
          ))}
          <button type="button" className={categoryFilter === "sem-categoria" ? "active" : ""} onClick={() => setCategoryFilter("sem-categoria")}>
            <span aria-hidden="true">○</span><strong>Sem categoria</strong>
          </button>
        </div>

        <div className="visitor-insights-v2">
          <article>
            <span className="visitor-insight-icon-v2" aria-hidden="true">◫</span>
            <div><small>Pessoas ativas</small><strong>{counts.visitantes}</strong><span>Cadastro central da comunidade</span></div>
          </article>
          <article>
            <span className="visitor-insight-icon-v2 is-warning" aria-hidden="true">!</span>
            <div><small>Próximas ações</small><strong>{counts.pendencias}</strong><span>Contatos que pedem atenção</span></div>
          </article>
          <section className="visitor-birthdays-compact-v2" aria-labelledby="birthday-compact-title">
            <header><div><small>ANIVERSÁRIOS DO MÊS</small><strong id="birthday-compact-title">Celebre com carinho</strong></div><b>{birthdays.length}</b></header>
            <div>
              {birthdays.slice(0, 5).map((visitor) => (
                <span key={visitor.id}>
                  <time dateTime={visitor.data_nascimento || ""}>{birthdayDay(visitor.data_nascimento)}</time>
                  <span><strong>{visitor.nome_completo}</strong><small>{formatBirthday(visitor.data_nascimento)}</small></span>
                  {visitor.telefone && birthdayWhatsappHref(visitor) ? <a href={birthdayWhatsappHref(visitor) || undefined} target="_blank" rel="noreferrer">WhatsApp</a> : <i>Sem contato</i>}
                </span>
              ))}
              {!birthdays.length && <p>Nenhum aniversariante neste mês.</p>}
            </div>
          </section>
        </div>

        <section className="visitor-sheet-v2" aria-labelledby="visitor-sheet-title">
          <header className="visitor-sheet-head-v2">
            <div><p className="pilot-kicker">DIRETÓRIO CENTRAL</p><h2 id="visitor-sheet-title">Pessoas e próximos cuidados</h2><span>Uma ficha por pessoa, em todas as visões.</span></div>
            <div>
              {canCreate && <><input ref={importInputRef} className="visitor-import-input-v2" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepareVisitorImport(file); }} /><button type="button" disabled={importing} onClick={() => importInputRef.current?.click()}>⇧ Importar Excel</button></>}
              <button type="button" onClick={() => void exportVisitors()}>⇩ Exportar Excel</button>
            </div>
          </header>

          <form className="visitor-commandbar-v2" onSubmit={(event) => { event.preventDefault(); void loadVisitors(); }}>
            <label className="visitor-search-v2"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail" /></label>
            <button type="button" className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen((current) => !current)}>☷ Filtros</button>
            <button type="button" className={columnsOpen ? "active" : ""} onClick={() => setColumnsOpen((current) => !current)}>▦ Colunas</button>
            <button type="button" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}>↕ Nome {sortDirection === "asc" ? "A–Z" : "Z–A"}</button>
            <button type="submit" disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button>
          </form>

          {filtersOpen && (
            <div className="visitor-filter-panel-v2">
              <label>Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas</option><option value="sem-categoria">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></label>
              <button type="button" onClick={() => { setSearch(""); setCategoryFilter("all"); }}>Limpar filtros</button>
            </div>
          )}
          {columnsOpen && <div className="visitor-column-panel-v2"><span>Colunas essenciais do Figma</span><b>Nome</b><b>Contato</b><b>Categoria</b><b>Responsável</b><b>Status</b><b>Próxima ação</b></div>}

          {Boolean(selectedRows.length) && (
            <div className="visitor-bulkbar-v2"><strong>{selectedRows.length} selecionado(s)</strong><button type="button" onClick={() => setSelectedRows([])}>Limpar seleção</button>{canDeactivate && activeVision !== "arquivados" && <button type="button" className="danger" onClick={() => void archiveSelectedVisitors()}>Arquivar</button>}{canDeactivate && <button type="button" className="danger permanent" onClick={() => void permanentlyDeleteSelectedVisitors()}>Excluir</button>}</div>
          )}
          <OperationFeedback message={message} error={error} />

          <div className="visitor-table-scroll-v2" aria-busy={loading}>
            <table className="visitor-table-v2">
              <thead><tr>
                <th><input type="checkbox" aria-label="Selecionar página" checked={Boolean(visibleVisitors.length && selectedRows.length === visibleVisitors.length)} onChange={(event) => setSelectedRows(event.target.checked ? visibleVisitors.map((visitor) => visitor.id) : [])} /></th>
                <th>Nome</th><th>Contato</th><th>Categoria</th><th>Ministério</th><th>Responsável</th><th>Status</th><th>Último contato</th><th>Próxima ação</th><th aria-label="Ações" />
              </tr></thead>
              <tbody>
                {visibleVisitors.map((visitor) => (
                  <tr key={visitor.id} onDoubleClick={() => void loadFollowups(visitor.id)}>
                    <td><input type="checkbox" aria-label={`Selecionar ${visitor.nome_completo}`} checked={selectedRows.includes(visitor.id)} onChange={(event) => setSelectedRows((current) => event.target.checked ? [...current, visitor.id] : current.filter((id) => id !== visitor.id))} /></td>
                    <th scope="row"><button type="button" className="visitor-person-cell-v2" onClick={() => void loadFollowups(visitor.id)}><span style={{ "--category-color": visitor.categoria_cor || "var(--pilot-blue)" } as CSSProperties}>{visitor.nome_completo.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><span><strong>{visitor.nome_completo}</strong><small>Entrada {formatDate(visitor.data_entrada)}</small></span></button></th>
                    <td><strong>{visitor.telefone || "Sem telefone"}</strong><small>{visitor.email || "Sem e-mail"}</small></td>
                    <td><span className="visitor-category-tag-v2" style={{ "--category-color": visitor.categoria_cor || "var(--pilot-blue)" } as CSSProperties}>{visitor.categoria_icone || "○"} {visitor.categoria_nome || "Sem categoria"}</span></td>
                    <td>{visitor.ministerio || "—"}</td>
                    <td><strong>{visitor.responsavel_email?.split("@")[0] || visitor.acompanhante || "A definir"}</strong></td>
                    <td>{canEdit && activeVision !== "arquivados" ? <select aria-label={`Status de ${visitor.nome_completo}`} value={visitor.status} onChange={(event) => void updateVisitorField(visitor, { status: event.target.value })}><option value="NOVO">Novo</option><option value="EM_CONTATO">Em contato</option><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="INTEGRADO">Integrado</option></select> : <span className={`status-pill status-${visitor.status.toLowerCase()}`}>{activeVision === "arquivados" ? "Arquivado" : statusLabel(visitor.status)}</span>}</td>
                    <td>{visitor.ultimo_contato ? formatDateTime(visitor.ultimo_contato) : "Sem contato"}</td>
                    <td className={visitor.proximo_contato && visitor.proximo_contato <= new Date().toISOString().slice(0, 10) ? "overdue" : ""}>{visitor.proximo_contato ? formatDate(visitor.proximo_contato) : "Não definida"}</td>
                    <td><button type="button" className="visitor-row-open-v2" aria-label={`Abrir ficha de ${visitor.nome_completo}`} onClick={() => void loadFollowups(visitor.id)}>›</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !visibleVisitors.length && <div className="visitor-empty-v2"><span aria-hidden="true">◎</span><strong>Nenhuma pessoa nesta visão</strong><p>Ajuste os filtros ou cadastre um novo visitante.</p></div>}
          </div>
          {nextCursor && <button type="button" className="visitor-load-more-v2" disabled={loading} onClick={() => void loadVisitors(nextCursor, true)}>Carregar mais pessoas</button>}
        </section>
      </section>

      {Boolean(importRows.length) && createPortal(
        <div className="visitor-import-backdrop-v2" role="presentation">
          <section className="visitor-import-dialog-v2" role="dialog" aria-modal="true" aria-labelledby="visitor-import-title">
            <header><div><p className="pilot-kicker">MIGRAÇÃO DE DADOS</p><h2 id="visitor-import-title">Revisar planilha</h2><p>{importFileName} · {importRows.length} cadastro(s) reconhecido(s)</p></div><button type="button" aria-label="Fechar importação" onClick={() => setImportRows([])}>×</button></header>
            <div className="visitor-import-table-v2"><table><thead><tr><th>Nome</th><th>Contato</th><th>Categoria</th><th>Ministério</th><th>Status</th></tr></thead><tbody>{importRows.slice(0, 10).map((row, index) => <tr key={`${row.nomeCompleto}-${index}`}><th>{row.nomeCompleto}</th><td>{row.telefone || row.email || "—"}</td><td>{row.categoriaNome || "Sem categoria"}</td><td>{row.ministerio || "—"}</td><td>{statusLabel(row.status)}</td></tr>)}</tbody></table>{importRows.length > 10 && <p>Mais {importRows.length - 10} linha(s) serão processadas.</p>}</div>
            <footer><button type="button" onClick={() => setImportRows([])} disabled={importing}>Cancelar</button><button type="button" className="primary" onClick={() => void confirmVisitorImport()} disabled={importing}>{importing ? "Importando…" : `Importar ${importRows.length} cadastro(s)`}</button></footer>
          </section>
        </div>, document.body)}

      {selectedVisitor && createPortal(
        <div className="visitor-person-drawer-backdrop-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <aside className="visitor-person-drawer-v2" role="dialog" aria-modal="true" aria-labelledby="visitor-person-title">
            <header>
              <div className="visitor-person-avatar-v2" style={{ "--category-color": selectedVisitor.categoria_cor || "var(--pilot-blue)" } as CSSProperties}>{selectedVisitor.nome_completo.slice(0, 1).toLocaleUpperCase("pt-BR")}</div>
              <div><p className="pilot-kicker">FICHA CENTRAL</p><h2 id="visitor-person-title">{selectedVisitor.nome_completo}</h2><span>{selectedVisitor.categoria_nome || "Sem categoria"} · {statusLabel(selectedVisitor.status)}</span></div>
              <button type="button" aria-label="Fechar ficha" onClick={() => setSelectedId(null)}>×</button>
            </header>
            <div className="visitor-person-actions-v2">
              {selectedVisitor.telefone && whatsappHref(selectedVisitor.telefone) && <a href={whatsappHref(selectedVisitor.telefone) || undefined} target="_blank" rel="noreferrer">WhatsApp</a>}
              {canEdit && selectedVisitor.status !== "INTEGRADO" && <button type="button" onClick={() => void markIntegrated(selectedVisitor)}>Marcar integrado</button>}
              {canDeactivate && activeVision !== "arquivados" && <button type="button" className="danger" onClick={() => void deactivateVisitor(selectedVisitor)}>Arquivar</button>}
              {canDeactivate && <button type="button" className="danger" onClick={() => void permanentlyDeleteVisitor(selectedVisitor)}>Excluir</button>}
            </div>
            <dl className="visitor-person-summary-v2">
              <div><dt>Telefone</dt><dd>{selectedVisitor.telefone || "Não informado"}</dd></div>
              <div><dt>E-mail</dt><dd>{selectedVisitor.email || "Não informado"}</dd></div>
              <div><dt>Célula</dt><dd>{selectedVisitor.celula_nome || "Sem célula"}</dd></div>
              <div><dt>Ministério</dt><dd>{selectedVisitor.ministerio || "Não definido"}</dd></div>
              <div><dt>Responsável</dt><dd>{selectedVisitor.responsavel_email || selectedVisitor.acompanhante || "A definir"}</dd></div>
              <div><dt>Próxima ação</dt><dd>{selectedVisitor.proximo_contato ? formatDate(selectedVisitor.proximo_contato) : "Não definida"}</dd></div>
            </dl>
            {canEdit && activeVision !== "arquivados" && <details className="visitor-edit-compact-v2"><summary>Editar dados completos</summary><form className="pilot-form visitor-edit-form" onSubmit={(event) => updateVisitor(event, selectedVisitor)}><label>Nome completo*<input name="nomeCompleto" required maxLength={120} defaultValue={selectedVisitor.nome_completo} /></label><label>Data de nascimento<input name="dataNascimento" type="date" defaultValue={selectedVisitor.data_nascimento || ""} /></label><label>Telefone<input name="telefone" maxLength={30} defaultValue={selectedVisitor.telefone || ""} /></label><label>E-mail<input name="email" type="email" maxLength={180} defaultValue={selectedVisitor.email || ""} /></label><label>Endereço<input name="endereco" maxLength={250} defaultValue={selectedVisitor.endereco || ""} /></label><label>Quem recebeu<input name="acompanhante" maxLength={120} defaultValue={selectedVisitor.acompanhante || ""} /></label><label>Parente<input name="parente" maxLength={120} defaultValue={selectedVisitor.parente || ""} /></label><label>Ministério<input name="ministerio" maxLength={120} defaultValue={selectedVisitor.ministerio || ""} /></label><label>Célula<select name="celulaId" defaultValue={selectedVisitor.celula_id || ""}><option value="">Sem célula</option>{cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.nome}</option>)}</select></label><label>Categoria<select name="categoriaId" defaultValue={selectedVisitor.categoria_id || ""}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></label><label>Batismo<select name="batizado" defaultValue={selectedVisitor.batizado}><option value="NAO_INFORMADO">Não informado</option><option value="SIM">Sim</option><option value="NAO">Não</option></select></label><label>Status<select name="status" defaultValue={selectedVisitor.status}><option value="NOVO">Novo</option><option value="EM_CONTATO">Em contato</option><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="INTEGRADO">Integrado</option></select></label><label>Entrada<input name="dataEntrada" type="date" required defaultValue={selectedVisitor.data_entrada} /></label><label className="visitor-check"><input name="encontroComDeus" type="checkbox" defaultChecked={Boolean(selectedVisitor.encontro_com_deus)} />Encontro com Deus</label><label className="visitor-check"><input name="cursoMembros" type="checkbox" defaultChecked={Boolean(selectedVisitor.curso_membros)} />Curso de membros</label><label className="visitor-wide-field">Observações<textarea name="observacoes" rows={3} maxLength={1000} defaultValue={selectedVisitor.observacoes || ""} /></label><button disabled={saving}>Salvar alterações</button></form></details>}
            {canFollowup && activeVision !== "arquivados" && <details className="visitor-followup-details-v2"><summary><span><strong>Novo acompanhamento</strong><small>Registre o cuidado sem sair da ficha.</small></span><i aria-hidden="true">⌄</i></summary><form className="visitor-followup-quick-v2" onSubmit={createFollowup}><label>Canal<select name="tipo" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="TELEFONE">Telefone</option><option value="PRESENCIAL">Presencial</option><option value="EMAIL">E-mail</option><option value="OUTRO">Outro</option></select></label><label>Resultado<input name="resultado" required maxLength={160} placeholder="Resumo do contato" /></label><label>Próximo contato<input name="proximoContato" type="date" /></label><label className="wide">Observações<textarea name="descricao" rows={3} maxLength={1500} /></label><button disabled={saving}>{saving ? "Salvando…" : "Registrar acompanhamento"}</button></form></details>}
            <section className="visitor-timeline-v2"><header><strong>Histórico</strong><b>{followups.length}</b></header>{followups.map((item) => <article key={item.id}><span aria-hidden="true" /><div><header><b>{item.tipo}</b><time>{formatDateTime(item.criado_em)}</time></header><strong>{item.resultado}</strong>{item.descricao && <p>{item.descricao}</p>}{item.proximo_contato && <small>Próximo contato: {formatDate(item.proximo_contato)}</small>}</div></article>)}{!followups.length && <p className="operations-muted">Nenhum acompanhamento registrado.</p>}</section>
          </aside>
        </div>, document.body)}

      {false && <>
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
      </>}
    </section>
  );
}

// Saúde da célula. O diretório listava nome, dia e liderança — dados que não
// respondem à pergunta que a liderança faz de fato: qual célula parou de
// reportar, qual está encolhendo e qual já tem gente para multiplicar. Tudo
// abaixo sai dos relatórios que a rota já devolve; nada de consulta nova.
type CellHealth = {
  id: "AGUARDANDO" | "SEM_RELATORIO" | "ATENCAO" | "MULTIPLICAR" | "SAUDAVEL";
  label: string;
  weeks: number[];
  semanasEmDia: number;
  mediaPresentes: number;
};

const CELL_HEALTH_WEEKS = 8;
const CELL_REPORT_GRACE_DAYS = 21;

function cellHealth(cell: Cell, agora: number): CellHealth {
  // Antes do relógio acertar no cliente não dá para julgar atraso sem chutar
  // uma data, e chutar aqui pintaria célula saudável de vermelho.
  if (!agora) {
    return {
      id: "AGUARDANDO",
      label: "Calculando",
      weeks: [],
      semanasEmDia: 0,
      mediaPresentes: 0,
    };
  }
  // Os relatórios chegam da rota em ordem decrescente de data.
  const recentes = cell.relatorios.slice(0, CELL_HEALTH_WEEKS);
  const weeks = [...recentes]
    .reverse()
    .map((item) => (item.aconteceu ? Number(item.presentes) || 0 : 0));
  const semanasEmDia = recentes.filter((item) => item.aconteceu).length;
  const comPresenca = weeks.filter((valor) => valor > 0);
  const mediaPresentes = comPresenca.length
    ? Math.round(comPresenca.reduce((soma, valor) => soma + valor, 0) / comPresenca.length)
    : 0;

  const ultimo = cell.ultimo_relatorio_em
    ? Date.parse(cell.ultimo_relatorio_em)
    : Number.NaN;
  const diasSemReportar = Number.isNaN(ultimo)
    ? Number.POSITIVE_INFINITY
    : Math.floor((agora - ultimo) / 86400000);

  if (diasSemReportar > CELL_REPORT_GRACE_DAYS) {
    const semanas = Number.isFinite(diasSemReportar)
      ? Math.floor(diasSemReportar / 7)
      : 0;
    return {
      id: "SEM_RELATORIO",
      label: semanas
        ? `Sem relatório há ${semanas} ${semanas === 1 ? "semana" : "semanas"}`
        : "Sem relatório",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }

  // Encolhendo: a média das duas últimas semanas caiu abaixo de 70% da média
  // das quatro anteriores. Uma semana ruim sozinha não acusa nada.
  const ultimas = weeks.slice(-2).filter((valor) => valor > 0);
  const anteriores = weeks.slice(-6, -2).filter((valor) => valor > 0);
  const mediaUltimas = ultimas.length
    ? ultimas.reduce((soma, valor) => soma + valor, 0) / ultimas.length
    : 0;
  const mediaAnteriores = anteriores.length
    ? anteriores.reduce((soma, valor) => soma + valor, 0) / anteriores.length
    : 0;
  const encolhendo = mediaAnteriores > 0 && mediaUltimas < mediaAnteriores * 0.7;

  if (encolhendo) {
    return { id: "ATENCAO", label: "Atenção", weeks, semanasEmDia, mediaPresentes };
  }
  if (mediaPresentes >= 15 && semanasEmDia >= 6) {
    return {
      id: "MULTIPLICAR",
      label: "Pronta p/ multiplicar",
      weeks,
      semanasEmDia,
      mediaPresentes,
    };
  }
  return { id: "SAUDAVEL", label: "Saudável", weeks, semanasEmDia, mediaPresentes };
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
  const [tab, setTab] = useState<"visao" | "integrantes" | "agenda" | "relatorio" | "solicitacoes" | "entrar">("visao");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<Cell["membros"][number] | null>(null);
  const [cellSearch, setCellSearch] = useState("");
  const [cellStatus, setCellStatus] = useState<"all" | "active" | "archived">("all");
  const [cellHealthFilter, setCellHealthFilter] = useState<"all" | CellHealth["id"]>("all");
  // O relógio vem de estado: lê-lo durante a renderização daria valores
  // diferentes no servidor e no cliente e quebraria a hidratação.
  const [agora, setAgora] = useState(0);
  const canManage = permissions.includes("cells.manage");

  const loadCells = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await apiJson<{ celulas: Cell[]; availableUsers?: Array<{ id: number; nome: string; papel: string }> }>("/api/pilot/celulas");
      setCells(result.celulas);
      setAvailableUsers(result.availableUsers || []);
      setSelectedId((current) => current && result.celulas.some((cell) => cell.id === current) ? current : null);
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

  useEffect(() => {
    const acertar = () => setAgora(Date.now());
    const primeiro = window.setTimeout(acertar, 0);
    const relogio = window.setInterval(acertar, 3600000);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId]);

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

  async function requestCellEntry(cell: Cell, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await apiJson(`/api/public/celulas/${cell.id}/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      form.reset();
      setMessage(`Solicitação enviada à liderança da célula ${cell.nome}.`);
      setTab("visao");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = cells.find((cell) => cell.id === selectedId) || null;
  const dayLabels: Record<string, string> = { DOM: "Dom", SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", SAB: "Sáb" };
  const activeCells = cells.filter((cell) => cell.ativo);
  const membersTotal = activeCells.reduce((total, cell) => total + cell.membros_total, 0);
  const meetingsTotal = activeCells.reduce((total, cell) => total + cell.agenda.length, 0);
  const normalizedCellSearch = cellSearch.trim().toLocaleLowerCase("pt-BR");
  const healthById = new Map(cells.map((cell) => [cell.id, cellHealth(cell, agora)]));
  const healthCounts = cells.reduce<Record<string, number>>((acc, cell) => {
    if (!cell.ativo) return acc;
    const id = healthById.get(cell.id)!.id;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const visibleCells = cells.filter((cell) => {
    if (cellStatus === "active" && !cell.ativo) return false;
    if (cellStatus === "archived" && cell.ativo) return false;
    if (cellHealthFilter !== "all" && healthById.get(cell.id)!.id !== cellHealthFilter) return false;
    if (!normalizedCellSearch) return true;
    return [cell.nome, cell.descricao_publica, cell.endereco_publico, cell.lider_nome, cell.responsavel]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedCellSearch));
  });

  return (
    <section className="cells-workspace-v2" aria-busy={loading}>
      <header className="cells-hero-v2 cells-hero-v4">
        <div><p className="pilot-kicker">CÉLULAS · {communityName}</p><h1>Grupos que aproximam pessoas</h1><p>Acompanhe líderes, encontros e relatórios sem perder a visão de cada célula.</p></div>
        {canManage && <button className="cell-create-trigger-v4" type="button" onClick={() => setCreateOpen(true)}><span aria-hidden="true">＋</span> Criar célula</button>}
      </header>
      <OperationFeedback message={message} error={error} />
      <section className="cells-summary-v4" aria-label="Resumo das células">
        <article><small>Ativas</small><strong>{activeCells.length}</strong></article>
        <article><small>Pessoas</small><strong>{membersTotal}</strong></article>
        <article><small>Próximos encontros</small><strong>{meetingsTotal}</strong></article>
        <article><small>Relatórios em dia</small><strong>{activeCells.filter((cell) => cell.ultimo_relatorio_em).length}<span> de {activeCells.length}</span></strong></article>
        <article data-alerta={(healthCounts.SEM_RELATORIO || 0) > 0 ? "1" : undefined}><small>Sem relatório</small><strong>{healthCounts.SEM_RELATORIO || 0}<span> há mais de 3 semanas</span></strong></article>
      </section>
      <div className="cell-shell-v2 cell-shell-v4">
        <aside className="cell-index-v2" aria-label="Células da comunidade">
          <header><div><p className="pilot-kicker">DIRETÓRIO</p><h2>Células da comunidade</h2><small>Abra uma célula para consultar ou administrar suas informações.</small></div><span>{activeCells.length} ativas · {cells.filter((cell) => !cell.ativo).length} arquivadas</span></header>
          <div className="cell-directory-toolbar-v4">
            <label className="cell-directory-search-v4"><span aria-hidden="true">⌕</span><input value={cellSearch} onChange={(event) => setCellSearch(event.target.value)} placeholder="Buscar célula, líder ou bairro" aria-label="Buscar célula, líder ou bairro" /></label>
            <div className="cell-directory-status-v4" role="group" aria-label="Filtrar células por situação">
              {([['all','Todas'],['active','Ativas'],['archived','Arquivadas']] as const).map(([value, label]) => <button key={value} type="button" className={cellStatus === value ? "active" : ""} aria-pressed={cellStatus === value} onClick={() => setCellStatus(value)}>{label}</button>)}
            </div>
            <div className="cell-health-filter-v5" role="group" aria-label="Filtrar células por saúde">
              {([
                ['all', 'Saúde: todas', 0],
                ['SEM_RELATORIO', 'Sem relatório', healthCounts.SEM_RELATORIO || 0],
                ['ATENCAO', 'Atenção', healthCounts.ATENCAO || 0],
                ['MULTIPLICAR', 'Prontas p/ multiplicar', healthCounts.MULTIPLICAR || 0],
                ['SAUDAVEL', 'Saudáveis', healthCounts.SAUDAVEL || 0],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  data-saude={value}
                  className={cellHealthFilter === value ? "active" : ""}
                  aria-pressed={cellHealthFilter === value}
                  onClick={() => setCellHealthFilter(value as "all" | CellHealth["id"])}
                >
                  {label}{value !== 'all' && <span>{count}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="cell-directory-v4">
            {visibleCells.map((cell) => <button type="button" key={cell.id} className={`${selectedId === cell.id ? "active" : ""}${!cell.ativo ? " archived" : ""}`} onClick={() => { setSelectedId(cell.id); setTab("visao"); }}><span className="cell-row-avatar-v4" aria-hidden="true">{cell.nome.slice(0, 1)}</span><span className="cell-row-copy-v4"><span><i>{cell.ativo ? "Ativa" : "Arquivada"}</i><strong>{cell.nome}</strong></span><small>{cell.descricao_publica || "Descrição pública ainda não informada."}</small></span><span className="cell-row-fact-v4"><small>Encontros</small><strong>{cell.dias_reuniao.map((day) => dayLabels[day] || day).join(", ") || "A definir"}</strong></span><span className="cell-row-fact-v4"><small>Pessoas</small><strong>{cell.membros_total + cell.visitantes_ativos}</strong></span><span className="cell-row-fact-v4"><small>Liderança</small><strong>{cell.lider_nome || cell.responsavel || "A definir"}</strong></span><span className="cell-row-health-v5"><i className="cell-health-pill-v5" data-saude={healthById.get(cell.id)!.id}>{healthById.get(cell.id)!.label}</i><span className="cell-health-weeks-v5" aria-hidden="true">{(() => { const saude = healthById.get(cell.id)!; const teto = Math.max(1, ...saude.weeks); return saude.weeks.map((valor, indice) => <i key={indice} data-vazio={valor === 0 ? "1" : undefined} style={{ height: `${Math.max(12, Math.round((valor / teto) * 100))}%` }} />); })()}</span><small>{healthById.get(cell.id)!.semanasEmDia}/8 relatórios</small></span><span className="cell-row-arrow-v4" aria-hidden="true">›</span></button>)}
            {!loading && !visibleCells.length && <p className="cell-directory-empty-v4">Nenhuma célula encontrada com esses filtros.</p>}
          </div>
        </aside>
        {selected && <div className="cell-detail-overlay-v2" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
        <main className="cell-detail-v2 cell-detail-v4" role="dialog" aria-modal="true" aria-label={`Detalhes da célula ${selected.nome}`}>
          <button className="cell-detail-close-v2" type="button" aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}>×</button>
          <>
            <header className="cell-detail-head-v2"><div><small>DETALHES DA CÉLULA</small><div className="cell-detail-title-v4"><h2>{selected.nome}</h2><span>{selected.ativo ? "Ativa" : "Arquivada"}</span></div><p>{selected.descricao_publica || "Descrição pública ainda não informada."}</p><div className="cell-day-pills"><small>Encontros</small>{selected.dias_reuniao.map((day) => <span key={day}>{dayLabels[day] || day}</span>)}</div></div></header>
            <dl className="cell-metrics-v2"><div><dt>Membros</dt><dd>{selected.membros_total}</dd></div><div><dt>Visitantes</dt><dd>{selected.visitantes_ativos + selected.membros.filter((member) => member.kind === "EXTERNAL").length}</dd></div><div><dt>Liderança</dt><dd>{selected.vice_lider_nome ? "2" : "1"}</dd></div><div><dt>Próximos encontros</dt><dd>{selected.agenda.length}</dd></div></dl>
            <div className="cell-detail-body-v4">
            <nav className="cell-tabs-v2" aria-label="Seções da célula">{(selected.can_operate ? [["visao","Visão geral"],["integrantes","Integrantes"],["agenda","Agenda"],["relatorio","Relatório semanal"],["solicitacoes",`Solicitações ${selected.solicitacoes.length || ""}`]] : [["visao","Informações"],["agenda","Próximos encontros"],["entrar","Solicitar entrada"]]).map(([id,label], index) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id as typeof tab)}><span>{String(index + 1).padStart(2,"0")}</span>{label}</button>)}</nav>
            <div className="cell-detail-content-v4">
            {tab === "visao" && <section className="cell-overview-v2"><article><span aria-hidden="true">♙</span><div><small>LIDERANÇA</small><strong>{selected.lider_nome || selected.responsavel}</strong><p>{selected.vice_lider_nome ? `Vice-líder: ${selected.vice_lider_nome}` : "Vice-líder ainda não definido"}</p></div></article><article><span aria-hidden="true">⌖</span><div><small>LOCAL PÚBLICO</small><strong>{selected.endereco_publico || "A definir"}</strong><p>Visível para quem procura uma célula.</p></div></article><article><span aria-hidden="true">✓</span><div><small>ÚLTIMO RELATÓRIO</small><strong>{selected.ultimo_relatorio_em ? new Date(selected.ultimo_relatorio_em).toLocaleDateString("pt-BR") : "Pendente"}</strong><p>Após 60 dias sem relatório, a célula é arquivada.</p></div></article>{canManage && <article className="cell-danger-v2"><span aria-hidden="true">⚙</span><div><small>GESTÃO PASTORAL</small><strong>{selected.ativo ? "Célula em atividade" : "Célula arquivada"}</strong>{selected.ativo ? <button type="button" onClick={() => void deactivateCell(selected)}>Arquivar célula</button> : <button type="button" onClick={() => void cellAction(selected, { acao: "REATIVAR" })}>Reativar célula</button>}</div></article>}</section>}
            {tab === "integrantes" && <section className="cell-members-v2">
              <div className="cell-member-list">{selected.membros.map((member) => <article key={member.id}>
                <span aria-hidden="true">{member.name.slice(0,1)}</span>
                <div><strong>{member.name}</strong><small>{member.role === "LEADER" ? "Líder" : member.role === "VICE_LEADER" ? "Vice-líder" : member.kind === "EXTERNAL" ? `Visitante${member.note ? ` · ${member.note}` : ""}` : "Membro"}</small>{member.kind === "COMMUNITY" && <button type="button" className="cell-member-profile-open" onClick={() => setSelectedMemberProfile(member)}>Ver perfil</button>}</div>
                {selected.can_operate && member.role !== "LEADER" && <div className="cell-member-actions">{member.kind === "COMMUNITY" && member.role !== "VICE_LEADER" && <button type="button" onClick={() => void cellAction(selected, { acao: "MEMBRO_PROMOVER_VICE", membroId: member.id })}>Promover</button>}<button type="button" className="danger-link" onClick={() => void updateCellMember(selected, "MEMBRO_REMOVER", { membroId: member.id })}>Remover</button></div>}
              </article>)}</div>
              {selected.can_operate && <div className="cell-add-members-v2"><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_INTERNO",{usuarioId:Number(data.get("usuarioId"))},form); }}><label>Membro da comunidade<select name="usuarioId" required defaultValue=""><option value="" disabled>Selecione</option>{availableUsers.map((user)=><option value={user.id} key={user.id}>{user.nome} · {user.papel}</option>)}</select></label><button disabled={saving}>Adicionar</button></form><form onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); void updateCellMember(selected,"MEMBRO_ADICIONAR_EXTERNO",{nomeExterno:data.get("nomeExterno"),descricaoExterna:data.get("descricaoExterna")},form); }}><label>Visitante de fora<input name="nomeExterno" required placeholder="Nome completo" /></label><label>Observação<input name="descricaoExterna" placeholder="Contato ou contexto" /></label><button disabled={saving}>Registrar</button></form></div>}
            </section>}
            {tab === "agenda" && <section className="cell-agenda-v2"><div className="cell-agenda-list-v2">{selected.agenda.map((item) => <article key={item.id}><time>{new Date(item.inicia_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"short" })}</time><div><strong>{item.titulo}</strong><small>{new Date(item.inicia_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}–{new Date(item.termina_em).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })} · {item.visibilidade === "PUBLICO" ? "Público" : "Só liderança"}</small><p>{item.lembrete}</p></div></article>)}{!selected.agenda.length && <p>Nenhum encontro programado.</p>}</div>{selected.can_operate && <form className="pilot-form cell-agenda-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"AGENDA_CRIAR",...data},form); }}><h3>Programar sem publicar no feed</h3><label>Título<input name="titulo" required /></label><label>Início<input name="iniciaEm" type="datetime-local" required /></label><label>Término<input name="terminaEm" type="datetime-local" required /></label><label>Visibilidade<select name="visibilidade"><option value="PUBLICO">Público para a célula</option><option value="PRIVADO">Privado para liderança</option></select></label><label className="cell-wide-field">Lembrete<textarea name="lembrete" rows={2} /></label><button disabled={saving}>Verificar horários e salvar</button></form>}</section>}
            {tab === "relatorio" && <section className="cell-reports-v2">{selected.can_operate && <form className="pilot-form cell-report-form-v2" onSubmit={(event) => { event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form)); void cellAction(selected,{acao:"RELATORIO_CRIAR",...data,aconteceu:data.aconteceu === "true"},form); }}><h3>Formulário do encontro</h3><label>Data<input name="dataReuniao" type="date" required /></label><label>Aconteceu?<select name="aconteceu"><option value="true">Sim</option><option value="false">Não</option></select></label><label>Presentes<input name="presentes" type="number" min="0" defaultValue="0" /></label><label>Visitantes<input name="visitantes" type="number" min="0" defaultValue="0" /></label><label className="cell-wide-field">Observações<textarea name="observacoes" rows={2} /></label><button disabled={saving}>Enviar ao pastor</button></form>}<div className="cell-report-history-v2">{selected.relatorios.map((report) => <article key={report.id}><time>{new Date(`${report.data_reuniao}T12:00:00`).toLocaleDateString("pt-BR")}</time><strong>{report.aconteceu ? `${report.presentes} pessoas · ${report.visitantes} visitantes` : "Encontro não realizado"}</strong><small>{report.enviado_por_nome ? `Enviado por ${report.enviado_por_nome}` : "Relatório registrado"}</small></article>)}</div></section>}
            {tab === "solicitacoes" && <section className="cell-requests-v2">{!selected.can_operate && <p>As solicitações ficam disponíveis somente para a liderança.</p>}{selected.solicitacoes.map((request) => <article key={request.id}><div><strong>{request.nome}</strong><small>{request.contato || "Sem contato"}</small><p>{request.mensagem}</p></div><div><button type="button" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"APROVADA"})}>Aprovar</button><button type="button" className="danger-link" onClick={() => void cellAction(selected,{acao:"SOLICITACAO_DECIDIR",solicitacaoId:request.id,status:"RECUSADA"})}>Recusar</button></div></article>)}</section>}
            {tab === "entrar" && !selected.can_operate && <section className="cell-entry-request-v2"><header><small>ENTRAR NESTA CÉLULA</small><h3>Envie seus dados à liderança</h3><p>As informações serão usadas somente para analisar seu pedido e entrar em contato.</p></header><form className="pilot-form" onSubmit={(event) => void requestCellEntry(selected, event)}><label>Nome completo<input name="nome" required minLength={5} maxLength={120} autoComplete="name" /></label><label>WhatsApp ou e-mail<input name="contato" required maxLength={160} autoComplete="email" /></label><label className="cell-wide-field">Mensagem para a liderança<textarea name="mensagem" rows={3} maxLength={500} placeholder="Conte um pouco sobre você e o melhor horário para contato." /></label><label className="cell-request-consent"><input type="checkbox" required />Autorizo o envio destes dados à liderança desta célula.</label><button disabled={saving}>{saving ? "Enviando…" : "Solicitar entrada"}</button></form></section>}
            </div>
            </div>
          </>
        </main>
        </div>}
      </div>
      {selectedMemberProfile && typeof document !== "undefined" && createPortal(
        <div className="cell-member-profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMemberProfile(null); }}>
          <section className="cell-member-profile-dialog" role="dialog" aria-modal="true" aria-label={`Perfil de ${selectedMemberProfile.name}`}>
            <header><span>{selectedMemberProfile.fotoPerfil ? <img src={selectedMemberProfile.fotoPerfil} alt="" /> : selectedMemberProfile.name.slice(0,1)}</span><div><small>PERFIL DO MEMBRO</small><h2>{selectedMemberProfile.name}</h2><p>{selectedMemberProfile.papelComunidade || "Membro da comunidade"}</p></div><button type="button" onClick={() => setSelectedMemberProfile(null)} aria-label="Fechar perfil">×</button></header>
            <dl><div><dt>Função na célula</dt><dd>{selectedMemberProfile.role === "LEADER" ? "Líder" : selectedMemberProfile.role === "VICE_LEADER" ? "Vice-líder" : "Membro"}</dd></div><div><dt>E-mail</dt><dd>{selectedMemberProfile.email || "Não informado"}</dd></div><div><dt>WhatsApp</dt><dd>{selectedMemberProfile.telefone || "Não informado"}</dd></div></dl>
            {selectedMemberProfile.telefone && whatsappHref(selectedMemberProfile.telefone) && <a href={whatsappHref(selectedMemberProfile.telefone) || undefined} target="_blank" rel="noreferrer">Conversar pelo WhatsApp</a>}
          </section>
        </div>, document.body,
      )}
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

function normalizeSpreadsheetKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function importStatus(value: string) {
  const normalized = normalizeSpreadsheetKey(value).replaceAll(" ", "_");
  if (normalized === "integrado") return "INTEGRADO";
  if (normalized === "em_acompanhamento") return "EM_ACOMPANHAMENTO";
  if (normalized === "em_contato") return "EM_CONTATO";
  return "NOVO";
}

function spreadsheetDate(value: string) {
  if (!value) return "";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const brazilian = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  return "";
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
