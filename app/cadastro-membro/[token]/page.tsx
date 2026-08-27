import { notFound } from "next/navigation";
import { getD1 } from "../../../db";
import MemberRegistrationForm from "../../components/MemberRegistrationForm";
import {
  getMemberRegistrationLinkByToken,
  isMemberRegistrationLinkOpen,
} from "../../lib/member-registration-links";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberRegistrationLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getD1();
  const link = await getMemberRegistrationLinkByToken(db, token);
  if (!link || !isMemberRegistrationLinkOpen(link)) notFound();

  const communityCount = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM comunidades
       WHERE proprietario_usuario_id = ? AND status = 'ATIVA'`,
    )
    .bind(link.ownerId)
    .first<{ total: number }>();
  if (!Number(communityCount?.total || 0)) notFound();

  return <MemberRegistrationForm token={token} expiresAt={link.expiresAt} />;
}
