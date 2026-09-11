export const PILOT_CONFIG = {
  environment: "PILOTO",
  legacyModulesEnabled: false,
  openRegistrationEnabled: true,
  privilegedMutationsEnabled: false,
  paymentsEnabled: false,
  networkModuleEnabled: false,
  affiliateCreationEnabled: false,
  aiEditorialEnabled: true,
  aiEditorialMode: "COM_REVISAO",
  aiAutoPublishEnabled: false,
} as const;

export const PILOT_LIMITATION =
  "Ação sensível indisponível no piloto até a homologação de MFA, auditoria externa e backend dedicado.";
