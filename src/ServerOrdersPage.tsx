import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowUpRight,Check,CheckCircle2,FileText,LoaderCircle,Server,ServerCog,Trash2,TriangleAlert} from 'lucide-react';
import {api,json} from './api';
import {Modal} from './Modal';
import {orderProviderNames,pendingServerOrder,ServerOrderWizard,type OrderProvider} from './ServerOrderWizard';
import type {Host} from './types';
import {providerSettingsHash,ReadinessBadge} from './ProviderSettings';
import './serverOrders.css';

interface ServerOrder {
 id:string;
 retry_operation_id?:string|null;
 domain:string;
 auto_hostname?:string|null;
 stage:string;
 error:string|null;
 zone:string;
 plan:string;
 provider?:OrderProvider;
 created_at:string;
 updated_at:string;
 ip:string|null;
 pool_hostname:string;
 group_name:string;
 profile_name:string;
 plugin_name?:string;
 can_cancel?:boolean;
 can_retry_create?:boolean;
 deleted_resources?:DeletionOptions;
}
type DeletionOptions={hosting:boolean;remnawave:boolean;dns:boolean};
interface OrderPool {id:string;name:string;hostname:string;domain_template:string|null}
interface AutoHost {country:string;pool_id:string;source_uuid:string;hostname:string;slot:number;occupied:number}
interface OrderSnapshot {orders:ServerOrder[];pools:OrderPool[];stages:Record<string,string>;upcloud_configured?:boolean;virtua_configured?:boolean;auto_hosts?:AutoHost[]}
type ReportError=(error:unknown)=>string;

export function useServerOrders(active:boolean,onAuthError:ReportError){
 const [snapshot,setSnapshot]=useState<OrderSnapshot|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const [optionsRevision,setOptionsRevision]=useState(0);
 const activeRef=useRef(active),requestRef=useRef(0);
 activeRef.current=active;

 const reload=useCallback(async(quiet=false)=>{
  if(!activeRef.current)return;
  const request=++requestRef.current;
  if(!quiet)setLoading(true);
  try{
   const value=await api<OrderSnapshot>('/server-orders');
   if(!Array.isArray(value?.orders)||!Array.isArray(value?.pools)||!value?.stages)throw new Error('Сервер вернул неполные данные о заказах.');
   if(request===requestRef.current){setSnapshot(value);setError('');}
  }catch(error){if(request===requestRef.current)setError(onAuthError(error));}
  finally{if(request===requestRef.current)setLoading(false);}
 },[onAuthError]);

 useEffect(()=>{
  if(active)void reload();
  else{setSnapshot(null);setError('');setLoading(false);}
  return()=>{requestRef.current++;};
 },[active,reload]);

 const refreshOptions=()=>setOptionsRevision(revision=>revision+1);
 return {snapshot,loading,error,reload,optionsRevision,refreshOptions};
}

function OrderError({message}:{message:string}){
 return <div className="error-box" role="alert"><TriangleAlert size={17}/><span>{message}</span></div>;
}

