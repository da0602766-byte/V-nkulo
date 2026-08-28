"use client";

import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

export default function StableLink({
  href,
  children,
  showLoading = false,
  loadingLabel = "Carregando o VÍNKULO…",
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  showLoading?: boolean;
  loadingLabel?: string;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!showLoading) return;
    const reset = () => {
      setPending(false);
      delete document.documentElement.dataset.navigationLoading;
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, [showLoading]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      !showLoading ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    setPending(true);
    document.documentElement.dataset.navigationLoading = "true";
    window.setTimeout(() => window.location.assign(href), 60);
  }

  return (
    <>
      <a href={href} onClick={handleClick} {...props}>
        {children}
      </a>
      {pending && (
        <div className="global-navigation-loading" role="status" aria-live="polite" aria-busy="true">
          <span className="pilot-loader" aria-hidden="true" />
          <strong>{loadingLabel}</strong>
          <small>Preparando sua sessão, comunidade e permissões.</small>
        </div>
      )}
    </>
  );
}
