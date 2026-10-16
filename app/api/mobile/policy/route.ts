import { getAndroidOfflinePolicy } from "../../../lib/android-offline-policy";

// Public operational state only: the native app must check this before login.
export async function GET(request: Request) {
  const challenge = new URL(request.url).searchParams.get("challenge") || "";
  if (challenge && !/^[a-f0-9]{64}$/.test(challenge)) {
    return Response.json({ error: "Consulta inválida." }, { status: 400 });
  }
  return Response.json({ protocol: 1, challenge, ...await getAndroidOfflinePolicy() }, {
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}
