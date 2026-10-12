export type CommunityHighlight = { prayerImageUrl: string; prayerImageAlt: string; signatureText: string; signatureIcon: "heart" | "sparkle" | "none"; enabled: boolean; eyebrow: string; title: string; content: string; verse: string; reference: string; imageUrl: string; imageAlt: string };
export const DEFAULT_COMMUNITY_HIGHLIGHT: CommunityHighlight = { prayerImageUrl:"", prayerImageAlt:"", signatureText:"Juntos, por\nalgo maior.", signatureIcon:"heart", enabled:true, eyebrow:"MAIS QUE UM APP.", title:"Pessoas reais.\nPropósito eterno.", content:"Onde a fé encontra uma família.", verse:"", reference:"", imageUrl:"", imageAlt:"" };
export function parseCommunityHighlight(value: unknown): CommunityHighlight {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Conteúdo do destaque inválido.");
  const source=value as Record<string,unknown>;
  const text=(key:string,max:number)=> { if(typeof source[key]!=="string" || source[key].length>max) throw new Error(`Revise o campo ${key} (máximo de ${max} caracteres).`); return source[key].trim(); };
  if(typeof source.enabled!=="boolean") throw new Error("Informe se o destaque está ativo.");
  const signatureText=source.signatureText===undefined ? DEFAULT_COMMUNITY_HIGHLIGHT.signatureText : text("signatureText",100);
  if(!signatureText) throw new Error("Escreva a mensagem do mural.");
  const signatureIcon=source.signatureIcon===undefined ? "heart" : source.signatureIcon;
  if(!["heart","sparkle","none"].includes(String(signatureIcon))) throw new Error("Escolha um símbolo disponível.");
  const result={prayerImageUrl:source.prayerImageUrl===undefined?"":text("prayerImageUrl",2000),prayerImageAlt:source.prayerImageAlt===undefined?"":text("prayerImageAlt",180),signatureText,signatureIcon:signatureIcon as CommunityHighlight["signatureIcon"],enabled:source.enabled,eyebrow:text("eyebrow",60),title:text("title",120),content:text("content",400),verse:text("verse",500),reference:text("reference",80),imageUrl:text("imageUrl",2000),imageAlt:text("imageAlt",180)};
  if(result.enabled && ![result.title,result.content,result.verse,result.imageUrl].some(Boolean)) throw new Error("Adicione uma imagem, título, mensagem ou versículo.");
  for(const [imageUrl,imageAlt] of [[result.imageUrl,result.imageAlt],[result.prayerImageUrl,result.prayerImageAlt]]) {
  if(!imageUrl) continue;
    const internal=/^\/api\/(?:storage\/media|pilot\/uploads)\/[A-Za-z0-9_./%-]+$/.test(imageUrl) && !imageUrl.includes("..");
    let external=false; try { const url=new URL(imageUrl); external=url.protocol==="https:"&&!url.username&&!url.password; } catch {}
    if(!internal&&!external) throw new Error("Use uma imagem enviada pelo Vínkulo ou um endereço HTTPS válido.");
    if(!imageAlt) throw new Error("Descreva a imagem para quem utiliza leitor de tela.");
  }
  return result;
}
