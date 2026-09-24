'use client';

import { useEffect, useState } from 'react';
import type { ResetSummary } from '../lib/platform-reset';

type History = { id: string; mode: string; created_at: string; downloadable: number; archive_bytes: number; pending_files: number };
type Preview = { token: string; summary: ResetSummary; expiresAt: number };
const endpoint = '/api/proprietario/reset';

export default function OwnerResetWorkspace({ onReset }: { onReset?: () => void }) {
  const [mode, setMode] = useState<'ARCHIVE' | 'DELETE'>('ARCHIVE');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const phrase = mode === 'ARCHIVE' ? 'ARQUIVAR E REINICIAR' : 'EXCLUIR TODOS OS DADOS';

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setHistory(result.history);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message || 'Falha ao carregar histórico.'); });
    return () => controller.abort();
  }, []);

  async function request(action: string, values: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, password, ...values }) });
      if (action === 'DOWNLOAD' && response.ok) {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a'); link.href = url; link.download = `vinkulo-arquivo-${values.id}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage('Arquivo exportado. Ele contém dados pessoais; guarde-o em local privado.');
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
      if (action === 'PREVIEW') { setPreview(result); setConfirmation(''); setAcknowledged(false); }
      else {
        setHistory(result.history); setPreview(null); setConfirmation(''); setAcknowledged(false);
        if (action === 'EXECUTE') onReset?.();
        const pending = result.history.reduce((total: number, item: History) => total + item.pending_files, 0);
        setMessage(action === 'EXECUTE'
          ? `Banco reiniciado. Seu acesso de Proprietário foi preservado.${mode === 'ARCHIVE' ? ' A cópia protegida está disponível no histórico.' : ' Os arquivos de recuperação anteriores foram apagados.'}${pending ? ` Ainda há ${pending} arquivo(s) aguardando exclusão. Use “Tentar exclusão dos arquivos” abaixo.` : ''}`
          : pending ? `Restam ${pending} arquivo(s). Tente novamente para continuar a exclusão.` : 'Exclusão dos arquivos concluída.');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); if (action !== 'PREVIEW') setPassword(''); }
  }

  return <section className="owner-reset" aria-busy={busy}>
    <div className="owner-reset-intro">
      <span className="owner-reset-eyebrow">CONTROLE DO PROPRIETÁRIO</span>
      <h2>Um novo começo para o Vínkulo</h2>
      <p>Remova todas as comunidades e os dados das pessoas para continuar construindo a plataforma.</p>
      <div className="owner-reset-preserved"><strong>Seu acesso permanece.</strong> Sua conta, CPF, senha, sessões de Proprietário e catálogo de planos serão preservados.</div>
    </div>

    <fieldset className="owner-reset-choices" disabled={busy}>
      <legend>1. Escolha o destino dos dados</legend>
      <label className={mode === 'ARCHIVE' ? 'is-selected' : ''}>
        <input type="radio" name="reset-mode" value="ARCHIVE" checked={mode === 'ARCHIVE'} onChange={() => { setMode('ARCHIVE'); setConfirmation(''); }} />
        <span><strong>Arquivar e reiniciar</strong><small>Guarda uma cópia criptografada do banco e retira os dados da plataforma. Os anexos ficam reservados. Recuperação técnica manual por exportação.</small></span>
      </label>
      <label className={mode === 'DELETE' ? 'is-selected' : ''}>
        <input type="radio" name="reset-mode" value="DELETE" checked={mode === 'DELETE'} onChange={() => { setMode('DELETE'); setConfirmation(''); }} />
        <span><strong>Excluir definitivamente</strong><small>Apaga os registros do banco, os anexos hospedados pelo Vínkulo e todas as cópias criadas por esta função. Não há desfazer na plataforma.</small></span>
      </label>
    </fieldset>

    <div className="owner-reset-scope">
      <h3>O que será reiniciado</h3>
      <p>Pessoas, comunidades, vínculos, cadastros, LOG1, assinaturas, convites, conversas, publicações, agendas, ministérios, células, auditorias e configurações, incluindo conexões com serviços externos.</p>
      <p><strong>Fora deste alcance:</strong> arquivos no Google Drive pessoal, cópias no Supabase, downloads já feitos e backups retidos pela hospedagem. Esses serviços exigem limpeza própria. A sincronização automática será desligada.</p>
      <button type="button" className="owner-reset-secondary" disabled={busy} onClick={() => void request('PREVIEW')}>{busy ? 'Aguarde…' : '2. Conferir dados antes de continuar'}</button>
    </div>

    {preview && <div className="owner-reset-preview">
      <h3>Conferência da reinicialização</h3>
      <div className="owner-reset-counts">
        <div><strong>{preview.summary.users}</strong><span>pessoas a remover</span></div>
        <div><strong>{preview.summary.communities}</strong><span>comunidades</span></div>
        <div><strong>{preview.summary.rows}</strong><span>registros</span></div>
        <div><strong>{preview.summary.files}</strong><span>arquivos hospedados</span></div>
      </div>
      <p>{mode === 'DELETE' ? `${preview.summary.archives} arquivo(s) de recuperação também serão apagados.` : 'A cópia será criada e conferida antes de remover os registros.'} Esta conferência vale por 5 minutos.</p>
      <details><summary>Ver contagem por tabela</summary><div className="owner-reset-table"><table><thead><tr><th>Tabela</th><th>Registros</th></tr></thead><tbody>{preview.summary.tables.filter(row => row.rows > 0).map(row => <tr key={row.name}><td>{row.name}</td><td>{row.rows}</td></tr>)}</tbody></table></div></details>
      <label className="owner-reset-ack"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>Entendi o alcance acima, incluindo os serviços externos, e autorizo reiniciar todas as comunidades e os dados indicados.</span></label>
      <label className="owner-reset-field">Digite <strong>{phrase}</strong><input value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} spellCheck={false} /></label>
    </div>}

    <div className="owner-reset-auth">
      <label className="owner-reset-field">Sua senha de Proprietário<input type="password" value={password} autoComplete="current-password" disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      <p>A senha é exigida para reiniciar, exportar arquivos ou continuar uma exclusão pendente.</p>
      {preview && <button type="button" className="owner-reset-danger" disabled={busy || !password || !acknowledged || confirmation !== phrase} onClick={() => void request('EXECUTE', { token: preview.token, mode, confirmation, acknowledged })}>{busy ? 'Processando…' : mode === 'ARCHIVE' ? '3. Arquivar e reiniciar plataforma' : '3. Excluir definitivamente e reiniciar'}</button>}
    </div>
    {error && <p className="owner-reset-error" role="alert">{error}</p>}
    {message && <p className="owner-reset-success" role="status">{message}</p>}

    <div className="owner-reset-history"><h3>Histórico de reinicializações</h3>
      {!history.length && <p>Nenhuma reinicialização registrada.</p>}
      {history.map(item => <article key={item.id}>
        <div><strong>{item.mode === 'ARCHIVE' ? 'Arquivamento' : 'Exclusão definitiva'}</strong><span>{new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}</span>
          <small>{item.pending_files > 0 ? `${item.pending_files} arquivo(s) com exclusão pendente` : item.downloadable ? `Cópia protegida • ${Math.ceil(item.archive_bytes / 1024)} KB` : 'Sem cópia de recuperação nesta função'}</small></div>
        {!!item.downloadable && <button type="button" className="owner-reset-secondary" disabled={busy || !password} onClick={() => void request('DOWNLOAD', { id: item.id })}>Exportar arquivo</button>}
        {item.pending_files > 0 && <button type="button" className="owner-reset-secondary" disabled={busy || !password} onClick={() => void request('RETRY_FILES')}>Tentar exclusão dos arquivos</button>}
      </article>)}
      {history.some(item => item.downloadable) && <p>As exportações incluem os registros e a lista de anexos. A restauração exige uma intervenção técnica; não há restauração automática nesta tela.</p>}
    </div>
  </section>;
}
