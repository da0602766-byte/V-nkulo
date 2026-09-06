"use client";

import dynamic from "next/dynamic";

// GlobalVisualEditor é um editor completo (~1700 linhas + upload nativo de
// imagem) montado sem condição em três pontos de entrada: cabeçalho público
// (todo visitante anônimo), painel comunitário e Área do Proprietário. A
// maioria das sessões nunca abre o editor, então este wrapper isola o
// componente em um chunk carregado sob demanda no cliente, em vez de somar
// ao pacote inicial de todas as páginas que renderizam o cabeçalho/painel.
// Nenhuma prop ou comportamento muda: mesma interface do componente original.
const GlobalVisualEditor = dynamic(() => import("./GlobalVisualEditor"), {
  ssr: false,
  loading: () => null,
});

export default GlobalVisualEditor;
