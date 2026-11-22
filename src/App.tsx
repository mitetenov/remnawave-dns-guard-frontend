import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Activity,ArrowDownToLine,ArrowLeft,ArrowRight,Check,CheckCircle2,ChevronRight,Cloud,Cog,Globe,HeartPulse,Info,KeyRound,LayoutDashboard,LoaderCircle,LogOut,Menu,Network,Pause,Pencil,Play,Plus,RefreshCw,Repeat2,Search,Server,ServerCog,Settings2,ShieldCheck,ShieldOff,SlidersHorizontal,Terminal,Trash2,TriangleAlert,X,Zap} from 'lucide-react';
import {api,ApiError,json} from './api';
import {blankProfile,isPublicIPv4,parseProfileURI,profileForProtocol,validateProfile} from './profile';
import {loadSubscription,type SubscriptionServer} from './subscription';
import {profileWithExtra} from './xhttpExtra';
import {profileWithALPN} from './alpn';
import type {Checker,GuardEvent,Host,Node,Overview,Pool,PoolInput,ProbeProfile,Settings,Target,TargetStatus,Zone} from './types';

import {pageNames,poolHash,routeFromHash} from './navigation';
import {EventList,EventsPage,type EventsRefresh} from './EventsPage';
import {TargetCards,targetAnchorId} from './TargetCards';
import {NotificationsSettings} from './NotificationsSettings';
import {PoolTargetCount} from './PoolTargetCount';
import {PoolCheckProgress,summarizePoolCheck,type PoolCheckReceipt,type PoolCheckRun} from './PoolCheckProgress';
import {checkerCount} from './status';
import {ProviderSettings,providerSettingsHash} from './ProviderSettings';
import {AgentsPage} from './AgentsPage';
import {ReplacementsPage,useReplacements} from './ReplacementsPage';
import {ServerOrdersPage,useServerOrders} from './ServerOrdersPage';
import {Modal} from './Modal';
type ModalState={type:'pool';pool?:Pool}|{type:'target';pool:Pool;target?:Target}|{type:'import';pool:Pool}|{type:'profile';pool:Pool;checkAfterSave?:boolean}|{type:'delete-target';target:Target}|{type:'confirm';title:string;description:string;label:string;danger?:boolean;deletedPoolId?:string;successMessage?:string;action:()=>Promise<unknown>}|null;
type Notice={message:string;error:boolean};
type PanelHeader=Pick<Overview,'pools'|'agents_total'|'agents_healthy'|'agent_healthy'>;
const mobileQuery='(max-width:760px)';
const statusNames:Record<TargetStatus,string>={unknown:'Ожидает проверки',healthy:'Доступен',suspect:'Под подозрением',excluded:'Исключён',recovering:'Восстанавливается',disabled:'Отключён вручную',protected:'Последний A · защищён',stale:'Нет свежих данных'};
function date(value:string|null){return value?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value)):'Ещё не было';}
function errorMessage(error:unknown){return error instanceof Error?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.';}
function IconButton({children,label,onClick,disabled=false,className=''}:{children:ReactNode;label:string;onClick:()=>void;disabled?:boolean;className?:string}){return <button className={`icon-button ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>}
function Badge({children,tone='muted'}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`}><span className="badge-dot"/>{children}</span>}
function Empty({icon=<Network size={28}/>,title,description,action}:{icon?:ReactNode;title:string;description:string;action?:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>}
function ErrorBox({message}:{message:string}){return <div className="error-box" role="alert"><TriangleAlert size={18}/><span>{message}</span></div>}
function Spinner({label='Загрузка…'}:{label?:string}){return <span className="loading-label"><LoaderCircle className="spin" size={17}/>{label}</span>}
function Field({label,help,children}:{label:string;help?:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}{help&&<small>{help}</small>}</label>}
export default function App(){
 const [user,setUser]=useState<string|null>(null),[authLoading,setAuthLoading]=useState(true);
 const [route,setRoute]=useState(()=>routeFromHash(window.location.hash));
 const {page,poolId,targetId}=route;
 const [overview,setOverview]=useState<Overview|null>(null),[header,setHeader]=useState<PanelHeader|null>(null);
 const [pools,setPools]=useState<Pool[]>([]),[poolsLoaded,setPoolsLoaded]=useState(false),[settings,setSettings]=useState<Settings|null>(null);
 const [agents,setAgents]=useState<Checker[]>([]);
 const [targetData,setTargetData]=useState<{poolId:string;items:Target[];error:string;loading:boolean}|null>(null);
 const [events,setEvents]=useState<GuardEvent[]>([]),[eventLoading,setEventLoading]=useState(true),[eventError,setEventError]=useState('');
 const [eventsRefresh,setEventsRefresh]=useState<EventsRefresh>({sequence:0,quiet:false});
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[updated,setUpdated]=useState<Date|null>(null),[notice,setNotice]=useState<Notice|null>(null),[modal,setModal]=useState<ModalState>(null),[busyKeys,setBusyKeys]=useState<Set<string>>(new Set());
 const [mobileOpen,setMobileOpen]=useState(false);
 const [settingsRevision,setSettingsRevision]=useState(0);
 const [manualChecks,setManualChecks]=useState<Map<string,PoolCheckRun>>(()=>new Map());
 const [checkClock,setCheckClock]=useState(0);
 const mobileMenu=useRef<HTMLButtonElement>(null),sidebar=useRef<HTMLElement>(null),closeMenuButton=useRef<HTMLButtonElement>(null);
 const [mobileViewport,setMobileViewport]=useState(()=>window.matchMedia?.(mobileQuery).matches??false);
 const selected=poolId?pools.find(pool=>pool.id===poolId):undefined;
 const selectedId=selected?.id;
 const currentTargets=targetData?.poolId===selectedId?targetData:null;
 const targets=currentTargets?.items??[];
 const targetsLoading=!!selectedId&&(!currentTargets||currentTargets.loading);
 const manualCheck=selectedId?manualChecks.get(selectedId):undefined;
 const checkSummary=manualCheck?summarizePoolCheck(manualCheck,targets):undefined;
 const waitingForChecks=!!manualCheck?.expected_agents.length&&!checkSummary?.complete&&Math.max(checkClock,Date.now())<manualCheck.waitUntil;
 const shell=page==='overview'?overview??header:header??overview;
 const routeRef=useRef(route);
 const selectedRef=useRef(selectedId);
 selectedRef.current=selectedId;
 const dashboardRequest=useRef<AbortController|null>(null),targetRequest=useRef<AbortController|null>(null),eventRequest=useRef<AbortController|null>(null);
 const invalidateRequests=useCallback(()=>{dashboardRequest.current?.abort();targetRequest.current?.abort();eventRequest.current?.abort();},[]);
 const clearSession=useCallback(()=>{
  invalidateRequests();
  setUser(null);setModal(null);setMobileOpen(false);
  setOverview(null);setHeader(null);setPools([]);setPoolsLoaded(false);setSettings(null);setAgents([]);
  setTargetData(null);setEvents([]);setUpdated(null);setNotice(null);setManualChecks(new Map());
 },[invalidateRequests]);
 const handleFailure=useCallback((error:unknown)=>{
  if(error instanceof ApiError&&error.status===401)clearSession();
  return errorMessage(error);
 },[clearSession]);
 const replacements=useReplacements(!!user&&page==='replacements',handleFailure);
 const reloadReplacements=replacements.reload;
 const serverOrders=useServerOrders(!!user&&page==='servers',handleFailure);
 const reloadServerOrders=serverOrders.reload;
 useEffect(()=>{let active=true;api<{username:string}>('/auth/me').then(data=>{if(active)setUser(data.username);}).catch(error=>{if(active&&(!(error instanceof ApiError)||error.status!==401))setLoadError(errorMessage(error));}).finally(()=>{if(active)setAuthLoading(false);});return()=>{active=false;invalidateRequests();};},[invalidateRequests]);

 const load=useCallback(async(quiet=false)=>{
  const activePage=routeRef.current.page;
  dashboardRequest.current?.abort();
  const request=new AbortController();
  dashboardRequest.current=request;
  if(!quiet){setLoading(true);setLoadError('');}
  const errors:unknown[]=[];
  const fetchResource=async<T,>(path:string,apply:(data:T)=>void)=>{
   try{
    const data=await api<T>(path,{signal:request.signal});
    if(!request.signal.aborted)apply(data);
   }catch(error){
    if(request.signal.aborted)return;
    errors.push(error);
    if(error instanceof ApiError&&error.status===401){
     handleFailure(error);
     setLoadError('');
     setLoading(false);
    }
   }
  };
  const headerRequest=activePage==='overview'?null:fetchResource<PanelHeader>('/header',data=>setHeader(data));
  const requests:Promise<void>[]=[];
  if(activePage==='overview')requests.push(fetchResource<Overview>('/overview',data=>{setOverview(data);setHeader(data);}));
  if(activePage==='overview'||activePage==='pools'||activePage==='events'&&!quiet){
   requests.push(fetchResource<Pool[]>('/pools',data=>{setPools(data);setPoolsLoaded(true);}));
  }
  if(activePage==='settings')requests.push(fetchResource<Settings>('/settings',data=>setSettings(data)));
  if(activePage==='agents')requests.push(fetchResource<Checker[]>('/agents',data=>setAgents(data)));
  await Promise.all(requests);
  if(!request.signal.aborted&&requests.length)setLoading(false);
  await headerRequest;
  if(request.signal.aborted)return;
  setLoading(false);
  if(errors.length)setLoadError(handleFailure(errors[0]));
  else {setLoadError('');setUpdated(new Date());}
 },[handleFailure]);

 const loadTargets=useCallback(async(id:string,quiet=false)=>{
  if(routeRef.current.poolId!==id||selectedRef.current!==id)return;
  targetRequest.current?.abort();
  const request=new AbortController();
  targetRequest.current=request;
  if(!quiet)setTargetData(previous=>({poolId:id,items:previous?.poolId===id?previous.items:[],error:'',loading:true}));
  try{
   const data=await api<Target[]>(`/pools/${encodeURIComponent(id)}/targets`,{signal:request.signal});
   if(!request.signal.aborted)setTargetData({poolId:id,items:data,error:'',loading:false});
  }catch(error){
   if(request.signal.aborted)return;
   const message=handleFailure(error);
   if(!request.signal.aborted)setTargetData(previous=>({poolId:id,items:previous?.poolId===id?previous.items:[],error:message,loading:false}));
  }finally{
   if(targetRequest.current===request)targetRequest.current=null;
  }
 },[handleFailure]);

 const loadRecentEvents=useCallback(async(quiet=false)=>{
  if(routeRef.current.page!=='overview')return;
  eventRequest.current?.abort();
  const request=new AbortController();
  eventRequest.current=request;
  if(!quiet)setEventLoading(true);
  try{
   const data=await api<GuardEvent[]>('/events?limit=8',{signal:request.signal});
   if(!request.signal.aborted){setEvents(data);setEventError('');}
  }catch(error){
   if(!request.signal.aborted)setEventError(handleFailure(error));
  }finally{
   if(!request.signal.aborted)setEventLoading(false);
  }
 },[handleFailure]);
 const refreshEvents=useCallback((quiet=false)=>{
  if(routeRef.current.page==='overview')return loadRecentEvents(quiet);
  if(routeRef.current.page==='events')setEventsRefresh(previous=>({sequence:previous.sequence+1,quiet}));
 },[loadRecentEvents]);

 useEffect(()=>{if(user)void load();return()=>dashboardRequest.current?.abort();},[user,page,load]);
 useEffect(()=>{if(user&&page==='overview')void loadRecentEvents();return()=>eventRequest.current?.abort();},[user,page,loadRecentEvents]);
 useEffect(()=>{
  setTargetData(null);
  if(user&&selectedId)void loadTargets(selectedId);
  return()=>targetRequest.current?.abort();
 },[user,selectedId,loadTargets]);

 const updateRoute=useCallback((hash:string)=>{
  const next=routeFromHash(hash);
  const previous=routeRef.current;
  if(previous.page!==next.page){dashboardRequest.current?.abort();eventRequest.current?.abort();}
  if(previous.poolId!==next.poolId)targetRequest.current?.abort();
  routeRef.current=next;
  setRoute(next);
  setMobileOpen(false);
 },[]);
 useEffect(()=>{
  const listener=()=>updateRoute(window.location.hash);
  window.addEventListener('hashchange',listener);
  return()=>window.removeEventListener('hashchange',listener);
 },[updateRoute]);
 const navigate=(hash:string)=>{
  updateRoute(hash);
  window.location.hash=hash;
 };

 useEffect(()=>{
  const media=window.matchMedia?.(mobileQuery);
  if(!media)return;
  const update=()=>{
   setMobileViewport(media.matches);
   if(!media.matches)setMobileOpen(false);
  };
  update();
  media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  if(!mobileOpen||!user)return;
  closeMenuButton.current?.focus();
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){
    event.preventDefault();
    setMobileOpen(false);
   }
   if(event.key==='Tab'){
    const controls=sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)');
    if(!controls?.length)return;
    const first=controls[0],last=controls[controls.length-1];
    const wrap=event.shiftKey?document.activeElement===first:document.activeElement===last;
    if(wrap||!sidebar.current?.contains(document.activeElement)){
     event.preventDefault();
     (event.shiftKey?last:first).focus();
    }
   }
  };
  document.addEventListener('keydown',onKeyDown);
  return()=>{
   document.body.style.overflow=overflow;
   document.removeEventListener('keydown',onKeyDown);
   mobileMenu.current?.focus();
  };
 },[mobileOpen,user]);

 const refreshVisibleTargets=(quiet=false)=>{
  const id=selectedRef.current;
  if(id)return loadTargets(id,quiet);
 };
 const refresh=async()=>{
  if(page==='servers')serverOrders.refreshOptions();
  if(page==='settings')setSettingsRevision(value=>value+1);
  await Promise.all([
   load(),refreshVisibleTargets(),refreshEvents(),
   page==='replacements'?reloadReplacements():undefined,
   page==='servers'?reloadServerOrders():undefined,
  ]);
 };
 const refreshAfterError=async()=>{await Promise.all([load(true),refreshVisibleTargets(true)]);};
 const run=async(key:string,action:()=>Promise<unknown>,message:string|((result:unknown)=>string))=>{
  setBusyKeys(previous=>new Set(previous).add(key));
  try{
   const result=await action();
   setNotice({message:typeof message==='function'?message(result):message,error:false});
   await Promise.all([load(true),refreshVisibleTargets(true),refreshEvents(true)]);
  }catch(error){
   setNotice({message:handleFailure(error),error:true});
   if(!(error instanceof ApiError&&error.status===401))await refreshAfterError();
  }finally{
   setBusyKeys(previous=>{const next=new Set(previous);next.delete(key);return next;});
  }
 };
 const checkPool=(pool:Pool)=>run(`${pool.id}-check`,async()=>{
  const receipt=await api<PoolCheckReceipt>(`/pools/${encodeURIComponent(pool.id)}/check`,json('POST'));
  if(receipt?.started_at&&Array.isArray(receipt.expected_agents)&&Array.isArray(receipt.target_ids)){
   setManualChecks(previous=>new Map(previous).set(pool.id,{...receipt,waitUntil:Date.now()+120000}));
  }
 },'Ручная проверка запрошена.');
 const signOut=async()=>{
  setBusyKeys(previous=>new Set(previous).add('logout'));
  try{
   await api('/auth/logout',json('POST'));
   clearSession();
   setLoadError('');
  }catch(error){
   setNotice({message:handleFailure(error),error:true});
  }finally{
   setBusyKeys(previous=>{const next=new Set(previous);next.delete('logout');return next;});
  }
 };
 const openPool=(pool:Pool)=>navigate(poolHash(pool.id));
 useEffect(()=>{
  if(!user)return;
  const id=window.setInterval(()=>{
   if(document.visibilityState!=='visible')return;
   void load(true);
   void refreshEvents(true);
   if(page==='replacements')void reloadReplacements(true);
   if(page==='servers')void reloadServerOrders(true);
  },20000);
  return()=>window.clearInterval(id);
 },[user,page,load,refreshEvents,reloadReplacements,reloadServerOrders]);
 useEffect(()=>{
  if(!user||!selectedId)return;
  const id=window.setInterval(()=>{
   if(document.visibilityState==='visible'&&(!targetRequest.current||targetRequest.current.signal.aborted))void loadTargets(selectedId,true);
  },waitingForChecks?5000:20000);
  return()=>window.clearInterval(id);
 },[user,selectedId,waitingForChecks,loadTargets]);
 useEffect(()=>{
  if(!manualCheck||!waitingForChecks)return;
  const timeout=window.setTimeout(()=>setCheckClock(Date.now()),Math.max(0,manualCheck.waitUntil-Date.now()));
  return()=>window.clearTimeout(timeout);
 },[manualCheck,waitingForChecks]);
 const togglePool=(pool:Pool)=>{if(pool.automation_enabled){void run(pool.id,()=>api(`/pools/${pool.id}`,json('PATCH',{automation_enabled:false})),'Автоматизация приостановлена. Проверки продолжаются.');}else setModal({type:'confirm',title:'Включить автоматизацию?',description:`DNS Guard будет исключать и возвращать A-записи ${pool.hostname} по результатам проверок из РФ. Последняя A-запись останется защищённой. Для запуска нужны профиль и хотя бы один узел.`,label:'Включить автоматизацию',action:()=>api(`/pools/${pool.id}`,json('PATCH',{automation_enabled:true}))});};
 const deletePool=(pool:Pool)=>setModal({type:'confirm',title:'Удалить DNS-пул?',description:`Пул «${pool.name}» (${pool.hostname}), его узлы и профиль будут удалены из панели. Проверки и автоматизация остановятся. A-записи в Cloudflare сохранятся.`,label:'Удалить пул',danger:true,deletedPoolId:pool.id,successMessage:'Пул удалён. A-записи в Cloudflare сохранены.',action:()=>api(`/pools/${pool.id}`,json('DELETE'))});
 const targetAction=(target:Target,action:'edit'|'disable'|'delete'|'enable')=>{
  if(action==='edit'){if(selected)setModal({type:'target',pool:selected,target});return;}
  if(action==='enable'){void run(target.id,()=>api(`/targets/${target.id}/enable`,json('POST')),'Мониторинг возобновлён. A-запись будет добавлена после успешных проверок.');return;}
  if(action==='delete'){setModal({type:'delete-target',target});return;}
  setModal({type:'confirm',title:'Отключить узел вручную?',description:`A-запись ${target.ip} будет удалена из DNS. Узел не вернётся автоматически — включите его вручную. Последнюю A-запись отключить нельзя.`,label:'Отключить узел',danger:true,action:()=>api(`/targets/${target.id}/disable`,json('POST'))});
 };
 if(authLoading)return <div className="auth-page"><div className="brand"><ShieldCheck size={30}/><span>DNS<span>Guard</span></span></div><Spinner label="Проверка сессии…"/></div>;
 if(!user)return <Login initialError={loadError} onLogin={username=>{setLoadError('');setUser(username);}}/>;
 return <div className="app-shell">
  {mobileOpen&&<div className="sidebar-shade" aria-hidden="true" onClick={()=>setMobileOpen(false)}/>}
  <aside id="main-sidebar" ref={sidebar} className={`sidebar ${mobileOpen?'open':''}`} inert={mobileViewport&&!mobileOpen} role={mobileOpen?'dialog':undefined} aria-modal={mobileOpen||undefined} aria-label={mobileOpen?'Меню навигации':undefined}>
   {mobileOpen&&<button ref={closeMenuButton} className="icon-button sidebar-close" type="button" onClick={()=>setMobileOpen(false)} aria-label="Закрыть меню"><X size={21}/></button>}<a className="brand" href="#overview" onClick={()=>navigate('overview')}><div className="brand-mark"><ShieldCheck size={25}/></div><span>DNS<span>Guard</span></span></a><div className="workspace-tag"><span className="tiny-dot"/>Панель управления</div><div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav aria-label="Основная навигация">{([{id:'overview',icon:LayoutDashboard},{id:'pools',icon:Network},{id:'servers',icon:ServerCog},{id:'replacements',icon:Repeat2},{id:'agents',icon:Server},{id:'events',icon:Terminal},{id:'settings',icon:Cog}] as const).map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} aria-current={page===item.id?'page':undefined} onClick={()=>navigate(item.id)}><item.icon size={19}/><span>{pageNames[item.id]}</span>{item.id==='pools'&&(shell?.pools??0)>0&&<span className="nav-count">{shell?.pools}</span>}{item.id==='agents'&&(shell?.agents_total??0)>0&&<span className="nav-count">{shell?.agents_total}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="agent-mini"><div className={`agent-symbol ${shell?.agent_healthy?'online':''}`}><Activity size={19}/></div><div><strong>RU чекеры</strong><span>{shell?checkerCount(shell):'Чекеры: —'}</span></div><span className={`tiny-dot ${shell?.agent_healthy?'':'off'}`}/></div><button className="user-button" onClick={()=>void signOut()} disabled={busyKeys.has('logout')} title="Выйти из системы"><span className="avatar">{user.slice(0,2).toUpperCase()}</span><span><strong>{user}</strong><small>Администратор</small></span><LogOut size={17}/></button><div className="sidebar-footer">DNS Guard <span>v1.0</span></div></div></aside>
  <main className="main" inert={mobileOpen}><header className="topbar"><div className="breadcrumb"><button ref={mobileMenu} className="icon-button mobile-menu" type="button" aria-label="Открыть меню" aria-controls="main-sidebar" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><span>Рабочее пространство</span><ChevronRight size={15}/><strong>{pageNames[page]}</strong></div><div className="topbar-right"><span className="topbar-live"><span className={`tiny-dot ${shell?.agent_healthy?'':'off'}`}/>{shell?checkerCount(shell):'Чекеры: —'}</span><span className="topbar-divider"/><span className="avatar small">{user.slice(0,2).toUpperCase()}</span></div></header>
   <div className="content"><div className="page-heading"><div><div className="eyebrow">{page==='overview'?'МОНИТОРИНГ И АВТОМАТИЗАЦИЯ':page==='pools'||page==='replacements'||page==='servers'?'ИНФРАСТРУКТУРА':page==='events'?'ИСТОРИЯ ОПЕРАЦИЙ':page==='agents'?'ТОЧКИ ПРОВЕРКИ':'КОНФИГУРАЦИЯ'}</div><h1>{page==='pools'&&selected?selected.name:pageNames[page]}</h1><p>{page==='overview'?'Доступность узлов из РФ. DNS под контролем.':page==='pools'&&selected?selected.hostname:page==='pools'?'Управляйте A-записями и правилами восстановления.':page==='events'?'Проверки, изменения DNS и действия администратора.':page==='agents'?'Управляйте прямыми проверками и проверками через SOCKS5.':page==='replacements'?'Замена серверов UpCloud при блокировке IP.':page==='servers'?'Заказы серверов и шаблоны доменов для DNS-пулов.':'Подключения сервисов и состояние probe-агента.'}</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>void refresh()} aria-label="Обновить" disabled={loading||page==='replacements'&&replacements.loading||page==='servers'&&serverOrders.loading}><RefreshCw size={16} className={loading||page==='replacements'&&replacements.loading||page==='servers'&&serverOrders.loading?'spin':''}/><span>Обновить</span></button>{(page==='overview'||page==='pools'&&!poolId)&&<button className="button primary" onClick={()=>setModal({type:'pool'})}><Plus size={17}/>Создать пул</button>}</div></div>
    {notice&&<div className={`notice ${notice.error?'error':'success'}`} role={notice.error?'alert':'status'}>{notice.error?<TriangleAlert size={18}/>:<CheckCircle2 size={18}/>}<span>{notice.message}</span><IconButton label="Закрыть уведомление" onClick={()=>setNotice(null)}><X size={16}/></IconButton></div>}
    {loadError&&<ErrorBox message={loadError}/>}
    {loading&&(page==='overview'&&!overview||page==='pools'&&!poolsLoaded||page==='settings'&&!settings)&&<div className="panel initial-loading"><Spinner label="Загрузка…"/></div>}
    {page==='agents'&&<AgentsPage agents={agents} loading={loading} onAuthError={handleFailure}/>}
    {page==='servers'&&<ServerOrdersPage {...serverOrders} onAuthError={handleFailure}/>}
    {page==='replacements'&&<ReplacementsPage {...replacements} onAuthError={handleFailure}/>}
    {page==='overview'&&<><div className="metric-grid"><Metric label="DNS-пулы" value={overview?.pools} icon={<Network size={20}/>} detail="Общие профили подключения"/><Metric label="Узлы в мониторинге" value={overview?.targets} icon={<Server size={20}/>} detail="Проверки через VLESS"/><Metric label="Доступные узлы" value={overview?.healthy} icon={<HeartPulse size={20}/>} detail="Свежая успешная проверка" tone="green"/><Metric label="Исключены из DNS" value={overview?.excluded} icon={<ShieldOff size={20}/>} detail="Проверки продолжаются" tone="amber"/></div>
     <div className={`agent-banner ${overview?.agent_healthy?'healthy':''}`}><div className="agent-banner-icon"><Activity size={22}/></div><div><h3>{overview?.agent_healthy?'Проверки из России доступны':overview?.agent_last_seen?'Нет готовых чекеров':'Подключите чекер в России'}</h3><p>{overview?.agent_healthy?'Каждый чекер проверяет все IP через VLESS. Ошибки любого чекера учитываются независимо; исключённые узлы остаются под наблюдением.':overview?.agent_last_seen?'Нет чекеров с доступной контрольной связью. Это не считается сбоем узлов.':'До подключения чекера результаты проверок не появятся. Настройте чекер и общий профиль пула.'}</p></div><button className="button text" onClick={()=>navigate('agents')}>Состояния чекеров<ArrowRight size={16}/></button></div>
     <div className="panel"><PanelHeading title="DNS-пулы" description="Один hostname · общий профиль · независимые узлы" action={<button className="button text" onClick={()=>navigate('pools')}>Все пулы<ArrowRight size={16}/></button>}/><PoolTable pools={pools} onSelect={openPool} onEdit={pool=>setModal({type:'pool',pool})} onToggle={togglePool} onDelete={deletePool} busy={busyKeys} onCreate={()=>setModal({type:'pool'})}/></div>
     <div className="overview-bottom"><div className="panel events-panel"><PanelHeading title="Последние события" action={<button className="button text" onClick={()=>navigate('events')}>Открыть журнал<ArrowRight size={16}/></button>}/>{eventError?<ErrorBox message={eventError}/>:eventLoading&&!events.length?<div className="panel-loading"><Spinner/></div>:<EventList events={events} pools={pools} compact/>}</div><div className="panel integrations-panel"><PanelHeading title="Подключения"/><IntegrationRow name="Cloudflare" detail="Управление A-записями" icon={<Cloud size={22}/>} configured={overview?.cloudflare_configured}/><IntegrationRow name="Remnawave" detail="Импорт узлов и хостов" icon={<Network size={22}/>} configured={overview?.remnawave_configured}/><div className="integration-footer"><div className="info-note"><ShieldCheck size={17}/><p>Последняя A-запись защищена от автоматического и ручного удаления.</p></div><button className="button secondary full" onClick={()=>navigate('settings')}><Settings2 size={16}/>Настроить подключения</button></div></div></div>
    </>}
    {page==='pools'&&poolsLoaded&&(selected?<><button className="back-link" onClick={()=>navigate('pools')}><ArrowLeft size={16}/>Все DNS-пулы</button><PoolDetail key={selected.id} pool={selected} targets={targets} targetsLoading={targetsLoading} targetsError={currentTargets?.error} targetId={targetId} checkProgress={manualCheck&&checkSummary&&<PoolCheckProgress run={manualCheck} summary={checkSummary} waiting={waitingForChecks}/>} busy={busyKeys} onEdit={()=>setModal({type:'pool',pool:selected})} onDelete={()=>deletePool(selected)} onProfile={()=>setModal({type:'profile',pool:selected})} onAdd={()=>setModal({type:'target',pool:selected})} onImport={()=>setModal({type:'import',pool:selected})} onToggle={()=>togglePool(selected)} onSync={()=>void run(`${selected.id}-sync`,()=>api<{added:number;message:string}>(`/pools/${selected.id}/sync`,json('POST')),result=>{const data=result as {added:number;message:string};return `${data.message} Добавлено: ${data.added}.`;})} onCheck={()=>{if(selected.profile_configured)void checkPool(selected);else setModal({type:'profile',pool:selected,checkAfterSave:true});}} onTargetAction={targetAction}/></>:poolId?<div className="panel"><Empty title="DNS-пул не найден" description="Возможно, пул удалён." action={<button className="button secondary" onClick={()=>navigate('pools')}>Все DNS-пулы</button>}/></div>:<div className="panel"><PanelHeading title="Ваши DNS-пулы" description="Автоматизация включается отдельно для каждого пула"/><PoolTable pools={pools} onSelect={openPool} onEdit={pool=>setModal({type:'pool',pool})} onToggle={togglePool} onDelete={deletePool} busy={busyKeys} onCreate={()=>setModal({type:'pool'})}/></div>)}
    {page==='events'&&<EventsPage pools={pools} onAuthError={handleFailure} refresh={eventsRefresh}/>}
    {page==='settings'&&settings&&<SettingsView settings={settings} providerRevision={settingsRevision} focusProviders={window.location.hash===providerSettingsHash} onSaved={async message=>{setNotice({message,error:false});await load(true);}} onAuthError={handleFailure}/>}
    <footer className="content-footer"><span><ShieldCheck size={14}/>Последняя A-запись всегда под защитой</span><span>{updated?`Данные обновлены в ${updated.toLocaleTimeString('ru-RU')}`:'Ожидаем данные сервера'}</span></footer>
   </div>
  </main>
  {modal?.type==='pool'&&<PoolForm pool={modal.pool} onClose={()=>setModal(null)} onSaved={async pool=>{setModal(null);setNotice({message:modal.pool?'Настройки пула сохранены.':'Пул создан. Добавьте профиль проверки и узлы.',error:false});setPools(previous=>previous.some(item=>item.id===pool.id)?previous.map(item=>item.id===pool.id?{...item,...pool}:item):[...previous,pool]);setPoolsLoaded(true);openPool(pool);if(routeRef.current.page===page)await load(true);}}/>}
  {modal?.type==='target'&&<TargetForm key={modal.target?.id||'new'} pool={modal.pool} target={modal.target} onFailure={refreshAfterError} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);setNotice({message:modal.target?'Изменения узла сохранены.':'Узел добавлен и ожидает проверок. A-запись будет добавлена после успешной серии.',error:false});await load(true);await loadTargets(modal.pool.id);}}/>}
  {modal?.type==='delete-target'&&<TargetDeleteModal key={modal.target.id} target={modal.target} onClose={()=>setModal(null)} onFailure={refreshAfterError} onDeleted={async deleteDNS=>{setModal(null);setNotice({message:deleteDNS?'Узел и его A-запись удалены.':'Узел удалён из панели. A-запись в Cloudflare сохранена.',error:false});if(routeRef.current.targetId===modal.target.id&&routeRef.current.poolId)navigate(poolHash(routeRef.current.poolId));await Promise.all([load(true),refreshVisibleTargets(true),refreshEvents(true)]);}}/>}
  {modal?.type==='import'&&<ImportForm pool={modal.pool} onFailure={refreshAfterError} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);setNotice({message:'Узел Remnawave добавлен и ожидает проверок перед добавлением A-записи.',error:false});await load(true);await loadTargets(modal.pool.id);}}/>}
  {modal?.type==='profile'&&<ProfileForm pool={modal.pool} checkAfterSave={modal.checkAfterSave} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);if(modal.checkAfterSave){await checkPool(modal.pool);return;}setNotice({message:'Общий профиль сохранён. Счётчики последовательных проверок сброшены.',error:false});await load(true);await loadTargets(modal.pool.id);}}/>}
  {modal?.type==='confirm'&&<ConfirmModal data={modal} onFailure={refreshAfterError} onClose={()=>setModal(null)} onDone={async()=>{const deletedId=modal.deletedPoolId;setModal(null);setNotice({message:modal.successMessage||'Действие выполнено.',error:false});if(deletedId&&routeRef.current.poolId===deletedId)navigate('pools');await Promise.all([load(true),refreshVisibleTargets(true),refreshEvents(true)]);}}/>}
 </div>;
}

