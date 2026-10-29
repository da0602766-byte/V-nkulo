"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  GlobalVisualConfig,
  VisualRule,
  VisualTextBox,
  VisualAppearance,
} from "../lib/global-visual-editor";
import { DEFAULT_GLOBAL_VISUAL_CONFIG, parseGlobalVisualConfig, resolveVisualConfig, setVisualRules, safeVisualHref } from "../lib/global-visual-editor";
import NativeImageUpload from "./NativeImageUpload";
import TransientFeedback from "./TransientFeedback";
import "./GlobalVisualEditor.css";

type SaveScope = "PERSONAL" | "COMMUNITY" | "PLATFORM";
type PanelPosition = { x: number; y: number };

const EDITOR_UI_STORAGE_KEY = "vinkulo:visual-editor-ui:v1";
const SHADOWS = {
  NONE: "none",
  SOFT: "0 10px 30px rgba(16,24,40,.12)",
  MEDIUM: "0 18px 48px rgba(16,24,40,.20)",
  GLOW: "0 0 0 1px rgba(126,87,240,.38),0 16px 48px rgba(126,87,240,.30)",
} as const;
const GRADIENTS = {
  NONE: "",
  PURPLE_GOLD: "linear-gradient(135deg,#6f42e8,#d6a44a)",
  PURPLE_BLUE: "linear-gradient(135deg,#7048e8,#347ed5)",
  OCEAN: "linear-gradient(135deg,#155e75,#2ab7a9)",
  SUNSET: "linear-gradient(135deg,#d75b78,#e6a542)",
} as const;
const SAFE_COLORS = [
  ["#172033", "Texto escuro"],
  ["#f5f3ed", "Texto claro"],
  ["#ffffff", "Branco suave"],
  ["#101521", "Azul-noite"],
  ["#6f42e8", "Violeta"],
  ["#d6a44a", "Dourado"],
  ["#2ab7a9", "Turquesa"],
] as const;

const SCREEN_LABELS: Record<string, string> = {
  inicio: "Início", eventos: "Agenda e eventos", agenda: "Agenda", mural: "Mural",
  fio: "Fio do dia", ministerios: "Ministérios", solicitacoes: "Pedidos",
  visitantes: "Visitantes", celulas: "Células", estacionamento: "Gestão",
  redes: "Redes e unidades", membro: "Painel do membro", lider: "Liderança",
  pessoas: "Pessoas", comunidade: "Configurações da comunidade", continuidade: "Continuidade",
  landing: "Página inicial pública", geral: "Área pública", feed: "Mural",
  perfil: "Perfil", planos: "Planos", aparencia: "Aparência", comunidades: "Comunidades",
  usuarios: "Usuários", laboratorio: "Laboratório", estatisticas: "Estatísticas",
};

const CANDIDATES = [
  "[data-editor-key]",
  ".pilot-topbar",
  ".pilot-sidebar",
  ".pilot-mobile-nav",
  ".pilot-workspace > section",
  ".pilot-workspace > div",
  ".workspace-heading",
  ".community-home-hero",
  ".community-home-rail > section",
  ".community-feed-entry",
  ".community-composer",
  ".community-comments",
  ".community-post-links",
  "article",
  "form",
  "table",
  "header",
  "nav",
  "aside",
  "button",
  "a",
  "h1",
  "h2",
  "h3",
  "p",
  "span",
  "strong",
  "small",
  "li",
  "td",
  "th",
  "label",
  "img",
  "input",
  "select",
  "textarea",
].join(",");

