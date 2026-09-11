export async function GET() {
  return Response.json(
    {
      error:
        "O feed público foi encerrado. Consulte o diretório e as páginas institucionais das comunidades.",
      directory: "/comunidades",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