function OrderPoolTemplate({pool,reload,onAuthError}:{pool:OrderPool;reload:()=>Promise<void>;onAuthError:ReportError}){
 const savedTemplate=pool.domain_template??'';
 const [draft,setDraft]=useState<string|null>(null),[result,setResult]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const value=draft??savedTemplate;
 const template=value.trim().toLowerCase();
 const valid=!template||template.includes('{n}')&&!/[{}]/.test(template.replaceAll('{n}','').replaceAll('{country}','').replaceAll('{pool}',''));
 const preview=template.replaceAll('{country}','fi').replaceAll('{n}','01').replaceAll('{pool}',pool.hostname);

 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!valid||template===savedTemplate)return;
  setBusy(true);setResult('');setError('');
  try{
   await api(`/server-orders/pools/${encodeURIComponent(pool.id)}`,json('PUT',{domain_template:template}));
   await reload();
   setDraft(null);setResult(template?'Шаблон сохранён.':'Заказы для пула выключены.');
  }catch(error){setError(onAuthError(error));}
  finally{setBusy(false);}
 }

 return <form className="order-pool-template" onSubmit={submit}>
  <div className="order-pool-name"><strong>{pool.name}</strong><code>{pool.hostname}</code></div>
  <label className="field">
   <span>Шаблон домена <span className="sr-only">для пула {pool.name}</span></span>
   <input value={value} placeholder="{country}-{n}.{pool}" disabled={busy} spellCheck={false} autoComplete="off" onChange={event=>{setDraft(event.target.value);setError('');setResult('');}}/>
   {valid&&template&&<small>{`Пример ${preview}`}</small>}
   {!valid&&<small className="text-amber">Добавьте {'{n}'}. Допустимые переменные {'{n}'}, {'{country}'} и {'{pool}'}.</small>}
  </label>
  <button className="button secondary" disabled={busy||!valid||template===savedTemplate}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Сохранить<span className="sr-only"> шаблон для пула {pool.name}</span></button>
  {(error||result)&&<div className="order-pool-feedback">{error?<OrderError message={error}/>:<p className="inline-success" role="status"><CheckCircle2 size={16}/>{result}</p>}</div>}
 </form>;
}

const autoCountries=[{code:'DE',name:'Германия'},{code:'FI',name:'Финляндия'}];

