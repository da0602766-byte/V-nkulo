import type { Plugin } from "vite";

export function rewriteFontAssetUrls(code: string, root: string, assetsDir = "assets") {
  if (!code.includes("_selfHostedCSS")) return code;
  // vinext's cache path uses native Windows separators, while its CSS uses '/'.
  // Fonts are already copied by vinext; reference that public directory in CSS.
  const cache = root.replaceAll("\\", "/").replace(/\/$/, "") + "/.vinext/fonts/";
  return code.split(cache).join(`/${assetsDir}/_vinext_fonts/`);
}

export function fontAssetUrls(): Plugin {
  let root = "", assetsDir = "assets";
  return {
    name: "vinkulo-font-asset-urls",
    apply: "build",
    enforce: "post",
    configResolved(config) { root = config.root; assetsDir = config.build.assetsDir; },
    transform(code) {
      const rewritten = rewriteFontAssetUrls(code, root, assetsDir);
      if (rewritten !== code) return { code: rewritten, map: null };
    },
  };
}
