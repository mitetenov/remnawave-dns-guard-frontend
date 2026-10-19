import {api,json} from './api';
import {parseVless} from './profile';
import type {ProbeProfile} from './types';

export interface SubscriptionServer {
 name:string;
 address:string;
 profile:ProbeProfile|null;
 error:string;
}

export function subscriptionServers(uris:string[]):SubscriptionServer[] {
 return uris.map((uri,index)=>{
  let name=`Сервер ${index+1}`,address='';
  try {
   const url=new URL(uri);
   address=url.host;
   if(url.hash.length>1)name=decodeURIComponent(url.hash.slice(1));
  } catch { /* Keep a safe label for malformed links. */ }
  try {return {name,address,profile:parseVless(uri),error:''};}
  catch(error){return {name,address,profile:null,error:error instanceof Error?error.message:'Не удалось прочитать параметры сервера.'};}
 });
}

export async function loadSubscription(value:string,useHwid=false):Promise<SubscriptionServer[]> {
 let url:URL;
 try {url=new URL(value.trim());}
 catch {throw new Error('Укажите HTTPS-ссылку на подписку.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Укажите HTTPS-ссылку на подписку без логина, пароля и фрагмента.');
 const result=await api<{uris:string[]}>('/subscriptions/preview',json('POST',{url:url.href,...(useHwid?{use_hwid:true}:{})}));
 return subscriptionServers(result.uris);
}