function OrderAutoHosts({slots,pools,reload,onAuthError}:{slots:AutoHost[];pools:OrderPool[];reload:()=>Promise<void>;onAuthError:ReportError}){
 const [country,setCountry]=useState('DE'),[poolID,setPoolID]=useState(''),[sourceID,setSourceID]=useState('');
 const [hosts,setHosts]=useState<Host[]|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const existing=slots.filter(slot=>slot.country===country);
 const pool=pools.find(item=>item.id===(existing[0]?.pool_id??poolID));
 const sourceHosts=hosts?.filter(host=>host.address.toLowerCase().replace(/\.$/,'')===pool?.hostname)??[];

 async function loadHosts(){
  if(loading||hosts)return;
  setLoading(true);setError('');
  try{setHosts(await api<Host[]>('/remnawave/hosts'));}
  catch(error){setError(onAuthError(error));}
  finally{setLoading(false);}
 }

 async function submit(event:FormEvent){
  event.preventDefault();
  if(!pool||!sourceID||busy||existing.length)return;
  setBusy(true);setError('');setMessage('');
  try{
   await api(`/server-orders/auto-hosts/${country}`,json('PUT',{pool_id:pool.id,source_uuid:sourceID}));
   await reload();
   setMessage('Автохосты подготовлены. Подключите их к шаблону «авто» в Remnawave.');
  }catch(error){setError(onAuthError(error));}
  finally{setBusy(false);}
 }

 return <section className="panel" aria-labelledby="order-auto-hosts-title">
  <div className="panel-heading"><div><h2 id="order-auto-hosts-title">Автохосты</h2><p>По 10 постоянных адресов для Германии и Финляндии.</p></div></div>
  <details className="order-auto-hosts" onToggle={event=>{if(event.currentTarget.open&&!existing.length)void loadHosts();}}>
   <summary>Настроить автохосты</summary>
   <form onSubmit={submit}>
    <label className="field"><span>Страна автохостов</span><select value={country} disabled={busy} onChange={event=>{setCountry(event.target.value);setPoolID('');setSourceID('');setError('');setMessage('');if(!slots.some(slot=>slot.country===event.target.value))void loadHosts();}}>
     {autoCountries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
    </select></label>
    {existing.length>0?<p className="field-help">{pool?.name} · занято {existing.filter(slot=>slot.occupied).length} из {existing.length} · <code>{existing[0].hostname}</code></p>:<>
     <label className="field"><span>DNS-пул автохостов</span><select required value={poolID} disabled={busy} onChange={event=>{setPoolID(event.target.value);setSourceID('');setError('');if(!hosts)void loadHosts();}}>
      <option value="">Выберите DNS-пул</option>{pools.filter(item=>item.domain_template).map(item=><option key={item.id} value={item.id}>{item.name} · {item.hostname}</option>)}
     </select></label>
     <label className="field"><span>Исходный хост Remnawave</span><select required value={sourceID} disabled={!pool||!hosts||busy} onChange={event=>{setSourceID(event.target.value);setError('');}}>
      <option value="">{loading?'Загрузка хостов…':'Выберите хост с параметрами подключения'}</option>
      {sourceHosts.map(host=><option key={host.uuid} value={host.uuid}>{host.remark||host.address} · {host.port}</option>)}
     </select></label>
     {pool&&hosts&&!sourceHosts.length&&<p className="field-help">В Remnawave нужен хост с адресом {pool.hostname}.</p>}
     <button className="button secondary" disabled={!pool||!sourceID||busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Подготовить 10 автохостов</button>
    </>}
    {error&&<OrderError message={error}/>}
    {message&&<p className="inline-success" role="status">{message}</p>}
   </form>
   <p className="field-help">В шаблоне XRAY_JSON «авто» добавьте в <code>remnawave.injectHosts</code> группу ниже. Добавьте префикс <code>dns-guard-auto-</code> в селекторы балансировщика и проверок доступности.</p>
   <pre className="order-auto-selector">{JSON.stringify({selector:{type:'remarkRegex',pattern:'^dns-guard-auto-(de|fi)-(0[1-9]|10)$'},selectFrom:'HIDDEN',useHostRemarkAsTag:true},null,2)}</pre>
  </details>
 </section>;
}

function timeLabel(value:string){
 const time=new Date(value);
 return Number.isNaN(time.getTime())?value:time.toLocaleString('ru-RU');
}

interface OrderLogEntry {
 id:number;
 recorded_at:string;
 stage:string;
 level:'info'|'error';
 message:string;
 occurrences:number;
}

function ServerOrderLog({order,stages,onAuthError}:{order:ServerOrder;stages:Record<string,string>;onAuthError:ReportError}){
 const [entries,setEntries]=useState<OrderLogEntry[]|null>(null);
 const [error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setError('');
  async function load(){
   try{
    const result=await api<OrderLogEntry[]>(`/server-orders/${encodeURIComponent(order.id)}/logs`,{signal:controller.signal});
    if(!Array.isArray(result))throw new Error('Сервер вернул некорректный журнал заказа.');
    if(!controller.signal.aborted)setEntries(result);
   }catch(err){if(!controller.signal.aborted)setError(onAuthError(err));}
  }
  void load();
  return()=>controller.abort();
 },[order.id,order.updated_at,revision,onAuthError]);
 return <section className="server-order-log" id={`order-log-${order.id}`} aria-label={`Журнал заказа ${order.domain}`}>
  <h3>Журнал заказа</h3>
  {error&&<><OrderError message={error}/><button className="button secondary" type="button" onClick={()=>setRevision(value=>value+1)}>Повторить загрузку</button></>}
  {entries===null?!error&&<p role="status">Загрузка журнала…</p>:entries.length===0?<p>Записей пока нет.</p>:
   <ol>{entries.map(entry=><li key={entry.id}>
    <time dateTime={entry.recorded_at}>{timeLabel(entry.recorded_at)}</time>
    <div><strong>{stages[entry.stage]??entry.stage}</strong>
     {entry.level==='error'&&<span className="order-log-error"> · Ошибка</span>}
     {entry.occurrences>1&&<span> · Повторений: {entry.occurrences-1}</span>}
     {entry.message&&<p>{entry.message}</p>}
    </div>
   </li>)}</ol>}
 </section>;
}

function ServerDeleteModal({order,onClose,onQueued,onAuthError}:{order:ServerOrder;onClose:()=>void;onQueued:()=>Promise<void>;onAuthError:ReportError}){
 const deleted=order.deleted_resources;
 const [selected,setSelected]=useState<DeletionOptions>({hosting:!deleted?.hosting,remnawave:!deleted?.remnawave,dns:!deleted?.dns});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const options=[
  {key:'hosting',label:`Удалить сервер у хостинга ${orderProviderNames[order.provider??'upcloud']}`},
  {key:'remnawave',label:'Удалить ноду из панели Remnawave'},
  {key:'dns',label:'Удалить записи из DNS и узел из DNS Guard'},
 ] as const;
 const hasSelection=Object.values(selected).some(Boolean);

 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!hasSelection)return;
  setBusy(true);setError('');
  try{
   await api(`/server-orders/${encodeURIComponent(order.id)}`,json('DELETE',selected));
   await onQueued();
  }catch(error){setError(onAuthError(error));}
  finally{setBusy(false);}
 }

 return <Modal title="Удалить сервер?" subtitle={order.ip?`${order.domain} · ${order.ip}`:order.domain} onClose={onClose} busy={busy}>
  <form onSubmit={submit}>
   <div className="modal-body">
    {error&&<OrderError message={error}/>}
    {options.map(({key,label})=><label className="checkbox-field" key={key}>
     <input type="checkbox" checked={selected[key]} disabled={busy||deleted?.[key]} onChange={event=>{
      const checked=event.target.checked;
      setSelected(previous=>({...previous,[key]:checked}));
     }}/>
     <span>{label}{deleted?.[key]&&' · Уже удалено'}</span>
    </label>)}
    {selected.hosting&&(order.provider??'upcloud')==='upcloud'&&<p className="field-help">UpCloud удалит сервер вместе с подключёнными дисками.</p>}
    {selected.dns&&<p className="field-help">Если это последняя A-запись пула, сначала опубликуйте в пуле другой IP.</p>}
   </div>
   <div className="modal-footer">
    <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Отмена</button>
    <button className="button danger" disabled={busy||!hasSelection}>{busy?<><LoaderCircle className="spin" size={16}/>Отправка…</>:'Удалить выбранное'}</button>
   </div>
  </form>
 </Modal>;
}

