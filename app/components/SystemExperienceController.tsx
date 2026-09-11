"use client";

import { useEffect, useState } from "react";

type NetworkState = "online" | "slow" | "offline";
type NetworkInformation = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
};

export default function SystemExperienceController() {
  const [network, setNetwork] = useState<NetworkState>("online");
  const [slowNoticeHidden, setSlowNoticeHidden] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    const syncNetwork = () => {
      const slow = Boolean(
        connection?.saveData ||
        connection?.effectiveType === "slow-2g" ||
        connection?.effectiveType === "2g",
      );
      const next: NetworkState = !navigator.onLine ? "offline" : slow ? "slow" : "online";
      document.documentElement.dataset.network = next;
      setNetwork(next);
      window.dispatchEvent(new CustomEvent("vinkulo:network-mode", { detail: next }));
      if (next === "online") setSlowNoticeHidden(false);
    };

    const explainInvalidField = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      field.setAttribute("aria-invalid", "true");
      field.setCustomValidity(validationMessage(field));
    };
    const clearInvalidField = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    };

    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    connection?.addEventListener("change", syncNetwork);
    document.addEventListener("invalid", explainInvalidField, true);
    document.addEventListener("input", clearInvalidField, true);
    document.addEventListener("change", clearInvalidField, true);
    return () => {
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
      connection?.removeEventListener("change", syncNetwork);
      document.removeEventListener("invalid", explainInvalidField, true);
      document.removeEventListener("input", clearInvalidField, true);
      document.removeEventListener("change", clearInvalidField, true);
    };
  }, []);

  if (network === "online" || (network === "slow" && slowNoticeHidden)) return null;

  return (
    <aside className={`system-network-notice ${network}`} role="status" aria-live="polite">
      <span aria-hidden="true">{network === "offline" ? "↯" : "◌"}</span>
      <div>
        <strong>{network === "offline" ? "Você está sem conexão" : "Modo de conexão lenta ativado"}</strong>
        <small>
          {network === "offline"
            ? "O Vínkulo preservará a tela atual. Reconecte para salvar ou atualizar informações."
            : "Imagens leves e menos animações serão usadas para economizar dados."}
        </small>
      </div>
      {network === "offline" ? (
        <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
      ) : (
        <button type="button" onClick={() => setSlowNoticeHidden(true)} aria-label="Fechar aviso de conexão lenta">×</button>
      )}
    </aside>
  );
}

function validationMessage(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const identity = `${field.name} ${field.id} ${field.autocomplete}`.toLowerCase();
  if (field.validity.valueMissing) return field instanceof HTMLSelectElement ? "Selecione uma opção para continuar." : "Preencha este campo para continuar.";
  if (field.validity.typeMismatch && field instanceof HTMLInputElement && field.type === "email") return "Digite um e-mail válido, como nome@exemplo.com.";
  if (field.validity.tooShort && !(field instanceof HTMLSelectElement)) return `Digite pelo menos ${field.minLength} caracteres.`;
  if (field.validity.tooLong && !(field instanceof HTMLSelectElement)) return `Use no máximo ${field.maxLength} caracteres.`;
  if (field.validity.rangeUnderflow && field instanceof HTMLInputElement) return `O valor mínimo permitido é ${field.min}.`;
  if (field.validity.rangeOverflow && field instanceof HTMLInputElement) return `O valor máximo permitido é ${field.max}.`;
  if (identity.includes("cep")) return "Digite um CEP válido com 8 números.";
  if (identity.includes("telefone") || identity.includes("phone") || field instanceof HTMLInputElement && field.type === "tel") return "Digite um telefone válido com DDD.";
  if (identity.includes("nome") || identity.includes("name")) return "Digite o nome completo, sem números.";
  if (field.validity.patternMismatch) return field.title || "Revise o formato deste campo.";
  return "Revise esta informação antes de continuar.";
}
