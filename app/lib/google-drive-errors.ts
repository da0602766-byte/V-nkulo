/** Safe, actionable errors: never expose Google's raw response or account details. */
export class GoogleDriveWriteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function googleDriveWriteError(response: Response) {
  const body = await response.json().catch(() => null) as {
    error?: { errors?: { reason?: string }[] };
  } | null;
  const reasons = body?.error?.errors?.map(error => error.reason) || [];
  if (reasons.includes('storageQuotaExceeded')) {
    return new GoogleDriveWriteError('O armazenamento da conta Google responsável pelo Drive está cheio. Libere espaço no Google Drive, Gmail ou Google Fotos e tente salvar novamente. Os dados anteriores foram preservados.', 507);
  }
  if (response.status === 401 || reasons.includes('authError')) {
    return new GoogleDriveWriteError('A autorização do Google Drive expirou. Reconecte a conta Google responsável em Armazenamento e acessos e tente novamente. Os dados anteriores foram preservados.', 503);
  }
  if (response.status === 429 || reasons.some(reason => reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) {
    return new GoogleDriveWriteError('O Google Drive atingiu o limite temporário de solicitações. Aguarde alguns minutos e tente salvar novamente. Os dados anteriores foram preservados.', 503);
  }
  if (response.status === 403) {
    return new GoogleDriveWriteError('O Google Drive recusou a gravação. Confira a autorização e a permissão de edição da pasta na conta Google responsável. Os dados anteriores foram preservados.', 503);
  }
  if (response.status === 404) {
    return new GoogleDriveWriteError('A pasta de destino não foi encontrada no Google Drive. Confira a lixeira e a conta Google responsável. Os dados anteriores foram preservados.', 503);
  }
  return new GoogleDriveWriteError('O Google Drive não confirmou a gravação. Confira a conexão e tente novamente. Os dados anteriores foram preservados.', 503);
}
