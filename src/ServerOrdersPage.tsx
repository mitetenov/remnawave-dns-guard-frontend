import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,CheckCircle2,LoaderCircle,Server,ServerCog,TriangleAlert} from 'lucide-react';
import {api,json} from './api';
import {pendingServerOrder,ServerOrderWizard} from './ServerOrderWizard';
import './serverOrders.css';

interface ServerOrder {
 id:string;
 domain:string;
 stage:string;
 error:string|null;
 zone:string;
 plan:string;
 created_at:string;
 ip:string|null;
 pool_hostname:string;
 group_name:string;
 profile_name:string;
 can_cancel?:boolean;
 can_retry_create?:boolean;
}
interface OrderPool {id:string;name:string;hostname:string;domain_template:string|null}
interface OrderSnapshot {orders:ServerOrder[];pools:OrderPool[];stages:Record<string,string>}
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

function timeLabel(value:string){
 const time=new Date(value);
 return Number.isNaN(time.getTime())?value:time.toLocaleString('ru-RU');
}

function ServerOrderRow({order,stages,reload,onAuthError}:{order:ServerOrder;stages:Record<string,string>;reload:()=>Promise<void>;onAuthError:ReportError}){
 const [confirmation,setConfirmation]=useState<'cancel'|'retry-create'|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const canCancel=!!order.can_cancel,canRetry=!!order.can_retry_create;
 const showConfirmation=(confirmation==='cancel'&&canCancel)||(confirmation==='retry-create'&&canRetry);
 const tone=order.error||order.stage==='rejected'?'red':order.stage==='complete'?'green':order.stage==='cancelled'?'muted':'blue';
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
   <span className={`badge ${tone}`}><span className="badge-dot"/>{Object.hasOwn(stages,order.stage)?stages[order.stage]:order.stage}</span>
  </div>
  <dl className="order-details">
   <div><dt>Локация</dt><dd>{order.zone}</dd></div>
   <div><dt>Тариф</dt><dd>{order.plan}</dd></div>
   <div><dt>Тип узла</dt><dd>{groupName}</dd></div>
   <div><dt>Профиль Remnawave</dt><dd>{order.profile_name}</dd></div>
   {order.ip&&<div><dt>IP</dt><dd><code>{order.ip}</code></dd></div>}
   <div><dt>Дата заказа</dt><dd><time dateTime={order.created_at}>{timeLabel(order.created_at)}</time></dd></div>
  </dl>
  {order.error&&<OrderError message={order.error}/>}
  {showConfirmation&&<div className="server-order-confirmation">
   <p>{confirmation==='cancel'?'Отменить заказ на создание сервера?':'Проверьте список серверов и журнал действий UpCloud. Убедитесь, что сервер по этому заказу отсутствует и запрос на его создание больше не выполняется.'}</p>
   {confirmation==='retry-create'&&<p>Метка в UpCloud <code>dns-guard-order={order.id}</code></p>}
   <div className="server-order-actions">
    <button type="button" className="button secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Назад</button>
    <button type="button" className="button danger" disabled={busy} onClick={()=>void actOnOrder()}>{busy&&<LoaderCircle className="spin" size={16}/>} {confirmation==='cancel'?'Да, отменить заказ':'Подтвердить отсутствие и повторить'}</button>
   </div>
  </div>}
  {!showConfirmation&&(canCancel||canRetry)&&<div className="server-order-actions">
   {canCancel&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setConfirmation('cancel');setError('');}}>Отменить заказ</button>}
   {canRetry&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{setConfirmation('retry-create');setError('');}}>Повторить создание</button>}
  </div>}
  {error&&<OrderError message={error}/>}
 </li>;
}

export function ServerOrdersPage({snapshot,loading,error,reload,optionsRevision,refreshOptions,onAuthError}:ReturnType<typeof useServerOrders>&{onAuthError:ReportError}){
 const [ordering,setOrdering]=useState(()=>pendingServerOrder()!==null),[ordered,setOrdered]=useState(false);
 const orders=snapshot?.orders??[],pools=snapshot?.pools??[];

 return <div className="server-orders-page" aria-busy={loading}>
  {error&&<OrderError message={error}/>}
  {ordered&&<p className="notice success" role="status"><CheckCircle2 size={18}/>Заказ принят. Статус появится в истории заказов.</p>}
  {ordering&&<ServerOrderWizard onClose={()=>setOrdering(false)} onOrdered={()=>{setOrdering(false);setOrdered(true);void reload(true);}} onAuthError={onAuthError} optionsRevision={optionsRevision} refreshOptions={refreshOptions}/>}
  <section className="panel" aria-labelledby="server-orders-title">
   <div className="panel-heading">
    <div><h2 id="server-orders-title">Заказы серверов</h2><p><a className="order-settings-link" href="#replacements">Подключение UpCloud и Ansible</a></p></div>
    {!ordering&&<button className="button primary" onClick={()=>{setOrdered(false);setOrdering(true);}}><ServerCog size={17}/>{pendingServerOrder()?'Проверить отправку заказа':'Заказать сервер'}</button>}
   </div>
   {!snapshot?loading&&<div className="panel-loading" role="status"><span className="loading-label"><LoaderCircle className="spin" size={17}/>Загрузка заказов…</span></div>:orders.length?
    <ul className="server-orders-list">{orders.map(order=><ServerOrderRow key={order.id} order={order} stages={snapshot.stages} reload={reload} onAuthError={onAuthError}/>)}</ul>:
    <div className="empty"><div className="empty-icon"><Server size={26}/></div><h3>Заказов ещё нет</h3></div>}
  </section>
  {snapshot&&<section className="panel" aria-labelledby="order-templates-title">
   <div className="panel-heading"><div><h2 id="order-templates-title">Домены серверов</h2><p>Задайте шаблон для каждого DNS-пула. Пустое поле выключает заказы для этого пула.</p></div></div>
   {pools.length?<div className="order-templates">
    <p className="field-help"><code>{'{n}'}</code> — порядковый номер, <code>{'{country}'}</code> — код страны, <code>{'{pool}'}</code> — DNS-имя пула.</p>
    {pools.map(pool=><OrderPoolTemplate key={pool.id} pool={pool} reload={reload} onAuthError={onAuthError}/>)}</div>:
    <p className="server-orders-empty">Сначала создайте DNS-пул в разделе «DNS-пулы».</p>}
  </section>}
 </div>;
}