function Metric({label,value,icon,detail,tone='blue'}:{label:string;value:number|undefined;icon:ReactNode;detail:string;tone?:string}){return <div className={`metric ${tone}`}><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><div className="metric-value">{value??'—'}</div><div className="metric-detail"><span className="tiny-dot"/>{detail}</div></div>}
function PanelHeading({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="panel-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</div>}
function IntegrationRow({name,detail,icon,configured}:{name:string;detail:string;icon:ReactNode;configured?:boolean}){return <div className="integration-row"><div className={`integration-icon ${name==='Cloudflare'?'orange':'purple'}`}>{icon}</div><div><h3>{name}</h3><p>{detail}</p></div><Badge tone={configured?'green':'muted'}>{configured?'Подключён':'Не настроен'}</Badge></div>}
export function PoolTable({pools,onSelect,onEdit,onToggle,onDelete,busy,onCreate}:{pools:Pool[];onSelect:(pool:Pool)=>void;onEdit:(pool:Pool)=>void;onToggle:(pool:Pool)=>void;onDelete:(pool:Pool)=>void;busy:Set<string>;onCreate:()=>void}){if(!pools.length)return <Empty title="Первый пул — начало мониторинга" description="Объедините узлы под одним DNS-именем. Добавьте общий VLESS-профиль, а затем включите автоматизацию." action={<button className="button primary" onClick={onCreate}><Plus size={16}/>Создать DNS-пул</button>}/>;return <div className="table-scroll"><table className="pool-table"><thead><tr><th>Пул / DNS-имя</th><th>Активные узлы</th><th>Автоматизация</th><th>Профиль</th><th>Интервал</th><th>Пороги сбой / успех</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{pools.map(pool=><tr key={pool.id}><td><button className="pool-name" onClick={()=>onSelect(pool)}><span className="pool-symbol"><Globe size={19}/></span><span><strong>{pool.name}</strong><small className="mono">{pool.hostname}</small></span><ChevronRight size={16}/></button></td><td><PoolTargetCount summary={pool.target_summary}/></td><td><Badge tone={pool.automation_enabled?'green':'amber'}>{pool.automation_enabled?'Включена':'На паузе'}</Badge></td><td><span className={`profile-label ${pool.profile_configured?'configured':''}`}>{pool.profile_configured?<CheckCircle2 size={14}/>:<KeyRound size={14}/>} {pool.profile_configured?'Настроен':'Не задан'}</span></td><td><span className="table-secondary">{pool.interval_seconds} сек.</span></td><td><span className="mono threshold"><span>{pool.failure_threshold}</span><span>/</span><span>{pool.recovery_threshold}</span></span></td><td><div className="row-actions"><IconButton label="Настройки пула" onClick={()=>onEdit(pool)}><Settings2 size={16}/></IconButton><IconButton label={pool.automation_enabled?'Поставить автоматизацию на паузу':'Включить автоматизацию'} onClick={()=>onToggle(pool)} disabled={busy.has(pool.id)}>{busy.has(pool.id)?<LoaderCircle className="spin" size={16}/>:pool.automation_enabled?<Pause size={16}/>:<Play size={16}/>}</IconButton><IconButton className="danger-hover" label="Удалить пул" onClick={()=>onDelete(pool)} disabled={busy.has(pool.id)}><Trash2 size={16}/></IconButton></div></td></tr>)}</tbody></table></div>}
export function PoolDetail({pool,targets,targetsLoading,targetsError,targetId,checkProgress,busy,onEdit,onDelete,onProfile,onAdd,onImport,onToggle,onSync,onCheck,onTargetAction}:{pool:Pool;targets:Target[];targetsLoading:boolean;targetsError?:string;targetId?:string;checkProgress?:ReactNode;busy:Set<string>;onEdit:()=>void;onDelete:()=>void;onProfile:()=>void;onAdd:()=>void;onImport:()=>void;onToggle:()=>void;onSync:()=>void;onCheck:()=>void;onTargetAction:(target:Target,action:'edit'|'disable'|'delete'|'enable')=>void}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('');
 const filtered=targets.filter(target=>(!status||target.status===status)&&`${target.name} ${target.ip}`.toLowerCase().includes(search.toLowerCase()));
 const focusedTarget=useRef<string|undefined>(undefined);
 useEffect(()=>{setSearch('');setStatus('');focusedTarget.current=undefined;},[targetId]);
 useEffect(()=>{
  if(!targetId||targetsLoading||focusedTarget.current===targetId)return;
  const node=document.getElementById(targetAnchorId(targetId));
  if(!node)return;
  focusedTarget.current=targetId;
  node.focus({preventScroll:true});
  node.scrollIntoView?.({block:'nearest'});
 },[targetId,targetsLoading,filtered]);
 return <><div className="pool-controls panel"><div><Badge tone={pool.automation_enabled?'green':'amber'}>{pool.automation_enabled?'Автоматизация включена':'Автоматизация на паузе'}</Badge><p>{pool.automation_enabled?'Проверки продолжаются и для автоматически исключённых узлов.':'Проверяйте узлы до включения Guard. Автоматические изменения DNS отключены. Управление хостами Remnawave на паузе.'}</p></div><div className="pool-control-actions"><button className="button secondary" onClick={onEdit}><Settings2 size={16}/>Настройки пула</button><button className="button secondary" onClick={onProfile}><KeyRound size={16}/>{pool.profile_configured?'Заменить профиль':'Задать профиль'}</button><button className={`button ${pool.automation_enabled?'secondary':'primary'}`} onClick={onToggle} disabled={busy.has(pool.id)}>{pool.automation_enabled?<Pause size={16}/>:<Play size={16}/>} {pool.automation_enabled?'Пауза':'Включить'}</button><button className="button secondary danger-hover" onClick={onDelete} disabled={busy.has(pool.id)}><Trash2 size={16}/>Удалить пул</button></div></div>
 <div className="pool-stat-strip"><div><span>TTL новых записей</span><strong>{pool.ttl===1?'Auto':`${pool.ttl} сек.`}</strong></div><div><span>Интервал проверки</span><strong>{pool.interval_seconds} сек.</strong></div><div><span>Исключение после</span><strong>{pool.failure_threshold} сбоев подряд</strong></div><div><span>Возврат после</span><strong>{pool.recovery_threshold} успехов подряд</strong></div><div><span>Общий профиль</span><strong className={pool.profile_configured?'text-green':'text-amber'}>{pool.profile_configured?'Настроен':'Не настроен'}</strong></div></div>
 <div className="info-note"><ShieldCheck size={17}/><p>{pool.disable_host_when_all_down?'При отказе всех нод хост Remnawave отключается. Последний IP сохраняется; после восстановления хост включается.':'При отказе всех нод последний IP сохраняется, хост Remnawave остаётся включённым.'}{typeof pool.remnawave_host_disabled==='boolean'&&<><br/>Последнее подтверждённое состояние: <strong>{pool.remnawave_host_disabled?'Хост Remnawave отключён':'Хост Remnawave включён'}</strong>.</>}</p></div>
 {pool.remnawave_error&&<ErrorBox message={`Не удалось обновить хост Remnawave: ${pool.remnawave_error}`}/>}
 {pool.dns_error&&<ErrorBox message={`Не удалось подтвердить DNS: ${pool.dns_error}`}/>}
 {!!pool.dns_drift_count&&<div className="info-banner"><TriangleAlert size={19}/><p>Обнаружены расхождения DNS: {pool.dns_drift_count}. Последняя сверка: {date(pool.dns_checked_at)}. Проверьте записи в Cloudflare или выполните синхронизацию.</p></div>}
 {!pool.profile_configured&&<div className="info-banner"><KeyRound size={19}/><p>Для проверки нужен общий VLESS- или Hysteria2-профиль. Нажмите «Проверить сейчас», чтобы задать его и запустить проверку каждого IP. Включать автоматизацию не требуется.</p><button className="button text" onClick={onProfile}>Настроить<ArrowRight size={16}/></button></div>}
 <div className="panel"><PanelHeading title={`Узлы пула · ${targets.length}`} description="DNS-only A-записи · проверки из РФ через VLESS / Hysteria2" action={<div className="heading-actions"><button className="button secondary" onClick={onCheck} disabled={targetsLoading||!targets.some(target=>target.manual_enabled)||busy.has(`${pool.id}-check`)} title={!targets.some(target=>target.manual_enabled)?'Добавьте или включите хотя бы один узел':undefined}>{busy.has(`${pool.id}-check`)?<LoaderCircle className="spin" size={16}/>:<Zap size={16}/>}Проверить сейчас</button><button className="button primary" onClick={onAdd}><Plus size={17}/>Добавить узел</button></div>}/><div className="target-toolbar"><div className="search-input"><Search size={16}/><input aria-label="Поиск узлов" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название или IP-адрес"/></div><select aria-label="Статус узла" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Все статусы</option>{Object.entries(statusNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><div className="import-actions"><button className="button text" onClick={onImport}><Network size={16}/>Из Remnawave</button><button className="button text" onClick={onSync} disabled={busy.has(`${pool.id}-sync`)}>{busy.has(`${pool.id}-sync`)?<LoaderCircle className="spin" size={16}/>:<ArrowDownToLine size={16}/>}Из Cloudflare</button></div></div>
 {checkProgress}
 {targetsError&&<ErrorBox message={targetsError}/>}
 {targetId&&!targetsLoading&&!targetsError&&!targets.some(target=>target.id===targetId)&&<ErrorBox message="Узел по ссылке не найден в этом пуле."/>}
 {targetsLoading?<div className="panel-loading"><Spinner label="Загрузка узлов…"/></div>:!targets.length?<Empty icon={<Server size={28}/>} title="В пуле пока нет узлов" description="Добавьте публичный IPv4 вручную, импортируйте узел Remnawave или существующие A-записи точного DNS-имени из Cloudflare." action={<button className="button secondary" onClick={onAdd}><Plus size={16}/>Добавить первый узел</button>}/>:!filtered.length?<Empty icon={<Search size={26}/>} title="Ничего не найдено" description="Измените запрос или фильтр статуса."/>:<TargetCards targets={filtered} pool={pool} statusNames={statusNames} onAction={onTargetAction} busy={busy} targetId={targetId}/>}
 <div className="table-note"><ShieldCheck size={15}/>DNS Guard не удаляет последнюю A-запись. Отключённые вручную узлы не восстанавливаются автоматически.</div></div></>;
}

function Login({onLogin,initialError}:{onLogin:(username:string)=>void;initialError:string}){const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(initialError);async function submit(event:FormEvent){event.preventDefault();setError('');setBusy(true);try{const result=await api<{username:string}>('/auth/login',json('POST',{username,password}));setPassword('');onLogin(result.username);}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}return <div className="auth-page"><div className="auth-grid"/><div className="auth-card"><div className="brand"><div className="brand-mark"><ShieldCheck size={27}/></div><span>DNS<span>Guard</span></span></div><div className="auth-icon"><Network size={33}/></div><div className="eyebrow">УПРАВЛЕНИЕ ИНФРАСТРУКТУРОЙ</div><h1>Ваш DNS. Под контролем.</h1><p>Войдите, чтобы управлять пулами и следить за доступностью узлов.</p><form onSubmit={submit}>{error&&<ErrorBox message={error}/>}<Field label="Имя пользователя"><input required value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoFocus placeholder="Имя администратора" disabled={busy}/></Field><Field label="Пароль"><input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Введите пароль" disabled={busy}/></Field><button className="button primary full" disabled={busy}>{busy?<Spinner label="Вход…"/>:<>Войти в панель<ArrowRight size={17}/></>}</button></form><div className="auth-footer"><ShieldCheck size={16}/>Защищённая сессия администратора</div></div><p className="auth-caption">Мониторинг из России · Cloudflare DNS · Remnawave</p></div>}

export function PoolForm({pool,onClose,onSaved}:{pool?:Pool;onClose:()=>void;onSaved:(pool:Pool)=>Promise<void>}){
 const [values,setValues]=useState<PoolInput>(pool?{name:pool.name,hostname:pool.hostname,zone_id:pool.zone_id,ttl:pool.ttl,interval_seconds:pool.interval_seconds,failure_threshold:pool.failure_threshold,recovery_threshold:pool.recovery_threshold,automation_enabled:pool.automation_enabled,disable_host_when_all_down:pool.disable_host_when_all_down??false}:{name:'',hostname:'',zone_id:'',ttl:120,interval_seconds:60,failure_threshold:3,recovery_threshold:5,automation_enabled:false,disable_host_when_all_down:false});
 const [zones,setZones]=useState<Zone[]>([]),[zoneError,setZoneError]=useState(''),[zonesLoading,setZonesLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;api<Zone[]>('/cloudflare/zones').then(result=>{if(active)setZones(result);}).catch(err=>{if(active)setZoneError(errorMessage(err));}).finally(()=>{if(active)setZonesLoading(false);});return()=>{active=false;};},[]);
 const update=<K extends keyof PoolInput>(key:K,value:PoolInput[K])=>setValues(previous=>({...previous,[key]:value}));
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const payload=pool?{name:values.name.trim(),ttl:values.ttl,interval_seconds:values.interval_seconds,failure_threshold:values.failure_threshold,recovery_threshold:values.recovery_threshold,disable_host_when_all_down:values.disable_host_when_all_down}:{...values,name:values.name.trim(),hostname:values.hostname.trim().toLowerCase()};const result=await api<Pool>(pool?`/pools/${pool.id}`:'/pools',json(pool?'PATCH':'POST',payload));await onSaved(result);}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}
 return <Modal title={pool?'Настройки DNS-пула':'Создать DNS-пул'} subtitle="Единый hostname и общий профиль подключения для всех узлов." onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-body">{error&&<ErrorBox message={error}/>}<Field label="Название пула"><input required maxLength={100} value={values.name} onChange={e=>update('name',e.target.value)} placeholder="Например, Основной пул" disabled={busy}/></Field><div className="form-grid"><Field label="DNS-имя" help={pool?'DNS-имя существующего пула фиксировано.':'Точное DNS-имя A-записей, без https://'}><input required value={values.hostname} onChange={e=>update('hostname',e.target.value)} placeholder="vpn.example.com" disabled={busy||!!pool}/></Field><Field label="Зона Cloudflare"><select required value={values.zone_id} onChange={e=>update('zone_id',e.target.value)} disabled={busy||zonesLoading||!!pool}><option value="">{zonesLoading?'Загрузка зон…':'Выберите зону'}</option>{pool&&!zones.find(zone=>zone.id===pool.zone_id)&&<option value={pool.zone_id}>Зона текущего пула</option>}{zones.map(zone=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></Field></div>{!pool&&zoneError&&<ErrorBox message={zoneError}/>}<div className="form-divider">ПРАВИЛА МОНИТОРИНГА</div><div className="form-grid"><Field label="Интервал проверок, сек." help="Как часто узел становится доступен для проверки"><input required type="number" min={10} max={86400} value={values.interval_seconds} onChange={e=>update('interval_seconds',Number(e.target.value))} disabled={busy}/></Field><Field label="TTL новых записей, сек." help="Не менее 60 сек. Принятые под управление записи сохраняют свой TTL."><input required type="number" min={60} max={86400} value={values.ttl} onChange={e=>update('ttl',Number(e.target.value))} disabled={busy}/></Field><Field label="Порог исключения" help="Последовательных неудачных проверок"><input required type="number" min={1} max={100} value={values.failure_threshold} onChange={e=>update('failure_threshold',Number(e.target.value))} disabled={busy}/></Field><Field label="Порог восстановления" help="Последовательных успешных проверок"><input required type="number" min={1} max={100} value={values.recovery_threshold} onChange={e=>update('recovery_threshold',Number(e.target.value))} disabled={busy}/></Field></div><label className="checkbox-field"><input type="checkbox" checked={values.disable_host_when_all_down} onChange={e=>update('disable_host_when_all_down',e.target.checked)} disabled={busy}/><span>Отключать хост в Remnawave, если все ноды недоступны</span></label><p className="field-help">Последний IP всегда остаётся в DNS. С выключенной опцией хост включён. С включённой — отключается после отказа всех нод и включается после восстановления. Применяется при включённой автоматизации к хостам с адресом, совпадающим с DNS-именем пула.</p><div className="info-note"><ShieldCheck size={18}/><p>{pool?'Пауза не останавливает проверки. Управляйте автоматизацией на странице пула.':'Пул создаётся с автоматизацией на паузе. Добавьте профиль и узлы, затем включите её.'} Последняя A-запись всегда защищена.</p></div></div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Отмена</button><button className="button primary" disabled={busy||!pool&&(!values.zone_id||zonesLoading)}>{busy?<Spinner label="Сохранение…"/>:pool?'Сохранить настройки':'Создать пул'}</button></div></form></Modal>;
}
export function TargetForm({pool,target,onClose,onSaved,onFailure}:{pool:Pool;target?:Target;onClose:()=>void;onSaved:()=>Promise<void>;onFailure:()=>Promise<void>}){
 const [name,setName]=useState(target?.name||''),[ip,setIp]=useState(target?.ip||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const ipChanged=!!target&&ip.trim()!==target.ip;
 async function submit(event:FormEvent){
  event.preventDefault();
  if(!name.trim()){setError('Укажите название узла.');return;}
  if(!isPublicIPv4(ip.trim())){setError('Укажите публичный IPv4. Частные, зарезервированные адреса и hostname не принимаются.');return;}
  setBusy(true);setError('');
  try{await api(target?`/targets/${target.id}`:`/pools/${pool.id}/targets`,json(target?'PATCH':'POST',{name:name.trim(),ip:ip.trim()}));await onSaved();}
  catch(err){setError(errorMessage(err));await onFailure();}
  finally{setBusy(false);}
 }
 return <Modal title={target?'Редактировать узел':'Добавить узел'} subtitle={`Пул ${pool.name} · ${pool.hostname}`} onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-body">
  {error&&<ErrorBox message={error}/>}
  <Field label="Название узла"><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Helsinki 01" disabled={busy}/></Field>
  <Field label="Публичный IPv4" help="Проверки обращаются напрямую к этому IP, сохраняя SNI из профиля"><input required value={ip} onChange={e=>setIp(e.target.value)} placeholder="Публичный IPv4 вашего сервера" autoComplete="off" disabled={busy}/></Field>
  <div className="info-note"><Globe size={18}/><p>{target?'При смене IP состояние узла сохранится: отключённые и исключённые узлы останутся вне DNS. Для узла в DNS новая A-запись будет подтверждена до удаления старой. Результаты проверок и счётчики будут сброшены.':<>Узел останется неактивным до успешных проверок. Каждый доступный агент должен выполнить {pool.recovery_threshold} успешных проверок подряд; затем в Cloudflare будет добавлена или принята под управление A-запись для <strong>{pool.hostname}</strong>. Сначала сохраните общий VLESS-профиль пула.</>}</p></div>
  {ipChanged&&<div className="info-note"><RefreshCw size={18}/><p>Смена IPv4: <strong className="mono">{target.ip}</strong> → <strong className="mono">{ip.trim()||'новый адрес'}</strong>. Общий профиль VLESS останется прежним.</p></div>}
 </div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>{error?'Закрыть':'Отмена'}</button><button className="button primary" disabled={busy}>{busy?<Spinner label={target?'Сохранение…':'Добавление…'}/>:target?<><Check size={16}/>Сохранить изменения</>:<><Plus size={16}/>Добавить и проверить</>}</button></div></form></Modal>;
}
function ImportForm({pool,onClose,onSaved,onFailure}:{pool:Pool;onClose:()=>void;onSaved:()=>Promise<void>;onFailure:()=>Promise<void>}){const [nodes,setNodes]=useState<Node[]>([]),[hosts,setHosts]=useState<Host[]>([]),[nodeId,setNodeId]=useState(''),[name,setName]=useState(''),[ip,setIp]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[hostError,setHostError]=useState('');const node=nodes.find(item=>item.uuid===nodeId);useEffect(()=>{let active=true;void Promise.allSettled([api<Node[]>('/remnawave/nodes'),api<Host[]>('/remnawave/hosts')]).then(([a,b])=>{if(!active)return;if(a.status==='fulfilled')setNodes(a.value);else setError(errorMessage(a.reason));if(b.status==='fulfilled')setHosts(b.value);else setHostError(errorMessage(b.reason));setLoading(false);});return()=>{active=false;};},[]);async function submit(event:FormEvent){event.preventDefault();if(!node)return;if(!isPublicIPv4(ip.trim())){setError('Для импорта нужен публичный IPv4. Если в Remnawave указан hostname, введите проверенный IP вручную.');return;}setBusy(true);setError('');try{await api(`/pools/${pool.id}/targets`,json('POST',{name:name.trim(),ip:ip.trim(),remnawave_uuid:node.uuid}));await onSaved();}catch(err){setError(errorMessage(err));await onFailure();}finally{setBusy(false);}}return <Modal title="Импорт из Remnawave" subtitle="Узлы читаются из Remnawave. Конфигурация сервиса не изменяется." onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-body">{error&&<ErrorBox message={error}/>} {loading?<Spinner label="Загрузка узлов и хостов…"/>:!nodes.length?<Empty icon={<Network size={26}/>} title="Нет доступных узлов" description="Проверьте подключение Remnawave в настройках и наличие узлов в его панели."/>:<><Field label="Узел Remnawave"><select required value={nodeId} onChange={e=>{setNodeId(e.target.value);const selected=nodes.find(item=>item.uuid===e.target.value);setName(selected?.name||'');setIp(selected&&isPublicIPv4(selected.address)?selected.address:'');setError('');}} disabled={busy}><option value="">Выберите узел</option>{nodes.map(item=><option key={item.uuid} value={item.uuid}>{item.name} · {item.address} {item.is_connected?'· подключён':'· не подключён'}</option>)}</select></Field>{node&&<><div className="import-node-info"><Badge tone={node.is_connected?'green':'amber'}>{node.is_connected?'Подключён к Remnawave':'Не подключён к Remnawave'}</Badge><p>Адрес в Remnawave: <span className="mono">{node.address}</span></p>{node.config_profile_uuid&&<p>Config Profile: <span className="mono">{node.config_profile_uuid}</span></p>}</div><Field label="Название в DNS Guard"><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></Field><Field label="Публичный IPv4" help={isPublicIPv4(node.address)?'Проверьте клиентский IPv4: адрес управления нодой может отличаться.':'Адрес управления может отличаться от клиентского. Hostname не разрешается автоматически: введите проверенный публичный IPv4.'}><input required value={ip} onChange={e=>setIp(e.target.value)} placeholder="Введите публичный IPv4" disabled={busy}/></Field>{hosts.filter(host=>host.node_uuids.includes(node.uuid)).length>0&&<div className="host-list"><h4>Связанные хосты</h4>{hosts.filter(host=>host.node_uuids.includes(node.uuid)).map(host=><p key={host.uuid}>{host.remark||'Без имени'} <span className="mono">{host.address}:{host.port}</span></p>)}<small>Хосты показаны для сверки. Профиль VLESS задаётся отдельно для всего пула.</small></div>}</>}</>}{hostError&&<div className="info-note"><Info size={16}/><p>Хосты загрузить не удалось: {hostError}</p></div>}<div className="info-note"><ShieldCheck size={18}/><p>Выбирайте узлы с одним Config Profile и inbound. Импорт добавит выбранный IP в пул <strong>{pool.name}</strong>. A-запись будет добавлена после {pool.recovery_threshold} успешных проверок подряд от каждого доступного агента.</p></div></div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>{error?'Закрыть':'Отмена'}</button><button className="button primary" disabled={busy||loading||!node}>{busy?<Spinner label="Импорт…"/>:<><ArrowDownToLine size={16}/>Импортировать узел</>}</button></div></form></Modal>}
export function ProfileForm({pool,checkAfterSave=false,onClose,onSaved}:{pool:Pool;checkAfterSave?:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){const [profile,setProfile]=useState<ProbeProfile>(blankProfile),[uri,setUri]=useState(''),[extraText,setExtraText]=useState(''),[alpnText,setAlpnText]=useState(''),[mode,setMode]=useState<'uri'|'fields'|'subscription'>('uri'),[subscriptionURL,setSubscriptionURL]=useState(''),[useHwid,setUseHwid]=useState(false),[servers,setServers]=useState<SubscriptionServer[]>([]),[serverIndex,setServerIndex]=useState(''),[subscriptionLoading,setSubscriptionLoading]=useState(false),[parsed,setParsed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const selectedServer=servers[Number(serverIndex)];const subscriptionProfile=serverIndex!==''?selectedServer?.profile:null;const update=<K extends keyof ProbeProfile>(key:K,value:ProbeProfile[K])=>setProfile(old=>({...old,[key]:value}));function parse(){setError('');try{if(mode==='subscription'&&!subscriptionProfile)throw new Error('Выберите сервер из подписки.');const value=mode==='subscription'?validateProfile(subscriptionProfile!):parseProfileURI(uri);setProfile(value);setAlpnText(value.alpn?.join(',')||'');setExtraText(value.xhttp_extra?JSON.stringify(value.xhttp_extra,null,2):'');setParsed(true);setUri('');setMode('fields');}catch(err){setParsed(false);setError(errorMessage(err));}}async function downloadSubscription(){setBusy(true);setSubscriptionLoading(true);setError('');setServers([]);setServerIndex('');try{setServers(await loadSubscription(subscriptionURL,useHwid));}catch(err){setError(errorMessage(err));}finally{setBusy(false);setSubscriptionLoading(false);}}async function submit(event:FormEvent){event.preventDefault();setError('');setBusy(true);try{if(mode==='subscription'&&!subscriptionProfile)throw new Error('Загрузите подписку и выберите сервер.');const value=mode==='uri'?parseProfileURI(uri):validateProfile(mode==='subscription'?subscriptionProfile!:profileWithExtra(profileWithALPN(profile,alpnText),extraText));await api(`/pools/${pool.id}/profile`,json('PUT',value));setUri('');setSubscriptionURL('');setServers([]);setServerIndex('');setProfile(blankProfile());await onSaved();}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}return <Modal title={pool.profile_configured?'Заменить общий профиль':'Общий профиль проверки'} subtitle={`Применяется ко всем узлам пула ${pool.name}.`} onClose={onClose} busy={busy}><form onSubmit={submit}><div className="modal-body">{error&&<ErrorBox message={error}/>} {checkAfterSave&&<div className="info-note"><Zap size={18}/><p>Сохраните профиль для проверки узлов. После сохранения проверка будет поставлена в очередь; включать Guard не требуется.</p></div>} {pool.profile_configured&&<div className="info-note"><KeyRound size={18}/><p>Сохранённые пароли, UUID и ключи не возвращаются сервером. Введите полный новый профиль, чтобы заменить существующий.</p></div>}<div className="segmented profile-modes"><button type="button" className={mode==='uri'?'active':''} disabled={busy} onClick={()=>{setMode('uri');setError('');}}>Вставить ссылку</button><button type="button" className={mode==='fields'?'active':''} disabled={busy} onClick={()=>{setMode('fields');setError('');}}>Ввести параметры</button><button type="button" className={mode==='subscription'?'active':''} disabled={busy} onClick={()=>{setMode('subscription');setError('');}}>Вставить ссылку на подписку</button></div>{mode==='uri'?<><Field label="VLESS / Hysteria2 URI" help="VLESS: TCP / RAW или XHTTP · Hysteria2: UDP / QUIC. Ссылка разбирается в браузере; адрес из ссылки не заменяет IP узлов."><textarea required rows={5} value={uri} onChange={e=>{setUri(e.target.value);setParsed(false);}} placeholder="vless://UUID@server:443?type=tcp&security=reality&sni=…&pbk=…" autoComplete="off" spellCheck={false} disabled={busy}/></Field><button type="button" className="button secondary full" onClick={parse} disabled={!uri||busy}><SlidersHorizontal size={16}/>Прочитать и проверить параметры</button></>:mode==='subscription'?<><Field label="Ссылка на подписку" help="HTTPS-ссылка на список VLESS и Hysteria2 в текстовом формате или Base64. Выберите сервер с настройками, общими для всех узлов пула."><input type="url" value={subscriptionURL} onChange={e=>{setSubscriptionURL(e.target.value);setServers([]);setServerIndex('');setError('');}} placeholder="https://sub.example.com/…" autoComplete="off" spellCheck={false} disabled={busy}/></Field><label className="subscription-device"><input type="checkbox" checked={useHwid} onChange={e=>{setUseHwid(e.target.checked);setServers([]);setServerIndex('');setError('');}} disabled={busy}/><span>Использовать DNS Guard как отдельное устройство<small>Для подписок с ограничением устройств (HWID). Может занять один слот; повторные загрузки используют тот же идентификатор.</small></span></label><button type="button" className="button secondary full" onClick={()=>void downloadSubscription()} disabled={!subscriptionURL.trim()||busy}>{subscriptionLoading?<Spinner label="Загрузка подписки…"/>:<><ArrowDownToLine size={16}/>Загрузить серверы</>}</button>{servers.length>0&&<div className="subscription-servers"><Field label="Сервер из подписки" help="Адрес выбранного сервера не заменяет IP узлов пула."><select required value={serverIndex} onChange={e=>{setServerIndex(e.target.value);setError('');}} disabled={busy}><option value="">Выберите сервер</option>{servers.map((server,index)=><option key={index} value={String(index)} disabled={!server.profile}>{server.name}{server.address?` · ${server.address}`:''}{server.error?' · не поддерживается':''}</option>)}</select></Field>{servers.some(server=>server.error)&&<div className="host-list"><h4>Неподдерживаемые серверы</h4>{servers.filter(server=>server.error).map((server,index)=><p key={index}>{server.name}: {server.error}</p>)}</div>}{subscriptionProfile&&<><div className="inline-success"><CheckCircle2 size={16}/>Выбран сервер: {selectedServer.name}. Параметры готовы к сохранению.</div><button type="button" className="button secondary full" onClick={parse} disabled={busy}><SlidersHorizontal size={16}/>Прочитать и проверить параметры</button></>}</div>}<div className="info-note"><Info size={17}/><p>Подписка загружается один раз. Сохраняются только параметры выбранного сервера; изменения подписки автоматически не применяются.</p></div></>:<>{parsed&&<div className="inline-success"><CheckCircle2 size={16}/>Ссылка разобрана. Проверьте параметры перед сохранением.</div>}<Field label="Протокол"><select value={profile.protocol||'vless'} onChange={e=>{setProfile(old=>profileForProtocol(old,e.target.value as 'vless'|'hysteria2'));setExtraText('');setAlpnText('');setParsed(false);}} disabled={busy}><option value="vless">VLESS</option><option value="hysteria2">Hysteria2</option></select></Field>{profile.protocol==='hysteria2'?<><div className="form-grid"><Field label="Порт UDP"><input required type="number" min={1} max={65535} value={profile.port} onChange={e=>update('port',Number(e.target.value))} disabled={busy}/></Field><Field label="SNI / server name"><input required value={profile.server_name} onChange={e=>update('server_name',e.target.value.trim())} placeholder="example.com" disabled={busy}/></Field></div><Field label="Пароль Hysteria2" help="Для userpass укажите логин:пароль. Может быть пустым, если сервер не требует пароль."><input type="password" value={profile.password||''} onChange={e=>update('password',e.target.value)} autoComplete="new-password" disabled={busy}/></Field><Field label="Обфускация"><select value={profile.obfs||''} onChange={e=>setProfile(old=>({...old,obfs:e.target.value as ProbeProfile['obfs'],obfs_password:''}))} disabled={busy}><option value="">Без обфускации</option><option value="salamander">Salamander</option></select></Field>{profile.obfs==='salamander'&&<Field label="Пароль Salamander"><input required type="password" value={profile.obfs_password||''} onChange={e=>update('obfs_password',e.target.value)} autoComplete="new-password" disabled={busy}/></Field>}<Field label="SHA-256 сертификата" help="Необязательно. Для самоподписанного сертификата укажите его SHA-256 (64 hex-символа)."><input value={profile.pin_sha256||''} onChange={e=>update('pin_sha256',e.target.value.replaceAll(':','').trim())} autoComplete="off" spellCheck={false} disabled={busy}/></Field><Field label="Алгоритм QUIC" help="Импортируется из параметра fm. Для явного выбора нужен агент 1.7.0 или новее."><select value={profile.hysteria_congestion||''} onChange={e=>update('hysteria_congestion',(e.target.value||undefined) as ProbeProfile['hysteria_congestion'])} disabled={busy}><option value="">По умолчанию</option><option value="bbr">BBR</option><option value="reno">Reno</option><option value="brutal">Brutal</option></select></Field><div className="info-note"><Info size={17}/><p>Hysteria2 использует UDP / QUIC и ALPN h3. Для маршрута через SOCKS5 прокси должен поддерживать UDP.</p></div></>:<><div className="form-grid"><Field label="Порт"><input required type="number" min={1} max={65535} value={profile.port} onChange={e=>update('port',Number(e.target.value))} disabled={busy}/></Field><Field label="Транспорт"><select value={profile.transport} onChange={e=>{const transport=e.target.value as ProbeProfile['transport'];setExtraText('');setProfile(old=>profileWithExtra({...old,transport,flow:transport==='xhttp'?'':old.flow},''));}} disabled={busy}><option value="tcp">TCP / RAW</option><option value="xhttp">XHTTP</option></select></Field></div><Field label="UUID пользователя VLESS"><input required value={profile.uuid} onChange={e=>update('uuid',e.target.value.trim())} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" disabled={busy}/></Field><div className="form-grid"><Field label="Безопасность"><select value={profile.security} onChange={e=>{const security=e.target.value as ProbeProfile['security'];setAlpnText('');setProfile(old=>profileWithALPN({...old,security},''));}} disabled={busy}><option value="reality">REALITY</option><option value="tls">TLS</option></select></Field><Field label="SNI / server name"><input required value={profile.server_name} onChange={e=>update('server_name',e.target.value.trim())} placeholder="example.com" disabled={busy}/></Field></div>{profile.security==='tls'&&<Field label="ALPN" help="Протоколы через запятую, например h2,http/1.1. Пустое поле — автоматически."><input value={alpnText} onChange={e=>setAlpnText(e.target.value)} placeholder="h2,http/1.1" autoComplete="off" spellCheck={false} disabled={busy}/></Field>}{profile.security==='reality'&&<><Field label="REALITY public key"><input required value={profile.public_key} onChange={e=>update('public_key',e.target.value.trim())} autoComplete="off" spellCheck={false} disabled={busy}/></Field><Field label="Short ID" help="Hex, чётное число символов, до 16; может быть пустым"><input value={profile.short_id} onChange={e=>update('short_id',e.target.value.trim())} autoComplete="off" disabled={busy}/></Field></>}<div className="form-grid"><Field label="Fingerprint"><select value={profile.fingerprint} onChange={e=>update('fingerprint',e.target.value)} disabled={busy}>{['chrome','firefox','safari','ios','android','edge','360','qq','random','randomized'].map(fp=><option key={fp}>{fp}</option>)}</select></Field><Field label="Flow"><select value={profile.flow} onChange={e=>update('flow',e.target.value)} disabled={busy||profile.transport==='xhttp'}><option value="">Без flow</option><option value="xtls-rprx-vision">xtls-rprx-vision</option></select></Field></div>{profile.transport==='xhttp'&&<><div className="form-grid"><Field label="Путь XHTTP"><input required value={profile.path} onChange={e=>update('path',e.target.value)} placeholder="/" disabled={busy}/></Field><Field label="Host XHTTP" help="Оставьте пустым для стандартного поведения"><input value={profile.host} onChange={e=>update('host',e.target.value)} disabled={busy}/></Field></div><Field label="Режим XHTTP"><select value={profile.xhttp_mode} onChange={e=>update('xhttp_mode',e.target.value)} disabled={busy}>{['auto','packet-up','stream-up','stream-one'].map(item=><option key={item}>{item}</option>)}</select></Field><Field label="XHTTP extra (JSON)" help="Дополнительные параметры XHTTP из ссылки. Оставьте пустым, если они не нужны."><textarea rows={7} value={extraText} onChange={e=>setExtraText(e.target.value)} autoComplete="off" spellCheck={false} placeholder='{"xPaddingBytes": "100-1000"}' disabled={busy}/></Field></>}</>}</>}<div className="info-note"><RefreshCw size={17}/><p>При сохранении незавершённые задания теряют силу, а счётчики последовательных успехов и сбоев сбрасываются. Пароли, UUID и ключи хранятся зашифрованными.</p></div></div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Отмена</button><button className="button primary" disabled={busy||mode==='subscription'&&!subscriptionProfile}>{busy?<Spinner label={subscriptionLoading?'Загрузка…':'Сохранение…'}/>:<><Check size={16}/>{checkAfterSave?'Сохранить и проверить':'Сохранить профиль'}</>}</button></div></form></Modal>}
export function TargetDeleteModal({target,onClose,onDeleted,onFailure}:{target:Target;onClose:()=>void;onDeleted:(deleteDNS:boolean)=>Promise<void>;onFailure:()=>Promise<void>}){
 const [deleteDNS,setDeleteDNS]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function execute(){
  setBusy(true);setError('');
  try{await api(`/targets/${target.id}?delete_dns=${deleteDNS}`,json('DELETE'));await onDeleted(deleteDNS);}
  catch(err){setError(errorMessage(err));await onFailure();}
  finally{setBusy(false);}
 }
 return <Modal title="Удалить узел из пула?" onClose={onClose} busy={busy}><div className="modal-body">
  {error&&<ErrorBox message={error}/>}
  <div className="confirm-icon danger"><TriangleAlert size={28}/></div>
  <p className="confirm-description">Узел {target.name} ({target.ip}) будет удалён из панели. Проверки этого узла остановятся.</p>
  <label className="dns-delete-option"><input type="checkbox" checked={deleteDNS} onChange={event=>setDeleteDNS(event.target.checked)} disabled={busy}/><span>Удалить также A-запись</span></label>
  <p className="confirm-description">{deleteDNS?`A-запись ${target.ip} будет удалена из Cloudflare. Последнюю A-запись удалить нельзя.`:'A-запись в Cloudflare сохранится.'}</p>
 </div><div className="modal-footer"><button className="button secondary" onClick={onClose} disabled={busy}>{error?'Закрыть':'Отмена'}</button><button className="button danger" onClick={()=>void execute()} disabled={busy}>{busy?<Spinner label="Удаление…"/>:'Удалить узел'}</button></div></Modal>;
}

function ConfirmModal({data,onClose,onDone,onFailure}:{data:Extract<ModalState,{type:'confirm'}>;onClose:()=>void;onDone:()=>Promise<void>;onFailure:()=>Promise<void>}){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function execute(){setBusy(true);setError('');try{await data.action();await onDone();}catch(err){setError(errorMessage(err));await onFailure();}finally{setBusy(false);}}return <Modal title={data.title} onClose={onClose} busy={busy}><div className="modal-body">{error&&<ErrorBox message={error}/>}<div className={`confirm-icon ${data.danger?'danger':''}`}>{data.danger?<TriangleAlert size={28}/>:<Play size={28}/>}</div><p className="confirm-description">{data.description}</p></div><div className="modal-footer"><button className="button secondary" onClick={onClose} disabled={busy}>{error?'Закрыть':'Отмена'}</button><button className={`button ${data.danger?'danger':'primary'}`} onClick={()=>void execute()} disabled={busy}>{busy?<Spinner label="Выполнение…"/>:data.label}</button></div></Modal>}

function SettingsView({settings,providerRevision,focusProviders,onSaved,onAuthError}:{settings:Settings;providerRevision:number;focusProviders:boolean;onSaved:(message:string)=>Promise<void>;onAuthError:(error:unknown)=>string}){
 const [cfToken,setCfToken]=useState(''),[rwToken,setRwToken]=useState(''),[url,setUrl]=useState(settings.remnawave_url),[busy,setBusy]=useState(''),[error,setError]=useState(''),[testResult,setTestResult]=useState<{service:string;message:string;ok:boolean}|null>(null);
 useEffect(()=>{setUrl(settings.remnawave_url);},[settings.remnawave_url]);
 async function save(event:FormEvent){event.preventDefault();setBusy('save');setError('');setTestResult(null);try{const body:Record<string,string>={};if(cfToken.trim())body.cloudflare_api_token=cfToken.trim();if(url.trim()!==settings.remnawave_url)body.remnawave_url=url.trim();if(rwToken.trim())body.remnawave_api_token=rwToken.trim();await api<Settings>('/settings',json('PUT',body));setCfToken('');setRwToken('');await onSaved('Настройки интеграций сохранены.');}catch(err){setError(onAuthError(err));}finally{setBusy('');}}
 async function test(service:'cloudflare'|'remnawave'){setBusy(service);setError('');setTestResult(null);try{const result=await api<{ok:boolean;message:string}>(`/integrations/${service}/test`,json('POST'));setTestResult({service,message:result.message,ok:result.ok});}catch(err){setTestResult({service,message:onAuthError(err),ok:false});}finally{setBusy('');}}
 return <div className="settings-layout"><div className="settings-form"><form onSubmit={save}><div className="panel"><PanelHeading title="Интеграции" description="Токены не отображаются после сохранения"/>{error&&<ErrorBox message={error}/>}<div className="settings-section"><div className="settings-section-header"><div className="integration-icon orange"><Cloud size={23}/></div><div><h3>Cloudflare</h3><p>Управление DNS-only A-записями</p></div><Badge tone={settings.cloudflare_configured?'green':'muted'}>{settings.cloudflare_configured?'Настроен':'Не настроен'}</Badge></div><Field label="API Token" help="Нужны права Zone:Read и DNS:Edit для нужных зон. Пустое поле сохраняет текущий токен."><input type="password" autoComplete="new-password" value={cfToken} onChange={e=>setCfToken(e.target.value)} placeholder={settings.cloudflare_configured?'Токен сохранён · введите новый для замены':'Введите Cloudflare API Token'} disabled={!!busy}/></Field><p className="settings-token-help"><a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" title="Откроется в новой вкладке">Создать API-токен в Cloudflare</a></p><button type="button" className="button secondary" onClick={()=>void test('cloudflare')} disabled={!!busy||!settings.cloudflare_configured}>{busy==='cloudflare'?<Spinner label="Проверка…"/>:<><Zap size={15}/>Проверить подключение</>}</button>{testResult?.service==='cloudflare'&&<div className={testResult.ok?'inline-success':'error-box'} role={testResult.ok?'status':'alert'}>{testResult.ok?<CheckCircle2 size={17}/>:<TriangleAlert size={17}/>}<span>{testResult.message}</span></div>}</div><div className="settings-section"><div className="settings-section-header"><div className="integration-icon purple"><Network size={23}/></div><div><h3>Remnawave</h3><p>Импорт узлов и управление состоянием хостов</p></div><Badge tone={settings.remnawave_configured?'green':'muted'}>{settings.remnawave_configured?'Настроен':'Не настроен'}</Badge></div><Field label="URL панели Remnawave" help="Адрес API вашей панели, например https://panel.example.com"><input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://panel.example.com" disabled={!!busy}/></Field><Field label="API Token" help="Пустое поле сохраняет текущий токен. Для управления хостами нужны права чтения и изменения хостов."><input type="password" autoComplete="new-password" value={rwToken} onChange={e=>setRwToken(e.target.value)} placeholder={settings.remnawave_configured?'Токен сохранён · введите новый для замены':'Введите Remnawave API Token'} disabled={!!busy}/></Field><button type="button" className="button secondary" onClick={()=>void test('remnawave')} disabled={!!busy||!settings.remnawave_configured}>{busy==='remnawave'?<Spinner label="Проверка…"/>:<><Zap size={15}/>Проверить подключение</>}</button>{testResult?.service==='remnawave'&&<div className={testResult.ok?'inline-success':'error-box'} role={testResult.ok?'status':'alert'}>{testResult.ok?<CheckCircle2 size={17}/>:<TriangleAlert size={17}/>}<span>{testResult.message}</span></div>}</div><div className="settings-save"><span>Сначала сохраните новые токены, затем проверьте подключение.</span><button className="button primary" disabled={!!busy}>{busy==='save'?<Spinner label="Сохранение…"/>:<><Check size={17}/>Сохранить</>}</button></div></div></form><ProviderSettings revision={providerRevision} focused={focusProviders} onAuthError={onAuthError}/><NotificationsSettings onAuthError={onAuthError}/></div><div className="settings-aside"><section className="panel agents-settings-link"><h2>Агенты</h2><p>Состояния агентов и независимые маршруты проверок доступны в разделе «Агенты».</p><a className="button secondary" href="#agents">Открыть агентов<ArrowRight size={17}/></a></section><div className="panel security-card"><ShieldCheck size={23}/><h3>Защита по умолчанию</h3><ul><li>Последняя A-запись сохраняется</li><li>Исключённые узлы проверяются</li><li>Секреты зашифрованы на сервере</li><li>Пауза останавливает изменения DNS и хостов</li></ul></div></div></div>;
}
