export async function canReadPost(db, p, user, context) {
  const uid = user?.id || 0;
  const owner = user?.system_owner === true;
  if (p.status === 'ARQUIVADA') return false;
  if (p.comunidade_id && p.community_status !== 'ATIVA') return false;
  const publicPost = p.aprovacao_status === 'APROVADA' && p.status === 'PUBLICADA' && p.visibilidade === 'PLATAFORMA'
    && p.audiencia_tipo === 'PUBLICO'
    && ((!p.comunidade_id && p.origem === 'PLATAFORMA') ||
      (p.feed_publico_habilitado === 1 && ['APROVADO', 'NAO_APLICAVEL'].includes(p.selo_pastoral_status)));
  if (publicPost) return true;
  if (!user || !context || context.comunidadeId !== p.comunidade_id ||
      !context.permissions.includes('feed.view')) return false;
  const moderate = owner || context.permissions.includes('feed.moderate');
  if (p.status !== 'PUBLICADA' && p.criado_por !== uid && !moderate) return false;
  if (p.audiencia_tipo === 'MINISTERIOS' && !moderate) {
    const member = await db.prepare(`SELECT 1 FROM ministerio_voluntarios mv
      JOIN ministerios_comunidade m ON m.id = mv.ministerio_id AND m.comunidade_id = mv.comunidade_id
      JOIN json_each(?) audience ON mv.ministerio_id = CAST(audience.value AS INTEGER)
      WHERE mv.usuario_id = ? AND mv.comunidade_id = ? AND mv.ativo = 1 AND m.status = 'ATIVO' LIMIT 1`)
      .bind(p.ministerios_json, uid, p.comunidade_id).first();
    if (!member) return false;
  }
  return true;
}

/** Query the live association on every request, including downloads. Fail closed. */
export async function canReadMedia(db, url, user, context) {
  const uid = user?.id || 0;
  const owner = user?.system_owner === true;
  const posts = await db.prepare(`SELECT p.*, c.status AS community_status,
      c.feed_publico_habilitado, c.selo_pastoral_status
    FROM publicacoes_piloto p LEFT JOIN comunidades c ON c.id = p.comunidade_id
    WHERE p.imagem_url = ? OR p.imagem_thumbnail_url = ?`).bind(url, url).all();
  const assetId = url.startsWith('/api/storage/media/') ? url.slice('/api/storage/media/'.length) : '';
  const asset = assetId ? await db.prepare('SELECT * FROM storage_files WHERE id = ?').bind(assetId).first() : null;
  if (asset?.revoked_at) return false;
  for (const p of posts.results) {
    if (asset?.community_id && asset.community_id !== p.comunidade_id) continue;
    if (asset?.purpose === 'post-image' && asset.resource_id !== p.id) continue;
    if (asset?.purpose === 'editorial-image' && !(await db.prepare(`SELECT 1 FROM programacoes_editoriais
      WHERE id = ? AND publicacao_id = ? AND comunidade_id = ? AND imagem_url = ? LIMIT 1`)
      .bind(asset.resource_id, p.id, p.comunidade_id, url).first())) continue;
    if (await canReadPost(db, p, user, context)) return true;
  }
  // An associated publication always owns its privacy, even for its uploader.
  if (posts.results.length || (asset?.purpose === 'post-image' && asset.resource_id)) return false;

  const profile = await db.prepare('SELECT id FROM usuarios WHERE foto_perfil = ? AND ativo = 1 LIMIT 1').bind(url).first();
  if (profile) {
    if (!user || (asset?.purpose && (asset.purpose !== 'profile-photo' || asset.uploaded_by !== profile.id))) return false;
    if (owner || profile.id === uid) return true;
    return Boolean(await db.prepare(`SELECT 1 FROM usuario_comunidades a
      JOIN usuario_comunidades b ON b.comunidade_id = a.comunidade_id
      JOIN comunidades c ON c.id = a.comunidade_id AND c.status = 'ATIVA'
      WHERE a.usuario_id = ? AND b.usuario_id = ? AND a.status = 'ATIVO' AND b.status = 'ATIVO' LIMIT 1`)
      .bind(uid, profile.id).first());
  }
  const ministry = await db.prepare("SELECT id, comunidade_id FROM ministerios_comunidade WHERE banner_url = ? AND status = 'ATIVO' LIMIT 1").bind(url).first();
  if (ministry) return Boolean(user && context && context.comunidadeId === ministry.comunidade_id && context.permissions.includes('ministries.view'));

  const registration = await db.prepare(`SELECT c.proprietario_usuario_id FROM cadastros_membros_temporarios r
    JOIN comunidades c ON c.id = r.comunidade_id AND c.status = 'ATIVA' WHERE r.foto_url = ? LIMIT 1`).bind(url).first();
  if (registration) return Boolean(user && (owner || registration.proprietario_usuario_id === uid));

  // Only explicitly public identity fields are public, never arbitrary JSON/layout history.
  const configs = await db.prepare(`SELECT chave, valor FROM configuracoes
    WHERE chave IN ('platform_branding', 'pilot_login_config', 'visual_editor_platform_v1') OR chave LIKE 'community_theme:%'`).all();
  for (const config of configs.results) {
    let value; try { value = JSON.parse(config.valor); } catch { continue; }
    if (config.chave === 'visual_editor_platform_v1') {
      if ((!asset?.purpose || ['visual-editor-image','platform-config-migration'].includes(asset.purpose)) &&
          JSON.stringify(value).includes(JSON.stringify(url))) return true;
    } else if (config.chave.startsWith('community_theme:')) {
      if (![value.logoUrl, value.bannerUrl].includes(url)) continue;
      const active = await db.prepare("SELECT 1 FROM comunidades WHERE id = ? AND status = 'ATIVA' LIMIT 1")
        .bind(Number(config.chave.split(':')[1])).first();
      if (active) return true;
    } else if ([value.logoUrl, value.feedBannerUrl, value.backgroundImageUrl, value.backgroundUrl].includes(url)) return true;
  }
  if (user && context?.permissions.includes('dashboard.view')) {
    const layout = await db.prepare(`SELECT 1 FROM layouts_interface l, json_tree(l.configuracao) j
      WHERE l.comunidade_id = ? AND l.escopo IN ('visual:community', ?)
      AND j.type = 'text' AND j.value = ? LIMIT 1`).bind(context.comunidadeId, `visual:user:${uid}`, url).first();
    if (layout && (!asset?.community_id || asset.community_id === context.comunidadeId)) return true;
    const editorial = await db.prepare('SELECT 1 FROM programacoes_editoriais WHERE comunidade_id = ? AND imagem_url = ? LIMIT 1')
      .bind(context.comunidadeId, url).first();
    if (editorial && owner && (!asset?.community_id || asset.community_id === context.comunidadeId)) return true;
  }
  // Unattached uploads have a short private preview window, scoped to their creator.
  const id = url.startsWith('/api/storage/media/') ? url.slice('/api/storage/media/'.length) : '';
  const pending = await db.prepare(`SELECT * FROM storage_files WHERE id = ? AND revoked_at IS NULL
    AND datetime(created_at) > datetime('now', '-1 hour') LIMIT 1`).bind(id).first();
  return Boolean(user && pending && pending.uploaded_by === uid &&
    (!pending.community_id || context?.comunidadeId === pending.community_id));
}
