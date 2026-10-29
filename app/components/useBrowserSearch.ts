"use client";
import {useSyncExternalStore} from "react";

const serverSearch=()=>"";
const clientSearch=()=>window.location.search;
function subscribe(notify:()=>void){
  window.addEventListener("popstate",notify);
  return()=>window.removeEventListener("popstate",notify);
}
export function useBrowserSearch(){
  return useSyncExternalStore(subscribe,clientSearch,serverSearch);
}
