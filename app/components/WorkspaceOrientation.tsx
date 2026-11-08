"use client";

import { useEffect, useState } from "react";

const AREAS: Record<string, [string, string, string]> = {
  inicio: ["Dia a dia", "Mural", "Acompanhe publicações, comunicados e encontros da sua comunidade."],
  fio: ["Dia a dia", "Fio do dia", "Veja o que acontece hoje e organize seus próximos passos."],
  eventos: ["Dia a dia", "Agenda", "Consulte datas, abra os detalhes e confirme sua participação."],
  ministerios: ["Comunidade", "Ministérios", "Encontre sua equipe, consulte escalas e acompanhe confirmações."],
  solicitacoes: ["Comunidade", "Pedidos", "Envie uma solicitação ou acompanhe o que precisa de atendimento."],
  visitantes: ["Comunidade", "Visitantes", "Localize pessoas e acompanhe cada contato e próximo passo."],
  celulas: ["Comunidade", "Células", "Encontre os grupos e acompanhe reuniões, integrantes e relatórios."],
  estacionamento: ["Comunidade", "Estacionamento", "Confira disponibilidade, reservas e movimentação no local."],
  redes: ["Gestão", "Redes e unidades", "Confira a estrutura e os responsáveis de cada unidade."],
  membro: ["Meu espaço", "Minha participação", "Acompanhe suas escalas, compromissos e vínculos."],
  lider: ["Gestão", "Liderança", "Resolva pendências e acompanhe as equipes sob sua responsabilidade."],
  pessoas: ["Comunidade", "Pessoas", "Pesquise uma pessoa e abra sua ficha sem perder a consulta."],
  comunidade: ["Gestão", "Central da Comunidade", "Consulte prioridades e siga para os registros de cada área."],
  relatorios: ["Gestão", "Relatórios", "Escolha o período e consulte os registros que compõem os resultados."],
  avisos: ["Dia a dia", "Avisos", "Consulte recados recebidos e destaque o que ainda não foi lido."],
  configuracoes: ["Gestão", "Configurações", "Escolha um assunto e revise o alcance das alterações antes de salvar."],
  continuidade: ["Gestão", "Continuidade", "Entenda a situação atual e acompanhe cada etapa das solicitações."],
  conta: ["Meu espaço", "Perfil e conta", "Atualize seus dados e escolha o que compartilhar com a comunidade."],
};

export default function WorkspaceOrientation({ area, community }: { area: string; community: string }) {
  const [help, setHelp] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  useEffect(() => {
    const sync = (event: Event) => setIntroOpen((event as CustomEvent<{open:boolean}>).detail.open);
    window.addEventListener("vinkulo:mural-intro-state", sync);
    return () => window.removeEventListener("vinkulo:mural-intro-state", sync);
  }, []);
  const info = AREAS[area];
  if (!info) return null;
  return <div className="workspace-orientation">
    <div className="workspace-breadcrumb" aria-label="Localização atual"><span title={community}>{community}</span><span aria-hidden="true">/</span><span>{info[0]}</span><span aria-hidden="true">/</span><strong>{info[1]}</strong></div>
    <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}><button type="button" aria-expanded={help} aria-controls={`workspace-guide-${area}`} onClick={() => setHelp(!help)}>Sobre esta área <span aria-hidden="true">{help ? "−" : "+"}</span></button>
    {area === "inicio" && <button type="button" style={{minWidth:44,minHeight:44,fontSize:20}} aria-label={introOpen ? "Recolher apresentação da comunidade" : "Mostrar apresentação da comunidade"} aria-expanded={introOpen} aria-controls="community-mural-intro" onClick={() => window.dispatchEvent(new Event("vinkulo:toggle-mural-intro"))}>−</button>}</div>
    {help && <p id={`workspace-guide-${area}`} className="workspace-area-help">{info[2]}</p>}
  </div>;
}