function ServerOrderRow({order,stages,reload,onDelete,onAuthError}:{order:ServerOrder;stages:Record<string,string>;reload:()=>Promise<void>;onDelete:()=>void;onAuthError:ReportError}){
 const [logOpen,setLogOpen]=useState(false);
 const [confirmation,setConfirmation]=useState<'cancel'|'retry-create'|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const canCancel=!!order.can_cancel,canRetry=!!order.can_retry_create;
 const showConfirmation=(confirmation==='cancel'&&canCancel)||(confirmation==='retry-create'&&canRetry);
 const partiallyDeleted=order.stage==='complete'&&Object.values(order.deleted_resources??{}).some(Boolean);
 const tone=order.error||order.stage==='rejected'?'red':partiallyDeleted||order.stage==='deleting'?'amber':order.stage==='complete'?'green':['cancelled','deleted'].includes(order.stage)?'muted':'blue';
 const provider=order.provider??'upcloud';
 const providerName=orderProviderNames[provider];
 const operationID=order.retry_operation_id??order.id;
 const groupName=order.group_name==='nodes'?'Обычная нода':order.group_name==='nodes_wl'?'Нода за CDN':order.group_name;

 async function actOnOrder(){
  if(!showConfirmation||!confirmation||busy)return;
  setBusy(true);setError('');
  try{
   await api(`/server-orders/${encodeURIComponent(order.id)}/${confirmation}`,json('POST',confirmation==='cancel'?{}:{confirmed_absent:true}));
   setConfirmation(null);await reload();
  }catch(error){setError(onAuthError(error));}
  finally{setBusy(false);}
 }

 return <li className="server-order">
  <div className="server-order-heading">
   <div className="server-order-name"><span className="pool-symbol"><Server size={17}/></span><div><strong>{order.domain||'Домен назначается'}</strong><small>{order.pool_hostname}</small></div></div>
   <span className={`badge ${tone}`}><span className="badge-dot"/>{partiallyDeleted?'Частично удалён':Object.hasOwn(stages,order.stage)?stages[order.stage]:order.stage}</span>
  </div>
  <dl className="order-details">
   <div><dt>Хостинг</dt><dd>{providerName}</dd></div>
   <div><dt>Локация</dt><dd>{order.zone}</dd></div>
   <div><dt>Тариф</dt><dd>{order.plan}</dd></div>
   <div><dt>Тип узла</dt><dd>{groupName}</dd></div>
   <div><dt>Профиль Remnawave</dt><dd>{order.profile_name}</dd></div>
   {order.plugin_name&&<div><dt>Плагин ноды Remnawave</dt><dd>{order.plugin_name}</dd></div>}
   {order.ip&&<div><dt>IP</dt><dd><code>{order.ip}</code></dd></div>}
   {order.auto_hostname&&<div><dt>Автохост</dt><dd><code>{order.auto_hostname}</code></dd></div>}
   <div><dt>Дата заказа</dt><dd><time dateTime={order.created_at}>{timeLabel(order.created_at)}</time></dd></div>
  </dl>
  {order.error&&<OrderError message={order.error}/>}
  {showConfirmation&&<div className="server-order-confirmation">
   <p>{confirmation==='cancel'?'Отменить заказ на создание сервера?':`Проверьте список серверов и журнал действий ${providerName}. Убедитесь, что сервер по этому заказу отсутствует и запрос на его создание больше не выполняется.`}</p>
   {confirmation==='retry-create'&&(provider==='virtua'?<p>Имя сервера в Virtua.Cloud <code>dns-guard-{operationID}</code></p>:<p>Метка в UpCloud <code>dns-guard-order={operationID}</code></p>)}
   <div className="server-order-actions">
    <button type="button" className="button secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Назад</button>
    <button type="button" className="button danger" disabled={busy} onClick={()=>void actOnOrder()}>{busy&&<LoaderCircle className="spin" size={16}/>} {confirmation==='cancel'?'Да, отменить заказ':'Подтвердить отсутствие и повторить'}</button>
   </div>
  </div>}
  <div className="server-order-actions">
   <button type="button" className="button secondary" aria-expanded={logOpen} aria-controls={logOpen?`order-log-${order.id}`:undefined} onClick={()=>setLogOpen(open=>!open)}><FileText size={16}/>{logOpen?'Скрыть логи':'Логи'}</button>
   {!showConfirmation&&canCancel&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setConfirmation('cancel');setError('');}}>Отменить заказ</button>}
   {!showConfirmation&&canRetry&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setConfirmation('retry-create');setError('');}}>Повторить создание</button>}
   {order.stage==='complete'&&<button type="button" className="button secondary" onClick={onDelete}><Trash2 size={16}/>Удалить сервер</button>}
  </div>
  {logOpen&&<ServerOrderLog order={order} stages={stages} onAuthError={onAuthError}/>}
  {error&&<OrderError message={error}/>}
 </li>;
}

