const retired = () => Response.json(
  {
    error: "O selo pastoral foi substituído pela aprovação exclusiva do proprietário.",
    destination: "/proprietario",
  },
  { status: 410 },
);

export const GET = retired;
export const PATCH = retired;
