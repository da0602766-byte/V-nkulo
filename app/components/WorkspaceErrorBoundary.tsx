"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export default class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha isolada no módulo ativo", error, info.componentStack);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="workspace-inline-error" role="alert">
        <span aria-hidden="true">↻</span>
        <div>
          <p className="pilot-kicker">MÓDULO PRESERVADO</p>
          <h1>Esta área não conseguiu carregar.</h1>
          <p>O menu e a comunidade ativa continuam disponíveis. Tente novamente sem perder o restante da navegação.</p>
        </div>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          Tentar novamente
        </button>
      </section>
    );
  }
}
