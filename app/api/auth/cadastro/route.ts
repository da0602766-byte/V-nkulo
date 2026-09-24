export async function POST() {
  return Response.json({error:'Use o convite temporário da sua comunidade. Para criar uma comunidade, envie uma solicitação pelo LOG1.',redirect:'/log1'},{status:403});
}