export default function GlobalVisualEditor({
  canEdit,
  communityName,
  screenId = "panel:inicio",
  surface = "panel",
  rootSelector = "[data-visual-editor-root]",
  toolbarTargetId = "global-editor-toolbar-slot",
}: {
  canEdit: boolean;
  communityName: string;
  screenId?: string;
  surface?: "panel" | "public";
  rootSelector?: string;
  toolbarTargetId?: string;
}) {
  const screenLabel = SCREEN_LABELS[screenId.split(":").slice(1).join(":")] || "Tela atual";
  const [config, setConfig] = useState<GlobalVisualConfig>(
    DEFAULT_GLOBAL_VISUAL_CONFIG,
  );
  const [savedConfig, setSavedConfig] = useState<GlobalVisualConfig>(
    DEFAULT_GLOBAL_VISUAL_CONFIG,
  );
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(true);
  const [panelPosition, setPanelPosition] = useState<PanelPosition>({
    x: 16,
    y: 16,
  });
  const [uiReady, setUiReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("Tela atual");
  const [tab, setTab] = useState<"object" | "screen" | "insert">("screen");
  const [target, setTarget] = useState<"screen" | "global">("screen");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [scope, setScope] = useState<SaveScope>(
    surface === "public" ? "PLATFORM" : "PERSONAL",
  );
  const [canSavePlatform, setCanSavePlatform] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [message, setMessageText] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const setMessage = useCallback((text: string, tone: "info" | "success" | "error" = "info") => {
    setMessageText(text);
    setMessageTone(tone);
  }, []);
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null);
  const [toolbarElement, setToolbarElement] = useState<HTMLElement | null>(null);
  const history = useRef<GlobalVisualConfig[]>([]);
  const future = useRef<GlobalVisualConfig[]>([]);
  const styleElement = useRef<HTMLStyleElement | null>(null);
  const dragKey = useRef("");
  const panelRef = useRef<HTMLElement | null>(null);
  const panelDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const textBoxDrag = useRef<{
    pointerId: number;
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    rootWidth: number;
    rootHeight: number;
  } | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setRootElement(document.querySelector<HTMLElement>(rootSelector));
      setToolbarElement(document.getElementById(toolbarTargetId));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rootSelector, toolbarTargetId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const fallback = defaultPanelPosition();
      try {
        const stored = window.localStorage.getItem(EDITOR_UI_STORAGE_KEY);
        if (!stored) {
          setPanelPosition(fallback);
          setUiReady(true);
          return;
        }
        const parsed = JSON.parse(stored) as {
          active?: boolean;
          minimized?: boolean;
          navigationLocked?: boolean;
          position?: Partial<PanelPosition>;
        };
        setActive(Boolean(parsed.active));
        setMinimized(Boolean(parsed.minimized));
        setNavigationLocked(parsed.navigationLocked !== false);
        setPanelPosition(
          clampPanelPosition(
            {
              x: Number.isFinite(parsed.position?.x)
                ? Number(parsed.position?.x)
                : fallback.x,
              y: Number.isFinite(parsed.position?.y)
                ? Number(parsed.position?.y)
                : fallback.y,
            },
            Boolean(parsed.minimized),
          ),
        );
      } catch {
        setPanelPosition(fallback);
      }
      setUiReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!uiReady) return;
    window.localStorage.setItem(
      EDITOR_UI_STORAGE_KEY,
      JSON.stringify({
        active,
        minimized,
        navigationLocked,
        position: panelPosition,
      }),
    );
  }, [active, minimized, navigationLocked, panelPosition, uiReady]);

  useEffect(() => {
    const keepInsideViewport = () =>
      setPanelPosition((current) =>
        clampPanelPosition(current, minimized, panelRef.current),
      );
    window.addEventListener("resize", keepInsideViewport);
    if (active) window.requestAnimationFrame(keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [active, minimized]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const applyConfig = useCallback((sourceConfig: GlobalVisualConfig) => {
    const nextConfig = resolveVisualConfig(sourceConfig, screenId);
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;
    root.style.setProperty("--ve-accent", nextConfig.accentColor);
    if (root.classList.contains("pilot-dashboard")) {
      // A paleta claro/escuro/automático é a fonte de verdade do painel.
      // Um fundo antigo do Editor Visual não pode deixar a interface híbrida.
      root.style.removeProperty("--ve-surface");
    } else {
      root.style.setProperty(
        "--ve-surface",
        nextConfig.surfaceColor || "transparent",
      );
    }
    root.style.setProperty("--ve-text-scale", String(nextConfig.textScale));
    root.style.setProperty("--ve-radius", `${nextConfig.radius}px`);
    root.dataset.veDensity = nextConfig.density;

    root
      .querySelectorAll<HTMLElement>("[data-ve-original-text], [data-ve-original-src]")
      .forEach((element) => {
        const key = element.dataset.veKey || "";
        const rule = nextConfig.rules[key];
        if (
          element.dataset.veOriginalText !== undefined &&
          typeof rule?.text !== "string"
        ) {
          element.textContent = element.dataset.veOriginalText;
          delete element.dataset.veOriginalText;
        }
        if (
          element instanceof HTMLImageElement &&
          element.dataset.veOriginalSrc &&
          !rule?.imageUrl
        ) {
          element.src = element.dataset.veOriginalSrc;
          delete element.dataset.veOriginalSrc;
        }
      });

    const css: string[] = [];
    for (const [key, rule] of Object.entries(nextConfig.rules)) {
      const selector = `${rootSelector} [data-ve-key="${key}"]`;
      const declarations: string[] = [];
      if (rule.color) declarations.push(`color:${rule.color}!important`);
      if (rule.background) {
        declarations.push(`background-color:${rule.background}!important`);
      }
      if (rule.gradient && rule.gradient !== "NONE") {
        declarations.push(`background-image:${GRADIENTS[rule.gradient]}!important`);
      }
      if (rule.shadow) {
        declarations.push(`box-shadow:${SHADOWS[rule.shadow]}!important`);
      }
      if (rule.fontSize) {
        declarations.push(`font-size:${rule.fontSize}px!important`);
      }
      if (typeof rule.borderRadius === "number") {
        declarations.push(`border-radius:${rule.borderRadius}px!important`);
      }
      if (rule.width) {
        declarations.push(
          `width:${rule.width}%!important;max-width:${rule.width}%!important`,
        );
      }
      if (typeof rule.order === "number") {
        declarations.push(`order:${rule.order}!important`);
      }
      if (rule.columns) {
        declarations.push(
          `grid-template-columns:repeat(${rule.columns},minmax(0,1fr))!important`,
        );
      }
      if (declarations.length) {
        css.push(`${selector}{${declarations.join(";")}}`);
      }
      if (rule.hoverEffect && rule.hoverEffect !== "NONE") {
        css.push(`${selector}{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease!important}`);
        if (rule.hoverEffect === "LIFT") {
          css.push(`${selector}:hover{transform:translateY(-4px)!important}`);
        } else if (rule.hoverEffect === "SCALE") {
          css.push(`${selector}:hover{transform:scale(1.025)!important}`);
        } else {
          css.push(`${selector}:hover{filter:brightness(1.08)!important;box-shadow:0 0 0 1px rgba(126,87,240,.42),0 18px 50px rgba(126,87,240,.34)!important}`);
        }
      }
      if (rule.hiddenDesktop) {
        css.push(`@media(min-width:761px){${selector}{display:none!important}}`);
      }
      if (rule.hiddenMobile) {
        css.push(`@media(max-width:760px){${selector}{display:none!important}}`);
      }
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) continue;
      if (
        typeof rule.text === "string" &&
        element.childElementCount === 0 &&
        !["INPUT", "SELECT", "TEXTAREA", "IMG"].includes(element.tagName)
      ) {
        if (element.dataset.veOriginalText === undefined) {
          element.dataset.veOriginalText = element.textContent || "";
        }
        if (element.textContent !== rule.text) element.textContent = rule.text;
      }
      if (element instanceof HTMLImageElement && rule.imageUrl) {
        if (!element.dataset.veOriginalSrc) {
          element.dataset.veOriginalSrc = element.src;
        }
        if (element.src !== rule.imageUrl) element.src = rule.imageUrl;
      }
    }
    if (!styleElement.current) {
      styleElement.current = document.createElement("style");
      styleElement.current.dataset.visualEditorStyles = "true";
      document.head.appendChild(styleElement.current);
    }
    styleElement.current.textContent = css.join("\n");
  }, [rootSelector, screenId]);

  const scanElements = useCallback(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(CANDIDATES),
    ).filter(
      (element) =>
        !element.closest(".global-visual-editor-ui") &&
        !element.closest(".global-editor-text-layer") &&
        !element.closest(".pilot-mobile-overlay") &&
        element !== root,
    );
    for (const element of elements) {
      if (!element.dataset.veKey) {
        element.dataset.veKey =
          element.dataset.editorKey || makeElementKey(element, root);
      }
      element.draggable =
        canEdit &&
        active && !preview && !loading && !saving &&
        !element.classList.contains("global-editor-free-text") &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
    }
    applyConfig(configRef.current);
  }, [active, applyConfig, canEdit, rootSelector, preview, loading, saving]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/pilot/editor-visual?audience=${scope}&surface=${surface}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao carregar.");
        if (cancelled) return;
        const loaded = parseGlobalVisualConfig(result.config);
        configRef.current = loaded;
        setConfig(loaded);
        setSavedConfig(loaded);
        setCanSave(Boolean(result.canEdit));
        setLoading(false);
        setLoadFailed(false);
        setDirty(false);
        history.current = [];
        future.current = [];
        setCanUndo(false);
        setCanRedo(false);
        setCanSavePlatform(Boolean(result.canSavePlatform));
      })
      .catch((error) => { if (!cancelled) { setMessage(error.message, "error"); setLoading(false); setLoadFailed(true); } });
    return () => {
      cancelled = true;
    };
  }, [communityName, surface, scope, setMessage]); // Screen changes must preserve the in-progress draft.

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;
    root.dataset.visualEditorActive =
      canEdit && active && !preview ? "true" : "false";
    scanElements();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        scanElements();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, canEdit, rootSelector, scanElements, preview]);

  useEffect(() => () => { styleElement.current?.remove(); }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSelectedKey(""));
    return () => cancelAnimationFrame(frame);
  }, [screenId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const open = () => {
      if (!canEdit) return;
      setActive(true);
      setMinimized(false);
      setTab("screen");
      setSelectedKey("");
    };
    window.addEventListener("vinkulo:open-visual-editor", open);
    return () => window.removeEventListener("vinkulo:open-visual-editor", open);
  }, [canEdit]);

  const changeConfig = useCallback(
    (next: GlobalVisualConfig) => {
      if (loading || saving || loadFailed) return;
      if (JSON.stringify(next) === JSON.stringify(configRef.current)) return;
      history.current.push(configRef.current);
      if (history.current.length > 30) history.current.shift();
      setCanUndo(true);
      future.current = [];
      setCanRedo(false);
      setConfig(next);
      configRef.current = next;
      setDirty(JSON.stringify(next) !== JSON.stringify(savedConfig));
      applyConfig(next);
    },
    [applyConfig, savedConfig, loading, saving, loadFailed],
  );

  const updateRule = useCallback(
    (key: string, patch: Partial<VisualRule>) => {
      if (!key) return;
      const screen = target === "screen" ? screenId : null;
      const rules = screen ? configRef.current.screens[screen]?.rules || {} : configRef.current.rules;
      const currentRule = rules[key] || configRef.current.rules[key] || {};
      changeConfig(setVisualRules(configRef.current, screen, { ...rules, [key]: { ...currentRule, ...patch } }));
    },
    [changeConfig, target, screenId],
  );

  useEffect(() => {
    if (!active || !canEdit || preview || loading || saving || loadFailed) return;
    const targetScope = target;
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;
    let longPressTimer: number | null = null;
    let longPressTarget: HTMLElement | null = null;
    let suppressNextClick = false;
    const selectElement = (editable: HTMLElement) => {
      root
        .querySelectorAll("[data-ve-selected]")
        .forEach((element) => element.removeAttribute("data-ve-selected"));
      editable.dataset.veSelected = "true";
      setSelectedKey(editable.dataset.veKey || "");
      setSelectedLabel(describeElement(editable));
      setTab("object");
    };
    const click = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".global-visual-editor-ui, .global-editor-text-layer")) return;
      const editable = target.closest<HTMLElement>("[data-ve-key]");
      if (!editable || !root.contains(editable)) return;
      if (suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextClick = false;
        return;
      }
      if (navigationLocked) {
        event.preventDefault();
        event.stopPropagation();
        selectElement(editable);
        return;
      }
      const isMobile = window.matchMedia("(max-width: 760px)").matches;
      const isInteractive = Boolean(
        target.closest("button, a, input, select, textarea, summary"),
      );
      if (isMobile || (isInteractive && !(event as MouseEvent).altKey)) return;
      event.preventDefault();
      event.stopPropagation();
      selectElement(editable);
    };
    const pointerDown = (event: PointerEvent) => {
      if (navigationLocked) return;
      if (!window.matchMedia("(max-width: 760px)").matches) return;
      const target = event.target as HTMLElement;
      if (target.closest(".global-visual-editor-ui")) return;
      const editable = target.closest<HTMLElement>("[data-ve-key]");
      if (!editable || !root.contains(editable)) return;
      longPressTarget = editable;
      longPressTimer = window.setTimeout(() => {
        if (longPressTarget) {
          selectElement(longPressTarget);
          suppressNextClick = true;
        }
        longPressTimer = null;
      }, 480);
    };
    const clearLongPress = () => {
      if (longPressTimer !== null) window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressTarget = null;
    };
    const dragStart = (event: DragEvent) => {
      const eventTarget = event.target as HTMLElement;
      const target =
        eventTarget.closest<HTMLElement>("[data-ve-key]") ||
        eventTarget.closest<HTMLElement>("[data-editor-key]");
      if (!target || target.closest(".global-visual-editor-ui")) return;
      dragKey.current = target.dataset.veKey || "";
    };
    const dragOver = (event: DragEvent) => {
      if (dragKey.current) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const eventTarget = event.target as HTMLElement;
      const target =
        eventTarget.closest<HTMLElement>("[data-ve-key]") ||
        eventTarget.closest<HTMLElement>("[data-editor-key]");
      if (!target || !dragKey.current) return;
      event.preventDefault();
      const siblings = target.parentElement
        ? Array.from(target.parentElement.children).filter(
            (item): item is HTMLElement =>
              item instanceof HTMLElement && Boolean(item.dataset.veKey),
          )
        : [];
      const source = siblings.find(
        (item) => item.dataset.veKey === dragKey.current,
      );
      if (!source) {
        dragKey.current = "";
        return;
      }
      if (!target.parentElement || !["flex", "inline-flex", "grid", "inline-grid"].includes(getComputedStyle(target.parentElement).display)) {
        dragKey.current = "";
        setMessage("Este contêiner não oferece reorganização visual por arraste.");
        return;
      }
      const reordered = siblings.filter((item) => item !== source);
      const targetIndex = Math.max(0, reordered.indexOf(target));
      reordered.splice(targetIndex, 0, source);
      const screen = targetScope === "screen" ? screenId : null;
      const nextRules = { ...(screen ? configRef.current.screens[screen]?.rules : configRef.current.rules) };
      reordered.forEach((item, index) => {
        const key = item.dataset.veKey || "";
        if (!key) return;
        nextRules[key] = { ...(nextRules[key] || configRef.current.rules[key] || {}), order: index };
      });
      changeConfig(setVisualRules(configRef.current, screen, nextRules));
      dragKey.current = "";
    };
    root.addEventListener("click", click, true);
    root.addEventListener("pointerdown", pointerDown, true);
    root.addEventListener("pointerup", clearLongPress, true);
    root.addEventListener("pointercancel", clearLongPress, true);
    root.addEventListener("dragstart", dragStart, true);
    root.addEventListener("dragover", dragOver, true);
    root.addEventListener("drop", drop, true);
    return () => {
      root.removeEventListener("click", click, true);
      root.removeEventListener("pointerdown", pointerDown, true);
      root.removeEventListener("pointerup", clearLongPress, true);
      root.removeEventListener("pointercancel", clearLongPress, true);
      root.removeEventListener("dragstart", dragStart, true);
      root.removeEventListener("dragover", dragOver, true);
      root.removeEventListener("drop", drop, true);
    };
  }, [active, canEdit, changeConfig, navigationLocked, rootSelector, preview, loading, saving, loadFailed, target, screenId, setMessage]);

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(configRef.current);
    setCanRedo(true);
    setCanUndo(history.current.length > 0);
    setConfig(previous);
    configRef.current = previous;
    setDirty(JSON.stringify(previous) !== JSON.stringify(savedConfig));
    applyConfig(previous);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(configRef.current);
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
    setConfig(next);
    configRef.current = next;
    setDirty(JSON.stringify(next) !== JSON.stringify(savedConfig));
    applyConfig(next);
  }

  function cancel() {
    setConfig(savedConfig);
    configRef.current = savedConfig;
    setDirty(false);
    history.current = [];
    future.current = [];
    setCanRedo(false);
    setCanUndo(false);
    setSelectedKey("");
    applyConfig(savedConfig);
    setMessage("Alterações descartadas");
  }

  function closeEditor() {
    // Closing the inspector keeps its draft; only Discard explicitly destroys it.
    setActive(false);
    setMinimized(false);
    setSelectedKey("");
    setPreview(false);
  }

  async function save() {
    if (saving || loading || loadFailed || !canSave) return;
    if (configRef.current.textBoxes.some((box) => box.kind === "link" && !safeVisualHref(box.href))) {
      setMessage("Informe um destino HTTPS ou caminho interno válido para cada bloco de link.", "error");
      return;
    }
    setSaving(true);
    setMessage("Salvando...");
    try {
    const response = await fetch("/api/pilot/editor-visual", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, config, surface }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Não foi possível salvar.", "error");
      return;
    }
    const saved = parseGlobalVisualConfig(result.config);
    configRef.current = saved;
    setSavedConfig(saved);
    setConfig(saved);
    applyConfig(saved);
    setDirty(false);
    history.current = [];
    setCanUndo(false);
    future.current = [];
    setCanRedo(false);
    setMessage("Visual salvo. O editor continua aberto.", "success");
    } catch {
      setMessage("Falha de conexão. Seu rascunho foi mantido; tente salvar novamente.", "error");
    } finally { setSaving(false); }
  }

  function addTextBox(kind: "text" | "callout" | "link" = "text") {
    if (configRef.current.textBoxes.length >= 80) { setMessage("Limite de 80 blocos atingido."); return; }
    const root = rootElement;
    if (!root) {
      setMessage("Não foi possível localizar esta tela para inserir o texto.", "error");
      return;
    }
    const rect = root.getBoundingClientRect();
    const rootHeight = Math.max(root.scrollHeight, rect.height, 1);
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    const rootTop = window.scrollY + rect.top;
    const id = `text-${crypto.randomUUID()}`;
    const textBox: VisualTextBox = {
      id,
      screen: screenId,
      kind,
      text: kind === "callout" ? "Informação importante para a comunidade." : kind === "link" ? "Acessar conteúdo" : "Escreva seu texto aqui.",
      ...(kind === "link" ? { href: "/" } : {}),
      x: 12,
      y: clamp(((viewportCenter - rootTop) / rootHeight) * 100, 2, 92),
      width: 32,
      fontSize: 18,
      color: "#172033",
      background: kind === "callout" ? "#f5f3ed" : "#ffffff",
    };
    changeConfig({
      ...configRef.current,
      textBoxes: [...configRef.current.textBoxes, textBox],
    });
    setSelectedKey(`textbox:${id}`);
    setSelectedLabel("Caixa de texto");
    setTab("object");
    setMessage("Caixa adicionada. Arraste para posicionar.");
  }

  const updateTextBox = useCallback(
    (id: string, patch: Partial<VisualTextBox>) => {
      changeConfig({
        ...configRef.current,
        textBoxes: configRef.current.textBoxes.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      });
    },
    [changeConfig],
  );

  const deleteTextBox = useCallback(
    (id: string) => {
      changeConfig({
        ...configRef.current,
        removedTextBoxIds: [...configRef.current.removedTextBoxIds, id],
        textBoxes: configRef.current.textBoxes.filter(
          (item) => item.id !== id,
        ),
      });
      setSelectedKey("");
      setSelectedLabel("Tela atual");
      setMessage("Caixa de texto removida. Salve para confirmar.");
    },
    [changeConfig, setMessage],
  );

  function resetSelectedAppearance() {
    if (!selectedKey || selectedTextBox) return;
    const screen = target === "screen" ? screenId : null;
    const rules = screen ? configRef.current.screens[screen]?.rules || {} : configRef.current.rules;
    changeConfig(setVisualRules(configRef.current, screen, { ...rules, [selectedKey]: {} }));
    setMessage("Ajustes do objeto restaurados neste alcance de edição.");
  }

  function resetAllColors() {
    updateAppearance({ accentColor: DEFAULT_GLOBAL_VISUAL_CONFIG.accentColor, surfaceColor: "" });
    setMessage("Paleta restaurada no alcance selecionado.");
  }

  function updateAppearance(patch: Partial<VisualAppearance>) {
    const current = configRef.current;
    changeConfig(target === "global" ? { ...current, ...patch } : {
      ...current, screens: { ...current.screens, [screenId]: { rules: current.screens[screenId]?.rules || {}, appearance: { ...current.screens[screenId]?.appearance, ...patch } } },
    });
  }

  function beginTextBoxDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    textBox: VisualTextBox,
  ) {
    if (!canEdit || !active || preview || saving || loading || loadFailed || event.button !== 0) return;
    const root = rootElement;
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = root.getBoundingClientRect();
    history.current.push(configRef.current);
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
    future.current = [];
    setCanRedo(false);
    setDirty(true);
    setSelectedKey(`textbox:${textBox.id}`);
    setSelectedLabel("Caixa de texto");
    setTab("object");
    textBoxDrag.current = {
      pointerId: event.pointerId,
      id: textBox.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: textBox.x,
      originY: textBox.y,
      rootWidth: Math.max(rect.width, 1),
      rootHeight: Math.max(root.scrollHeight, rect.height, 1),
    };
  }

  function moveTextBox(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = textBoxDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = clamp(
      drag.originX + ((event.clientX - drag.startX) / drag.rootWidth) * 100,
      0,
      96,
    );
    const nextY = clamp(
      drag.originY + ((event.clientY - drag.startY) / drag.rootHeight) * 100,
      0,
      96,
    );
    const next = {
      ...configRef.current,
      textBoxes: configRef.current.textBoxes.map((item) =>
        item.id === drag.id ? { ...item, x: nextX, y: nextY } : item,
      ),
    };
    configRef.current = next;
    setConfig(next);
  }

  function finishTextBoxDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (textBoxDrag.current?.pointerId !== event.pointerId) return;
    textBoxDrag.current = null;
    if (JSON.stringify(history.current.at(-1)) === JSON.stringify(configRef.current)) {
      history.current.pop();
      setCanUndo(history.current.length > 0);
    }
    setDirty(JSON.stringify(configRef.current) !== JSON.stringify(savedConfig));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button, input, select, textarea")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panelDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
    };
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = {
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    };
    setPanelPosition(
      clampPanelPosition(next, minimized, panelRef.current),
    );
  }

  function finishPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (panelDrag.current?.pointerId !== event.pointerId) return;
    panelDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const effectiveConfig = useMemo(() => resolveVisualConfig(config, screenId), [config, screenId]);
  const appearance = target === "global" ? config : effectiveConfig;
  const rule = useMemo(
    () => (selectedKey ? (target === "global" ? config : effectiveConfig).rules[selectedKey] || {} : {}),
    [config, effectiveConfig, selectedKey, target],
  );
  const selectedTextBox = selectedKey.startsWith("textbox:")
    ? config.textBoxes.find(
        (item) => item.id === selectedKey.slice("textbox:".length),
      ) || null
    : null;
  const selectedElement =
    typeof document === "undefined" || !selectedKey
      ? null
      : document.querySelector<HTMLElement>(
          `[data-ve-key="${CSS.escape(selectedKey)}"]`,
        );
  const selectedParent = selectedElement?.parentElement?.closest<HTMLElement>(
    "[data-ve-key]",
  ) || null;
  const selectedChildren = selectedElement
    ? Array.from(selectedElement.children).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && Boolean(element.dataset.veKey),
      ).slice(0, 24)
    : [];
  const selectEditorElement = useCallback(
    (key: string) => {
      if (!key || typeof document === "undefined") return;
      const root = document.querySelector<HTMLElement>(rootSelector);
      const element = root
        ? Array.from(root.querySelectorAll<HTMLElement>("[data-ve-key]")).find(
            (candidate) => candidate.dataset.veKey === key,
          )
        : null;
      if (!element) return;
      root?.querySelectorAll("[data-ve-selected]").forEach((item) =>
        item.removeAttribute("data-ve-selected"),
      );
      element.dataset.veSelected = "true";
      setSelectedKey(key);
      setSelectedLabel(describeElement(element));
      setTab("object");
    },
    [rootSelector],
  );
  const textEditable = Boolean(
    !selectedTextBox &&
      selectedElement &&
      selectedElement.childElementCount === 0 &&
      !["INPUT", "SELECT", "TEXTAREA", "IMG"].includes(
        selectedElement.tagName,
      ),
  );
  const textColorEditable = Boolean(
    selectedElement &&
      ["A", "BUTTON", "H1", "H2", "H3", "P", "SPAN", "STRONG", "SMALL", "LI", "TD", "TH", "LABEL"].includes(
        selectedElement.tagName,
      ),
  );
  const backgroundEditable = Boolean(
    selectedElement &&
      !["H1", "H2", "H3", "P", "SPAN", "STRONG", "SMALL", "LI", "TD", "TH", "LABEL"].includes(
        selectedElement.tagName,
      ),
  );

  useEffect(() => {
    if (!active || preview || saving || !selectedTextBox) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], .global-visual-editor-ui",
        )
      ) {
        return;
      }
      event.preventDefault();
      deleteTextBox(selectedTextBox.id);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [active, deleteTextBox, selectedTextBox, preview, saving]);

  const pencilButton = (
    <button
      type="button"
      className={`global-editor-pencil ${active ? "active" : ""}`}
      onClick={() => {
        setActive(true);
        setMinimized(false);
        setTab("screen");
        setSelectedKey("");
      }}
      aria-label="Abrir Aparência"
      title="Aparência"
    >
      <span aria-hidden="true">✎</span>
    </button>
  );

  const visibleTextBoxes = config.textBoxes.filter(
    (textBox) => textBox.screen === screenId,
  );

  return (
    <>
      {canEdit &&
        toolbarElement &&
        createPortal(pencilButton, toolbarElement)}
      {rootElement &&
        createPortal(
          <div className="global-editor-text-layer ve-block-layer" aria-label="Blocos personalizados">
            {visibleTextBoxes.map((textBox) => (
              <div
                key={textBox.id}
                className={`global-editor-free-text ve-block ve-block-${textBox.kind || "text"} ${
                  active && !preview && selectedKey === `textbox:${textBox.id}` ? "selected" : ""
                }`}
                data-ve-key={`textbox:${textBox.id}`}
                data-editor-key={`textbox:${textBox.id}`}
                style={
                  {
                    left: `${textBox.x}%`,
                    top: `${textBox.y}%`,
                    width: `${Math.min(textBox.width, 100 - textBox.x)}%`,
                    color: textBox.color,
                    background: textBox.background,
                    fontSize: `${textBox.fontSize}px`,
                  } as CSSProperties
                }
                onPointerDown={(event) => beginTextBoxDrag(event, textBox)}
                onPointerMove={moveTextBox}
                onPointerUp={finishTextBoxDrag}
                onPointerCancel={finishTextBoxDrag}
              >
                {textBox.kind === "link" && safeVisualHref(textBox.href) ? <a href={safeVisualHref(textBox.href)} onClick={(event) => { if (active && !preview) { event.preventDefault(); setSelectedKey(`textbox:${textBox.id}`); setTab("object"); } }}>{textBox.text} <span aria-hidden="true">↗</span></a> : textBox.text}
              </div>
            ))}
          </div>,
          rootElement,
        )}
      <div className="global-visual-editor-ui ve-studio">

      {canEdit && active && (
        <aside
          ref={panelRef}
          className={`global-editor-panel ${minimized ? "is-minimized" : ""}`}
          aria-label="Aparência"
          style={
            {
              left: `${panelPosition.x}px`,
              top: `${panelPosition.y}px`,
            } as CSSProperties
          }
        >
          <header
            className="global-editor-drag-handle"
            onPointerDown={beginPanelDrag}
            onPointerMove={movePanel}
            onPointerUp={finishPanelDrag}
            onPointerCancel={finishPanelDrag}
          >
            <div>
              <span aria-hidden="true">✎</span>
              <div>
                <strong>Estúdio visual</strong>
                {!minimized && <small>{communityName}</small>}
              </div>
            </div>
            <div className="global-editor-window-actions">
              {minimized ? (
                <button
                  type="button"
                  onClick={() => setMinimized(false)}
                  aria-label="Restaurar editor"
                  title="Restaurar"
                >
                  □
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label="Minimizar editor"
                  title="Minimizar"
                >
                  −
                </button>
              )}
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Fechar editor e manter rascunho"
                title="Fechar e manter rascunho"
              >
                ×
              </button>
            </div>
          </header>
          {!minimized && <>
            <div className="ve-context">
              <div className="ve-eyebrow">01 · Onde editar</div>
              <div className="ve-segmented" aria-label="Alcance da edição">
                <button type="button" aria-pressed={target === "screen"} onClick={() => setTarget("screen")}>Tela atual</button>
                <button type="button" aria-pressed={target === "global"} onClick={() => setTarget("global")}>Global</button>
              </div>
              <p>{target === "screen" ? "Ajustes exclusivos desta tela; têm prioridade sobre o visual global." : "Base visual compartilhada entre telas. Ajustes locais têm prioridade."}</p>
              <span className="ve-screen-label">{target === "screen" ? screenLabel : "Todas as telas"}</span>
            </div>
            <div className="ve-command-bar">
              <button type="button" onClick={undo} disabled={!canUndo || saving || loading} title="Desfazer última alteração">↶ Desfazer</button>
              <button type="button" onClick={redo} disabled={!canRedo || saving || loading} title="Refazer alteração">↷ Refazer</button>
              <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Voltar a editar" : "Ver prévia"}</button>
            </div>
          </>}
          {!minimized && (
            <button
              type="button"
              className={`global-editor-navigation-lock ${navigationLocked ? "locked" : ""}`}
              onClick={() => setNavigationLocked((current) => !current)}
              aria-pressed={navigationLocked}
              disabled={preview}
            >
              {navigationLocked
                ? "Seleção ativa · clique em um elemento da página"
                : "Navegação livre · Alt + clique para selecionar"}
            </button>
          )}
          {!minimized && <div className="global-editor-tabs">
            <button
              type="button"
              className={tab === "object" ? "active" : ""}
              onClick={() => setTab("object")}
            >
              Elemento
            </button>
            <button
              type="button"
              className={tab === "screen" ? "active" : ""}
              onClick={() => setTab("screen")}
            >
              Aparência
            </button>
            <button type="button" className={tab === "insert" ? "active" : ""} onClick={() => setTab("insert")}>Inserir blocos</button>
          </div>}

          {!minimized && <fieldset className="global-editor-body" disabled={saving || loading || loadFailed || preview || !canSave}>
            {preview && <p className="ve-notice">Prévia interativa do rascunho. Volte a editar para ajustar; salve para persistir.</p>}
            {loading && <p role="status">Carregando o visual deste público…</p>}
            {tab === "object" ? (
              selectedKey ? (
                <>
                  <section>
                    <span>Objeto selecionado</span>
                    <strong>{selectedLabel}</strong>
                    <small>
                      {selectedTextBox ? "Bloco exclusivo desta tela." : target === "screen" ? "Você está alterando este elemento somente nesta tela." : "A regra vale para elementos com a mesma identificação nas telas."}
                    </small>
                    {selectedParent && (
                      <button
                        type="button"
                        className="global-editor-secondary-action"
                        onClick={() =>
                          selectEditorElement(selectedParent.dataset.veKey || "")
                        }
                      >
                        Selecionar cartão pai
                      </button>
                    )}
                    {selectedChildren.length > 0 && (
                      <label>
                        Subselecionar cartão
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            selectEditorElement(event.target.value);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Escolha um item interno…</option>
                          {selectedChildren.map((child) => (
                            <option value={child.dataset.veKey || ""} key={child.dataset.veKey || "child"}>
                              {describeElement(child)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </section>
                  {selectedTextBox && (
                    <>
                      <section>
                        <h3>Caixa de texto</h3>
                        <label>
                          Texto
                          <textarea
                            value={selectedTextBox.text}
                            maxLength={500}
                            onChange={(event) =>
                              updateTextBox(selectedTextBox.id, {
                                text: event.target.value,
                              })
                            }
                          />
                        </label>
                        {selectedTextBox.kind === "link" && <label>Destino do link
                          <input type="url" value={selectedTextBox.href || ""} maxLength={600} placeholder="https://… ou /caminho" onChange={(event) => updateTextBox(selectedTextBox.id, { href: event.target.value })} aria-invalid={!safeVisualHref(selectedTextBox.href)} />
                          <small>{safeVisualHref(selectedTextBox.href) ? "Destino válido. O link funciona fora do modo de seleção." : "Use HTTPS ou um caminho interno iniciado por /."}</small>
                        </label>}
                        <small>
                          Arraste a caixa diretamente pela tela para posicionar.
                        </small>
                      </section>
                      <section>
                        <h3>Aparência</h3>
                        <div className="global-editor-color-grid">
                          <label>
                            Texto
                            <ColorPresetSelect
                              value={selectedTextBox.color}
                              onChange={(event) =>
                                updateTextBox(selectedTextBox.id, {
                                  color: event,
                                })
                              }
                            />
                          </label>
                          <label>
                            Fundo
                            <ColorPresetSelect
                              value={selectedTextBox.background}
                              onChange={(value) =>
                                updateTextBox(selectedTextBox.id, {
                                  background: value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          Tamanho do texto: {selectedTextBox.fontSize}px
                          <input
                            type="range"
                            min="8"
                            max="72"
                            value={selectedTextBox.fontSize}
                            onChange={(event) =>
                              updateTextBox(selectedTextBox.id, {
                                fontSize: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <div className="global-editor-color-grid">{(["x", "y"] as const).map((axis) => <label key={axis}>{axis === "x" ? "Posição horizontal" : "Posição vertical"}: {Math.round(selectedTextBox[axis])}%
                          <input type="range" min="0" max="96" value={selectedTextBox[axis]} onChange={(event) => updateTextBox(selectedTextBox.id, { [axis]: Number(event.target.value) })} />
                        </label>)}</div>
                        <button type="button" className="global-editor-reset" onClick={() => updateTextBox(selectedTextBox.id, { color: "#172033", background: "#ffffff", width: 32, fontSize: 18 })}>Restaurar aparência do bloco</button>
                        <label>
                          Largura: {Math.round(selectedTextBox.width)}%
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={selectedTextBox.width}
                            onChange={(event) =>
                              updateTextBox(selectedTextBox.id, {
                                width: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </section>
                      <section>
                        <h3>Remover</h3>
                        <p>
                          Pressione Delete no computador ou use o botão abaixo.
                        </p>
                        <button
                          type="button"
                          className="global-editor-delete"
                          onClick={() => deleteTextBox(selectedTextBox.id)}
                        >
                          Excluir caixa de texto
                        </button>
                      </section>
                    </>
                  )}
                  {!selectedTextBox && textEditable && (
                    <section>
                      <h3>Conteúdo</h3>
                      <label>
                        Texto
                        <textarea
                          value={
                            rule.text ??
                            selectedElement?.textContent ??
                            ""
                          }
                          maxLength={500}
                          onChange={(event) =>
                            updateRule(selectedKey, {
                              text: event.target.value,
                            })
                          }
                        />
                        <small>Edite até 500 caracteres. A alteração é aplicada na prévia imediatamente.</small>
                      </label>
                    </section>
                  )}
                  {!selectedTextBox && <section>
                    <h3>Aparência</h3>
                    <div className="global-editor-color-grid">
                      {textColorEditable && <label>
                        Texto
                        <ColorPresetSelect
                          value={rule.color || "#172033"}
                          onChange={(value) =>
                            updateRule(selectedKey, {
                              color: value,
                            })
                          }
                        />
                      </label>}
                      {backgroundEditable && <label>
                        Fundo
                        <ColorPresetSelect
                          value={rule.background || "#ffffff"}
                          onChange={(value) =>
                            updateRule(selectedKey, {
                              background: value,
                            })
                          }
                        />
                      </label>}
                    </div>
                    <label>
                      Tamanho do texto
                      <input
                        type="range"
                        min="8"
                        max="48"
                        value={rule.fontSize || 16}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            fontSize: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Arredondamento
                      <input
                        type="range"
                        min="0"
                        max="48"
                        value={rule.borderRadius ?? 16}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            borderRadius: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Sombra
                      <select
                        value={rule.shadow || "NONE"}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            shadow: event.target.value as VisualRule["shadow"],
                          })
                        }
                      >
                        <option value="NONE">Sem sombra</option>
                        <option value="SOFT">Suave</option>
                        <option value="MEDIUM">Média</option>
                        <option value="GLOW">Brilho moderno</option>
                      </select>
                    </label>
                    <label>
                      Efeito ao passar o mouse
                      <select
                        value={rule.hoverEffect || "NONE"}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            hoverEffect: event.target.value as VisualRule["hoverEffect"],
                          })
                        }
                      >
                        <option value="NONE">Nenhum</option>
                        <option value="LIFT">Elevar</option>
                        <option value="GLOW">Iluminar</option>
                        <option value="SCALE">Ampliar suavemente</option>
                      </select>
                    </label>
                    <label>
                      Gradiente
                      <select
                        value={rule.gradient || "NONE"}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            gradient: event.target.value as VisualRule["gradient"],
                          })
                        }
                      >
                        <option value="NONE">Sem gradiente</option>
                        <option value="PURPLE_GOLD">Violeta e dourado</option>
                        <option value="PURPLE_BLUE">Violeta e azul</option>
                        <option value="OCEAN">Oceano</option>
                        <option value="SUNSET">Pôr do sol</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="global-editor-reset"
                      onClick={resetSelectedAppearance}
                    >
                      Restaurar todos os ajustes do elemento
                    </button>
                  </section>}
                  {!selectedTextBox && <section>
                    <h3>Dimensões e organização</h3>
                    {selectedElement && getComputedStyle(selectedElement).display.includes("grid") && <label>
                      Quantidade de colunas
                      <select
                        value={rule.columns || 1}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            columns: Number(event.target.value),
                          })
                        }
                      >
                        {[1, 2, 3, 4, 5, 6].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>}
                    <label>
                      Largura: {rule.width || 100}%
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={rule.width || 100}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            width: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </section>}
                  {typeof HTMLImageElement !== "undefined" && selectedElement instanceof HTMLImageElement && (
                    <section>
                      <h3>Imagem</h3>
                      <NativeImageUpload
                        label="Trocar imagem"
                        value={rule.imageUrl || selectedElement.src || ""}
                        purpose="visual-editor-image"
                        onChange={(imageUrl) =>
                          updateRule(selectedKey, { imageUrl })
                        }
                      />
                    </section>
                  )}
                  {!selectedTextBox && <section>
                    <h3>Visibilidade</h3>
                    <label className="global-editor-check">
                      <input
                        type="checkbox"
                        checked={!rule.hiddenDesktop}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            hiddenDesktop: !event.target.checked,
                          })
                        }
                      />
                      Mostrar no computador
                    </label>
                    <label className="global-editor-check">
                      <input
                        type="checkbox"
                        checked={!rule.hiddenMobile}
                        onChange={(event) =>
                          updateRule(selectedKey, {
                            hiddenMobile: !event.target.checked,
                          })
                        }
                      />
                      Mostrar no celular
                    </label>
                    <button
                      type="button"
                      className="global-editor-delete"
                      onClick={() => {
                        updateRule(selectedKey, {
                          hiddenDesktop: true,
                          hiddenMobile: true,
                        });
                        setMessage(
                          "Elemento oculto neste alcance. Restaure os ajustes para mostrá-lo novamente.",
                        );
                      }}
                    >
                      Ocultar neste alcance
                    </button>
                    <small>
                      Oculta apenas a apresentação. Dados e permissões do aplicativo permanecem iguais.
                    </small>
                  </section>}
                </>
              ) : (
                <section className="global-editor-empty">
                  <span>✦</span>
                  <h3>Selecione um elemento da página</h3>
                  <p>
                    Clique no computador ou mantenha pressionado no celular
                    sobre menus, textos, botões, imagens, formulários ou áreas
                    da tela.
                  </p>
                  <small>
                    Com o cadeado ativo, cliques selecionam os elementos sem
                    abrir páginas. Libere a navegação no botão acima quando
                    quiser usar os links normalmente.
                  </small>
                </section>
              )
            ) : tab === "insert" ? (
              <>
                <section>
                  <span className="ve-eyebrow">Biblioteca de blocos</span>
                  <h3>Um novo espaço para sua mensagem</h3>
                  <p>Os blocos são inseridos somente em <strong>{screenLabel}</strong>, inclusive quando o alcance global está selecionado.</p>
                  <div className="ve-template-grid">
                    <button type="button" onClick={() => addTextBox("text")}><b aria-hidden="true">Tt</b><strong>Texto</strong><small>Título, legenda ou orientação.</small></button>
                    <button type="button" onClick={() => addTextBox("callout")}><b aria-hidden="true">!</b><strong>Aviso</strong><small>Uma mensagem em destaque.</small></button>
                    <button type="button" onClick={() => addTextBox("link")}><b aria-hidden="true">↗</b><strong>Link</strong><small>Acesso a uma página ou recurso.</small></button>
                  </div>
                  <small>Blocos visuais posicionáveis. Não criam formulários, automações ou funções do aplicativo.</small>
                </section>
                <section>
                  <h3>Blocos nesta tela · {visibleTextBoxes.length}</h3>
                  {visibleTextBoxes.length ? visibleTextBoxes.map((box) => <button className="ve-layer-row" type="button" key={box.id} onClick={() => { setSelectedKey(`textbox:${box.id}`); setSelectedLabel(box.text.slice(0, 56)); setTab("object"); }}>{box.kind === "link" ? "↗" : box.kind === "callout" ? "!" : "Tt"} · {box.text || "Bloco sem texto"}</button>) : <p>Nenhum bloco adicionado nesta tela.</p>}
                </section>
              </>
            ) : (
              <>
                <section>
                  <h3>{target === "global" ? "Identidade global" : "Identidade desta tela"}</h3>
                  <div className="global-editor-color-grid">
                    <label>
                      Destaque
                      <ColorPresetSelect
                        value={appearance.accentColor}
                        onChange={(value) =>
                          updateAppearance({
                            accentColor: value,
                          })
                        }
                      />
                    </label>
                    {!rootElement?.classList.contains("pilot-dashboard") && <label>
                      Superfície
                      <ColorPresetSelect
                        value={appearance.surfaceColor || "#ffffff"}
                        onChange={(value) =>
                          updateAppearance({
                            surfaceColor: value,
                          })
                        }
                      />
                    </label>}
                  </div>
                  <label>
                    Escala dos textos · {Math.round(appearance.textScale * 100)}%
                    <input
                      type="range"
                      min="0.8"
                      max="1.3"
                      step="0.05"
                      value={appearance.textScale}
                      onChange={(event) =>
                        updateAppearance({
                          textScale: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Arredondamento · {appearance.radius}px
                    <input
                      type="range"
                      min="0"
                      max="28"
                      value={appearance.radius}
                      onChange={(event) =>
                        updateAppearance({
                          radius: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="global-editor-reset"
                    onClick={resetAllColors}
                  >
                    Restaurar paleta
                  </button>
                </section>
                <section>
                  <h3>Modo de exibição</h3>
                  <div className="global-editor-choice-grid">
                    {(["compact", "comfortable", "expanded"] as const).map(
                      (density) => (
                        <button
                          type="button"
                          key={density}
                          className={
                            appearance.density === density ? "active" : ""
                          }
                          onClick={() =>
                            updateAppearance({ density })
                          }
                        >
                          {density === "compact"
                            ? "Compacto"
                            : density === "expanded"
                              ? "Expandido"
                              : "Confortável"}
                        </button>
                      ),
                    )}
                  </div>
                </section>
                <section>
                  <h3>Ajustes do elemento</h3>
                  <p>Selecione um elemento da página para editar texto, imagem, cores, dimensões e visibilidade.</p>
                  <small>A reorganização por arraste funciona entre irmãos em contêineres flex ou grid. Textos com conteúdo interno e campos de dados não são substituídos.</small>
                  <small>Este editor altera conteúdo e apresentação. Permissões, dados de negócio e regras do aplicativo não são alterados.</small>
                </section>
              </>
            )}
          </fieldset>}

          {!minimized && <footer>
            <label>
              <span className="ve-eyebrow">02 · Quem verá ao salvar</span>
              <select
                value={scope}
                disabled={surface === "public" || dirty || loading || saving}
                onChange={(event) =>
                  { setLoading(true); setMessage(""); setSelectedKey(""); setScope(event.target.value as SaveScope); }
                }
              >
                {surface !== "public" && (
                  <option value="PERSONAL">Somente eu · pessoal</option>
                )}
                {surface !== "public" && (
                  <option value="COMMUNITY">Membros desta comunidade</option>
                )}
                {(canSavePlatform || surface === "public") && (
                  <option value="PLATFORM">Toda a plataforma</option>
                )}
              </select>
            </label>
            <small className="ve-save-context">{dirty ? "Rascunho não salvo · salve ou descarte antes de trocar o público." : "Sem alterações pendentes. O público é independente da tela escolhida."}</small>
            <div>
              <button type="button" onClick={cancel} disabled={!dirty || saving || loading}>
                Descartar
              </button>
              <button
                type="button"
                className="global-editor-save"
                onClick={() => void save()}
                disabled={!dirty || saving || loading || loadFailed || !canSave || (scope === "PLATFORM" && !canSavePlatform)}
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </footer>}
        </aside>
      )}
      </div>
      {message && <TransientFeedback className={`operations-feedback ${messageTone === "error" ? "error" : ""}`} tone={messageTone} role={messageTone === "error" ? "alert" : "status"}>{message}</TransientFeedback>}
    </>
  );
}

function ColorPresetSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const known = SAFE_COLORS.some(([color]) => color === value);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {!known && <option value={value}>Cor atual</option>}
      {SAFE_COLORS.map(([color, label]) => (
        <option value={color} key={color}>
          {label}
        </option>
      ))}
    </select>
  );
}

function defaultPanelPosition(): PanelPosition {
  if (typeof window === "undefined") return { x: 16, y: 16 };
  const width = window.innerWidth <= 760
    ? Math.min(420, window.innerWidth - 16)
    : 420;
  return {
    x: Math.max(8, window.innerWidth - width - 16),
    y: window.innerWidth <= 760 ? 88 : 16,
  };
}

function clampPanelPosition(
  position: PanelPosition,
  minimized: boolean,
  panel?: HTMLElement | null,
): PanelPosition {
  if (typeof window === "undefined") return position;
  const fallbackWidth = minimized ? 270 : Math.min(420, window.innerWidth - 16);
  const fallbackHeight = minimized
    ? 66
    : Math.min(720, window.innerHeight - 32);
  const width = panel?.offsetWidth || fallbackWidth;
  const height = panel?.offsetHeight || fallbackHeight;
  return {
    x: Math.round(
      Math.min(
        Math.max(8, position.x),
        Math.max(8, window.innerWidth - width - 8),
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(8, position.y),
        Math.max(8, window.innerHeight - height - 8),
      ),
    ),
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function makeElementKey(element: HTMLElement, root: HTMLElement) {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root && parts.length < 6) {
    const className = Array.from(current.classList)
      .find((item) => !item.startsWith("active") && !item.startsWith("is-"))
      ?.replace(/[^a-zA-Z0-9_-]/g, "");
    const base = `${current.tagName.toLowerCase()}${className ? `-${className}` : ""}`;
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (sibling) =>
            sibling.tagName === current?.tagName &&
            (!className || sibling.classList.contains(className)),
        )
      : [];
    parts.unshift(`${base}:${Math.max(0, siblings.indexOf(current))}`);
    current = current.parentElement;
  }
  return parts.join("--").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180);
}

function describeElement(element: HTMLElement) {
  const text = (element.textContent || "").trim().replace(/\s+/g, " ");
  if (text) return text.slice(0, 56);
  if (element instanceof HTMLImageElement) return "Imagem";
  if (element instanceof HTMLInputElement) return "Campo de formulário";
  return (
    element.getAttribute("aria-label") ||
    element.classList[0] ||
    element.tagName.toLocaleLowerCase("pt-BR")
  );
}
