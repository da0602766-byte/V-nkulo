const retired = () => Response.json(
  { error: "Publicações globais foram desativadas com a retirada do feed público." },
  { status: 410 },
);

export const PATCH = retired;
export const DELETE = retired;
