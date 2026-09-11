export async function GET() {
  return Response.json(
    {
      pilot: true,
      version: "V4.5",
      maintenance: {
        ativa: false,
        mensagem: "",
        iniciaEm: null,
        terminaEm: null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
