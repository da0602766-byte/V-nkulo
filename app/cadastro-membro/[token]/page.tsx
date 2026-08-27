import { notFound } from "next/navigation";
import { getD1 } from "../../../db";
import MemberRegistrationForm from "../../components/MemberRegistrationForm";
import { getMemberRegistrationForm } from "../../lib/member-registration";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token;
  const form = await getMemberRegistrationForm(getD1(), token);
  if (!form) notFound();
  return <MemberRegistrationForm token={token} registration={form} />;
}
