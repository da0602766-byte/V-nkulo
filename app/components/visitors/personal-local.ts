import {emptyPersonalVisitors,validatePersonalVisitors,type PersonalVisitors} from '../../lib/personal-visitors';

const databaseName='vinkulo-personal-visitors';
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  const request=indexedDB.open(databaseName,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('lists');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('Não foi possível abrir o armazenamento deste aparelho. Confira as permissões do navegador.'));
});}
export async function readPersonalLocal(userId:number,communityId:number):Promise<PersonalVisitors|null>{
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('lists','readonly'),r=tx.objectStore('lists').get(`${userId}:${communityId}`);
    let result:PersonalVisitors|null=null;
    r.onsuccess=()=>{try{if(r.result){validatePersonalVisitors(r.result,userId,communityId);result=r.result;}}catch(e){reject(e);}};
    tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Não foi possível ler sua lista neste aparelho. Nenhum cadastro foi substituído.'));};
  });
}
export async function savePersonalLocal(doc:PersonalVisitors,expectedRevision:number|null):Promise<PersonalVisitors>{
  validatePersonalVisitors(doc,doc.userId,doc.communityId);
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('lists','readwrite'),store=tx.objectStore('lists'),key=`${doc.userId}:${doc.communityId}`,r=store.get(key);
    let problem='Não foi possível salvar neste aparelho. Confira o espaço disponível; a versão anterior foi preservada.';
    const next={...doc,revision:(expectedRevision??-1)+1};
    r.onsuccess=()=>{
      if((r.result?.revision??null)!==expectedRevision){problem='Sua lista mudou em outra aba. Atualize antes de salvar.';tx.abort();return;}
      store.put(next,key);
    };
    tx.oncomplete=()=>{db.close();resolve(next);};tx.onabort=tx.onerror=()=>{db.close();reject(new Error(problem));};
  });
}
export async function initializePersonalLocal(userId:number,communityId:number){
  const existing=await readPersonalLocal(userId,communityId);if(existing)return existing;
  return savePersonalLocal(emptyPersonalVisitors(userId,communityId),null);
}
