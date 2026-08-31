import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canSelectCommunity,
  permissionsForTenantRole,
  scopeRowsToCommunity,
  tenantRoleHasPermission,
} from "../app/lib/tenant-policy.mjs";

test("isolamento mantém somente linhas da comunidade ativa", () => {
  const rows = [
    { id: 1, comunidade_id: 1, title: "Norte" },
    { id: 2, comunidade_id: 2, title: "Sul" },
  ];
  assert.deepEqual(scopeRowsToCommunity(rows, 1), [rows[0]]);
  assert.deepEqual(scopeRowsToCommunity(rows, 2), [rows[1]]);
  assert.deepEqual(scopeRowsToCommunity(rows, 999), []);
});

test("troca de comunidade exige vínculo ativo", () => {
  const memberships = [
    { comunidade_id: 1, status: "ATIVO" },
    { comunidade_id: 2, status: "SUSPENSO" },
  ];
  assert.equal(canSelectCommunity(memberships, 1), true);
  assert.equal(canSelectCommunity(memberships, 2), false);
  assert.equal(canSelectCommunity(memberships, 3), false);
});

test("permissões diferenciam membro, líder, pastor, admin e superadmin", () => {
  assert.equal(tenantRoleHasPermission("MEMBRO", "platform.admin.view"), false);
  assert.equal(tenantRoleHasPermission("LIDER", "leadership.panel.view"), true);
  assert.equal(tenantRoleHasPermission("PASTOR", "pastoral.panel.view"), true);
  assert.equal(
    tenantRoleHasPermission("ADMIN_COMUNIDADE", "invites.manage"),
    true,
  );
  assert.equal(
    tenantRoleHasPermission("ADMIN_COMUNIDADE", "feature_flags.view"),
    false,
  );
  assert.equal(
    permissionsForTenantRole("SUPERADMIN").includes("feature_flags.view"),
    true,
  );
  assert.equal(
    tenantRoleHasPermission("SUPERADMIN", "platform.feed.publish"),
    true,
  );
  assert.equal(
    tenantRoleHasPermission("ADMIN_COMUNIDADE", "platform.feed.publish"),
    false,
  );
  assert.equal(
    tenantRoleHasPermission("ADMIN_COMUNIDADE", "feed.moderate"),
    true,
  );
  assert.equal(tenantRoleHasPermission("MEMBRO", "schedules.respond"), true);
  assert.equal(tenantRoleHasPermission("LIDER", "ministries.manage"), false);
  assert.equal(tenantRoleHasPermission("PASTOR", "ministries.manage"), true);
  assert.equal(
    tenantRoleHasPermission("PASTOR", "community.lifecycle.request"),
    false,
  );
  assert.equal(
    tenantRoleHasPermission(
      "ADMIN_COMUNIDADE",
      "community.lifecycle.request",
    ),
    false,
  );
  assert.equal(
    tenantRoleHasPermission("SUPERADMIN", "community.lifecycle.review"),
    false,
  );
  assert.equal(
    tenantRoleHasPermission("ADMIN_COMUNIDADE", "schedules.manage"),
    true,
  );
});

