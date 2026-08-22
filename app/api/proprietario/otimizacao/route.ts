import { getD1 } from "../../../../db";
import { getSessionUser } from "../../../lib/local-auth";
import {
  configurePlatformOptimizer,
  getPlatformOptimizerStatus,
  PlatformOptimizerBusyError,
  runPlatformOptimization,
} from "../../../lib/platform-optimizer";

async function requireSystemOwner() {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: Response.json({ error: "Faça login para continuar." }, { status: 401 }),
    } as const;
  }
  if (!user.ativo || !user.system_owner) {
    return {
      error: Response.json(
        { error: "Esta manutenção é exclusiva do proprietário do sistema." },
        { status: 403 },
      ),
    } as const;
  }
  return { user } as const;
}

export async function GET() {
  const access = await requireSystemOwner();
  if ("error" in access) return access.error;
  const status = await getPlatformOptimizerStatus(getD1());
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const access = await requireSystemOwner();
  if ("error" in access) return access.error;
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  const action = String(payload.action || "").toUpperCase();
  const db = getD1();
  try {
    if (action === "CONFIGURAR") {
      const status = await configurePlatformOptimizer(
        db,
        {
          enabled: payload.enabled !== false,
          intervalHours: Number(payload.intervalHours),
        },
        access.user.id,
      );
      return Response.json({ ...status, message: "Programação de manutenção salva." });
    }

    if (action === "EXECUTAR_AGORA") {
      const execution = await runPlatformOptimization(db, {
        trigger: "MANUAL",
        actorId: access.user.id,
        force: true,
      });
      if (!execution.executed) {
        return Response.json(
          { error: "A manutenção já está em execução. Atualize o painel em alguns instantes." },
          { status: 409 },
        );
      }
      const status = await getPlatformOptimizerStatus(db);
      return Response.json({ ...status, execution, message: "Manutenção concluída com segurança." });
    }

    return Response.json({ error: "Ação de manutenção inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof PlatformOptimizerBusyError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: "Não foi possível concluir a manutenção. Nenhum dado ativo foi removido." },
      { status: 500 },
    );
  }
}
