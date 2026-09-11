"use client";

import dynamic from "next/dynamic";

// O editor visual completo só precisa ser carregado quando a sessão realmente
// o utiliza. Este wrapper mantém a mesma interface e o separa do pacote inicial.
const GlobalVisualEditor = dynamic(() => import("./GlobalVisualEditor"), {
  ssr: false,
  loading: () => null,
});

export default GlobalVisualEditor;
