// Reserved integration point: a browser payload can never mark an invoice as paid.
export async function POST(){return Response.json({error:'Nenhum provedor de pagamento está configurado.'},{status:503});}
