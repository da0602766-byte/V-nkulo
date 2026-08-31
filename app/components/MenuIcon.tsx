/* Ícones do trilho, em traçado de 1,6px.
   Vivia dentro de PilotDashboard.tsx e não era exportado, então a área do
   proprietário seguia com glifos tipográficos (▦ ◫ ◇ ◎ ✓ ! ✦ ▥ ↻ ⚙) mesmo
   depois de a V5 tê-los removido do painel. Duplicar o conjunto criaria duas
   verdades sobre o mesmo ícone; extrair mantém uma. */

export type MenuIconId =
  | "inicio"
  | "fio"
  | "eventos"
  | "ministerios"
  | "escalas"
  | "diaconia"
  | "solicitacoes"
  | "visitantes"
  | "celulas"
  | "estacionamento"
  | "membro"
  | "lider"
  | "pessoas"
  | "mural"
  | "comunidade"
  | "continuidade"
  | "redes"
  | "pastoral"
  | "mensagens"
  | "conta"
  | "visual-editor"
  // A partir daqui, os da área do proprietário.
  | "painel-geral"
  | "auditoria"
  | "feedback"
  | "editorial"
  | "estatisticas"
  | "otimizacao"
  | "configuracoes"
  | "aparencia"
  | "publicacoes"
  | "ensaio";

const PATHS: Partial<Record<MenuIconId, string>> = {
  inicio: "M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5v-8Z",
  fio: "M6 5h.01M6 12h.01M6 19h.01M11 5h9M11 12h9M11 19h6",
  eventos: "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 6h14M8 2v4m8-4v4",
  ministerios: "M12 3v18m-7-9h14M7 7h10v10H7z",
  escalas: "M7 4h10v3H7V4Zm-2 2h14v15H5V6Zm3 6 2 2 4-4m-6 7h7",
  diaconia: "M6 20v-8a6 6 0 0 1 12 0v8M9 8a3 3 0 1 1 6 0",
  solicitacoes: "M12 21s-8-4.4-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.6-8 11-8 11Z",
  visitantes: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m9-2v6m3-3h-6",
  celulas: "M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 0v18M4 7l8 4 8-4",
  estacionamento: "M7 21V3h6a5 5 0 0 1 0 10H7m0-4h6a1 1 0 0 0 0-2H7",
  membro: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  lider: "M12 3 3 8l3 13h12l3-13-9-5Zm0 0v18",
  pessoas: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8 1a4 4 0 0 1 4 4v2m-4-18a4 4 0 0 1 0 8",
  mural: "M4 5h16v14H4V5Zm3 3h4v4H7V8Zm7 0h3m-3 3h3M7 15h10",
  comunidade: "M4 7h10m4 0h2M14 5v4M4 17h2m4 0h10M8 15v4M4 12h4m4 0h8M10 10v4",
  continuidade: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  redes: "M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 22v-2a7 7 0 0 1 14 0v2",
  pastoral: "M12 3v18M8 7h8M5 21h14a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2Z",
  mensagens: "M20 15.2A2.8 2.8 0 0 1 17.2 18H8l-4 3V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v8.4Z",
  conta: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  "visual-editor": "m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Zm9-13 4 4",

  // Proprietário. "solicitacoes" e "pessoas" são reaproveitados das linhas
  // acima: são a mesma coisa vista de outra altura.
  "painel-geral": "M4 4h7v7H4V4Zm9 0h7v4h-7V4ZM4 13h7v7H4v-7Zm9-3h7v10h-7V10Z",
  auditoria: "M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Zm-3 9 2.2 2.2L15.5 10",
  feedback: "M20 15.2A2.8 2.8 0 0 1 17.2 18H8l-4 3V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v8.4ZM12 8v4m0 3h.01",
  editorial: "M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5 10.1 12.8 4.5 10.9 10.1 9 12 3.5ZM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z",
  estatisticas: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  otimizacao: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5M12 8v4l2.5 2.5",
  configuracoes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.9-1.7L14.2 2H9.8l-.4 2.7a8 8 0 0 0-2.9 1.7l-2.3-1-2 3.4 2 1.5a8 8 0 0 0 0 3.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.9 1.7l.4 2.7h4.4l.4-2.7a8 8 0 0 0 2.9-1.7l2.3 1 2-3.4-2-1.5c.1-.6.2-1.1.2-1.7Z",
  aparencia: "M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
  publicacoes: "M4 5h11v14H4V5Zm14 3h2v9a2 2 0 0 1-2 2M7 9h5M7 12h5M7 15h3",
  ensaio: "M3 6h18v10H3V6Zm6 14h6m-3-4v4M8 9.5l3 1.5-3 1.5v-3Z",
};

export default function MenuIcon({ id }: { id: MenuIconId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[id] || "M5 5h14v14H5z"} />
    </svg>
  );
}
