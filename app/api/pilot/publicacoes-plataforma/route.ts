const retired = () => Response.json(
  {
    error: "O feed público agregado foi removido. Publique apenas dentro de uma comunidade.",
    destination: "/proprietario",
  },
  { status: 410 },
);

export const GET = retired;
export const POST = retired;
