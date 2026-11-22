export const pageNames = {overview:'Обзор',pools:'DNS-пулы',servers:'Серверы',replacements:'Автозамена',agents:'Агенты',events:'Журнал событий',settings:'Настройки'} as const;
export type Page = keyof typeof pageNames;
export type Route = {page:Page;poolId?:string;targetId?:string};

export function routeFromHash(hash:string):Route {
 const value=hash.startsWith('#')?hash.slice(1):hash;
 if(value.startsWith('agents/'))return {page:'agents'};
 if(value==='settings/providers')return {page:'settings'};
 if(value.startsWith('events?'))return {page:'events'};
 if(value.startsWith('pools/')){
  const parts=value.split('/');
  try{
   if(parts.length===2&&parts[1])return {page:'pools',poolId:decodeURIComponent(parts[1])};
   if(parts.length===4&&parts[1]&&parts[2]==='targets'&&parts[3]){
    return {page:'pools',poolId:decodeURIComponent(parts[1]),targetId:decodeURIComponent(parts[3])};
   }
  }catch{
   return {page:'pools'};
  }
  return {page:'pools'};
 }
 return {page:Object.hasOwn(pageNames,value)?value as Page:'overview'};
}

export function pageFromHash(hash:string):Page {
 return routeFromHash(hash).page;
}

export function poolHash(poolId:string,targetId?:string):string{
 const pool=`#pools/${encodeURIComponent(poolId)}`;
 return targetId?`${pool}/targets/${encodeURIComponent(targetId)}`:pool;
}

export function eventsHash(poolId?:string,targetId?:string):string{
 const filters=new URLSearchParams();
 if(poolId)filters.set('pool_id',poolId);
 if(targetId)filters.set('target_id',targetId);
 return filters.size?`#events?${filters}`:'#events';
}