export function ServerOrdersPage({snapshot,loading,error,reload,optionsRevision,refreshOptions,onAuthError}:ReturnType<typeof useServerOrders>&{onAuthError:ReportError}){
 const pending=pendingServerOrder();
 const pendingProvider=pending?(pending.provider??'upcloud'):null;
 const [ordering,setOrdering]=useState<OrderProvider|null>(pendingProvider),[ordered,setOrdered]=useState(false);
 const [deletionID,setDeletionID]=useState<string|null>(null);
 const virtuaConfigured=!!snapshot?.virtua_configured;

 function order(provider:OrderProvider){setOrdered(false);setOrdering(provider);}
 const orders=snapshot?.orders??[],pools=snapshot?.pools??[];
 const deletingOrder=orders.find(order=>order.id===deletionID);

 return <div className="server-orders-page" aria-busy={loading}>
  {error&&<OrderError message={error}/>}
  {ordered&&<p className="notice success" role="status"><CheckCircle2 size={18}/>Заказ принят. Статус появится в истории заказов.</p>}
  {ordering?<ServerOrderWizard provider={ordering} onClose={()=>setOrdering(null)} onOrdered={()=>{setOrdering(null);setOrdered(true);void reload(true);}} onAuthError={onAuthError} optionsRevision={optionsRevision} refreshOptions={refreshOptions}/>:<section className="panel" aria-labelledby="server-hostings-title">
   <div className="panel-heading"><h2 id="server-hostings-title">Доступные хостинги</h2><a className="button secondary" href={providerSettingsHash}>Настроить хостинги и Ansible</a></div>
   <ul className="server-hostings-list">
    <li>
     <div><h3>UpCloud</h3>{snapshot?.upcloud_configured!==undefined&&<ReadinessBadge ready={snapshot.upcloud_configured} positive="Токен сохранён" negative="Требуется токен"/>}</div>
     <button className="button primary" disabled={pendingProvider==='virtua'} onClick={()=>order('upcloud')}><ServerCog size={17}/>{pendingProvider==='upcloud'?'Проверить отправку заказа':'Заказать сервер'}</button>
    </li>
    <li>
     <div><h3>Virtua.Cloud</h3>{snapshot&&<ReadinessBadge ready={virtuaConfigured} positive="Токен сохранён" negative="Требуется токен"/>}</div>
     <div className="virtua-actions">
      <a className="button secondary" href="https://virtua.cloud/" target="_blank" rel="noopener noreferrer">Открыть Virtua.Cloud<ArrowUpRight size={16} aria-hidden="true"/></a>
      {(virtuaConfigured||pendingProvider==='virtua')&&<button className="button primary" disabled={pendingProvider==='upcloud'} onClick={()=>order('virtua')}><ServerCog size={17}/>{pendingProvider==='virtua'?'Проверить отправку заказа Virtua.Cloud':'Заказать сервер Virtua.Cloud'}</button>}
     </div>
    </li>
   </ul>
  </section>}
  <section className="panel" aria-labelledby="server-orders-title">
   <div className="panel-heading">
    <h2 id="server-orders-title">Заказы серверов</h2>
   </div>
   {!snapshot?loading&&<div className="panel-loading" role="status"><span className="loading-label"><LoaderCircle className="spin" size={17}/>Загрузка заказов…</span></div>:orders.length?
    <ul className="server-orders-list">{orders.map(order=><ServerOrderRow key={order.id} order={order} stages={snapshot.stages} reload={reload} onDelete={()=>setDeletionID(order.id)} onAuthError={onAuthError}/>)}</ul>:
    <div className="empty"><div className="empty-icon"><Server size={26}/></div><h3>Заказов ещё нет</h3></div>}
  </section>
  {snapshot&&<section className="panel" aria-labelledby="order-templates-title">
   <div className="panel-heading"><div><h2 id="order-templates-title">Домены серверов</h2><p>Задайте шаблон для каждого DNS-пула. Пустое поле выключает заказы для этого пула.</p></div></div>
   {pools.length?<div className="order-templates">
    <p className="field-help"><code>{'{n}'}</code> — порядковый номер, <code>{'{country}'}</code> — код страны, <code>{'{pool}'}</code> — DNS-имя пула.</p>
    {pools.map(pool=><OrderPoolTemplate key={pool.id} pool={pool} reload={reload} onAuthError={onAuthError}/>)}</div>:
    <p className="server-orders-empty">Сначала создайте DNS-пул в разделе «DNS-пулы».</p>}
  </section>}
  {snapshot?.auto_hosts&&<OrderAutoHosts slots={snapshot.auto_hosts} pools={pools} reload={()=>reload(true)} onAuthError={onAuthError}/>}
  {deletingOrder&&<ServerDeleteModal key={deletingOrder.id} order={deletingOrder} onClose={()=>setDeletionID(null)} onQueued={async()=>{setDeletionID(null);await reload(true);}} onAuthError={onAuthError}/>}
 </div>;
}
