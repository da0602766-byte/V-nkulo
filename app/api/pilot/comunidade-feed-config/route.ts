export async function GET() {
  return Response.json(
    {
      enabled: false,
      retired: true,
      message:
        "O feed público foi removido. Publicações permanecem internas à comunidade.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH() {
  return Response.json(
    {
      error:
        "O compartilhamento com feed público foi removido da plataforma.",
    },
    { status: 410 },
  );
}