test("governança V4.7.2 mantém exclusões protegidas, conta neutra e temas isolados", async () => {
  const [
    peopleRoute,
    scheduleRoute,
    ministryRoute,
    accountRoute,
    noCommunityPage,
    themeRoute,
    dashboard,
    editor,
  ] = await Promise.all([
    readFile(new URL("../app/api/pilot/pessoas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/escalas/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/ministerios/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/conta/perfil/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sem-comunidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/community-theme/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PilotDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/GlobalVisualEditor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(peopleRoute, /access\.user\.system_owner/);
  assert.match(peopleRoute, /EXCLUSAO_DEFINITIVA_DE_CONTA_BLOQUEADA/);
  assert.match(peopleRoute, /UPDATE usuarios SET ativo = 0/);
  assert.match(scheduleRoute, /status = 'ARQUIVADA'/);
  assert.match(ministryRoute, /ARQUIVAR_DIACONIA/);
  assert.match(ministryRoute, /DIACONIA_V472_ARQUIVADA/);
  assert.match(accountRoute, /getSessionUser/);
  assert.doesNotMatch(accountRoute, /requireTenantPermission/);
  assert.match(noCommunityPage, /Sair/);
  assert.match(noCommunityPage, /Explorar comunidades/);
  assert.match(themeRoute, /community_theme:/);
  assert.match(themeRoute, /community\.theme\.manage/);
  assert.match(dashboard, /searchParams\.set\("view"/);
  assert.match(editor, /Excluir deste layout/);
  assert.match(editor, /hiddenDesktop:\s*true/);
  assert.match(editor, /hiddenMobile:\s*true/);
});

test("gate do piloto protege recursos críticos e reautentica controles de rede", async () => {
  const [config, flags, networks, editorial, signup, access, migration] =
    await Promise.all([
      readFile(new URL("../app/lib/pilot-config.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/pilot/feature-flags/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/pilot/redes/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/pilot/editorial/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/cadastro/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/lib/access.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0013_chunky_scalphunter.sql", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(config, /legacyModulesEnabled:\s*false/);
  assert.match(config, /networkModuleEnabled:\s*false/);
  assert.match(config, /paymentsEnabled:\s*false/);
  assert.match(config, /aiEditorialMode:\s*"COM_REVISAO"/);
  assert.match(config, /aiAutoPublishEnabled:\s*false/);
  assert.match(flags, /verifyPassword/);
  assert.match(flags, /Somente o superadministrador/);
  assert.match(flags, /FEATURE_FLAG_REDE_ATUALIZADA/);
  assert.match(flags, /requiresConfirmation:\s*"REDES"/);
  assert.match(networks, /networkModuleEnabled/);
  assert.match(networks, /status:\s*404/);
  assert.match(editorial, /autoPublish:\s*false/);
  assert.match(config, /openRegistrationEnabled:\s*true/);
  assert.match(signup, /INSERT INTO usuarios/);
  assert.match(signup, /membershipCreated:\s*false/);
  assert.doesNotMatch(signup, /INSERT INTO usuario_comunidades/);
  assert.match(access, /legacyModulesEnabled/);
  const legacyGate = access.indexOf("!PILOT_CONFIG.legacyModulesEnabled");
  const permissionGate = access.indexOf("permission && !hasPermission");
  assert.ok(legacyGate > -1, "gate dos módulos legados ausente");
  assert.ok(
    legacyGate < permissionGate,
    "o bloqueio legado precisa ocorrer antes da autorização operacional",
  );
  assert.match(migration, /'network_module_enabled','GLOBAL',0,0/);
  assert.match(migration, /'COM_REVISAO','ATIVA',0/);
});

test("consultas do piloto usam o tenant resolvido no servidor", async () => {
  const [tenant, data, invites] = await Promise.all([
    readFile(new URL("../app/lib/tenant.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pilot-data.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/pilot/convites/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(tenant, /WHERE uc\.usuario_id = \?/);
  assert.match(tenant, /membership\.comunidadeId/);
  assert.match(data, /WHERE comunidade_id = \?/);
  assert.match(invites, /access\.context\.comunidadeId/);
  assert.doesNotMatch(invites, /payload\.comunidadeId/);
});

test("Secretaria V4.7.2 mantém tenant, permissões e página compartilhada sem contatos", async () => {
  const [schedules, shareAction, publicPage, pdfRoute, calendarRoute] =
    await Promise.all([
      readFile(
        new URL("../app/api/pilot/escalas/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/pilot/escalas/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/escala/[token]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/pilot/escalas/[id]/pdf/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/pilot/escalas/[id]/calendario/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assert.match(schedules, /access\.context\.comunidadeId/);
  assert.match(schedules, /canManageMinistry/);
  assert.match(schedules, /notifyUser/);
  assert.match(shareAction, /GERAR_LINK_COMPARTILHAVEL/);
  assert.match(shareAction, /status !== "PUBLICADA"/);
  assert.match(publicPage, /status = 'PUBLICADA'/);
  assert.doesNotMatch(publicPage, /email|telefone/i);
  assert.match(pdfRoute, /canViewSchedule/);
  assert.match(calendarRoute, /canViewSchedule/);
});

test("páginas, temas e responsividade do VÍNKULO permanecem explícitos", async () => {
  const [home, privacy, terms, plans, login, styles, dashboard, mobileNav, ministries, visitors, notifications, loginConfig, visualEditor, communityTheme, uploadRoute, secretaryStyles, loginWorkspace] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/termos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/planos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/PilotDashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PublicMobileNav.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/MinistriesWorkspace.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/TenantOperations.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/PilotNotificationCenter.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/pilot-login-config.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/GlobalVisualEditor.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/lib/community-theme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/secretary.css", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LoginCustomizationWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /VÍNKULO/);
  assert.match(home, /A plataforma completa/i);
  assert.match(home, /Cada nova comunidade passa por análise do proprietário/i);
  assert.match(privacy, /Política de Privacidade/);
  assert.match(terms, /Termos de Uso/);
  assert.match(plans, /Não existe checkout/i);
  assert.match(login, /getPilotLoginConfig/);
  assert.match(login, /siteName=\{config\.siteName\}/);
  assert.match(styles, /html\[data-pilot-theme="escuro"\]/);
  assert.match(styles, /prefers-color-scheme:\s*dark/);
  assert.match(styles, /@media\s*\(max-width:\s*680px\)/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.pilot-mobile-nav/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(dashboard, /Menu geral/);
  assert.match(dashboard, /Sair da plataforma/);
  assert.match(dashboard, /setMobileMenu/);
  assert.match(dashboard, /community-brand-trigger/);
  assert.match(dashboard, /Ver informações de/);
  assert.match(dashboard, /canEditCommunity/);
  assert.match(dashboard, /Editar comunidade/);
  assert.match(styles, /pilot-dashboard\[data-visual-editor-root\][\s\S]*background:\s*var\(--pilot-bg\)\s*!important/);
  assert.match(styles, /community-info-dialog/);
  assert.match(styles, /community-home-welcome h1/);
  assert.match(visualEditor, /root\.classList\.contains\("pilot-dashboard"\)/);
  assert.match(visualEditor, /root\.style\.removeProperty\("--ve-surface"\)/);
  assert.doesNotMatch(
    dashboard,
    /async function openView/,
    "abrir o menu móvel não deve depender de rede",
  );
  assert.match(mobileNav, /user \? "\/painel" : "\/login"/);
  assert.match(mobileNav, /Meu perfil/);
  assert.match(ministries, /Visão geral/);
  assert.match(ministries, /Participantes/);
  assert.match(ministries, /Histórico/);
  assert.match(ministries, /Editar escala/);
  assert.match(ministries, /Gerar convite/);
  assert.match(visitors, /Informações pessoais/);
  assert.match(visitors, /Conexão espiritual/);
  assert.match(visitors, /Editar cadastro/);
  assert.match(visitors, /vinkulo:new-visitor/);
  assert.match(dashboard, /Novo visitante/);
  assert.match(dashboard, /O que deseja adicionar/);
  assert.match(dashboard, /Pesquisar comunidade/);
  assert.match(dashboard, /pilot-mobile-list-icon/);
  assert.match(notifications, /<svg/);
  assert.match(loginConfig, /DEFAULT_PILOT_SIGNUP_FIELDS/);
  assert.match(loginConfig, /id:\s*"cep"/);
  assert.match(loginConfig, /themeMode:\s*"AUTO"/);
  assert.match(loginConfig, /layout:\s*"CENTERED"/);
  assert.match(loginWorkspace, /Cartão centralizado — padrão V2/);
  assert.match(styles, /\.login-shell\.login-shell-v2/);
  assert.match(styles, /\.login-v2-benefits/);
  assert.match(home, /O QUE É CONFERIDO/);
  assert.match(visualEditor, /EDITOR_UI_STORAGE_KEY/);
  assert.match(visualEditor, /setPointerCapture/);
  assert.match(visualEditor, /aria-label="Minimizar editor"/);
  assert.match(visualEditor, /aria-label="Restaurar editor"/);
  assert.match(visualEditor, /Caixa de texto livre/);
  assert.match(visualEditor, /event\.key !== "Delete"/);
  assert.match(visualEditor, /createPortal\(pencilButton/);
  assert.match(styles, /\.global-editor-panel\.is-minimized/);
  assert.match(styles, /\.global-editor-free-text/);
  assert.match(styles, /\.global-editor-toolbar-slot/);
  assert.match(home, /data-editor-key="landing-page"/);
  assert.match(home, /data-editor-key="landing-governanca"/);
  assert.match(dashboard, /id="global-editor-toolbar-slot"/);
  assert.match(styles, /\.schedule-week/);
  assert.match(styles, /\.visitor-registration/);
  assert.match(styles, /overflow-x:clip/);
  assert.match(communityTheme, /CLASSICO/);
  assert.match(communityTheme, /MODERNO/);
  assert.match(communityTheme, /CORPORATIVO/);
  assert.match(uploadRoute, /MAX_IMAGE_BYTES/);
  assert.match(uploadRoute, /user\.system_owner/);
  assert.match(uploadRoute, /uploadDriveFile/);
  assert.doesNotMatch(uploadRoute, /bucket\.put/);
  assert.match(secretaryStyles, /Secretaria: contenção mobile/);
  assert.match(secretaryStyles, /overflow-wrap:anywhere/);
  assert.match(visualEditor, /hoverEffect/);
  assert.match(visualEditor, /PURPLE_GOLD/);
  assert.match(visualEditor, /NativeImageUpload/);
  assert.doesNotMatch(loginWorkspace, /type="url"/);
});

test("Ministérios, Diaconia, uploads e Aparência mantêm os novos bloqueios", async () => {
  const [
    ministryRoute,
    resourcesRoute,
    diaconiaRoute,
    secretary,
    diaconia,
    editor,
    upload,
    parking,
  ] = await Promise.all([
    readFile(new URL("../app/api/pilot/ministerios/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/ministerios/recursos/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/diaconia/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SecretaryMinisterialWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DiaconiaWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/GlobalVisualEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NativeImageUpload.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ParkingWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ministryRoute, /export async function DELETE/);
  assert.match(ministryRoute, /canManageMinistry/);
  assert.match(ministryRoute, /DELETE FROM ministerio_voluntarios/);
  assert.match(resourcesRoute, /EXCLUIR_FUNCAO/);
  assert.match(resourcesRoute, /EXCLUIR_MODELO/);
  assert.match(diaconiaRoute, /EXCLUIR_ITEM/);
  assert.match(diaconiaRoute, /canManageMinistry/);
  assert.match(secretary, /Salvar configurações/);
  assert.match(secretary, /purpose="ministry-banner"/);
  assert.match(secretary, /searchParams\.set\("ministry"/);
  assert.match(secretary, /addEventListener\("popstate"/);
  assert.doesNotMatch(secretary, /igreja renascer em cristo/);
  assert.doesNotMatch(secretary, /usesRenascerCatalogCompatibility/);
  assert.match(secretary, /secretary-workspace secretary-catalog/);
  assert.match(secretary, /key="ministerios-catalogo"/);
  assert.match(secretary, /key=\{`ministerio-detalhe-/);
  assert.doesNotMatch(secretary, /requiresCleanReturn/);
  assert.match(secretary, /const raw = await response\.text\(\)/);
  assert.match(secretary, /if \(created\)/);
  assert.match(parking, /const formElement = event\.currentTarget/);
  assert.match(parking, /formElement\.reset\(\)/);
  assert.match(diaconia, /Somente leitura/);
  assert.doesNotMatch(diaconia, /function updateItem/);
  assert.match(editor, /navigationLocked/);
  assert.match(editor, /Restaurar todas as cores/);
  assert.match(editor, /background-color:/);
  assert.match(upload, /saveImageOutsidePlatform/);
  const mediaUpload = await readFile(
    new URL("../app/lib/media-upload-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(mediaUpload, /prepareImageForUpload/);
  assert.match(mediaUpload, /response\.text\(\)/);
});

test("comunidades novas exigem solicitação ao proprietário, ficha rígida e automação editorial interna", async () => {
  const [communities, publicData, creation, creationConfig, seals, leadership, editorApi, editorUi, dashboard, mobileNav, peopleApi, accountUi, themes, styles] = await Promise.all([
    readFile(new URL("../app/api/pilot/comunidades/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pilot-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/CreateCommunityShortcut.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/community-creation-config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/community-pastoral-seals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LeadershipWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/editorial/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/EditorialAutomationWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PilotDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PublicMobileNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/pessoas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LoginCustomizationWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/community-theme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(communities, /solicitacoes_criacao_comunidade/);
  assert.match(communities, /'PENDENTE'/);
  assert.match(communities, /SOLICITACAO_CRIACAO_COMUNIDADE_REGISTRADA/);
  assert.doesNotMatch(communities, /pastorEmail/);
  assert.match(publicData, /c\.status = 'ATIVA'/);
  assert.doesNotMatch(publicData, /c\.ambiente_demo = 1/);
  assert.match(publicData, /NAO_APLICAVEL/);
  assert.match(creation, /ficha institucional/i);
  assert.match(creation, /ficha-criacao-comunidade-v2/);
  assert.match(creation, /createPortal/);
  assert.match(creation, /create-community-progress/);
  assert.match(creation, /data-community-step/);
  assert.match(creation, /document\.body\.style\.overflow = "hidden"/);
  assert.match(creation, /event\.key === "Escape"/);
  assert.match(creationConfig, /system_owner/);
  assert.match(seals, /substituído pela aprovação exclusiva do proprietário/);
  assert.doesNotMatch(seals, /SELO_PASTORAL_APROVADO/);
  assert.doesNotMatch(leadership, /Comunidades aguardando validação/);
  assert.match(editorApi, /EDITORIAL_PUBLICACAO_MANUAL/);
  assert.match(editorApi, /automaticEnabled/);
  assert.match(editorApi, /sensitive_topics_blocked/);
  assert.match(editorUi, /Automático/);
  assert.match(editorUi, /Híbrido/);
  assert.match(editorUi, /Publicação manual/);
  assert.match(editorUi, /PROGRAMAÇÃO AUTORIZADA/);
  assert.match(editorUi, /Autorizar e iniciar contador/);
  assert.match(editorUi, /value="COMUNIDADE"/);
  assert.doesNotMatch(dashboard, /pilot-desktop-community-switcher/);
  assert.match(dashboard, /Trocar comunidade pelo menu da conta/);
  assert.match(dashboard, /window\.location\.assign\("\/painel\?view=inicio"\)/);
  assert.match(mobileNav, /CreateCommunityShortcut/);
  assert.match(styles, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /create-community-shortcut\.compact \{ grid-column:3/);
  assert.match(peopleApi, /PASTOR_REMOVEU_MEMBRO_DA_COMUNIDADE/);
  assert.match(accountUi, /Pesquisar por nome, e-mail ou telefone/);
  assert.match(themes, /ACOLHEDOR/);
  assert.match(themes, /SERENIDADE/);
  assert.match(themes, /CELEBRACAO/);
  assert.match(styles, /community-creation-config/);
});

test("padrão global evita divergência, dá acesso total ao proprietário e restringe gráficos pastorais", async () => {
  const [tenant, migration, dashboardApi, leadership, shell, ownerApi, ownerPage] = await Promise.all([
    readFile(new URL("../app/lib/tenant.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0035_thick_stark_industries.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/pastoral-dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LeadershipWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PilotDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/proprietario/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/OwnerWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(tenant, /'SUPERADMIN' AS papel/);
  assert.match(tenant, /communityAccess: user\.system_owner \? "OWNER"/);
  assert.match(migration, /community_theme:/);
  assert.match(migration, /WHERE NOT EXISTS/);
  assert.match(dashboardApi, /proprietario_usuario_id/);
  assert.match(dashboardApi, /acessos_painel_pastoral/);
  assert.match(dashboardApi, /Somente quem criou a comunidade/);
  assert.match(dashboardApi, /WHERE comunidade_id = \?/);
  assert.match(leadership, /Indicadores pastorais/);
  assert.match(leadership, /Gerenciar acesso de outros pastores/);
  assert.match(shell, /WorkspaceErrorBoundary/);
  assert.match(ownerApi, /COMUNIDADE_CRIADA_PELO_PROPRIETARIO/);
  assert.match(ownerApi, /ALTERAR_STATUS_COMUNIDADE/);
  assert.match(ownerApi, /COMUNIDADE_RESTAURADA_PELO_PROPRIETARIO/);
  assert.match(ownerApi, /Esta área é exclusiva do proprietário do sistema/);
  assert.match(ownerPage, /Escopo global/);
  assert.match(ownerPage, /Abrir com acesso integral/);
  assert.match(ownerPage, /Restaurar e ativar/);
  assert.match(ownerPage, /Recolher lista/);
  assert.match(ownerPage, /Página \{safeDirectoryPage \+ 1\}/);
});

test("conversas ficam no perfil, isolam comunidade e respeitam membro versus oficial", async () => {
  const [chatApi, chatUi, presenceUi, presenceApi, notificationApi, notificationUi, dashboard] = await Promise.all([
    readFile(new URL("../app/api/pilot/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PrivateChatDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/CommunityPresencePanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/presenca/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pilot/notificacoes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PilotNotificationCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PilotDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(chatApi, /communityAccess === "FEED_ONLY"/);
  assert.match(chatApi, /c\.comunidade_id = \?/);
  assert.match(chatApi, /ciclo_mes = strftime\('%Y-%m','now'\)/);
  assert.match(chatApi, /usuario_menor_id/);
  assert.match(chatApi, /usuario_maior_id/);
  assert.doesNotMatch(chatApi, /createSystemNotification/);
  assert.match(chatApi, /communicationGroup/);
  assert.match(chatApi, /Membros conversam somente com membros/);
  assert.match(chatUi, /CONVERSA PRIVADA/);
  assert.match(chatUi, /type="submit"/);
  assert.match(presenceUi, /Mensagem/);
  assert.match(presenceUi, /Biografia/);
  assert.match(presenceApi, /json_extract\(u\.cadastro_dados/);
  assert.match(presenceApi, /canMessage/);
  assert.match(notificationApi, /normalizeDestination/);
  assert.match(notificationApi, /n\.area <> 'CHAT'/);
  assert.match(notificationUi, /window\.location\.assign\(item\.destination\)/);
  assert.doesNotMatch(dashboard, /label: "Mensagens"/);
  assert.doesNotMatch(chatApi, /chat.*public/i);
});
