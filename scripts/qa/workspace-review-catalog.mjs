export const areas = [
 ['inicio','Mural','Publicações com hierarquia visual e categorias distintas.'],
 ['fio','Fio do dia','Hoje em evidência e próximo registro do dia.'],
 ['eventos','Agenda','Próximo encontro em destaque; calendário, busca e detalhes.'],
 ['ministerios','Ministérios','Equipes, responsáveis e escalas com contexto preservado.'],
 ['solicitacoes','Pedidos','Atendimento, filtros e formulários mantidos ao trocar de aba.'],
 ['visitantes','Visitantes','Orientação consistente e listas compactas com acompanhamento.'],
 ['celulas','Células','Grupos, liderança, reuniões e pendências em um espaço mais limpo.'],
 ['estacionamento','Estacionamento','Disponibilidade, reserva e entrada no ambiente de teste.'],
 ['redes','Redes e unidades','Rede e sede selecionadas explícitas acima da hierarquia.'],
 ['membro','Painel do membro','Prioridades pessoais, escalas e acesso aos próprios dados.'],
 ['lider','Liderança','Pendências, equipe e indicadores com atualização sem apagar conteúdo.'],
 ['pessoas','Pessoas','Pesquisa, ficha e filtros preservados ao navegar.'],
 ['comunidade','Central da Comunidade','Resumo compacto e acesso contextual às áreas.'],
 ['relatorios','Relatórios','Período e quantidade de resultados explícitos.'],
 ['avisos','Avisos','Contagem de resultados, não lidos e limpeza dos filtros.'],
 ['configuracoes','Configurações','Assuntos e alcance das mudanças identificados.'],
 ['continuidade','Continuidade','Etapas, responsável pela análise e próximo passo.'],
 ['conta','Perfil e conta','Indicador de alterações não salvas e privacidade por campo.'],
];
export function reviewPage() {
 return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisão do Vínkulo — não publicado</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172b43;font:16px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:40px 24px}small{font-weight:700;color:#3160b5;letter-spacing:.08em}h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.04em;margin:12px 0}p{max-width:760px;color:#536579}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}a{color:#245bb0;text-decoration:none}nav a{background:#245bb0;color:white;padding:12px 18px;border-radius:8px;min-height:44px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,285px),1fr));gap:16px}article{background:white;border:1px solid #dde4ed;border-radius:12px;padding:22px}h2{font-size:18px;margin:0}article p{font-size:14px;margin:10px 0}article a{display:inline-flex;align-items:center;min-height:44px;font-weight:650}a:focus-visible{outline:3px solid #245bb0;outline-offset:4px}.notice{padding:16px;border-left:3px solid #d69c32;background:#fff9ea;margin:24px 0;font-size:14px}</style><main><small>VÍNKULO · REVISÃO LOCAL</small><h1>Uma experiência mais consistente,<br>aba por aba.</h1><p>Esta versão não está publicada. Use dados fictícios para pesquisar, abrir fichas e experimentar formulários. Comece entrando como gestor; depois escolha uma área abaixo.</p><nav><a href="/qa-login/manager">Entrar como gestor de teste →</a><a href="/qa-login/member">Ver como membro</a></nav><div class="notice">Para testar a continuidade: abra Pessoas, pesquise um nome, troque de aba pelo menu e volte. A busca deve continuar preenchida. A manutenção de telas vale para a navegação interna do painel. Visitantes abre sua área própria. Os rascunhos ficam nesta navegação; recarregar ou sair descarta o que não foi salvo. O banco de demonstração reinicia ao encerrar a prévia.</div><div class="grid">${areas.map(([id,title,description],index)=>`<article><h2>${title}</h2><p>${description}</p><a href="${id==='visitantes'?'/painel/visitantes':'/painel?view='+id}">Conferir alteração →</a><details><summary>Ver capturas da revisão</summary><p>Computador</p><img loading="lazy" style="width:100%;height:auto;border-radius:8px" src="/review/proofs/${index}-desktop.png" alt="${title} no computador"><p>Celular</p><img loading="lazy" style="width:min(100%,240px);height:auto;border-radius:8px" src="/review/proofs/${index}-mobile.png" alt="${title} no celular"></details></article>`).join('')}</div></main></html>`;
}

export function seedReview(db, manager, member) {
 db.prepare("UPDATE comunidades SET nome='Comunidade Horizonte · demonstração',proprietario_usuario_id=? WHERE id=1").run(manager);
 for(const user of [manager,member]) {
  db.prepare("INSERT OR IGNORE INTO storage_preferences(usuario_id,provider) VALUES(?,'LOCAL')").run(user);
  db.prepare("INSERT OR IGNORE INTO usuario_introducoes(usuario_id,comunidade_id,tipo) VALUES(?,0,'PLATAFORMA'),(?,1,'COMUNIDADE')").run(user,user);
 }
 db.exec("UPDATE feature_flags SET enabled=1 WHERE flag_key='network_module_enabled'");
 const network=Number(db.prepare("INSERT INTO redes_igrejas(nome,slug,comunidade_mae_id) VALUES('Rede Horizonte','rede-horizonte-revisao',1)").run().lastInsertRowid);
 db.prepare("INSERT INTO rede_administradores(rede_id,usuario_id,papel) VALUES(?,?,'NETWORK_ADMIN')").run(network,manager);
 db.prepare("INSERT INTO rede_unidades(rede_id,comunidade_id,tipo,responsavel_usuario_id) VALUES(?,1,'SEDE',?)").run(network,manager);
 db.prepare("INSERT INTO notificacoes_sistema(tipo,titulo,mensagem,area,usuario_id,criado_por) VALUES('INFO','Bem-vindos ao encontro','Confira a programação e confirme sua participação.','EVENTOS',?,'revisao-local')").run(manager);
}
