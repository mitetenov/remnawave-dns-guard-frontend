import {useEffect,useId,useState} from 'react';
import {api} from './api';

export type NodePluginChoice={id:string;label:string};

export function NodePluginSelect({value,defaultLabel,onChange,onAuthError,disabled,active=true}:{
 value:NodePluginChoice|null;
 defaultLabel:string;
 onChange:(plugin:NodePluginChoice|null)=>void;
 onAuthError:(error:unknown)=>string;
 disabled:boolean;
 active?:boolean;
}){
 const id=useId();
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<{attempt:number;choices:NodePluginChoice[];error:string}>();
 const current=result?.attempt===attempt?result:undefined;
 const choices=current?.choices??[];

 useEffect(()=>{
  if(!active)return;
  const controller=new AbortController();
  api<{choices:NodePluginChoice[]}>('/server-orders/options?kind=plugin',{signal:controller.signal}).then(response=>{
   if(!Array.isArray(response?.choices))throw new Error('Сервер вернул неполный список плагинов.');
   if(!controller.signal.aborted)setResult({attempt,choices:response.choices,error:''});
  }).catch(error=>{
   if(!controller.signal.aborted)setResult({attempt,choices:[],error:onAuthError(error)});
  });
  return()=>controller.abort();
 },[active,attempt,onAuthError]);

 return <div className="field">
  <span><label htmlFor={id}>Плагин ноды Remnawave</label></span>
  <select id={id} value={value?.id??''} disabled={disabled||(!value&&!choices.length)} onChange={event=>onChange(choices.find(choice=>choice.id===event.target.value)??null)}>
   <option value="">{defaultLabel}</option>
   {value&&!choices.some(choice=>choice.id===value.id)&&<option value={value.id}>{value.label}</option>}
   {choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
  </select>
  {active&&!current&&<small role="status">Загрузка плагинов…</small>}
  {active&&current?.error&&<small role="status">Не удалось загрузить плагины. {current.error}</small>}
  {active&&current&&!current.error&&!choices.length&&<small>В Remnawave нет плагинов нод.</small>}
  {active&&current?.error&&<button type="button" className="button secondary" disabled={disabled} onClick={()=>setAttempt(previous=>previous+1)}>Обновить список плагинов</button>}
 </div>;
}
