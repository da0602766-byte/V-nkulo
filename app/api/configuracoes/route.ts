import { getD1 } from "../../../db";
import { ALL_PERMISSIONS, requireApiPermission } from "../../lib/access";
export async function PATCH(request: Request) {
  const access = await requireApiPermission("SISTEMA_PERSONALIZAR");
  if (access.error) return access.error;
  const body = await request.json() as { tema?: unknown; abas?: unknown; site?: unknown; login?: unknown; manutencao?: unknown; ordemMenu?: unknown; textos?: unknown; layoutAbas?: unknown; abasOcultas?: unknown; hierarquias?: unknown };
  const db = getD1();
  const hierarquias = Array.isArray(body.hierarquias)
    ? body.hierarquias.flatMap((item) => {
        const value = item as { id?: unknown; nome?: unknown; cor?: unknown; permissoes?: unknown };
        const id = String(value.id || "").trim().toUpperCase();
        if (!/^[A-Z0-9_]{2,40}$/.test(id)) return [];
        const permissoes = Array.isArray(value.permissoes)
          ? value.permissoes.map(String).filter((key) => ALL_PERMISSIONS.includes(key as never))
          : [];
        return [{ id, nome: String(value.nome || id).trim().slice(0, 40), cor: /^#[0-9a-f]{6}$/i.test(String(value.cor)) ? String(value.cor) : "#526d82", permissoes }];
      })
    : body.hierarquias;
  for (const [chave, valor] of Object.entries({ tema: body.tema, abas: body.abas, site: body.site, login: body.login, manutencao: body.manutencao, ordem_menu: body.ordemMenu, textos: body.textos, layout_abas: body.layoutAbas, abas_ocultas: body.abasOcultas, hierarquias })) {
    if (valor === undefined) continue;
    await db.prepare("INSERT INTO configuracoes (chave, valor, atualizado_por) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP").bind(chave, JSON.stringify(valor), access.user!.email).run();
  }
  if (Array.isArray(hierarquias)) {
    for (const hierarchy of hierarquias) {
      await db.prepare("UPDATE usuarios SET permissoes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE perfil <> 'ADMIN' AND titulo_eclesiastico = ?")
        .bind(["HIERARQUIA_CONFIGURADA", ...hierarchy.permissoes].join(","), hierarchy.id)
        .run();
    }
  }
  return Response.json({ ok: true });
}
