import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowDown,Globe,Info,LoaderCircle,Settings2,SlidersHorizontal,Terminal,TriangleAlert,X} from 'lucide-react';
import {api} from './api';
import {eventsHash,poolHash} from './navigation';
import type {GuardEvent,Pool} from './types';
import './events.css';

export interface EventsRefresh {sequence:number;quiet:boolean}
interface EventPage {events:GuardEvent[];next_cursor:string|null}
interface EventJournal extends EventPage {showingHistory:boolean}

const eventDate=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const eventTypes={check:'Проверка',dns:'DNS',manual:'Вручную',system:'Система'} as const;
const eventLevels={info:'Информация',warning:'Предупреждение',error:'Ошибка'} as const;
const emptyJournal:EventJournal={events:[],next_cursor:null,showingHistory:false};

function scopeFromHash(){
 const hash=window.location.hash;
 const prefix='#events?';
 const params=new URLSearchParams(hash.startsWith(prefix)?hash.slice(prefix.length):'');
 return {poolId:params.get('pool_id')??'',targetId:params.get('target_id')??''};
}

export function EventsPage({pools,onAuthError,refresh}:{pools:Pool[];onAuthError:(error:unknown)=>string;refresh:EventsRefresh}){
 const [scope,setScope]=useState(scopeFromHash);
 const [targetInput,setTargetInput]=useState(scope.targetId);
 const [level,setLevel]=useState(''),[type,setType]=useState('');
 const [page,setPage]=useState<EventJournal>(emptyJournal);
 const [loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState('');
 const previousPath=useRef('');
 const headRequest=useRef<AbortController|null>(null);
 const moreRequest=useRef<AbortController|null>(null);
 const historyOpened=useRef(false);

 function changeScope(poolId:string,targetId:string){
  setScope({poolId,targetId});
  setTargetInput(targetId);
  window.location.hash=eventsHash(poolId,targetId);
 }

 useEffect(()=>{
  function readScope(){
   const current=scopeFromHash();
   setScope(current);
   setTargetInput(current.targetId);
  }
  window.addEventListener('hashchange',readScope);
  return()=>window.removeEventListener('hashchange',readScope);
 },[]);
 useEffect(()=>()=>moreRequest.current?.abort(),[]);

 const query=new URLSearchParams({limit:'100',paginated:'1'});
 if(level)query.set('level',level);
 if(type)query.set('type',type);
 if(scope.poolId)query.set('pool_id',scope.poolId);
 if(scope.targetId)query.set('target_id',scope.targetId);
 const path=`/events?${query}`;

 useEffect(()=>{
  const changed=previousPath.current!==path;
  if(!changed&&refresh.quiet&&(historyOpened.current||moreRequest.current))return;
  previousPath.current=path;
  if(changed||!refresh.quiet){
   moreRequest.current?.abort();
   moreRequest.current=null;
   setLoadingMore(false);
   setLoading(true);
   setError('');
  }
  if(changed){
   historyOpened.current=false;
   setPage(emptyJournal);
  }
  const controller=new AbortController();
  headRequest.current=controller;
  api<EventPage>(path,{signal:controller.signal}).then(data=>{
   if(controller.signal.aborted)return;
   historyOpened.current=false;
   setPage({...data,showingHistory:false});
   setError('');
  }).catch(reason=>{
   if(!controller.signal.aborted)setError(onAuthError(reason));
  }).finally(()=>{
   if(headRequest.current===controller)headRequest.current=null;
   if(!controller.signal.aborted)setLoading(false);
  });
  return()=>controller.abort();
 },[path,onAuthError,refresh.sequence,refresh.quiet]);

 async function loadOlder(){
  if(!page.next_cursor||moreRequest.current)return;
  headRequest.current?.abort();
  const controller=new AbortController();
  moreRequest.current=controller;
  setLoadingMore(true);
  setError('');
  try{
   const data=await api<EventPage>(`${path}&cursor=${encodeURIComponent(page.next_cursor)}`,{signal:controller.signal});
   if(controller.signal.aborted)return;
   historyOpened.current=true;
   setPage(current=>{
    const seen=new Set(current.events.map(event=>event.id));
    return {events:[...current.events,...data.events.filter(event=>!seen.has(event.id))],next_cursor:data.next_cursor,showingHistory:true};
   });
  }catch(reason){
   if(!controller.signal.aborted)setError(onAuthError(reason));
  }finally{
   if(moreRequest.current===controller){
    moreRequest.current=null;
    setLoadingMore(false);
   }
  }
 }

 const hasPool=scope.poolId&&pools.some(pool=>pool.id===scope.poolId);

 return <div className="panel">
  <div className="panel-heading"><h2>Журнал</h2></div>
  <div className="filters">
   <SlidersHorizontal size={18} aria-hidden="true"/>
   <label className="sr-only" htmlFor="level-filter">Уровень</label>
   <select id="level-filter" value={level} onChange={e=>setLevel(e.target.value)}>
    <option value="">Все уровни</option>
    <option value="info">Информация</option>
    <option value="warning">Предупреждения</option>
    <option value="error">Ошибки</option>
   </select>
   <label className="sr-only" htmlFor="type-filter">Тип события</label>
   <select id="type-filter" value={type} onChange={e=>setType(e.target.value)}>
    <option value="">Все типы событий</option>
    <option value="check">Проверки</option>
    <option value="dns">DNS</option>
    <option value="manual">Действия пользователя</option>
    <option value="system">Система</option>
   </select>
   <label className="sr-only" htmlFor="pool-filter">Пул</label>
   <select id="pool-filter" value={scope.poolId} onChange={e=>changeScope(e.target.value,'')}>
    <option value="">Все пулы</option>
    {scope.poolId&&!hasPool&&<option value={scope.poolId}>Пул из ссылки</option>}
    {pools.map(pool=><option key={pool.id} value={pool.id}>{pool.name}</option>)}
   </select>
   <form className="events-target-filter" onSubmit={e=>{e.preventDefault();changeScope(scope.poolId,targetInput.trim());}}>
    <label className="sr-only" htmlFor="target-filter">ID узла</label>
    <input id="target-filter" value={targetInput} onChange={e=>setTargetInput(e.target.value)} placeholder="ID узла" spellCheck={false}/>
    <button className="button secondary" type="submit" disabled={targetInput.trim()===scope.targetId}>Применить</button>
   </form>
   {(level||type||scope.poolId||scope.targetId||targetInput)&&<button className="button text" onClick={()=>{setLevel('');setType('');changeScope('','');}}>Сбросить<X size={14}/></button>}
  </div>
  {error&&<div className="error-box" role="alert"><TriangleAlert size={18}/>{error}</div>}
  {!loading&&page.showingHistory&&<p className="events-history-note" role="status">Автообновление приостановлено. «Обновить» вернёт к новым событиям.</p>}
  <div aria-busy={loading||loadingMore}>
   {loading?<div className="panel-loading"><span className="loading-label"><LoaderCircle size={17} className="spin"/>Загрузка событий…</span></div>:
    error&&!page.events.length?null:
    scope.targetId&&!page.events.length?<div className="empty"><h3>Пока нет событий по этому узлу</h3><p>Проверьте выбранные фильтры и ID узла.</p></div>:
    <EventList events={page.events} pools={pools}/>}
   {!loading&&page.next_cursor&&<div className="events-pagination">
    <button type="button" className="button secondary" onClick={()=>void loadOlder()} disabled={loadingMore}>
     {loadingMore?<><LoaderCircle size={16} className="spin"/>Загрузка событий…</>:<><ArrowDown size={16}/>Показать ещё</>}
    </button>
   </div>}
  </div>
 </div>;
}

export function EventList({events,pools,compact=false}:{events:GuardEvent[];pools:Pool[];compact?:boolean}){
 if(!events.length)return <div className="empty"><div className="empty-icon"><Terminal size={27}/></div><h3>Пока нет событий</h3><p>Здесь появятся результаты проверок, изменения DNS и действия администратора.</p></div>;
 const poolNames=new Map(pools.map(pool=>[pool.id,pool.name]));
 return <div className={`event-list ${compact?'compact':''}`}>
  {events.map(event=><article className="event" key={event.id}>
   <span className={`event-icon ${event.level}`} aria-hidden="true">
    {event.level==='error'?<TriangleAlert size={17}/>:event.type==='dns'?<Globe size={17}/>:event.type==='check'?<Activity size={17}/>:event.type==='manual'?<Settings2 size={17}/>:<Info size={17}/>}
   </span>
   <div className="event-main">
    <div className="event-message">{event.message}</div>
    <div className="event-meta">
     <span className={`level-label ${event.level}`}>{eventLevels[event.level]}</span><span>·</span><span>{eventTypes[event.type]}</span>
     {event.pool_id&&<><span>·</span><span>{poolNames.get(event.pool_id)||'Пул удалён'}</span></>}
     {event.pool_id&&event.target_id&&<><span>·</span><a href={poolHash(event.pool_id,event.target_id)}>Открыть узел</a></>}
     {!compact&&event.target_id&&<><span>·</span><a href={eventsHash(event.pool_id??undefined,event.target_id)}>События узла</a></>}
    </div>
   </div>
   <time dateTime={event.created_at}>{eventDate.format(new Date(event.created_at))}</time>
  </article>)}
 </div>;
}
