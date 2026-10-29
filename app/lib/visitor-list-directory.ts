export type VisitorListEntry = {
  id:string; communityId:number; communityName:string; kind:'pessoal'|'compartilhada';
  title:string; ownerName:string|null; sharedByName:string|null;
  access:'READ'|'EDIT'; own:boolean; href:string;
};
