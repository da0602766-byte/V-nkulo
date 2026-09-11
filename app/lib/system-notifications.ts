type NotificationInput = {
  tipo?: "INFO" | "NOVO" | "IMPORTANTE";
  titulo: string;
  mensagem: string;
  area: "MENU" | "VISITANTES" | "CULTOS" | "USUARIOS" | "MODULOS" | "DIACONIA" | "CHAT" | "SOLICITACOES" | "CHECKLISTS" | "ESCALAS" | "EVENTOS";
  entidadeId?: number | null;
  usuarioId?: number | null;
  comunidadeId?: number | null;
  remetenteUsuarioId?: number | null;
  destinoRota?: string;
  hierarquia?: string;
  ministerio?: string;
  criadoPor: string;
};

export async function createSystemNotification(
  db: D1Database,
  input: NotificationInput,
) {
  await db
    .prepare(
      `INSERT INTO notificacoes_sistema
       (tipo, titulo, mensagem, area, entidade_id, usuario_id, comunidade_id,
        remetente_usuario_id, destino_rota, hierarquia, ministerio, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.tipo || "INFO",
      input.titulo.trim().slice(0, 120),
      input.mensagem.trim().slice(0, 500),
      input.area,
      input.entidadeId || null,
      input.usuarioId || null,
      input.comunidadeId || null,
      input.remetenteUsuarioId || null,
      normalizeInternalDestination(input.destinoRota),
      (input.hierarquia || "").trim().slice(0, 80),
      (input.ministerio || "").trim().slice(0, 160),
      input.criadoPor,
    )
    .run();
}

function normalizeInternalDestination(value?: string) {
  const destination = String(value || "").trim();
  return isSafeInternalDestination(destination) ? destination.slice(0, 300) : "";
}

function isSafeInternalDestination(value: string) {
  return (
    value.startsWith("/painel?") ||
    value.startsWith("/comunidades") ||
    value.startsWith("/proprietario")
  );
}
