import { createSystemNotification } from "./system-notifications";

type Database = Parameters<typeof createSystemNotification>[0];

export async function notifyUser(
  db: Database,
  input: {
    userId: number;
    title: string;
    message: string;
    entityId?: number;
    area?: "USUARIOS" | "DIACONIA" | "SOLICITACOES" | "CHECKLISTS" | "ESCALAS" | "EVENTOS";
    destination?: string;
    createdBy: string;
  },
) {
  await createSystemNotification(db, {
    tipo: "IMPORTANTE",
    titulo: input.title,
    mensagem: input.message,
    area: input.area || "USUARIOS",
    entidadeId: input.entityId,
    usuarioId: input.userId,
    destinoRota: input.destination,
    criadoPor: input.createdBy,
  });
}

export async function notifyCommunityManagers(
  db: Database,
  input: {
    communityId: number;
    communityName: string;
    applicantName: string;
    requestId: number;
    createdBy: string;
  },
) {
  const recipients = await db
    .prepare(
      `SELECT DISTINCT u.id
      FROM usuarios u
      JOIN usuario_comunidades uc ON uc.usuario_id = u.id
      WHERE uc.comunidade_id = ?
        AND uc.status = 'ATIVO'
        AND u.ativo = 1
        AND (u.perfil = 'ADMIN' OR uc.papel IN ('PASTOR', 'ADMIN_COMUNIDADE'))`,
    )
    .bind(input.communityId)
    .all<{ id: number }>();
  await Promise.all(
    recipients.results.map((recipient) =>
      notifyUser(db, {
        userId: Number(recipient.id),
        title: "Nova solicitação de entrada",
        message: `${input.applicantName} solicitou entrada em ${input.communityName}.`,
        entityId: input.requestId,
        destination: "/painel?view=comunidade",
        createdBy: input.createdBy,
      }),
    ),
  );
}

export async function notifySuperadmins(
  db: Database,
  input: {
    title: string;
    message: string;
    entityId?: number;
    createdBy: string;
  },
) {
  const recipients = await db
    .prepare("SELECT id FROM usuarios WHERE perfil = 'ADMIN' AND ativo = 1")
    .all<{ id: number }>();
  await Promise.all(
    recipients.results.map((recipient) =>
      notifyUser(db, {
        userId: Number(recipient.id),
        title: input.title,
        message: input.message,
        entityId: input.entityId,
        createdBy: input.createdBy,
      }),
    ),
  );
}
