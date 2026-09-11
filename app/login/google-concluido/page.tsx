import GoogleAppReturn from "../../components/GoogleAppReturn";

export const dynamic = "force-dynamic";

export default async function GoogleCompletedPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  return <GoogleAppReturn error={(await searchParams).erro || ""} />;
}
