import { getD1 } from '../../../../db';
import { getRuntimeEnv } from '../../../../db/runtime-env';
import { rateLimit, requireGlobalOwner } from '../../../lib/access-security';
import { verifyPassword } from '../../../lib/local-auth';
import { cleanupResetFiles, downloadResetArchive, executeReset, prepareReset, ResetError, resetOverview } from '../../../lib/platform-reset';

export async function GET() {
  const access = await requireGlobalOwner();
  if ('error' in access) return access.error;
  return Response.json(await resetOverview(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const access = await requireGlobalOwner();
  if ('error' in access) return access.error;
  try {
    const body = await request.json();
    if (body.action === 'PREVIEW') return Response.json(await prepareReset(access.user.id), { headers: { 'Cache-Control': 'no-store' } });
    if (!['EXECUTE', 'DOWNLOAD', 'DOWNLOAD_FILE', 'RETRY_FILES'].includes(body.action)) throw new ResetError('Ação inválida.');
    if (!(await rateLimit(request, 'owner-reset', String(access.user.id), 8))) return Response.json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, { status: 429 });
    const account = await getD1().prepare('SELECT senha_hash,senha_salt FROM usuarios WHERE id=? AND ativo=1').bind(access.user.id)
      .first<{ senha_hash: string; senha_salt: string }>();
    if (typeof body.password !== 'string' || body.password.length > 256 || !account?.senha_hash || !account.senha_salt || !(await verifyPassword(body.password, account.senha_salt, account.senha_hash))) {
      return Response.json({ error: 'Senha do Proprietário incorreta.' }, { status: 403 });
    }
    if (body.action === 'DOWNLOAD') {
      if (typeof body.id !== 'string' || body.id.length > 100) throw new ResetError('Arquivo inválido.');
      return new Response(await downloadResetArchive(body.id), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="vinkulo-arquivo.json"`, 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'DOWNLOAD_FILE') {
      if (typeof body.key !== 'string' || body.key.length > 1024) throw new ResetError('Arquivo inválido.');
      const archived = await getD1().prepare("SELECT object_key FROM platform_reset_files WHERE object_key=? AND disposition='ARCHIVED'").bind(body.key).first();
      const object = archived ? await getRuntimeEnv().BUCKET?.get(body.key) : null;
      if (!object) throw new ResetError('Arquivo não encontrado.');
      return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="vinkulo-anexo"', 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'RETRY_FILES') {
      await cleanupResetFiles();
      return Response.json({ ok: true, ...await resetOverview() });
    }
    const expected = body.mode === 'ARCHIVE' ? 'ARQUIVAR E REINICIAR' : body.mode === 'DELETE' ? 'EXCLUIR TODOS OS DADOS' : null;
    if (!expected || body.confirmation !== expected || body.acknowledged !== true || typeof body.token !== 'string' || body.token.length !== 64) throw new ResetError('Confira o alcance da operação e digite a confirmação solicitada.');
    return Response.json(await executeReset(access.user.id, body.token, body.mode));
  } catch (error) {
    return Response.json({ error: error instanceof ResetError ? error.message : 'Não foi possível concluir a operação. Atualize a página e tente novamente.' }, { status: error instanceof ResetError ? 409 : 500 });
  }
}
