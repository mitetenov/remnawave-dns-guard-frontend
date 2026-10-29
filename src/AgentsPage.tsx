import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,ArrowLeft,ArrowRight,Globe,LoaderCircle,Server,ShieldCheck} from 'lucide-react';
import {api,json} from './api';
import {CheckerProxy} from './CheckerProxy';
import type {Checker} from './types';

export const agentStatus:Record<Checker['status'],string>={online:'Проверки доступны',control_unhealthy:'Прямая связь недоступна',proxy_unhealthy:'SOCKS5 недоступен',offline:'Нет связи',paused:'Проверки выключены'};
export function agentIDFromHash(hash:string){
 if(!hash.startsWith('#agents/'))return null;
 try{const id=decodeURIComponent(hash.slice(8));return /^[A-Za-z0-9_.-]{1,100}$/.test(id)?id:null;}catch{return null;}
}
function currentAgentID(){return typeof window==='undefined'?null:agentIDFromHash(window.location.hash);}

export function AgentDetail({agent,onChanged,onReload,onAuthError}:{agent:Checker;onChanged:(agent:Checker)=>void;onReload:()=>Promise<void>;onAuthError:(error:unknown)=>string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const routes=agent.routes??{direct:true,socks5:false,revision:0,supported:false};
 const proxySupported=!!agent.proxy?.supported;
 async function toggle(key:'direct_enabled'|'socks5_enabled',value:boolean){
  setBusy(true);setError('');
  try{onChanged(await api<Checker>(`/agents/${encodeURIComponent(agent.id)}`,json('PATCH',{[key]:value})));}catch(err){setError(onAuthError(err));}finally{setBusy(false);}
 }
 const proxyChanged=useCallback(()=>{void onReload();},[onReload]);
 return <div className="agent-detail">
  <div className="panel agent-identity"><div className="panel-heading"><div><h2><Server size={20}/>{agent.id}</h2><p>Версия {agent.version||'не сообщена'} · Последняя связь: {new Date(agent.last_seen).toLocaleString('ru-RU')}</p></div><span className={`badge ${agent.healthy?'green':'amber'}`}>{agentStatus[agent.status]}</span></div></div>
  {error&&<div className="error-box" role="alert">{error}</div>}
  <div className="agent-route-grid">
   <section className="panel agent-route" aria-label="Прямая проверка">
    <div className="panel-heading"><div><h2><Globe size={20}/>Напрямую</h2><p>Проверка из сети самого агента</p></div><button type="button" role="switch" aria-label="Проверять напрямую" aria-checked={routes.direct} className={`notification-switch ${routes.direct?'on':''}`} disabled={busy||!agent.routes} onClick={()=>void toggle('direct_enabled',!routes.direct)}><span/></button></div>
    <div className="agent-route-body"><p>Агент → Xray-нода → тестовый HTTPS-сайт.</p><p>Результат показывает доступность VLESS из сети, где запущен агент.</p><span className={`badge ${routes.direct?(agent.direct_healthy?'green':'amber'):'gray'}`}>{!routes.direct?'Выключено':agent.direct_healthy?'Контрольная связь доступна':'Контрольная связь недоступна'}</span></div>
   </section>
   <section className="panel agent-route" aria-label="Проверка через SOCKS5">
    <div className="panel-heading"><div><h2><ShieldCheck size={20}/>Через SOCKS5</h2><p>Проверка из сети выхода прокси</p></div><button type="button" role="switch" aria-label="Проверять через SOCKS5" aria-checked={routes.socks5} className={`notification-switch ${routes.socks5?'on':''}`} disabled={busy||!proxySupported||!agent.proxy?.configured} onClick={()=>void toggle('socks5_enabled',!routes.socks5)}><span/></button></div>
    <div className="agent-route-body"><p>Агент → SOCKS5 → Xray-нода → тестовый HTTPS-сайт.</p><p>Сбой самого SOCKS5 пропускает только этот маршрут. Прямая проверка продолжает работать.</p>{!agent.proxy?.configured&&proxySupported&&<p>Введите данные и проверьте прокси. После сохранения можно включить маршрут.</p>}<CheckerProxy agent={agent} onAuthError={onAuthError} onChanged={proxyChanged}/></div>
   </section>
  </div>
  <div className="info-note"><Activity size={18}/><p>Ошибка VLESS в любом включённом маршруте проваливает общий чек. Если достоверных результатов нет, чек пропускается. Когда оба маршрута выключены, агент остаётся на связи без проверок.</p></div>
 </div>;
}

export function AgentsPage({agents,loading,onAuthError}:{agents:Checker[];loading:boolean;onAuthError:(error:unknown)=>string}){
 const [selectedID,setSelectedID]=useState(currentAgentID),[selected,setSelected]=useState<Checker|null>(null),[error,setError]=useState(''),[detailLoading,setDetailLoading]=useState(false),[showOffline,setShowOffline]=useState(false);
 const currentID=useRef(selectedID);currentID.current=selectedID;
 const updateSelected=useCallback((value:Checker)=>{setSelected(previous=>previous?.id===value.id&&(previous.routes?.revision??0)>(value.routes?.revision??0)?previous:value);},[]);
 useEffect(()=>{const change=()=>setSelectedID(currentAgentID());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 const reload=useCallback(async()=>{
  if(!selectedID)return;
  try{const value=await api<Checker>(`/agents/${encodeURIComponent(selectedID)}`);if(currentID.current===selectedID){updateSelected(value);setError('');}}catch(err){if(currentID.current===selectedID)setError(onAuthError(err));}
 },[selectedID,onAuthError,updateSelected]);
 useEffect(()=>{
  let active=true;setSelected(null);setError('');
  if(!selectedID)return;
  setDetailLoading(true);
  void api<Checker>(`/agents/${encodeURIComponent(selectedID)}`).then(value=>{if(active)setSelected(value);}).catch(err=>{if(active)setError(onAuthError(err));}).finally(()=>{if(active)setDetailLoading(false);});
  const timer=window.setInterval(()=>void reload(),10000);
  return()=>{active=false;window.clearInterval(timer);};
 },[selectedID,onAuthError,reload]);
 function open(id:string|null){setSelectedID(id);window.location.hash=id?`agents/${encodeURIComponent(id)}`:'agents';}
 if(selectedID)return <><button className="button text agent-back" onClick={()=>open(null)}><ArrowLeft size={17}/>Все агенты</button>{detailLoading&&<p className="loading-label"><LoaderCircle className="spin" size={18}/>Загрузка агента…</p>}{error&&<div className="error-box" role="alert">{error}</div>}{selected&&<AgentDetail key={selected.id} agent={selected} onChanged={updateSelected} onReload={reload} onAuthError={onAuthError}/>}</>;
 const connected=agents.filter(agent=>agent.status!=='offline'),visible=showOffline?agents:connected;
 return <section className="panel agents-list" aria-label="Агенты">
  <div className="panel-heading"><div><h2>Подключённые агенты</h2><p>На связи: {connected.length} · Всего: {agents.length}</p></div><label className="agents-filter"><input type="checkbox" checked={showOffline} onChange={event=>setShowOffline(event.target.checked)}/>Показать офлайн</label></div>
  {loading&&!agents.length?<p className="loading-label"><LoaderCircle className="spin" size={18}/>Загрузка агентов…</p>:visible.length?<ul>{visible.map(agent=><li key={agent.id}><button className="agent-open" onClick={()=>open(agent.id)}><span className="agent-open-icon"><Server size={21}/></span><span className="agent-open-name"><strong>{agent.id}</strong><small>Версия {agent.version||'не сообщена'} · {new Date(agent.last_seen).toLocaleString('ru-RU')}</small><small>Напрямую: {agent.routes?.direct===false?'выкл.':'вкл.'} · SOCKS5: {agent.routes?.socks5?'вкл.':'выкл.'}</small></span><span className={`badge ${agent.healthy?'green':'amber'}`}>{agentStatus[agent.status]}</span><ArrowRight size={18}/></button></li>)}</ul>:<div className="agent-empty"><Server size={28}/><p>{agents.length?'Сейчас нет агентов на связи.':'Агенты пока не подключены.'}</p><p>Новый агент регистрируется автоматически с URL панели, общим токеном и уникальным AGENT_ID.</p></div>}
 </section>;
}
