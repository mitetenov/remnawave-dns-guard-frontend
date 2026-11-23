import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,LoaderCircle,TriangleAlert,X} from 'lucide-react';
import {api,ApiError,json} from './api';
import {NodePluginSelect,type NodePluginChoice} from './NodePluginSelect';

const steps=[
 {kind:'zone',label:'Локация',empty:'Нет доступных локаций UpCloud.'},
 {kind:'plan',label:'Тариф',empty:'В этой локации нет доступных тарифов Starter и Premium.'},
 {kind:'pool',label:'DNS-пул',empty:'Нет доступных DNS-пулов. Сохраните шаблон для нужного пула ниже в блоке «Домены серверов» и настройте его профиль проверок в разделе «DNS-пулы».'},
 {kind:'group',label:'Тип узла',empty:'Нет доступных групп Ansible.'},
 {kind:'profile',label:'Профиль Remnawave',empty:'Для выбранного DNS-пула нет совместимых профилей. Проверьте, что хост Remnawave с адресом пула использует входящие подключения профиля.'},
] as const;
type Kind=typeof steps[number]['kind'];
const planFamilies=[{id:'starter',label:'Starter'},{id:'premium',label:'Premium'}] as const;
type Choice={id:string;label:string;family?:typeof planFamilies[number]['id']};
type Selection=Partial<Record<Kind,Choice>>;
export type OrderProvider='upcloud'|'virtua';
export const orderProviderNames={upcloud:'UpCloud',virtua:'Virtua.Cloud'} satisfies Record<OrderProvider,string>;
type PendingOrder={id:string;selection:Selection;provider?:OrderProvider;plugin?:NodePluginChoice};
const pendingKey='dns-guard:pending-server-order';

function requestID(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;
 bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function pendingServerOrder():PendingOrder|null{
 try{
  const value=JSON.parse(sessionStorage.getItem(pendingKey)??'null') as PendingOrder|null;
  if(value&&(value.provider===undefined||Object.hasOwn(orderProviderNames,value.provider))&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.id)&&steps.every(({kind})=>{
   const choice=value.selection?.[kind];
   return typeof choice?.id==='string'&&!!choice.id&&typeof choice.label==='string';
  }))return value;
 }catch{/* Storage may be disabled. */}
 return null;
}

function storePending(order:PendingOrder|null,expectedID?:string){
 try{
  if(order)sessionStorage.setItem(pendingKey,JSON.stringify(order));
  else if(!expectedID||pendingServerOrder()?.id===expectedID)sessionStorage.removeItem(pendingKey);
 }catch{/* The current form still keeps the request ID. */}
}

export function ServerOrderWizard({provider,onClose,onOrdered,onAuthError,optionsRevision,refreshOptions}:{provider:OrderProvider;onClose:()=>void;onOrdered:()=>void;onAuthError:(error:unknown)=>string;optionsRevision:number;refreshOptions:()=>void}){
 const [restored]=useState(()=>{
  const pending=pendingServerOrder();
  return pending&&(pending.provider??'upcloud')===provider?pending:null;
 });
 const providerName=orderProviderNames[provider];
 const [id]=useState(()=>restored?.id??requestID());
 const [selection,setSelection]=useState<Selection>(restored?.selection??{});
 const [plugin,setPlugin]=useState<NodePluginChoice|null>(restored?.plugin??null);
 const [planFamily,setPlanFamily]=useState('');
 const [step,setStep]=useState(restored?steps.length:0);
 const [options,setOptions]=useState<{key:string;choices:Choice[];error:string}|null>(null);
 const [confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(!!restored),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sending=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const current=steps[step];
 const isPlan=current?.kind==='plan';
 const chooseFamily=isPlan&&provider==='upcloud';
 const query=new URLSearchParams({kind:current?.kind??''});
 if(isPlan&&selection.zone)query.set('zone',selection.zone.id);
 if(current?.kind==='profile'){
  if(selection.pool)query.set('pool_id',selection.pool.id);
  if(selection.group)query.set('group',selection.group.id);
 }
 if(provider==='virtua'&&(current?.kind==='zone'||isPlan))query.set('provider',provider);
 const requestKey=current?query.toString():'';
 const optionKey=`${requestKey}:${optionsRevision}`;
 const result=options?.key===optionKey?options:null;
 const availableChoices=result?.choices??[];
 const availableFamilies=chooseFamily?planFamilies.filter(family=>availableChoices.some(choice=>choice.family===family.id)):[];
 const selectedFamily=availableFamilies.find(family=>family.id===planFamily);
 const choices=chooseFamily?availableChoices.filter(choice=>choice.family===planFamily):availableChoices;
 const hasChoices=chooseFamily?availableFamilies.length>0:choices.length>0;
 const chosen=current?choices.find(choice=>choice.id===selection[current.kind]?.id):null;
 const complete=steps.every(({kind})=>!!selection[kind]?.id);

 useEffect(()=>{
  if(!requestKey)return;
  let active=true;
  const controller=new AbortController();
  api<{choices:Choice[]}>(`/server-orders/options?${requestKey}`,{signal:controller.signal}).then(value=>{
   if(!Array.isArray(value?.choices))throw new Error('Сервер вернул неполный список вариантов.');
   if(active)setOptions({key:optionKey,choices:value.choices,error:''});
  }).catch(error=>{
   if(active)setOptions({key:optionKey,choices:[],error:onAuthError(error)});
  });
  return()=>{active=false;controller.abort();};
 },[requestKey,optionKey,onAuthError]);

 useEffect(()=>{heading.current?.focus();},[step]);

 function select(kind:Kind,next:Choice|undefined){
  if(kind==='zone'&&selection.zone?.id!==next?.id)setPlanFamily('');
  setSelection(previous=>{
   const updated={...previous,[kind]:next};
   if(kind==='zone'&&previous.zone?.id!==next?.id)delete updated.plan;
   if(kind==='pool'&&previous.pool?.id!==next?.id)delete updated.profile;
   if(kind==='group'&&previous.group?.id!==next?.id)delete updated.profile;
   return updated;
  });
 }

 async function submit(event:FormEvent){
  event.preventDefault();
  if(current){if(chosen)setStep(step+1);return;}
  if(!complete||!confirmed||sending.current)return;
  const {zone,plan,pool,group,profile}=selection;
  if(!zone||!plan||!pool||!group||!profile)return;
  sending.current=true;setBusy(true);setError('');
  storePending({id,selection,provider,...(plugin?{plugin}:{})});
  try{
   const value=await api<{id:string}>('/server-orders',json('POST',{request_id:id,zone:zone.id,plan:plan.id,pool_id:pool.id,group:group.id,profile_id:profile.id,...(provider==='virtua'?{provider}:{}),...(plugin?{plugin_uuid:plugin.id}:{})}));
   if(!value?.id)throw new Error('Подтверждение заказа не получено.');
   storePending(null,id);onOrdered();
  }catch(error){
   const unknownResult=!(error instanceof ApiError)||[0,408,429].includes(error.status)||error.status>=500||(pending&&error.status===401);
   setPending(unknownResult);
   if(!unknownResult)storePending(null,id);
   setError(onAuthError(error));
  }finally{sending.current=false;setBusy(false);}
 }

 return <section className="panel order-wizard" aria-labelledby="order-wizard-title">
  <div className="panel-heading">
   <div><h2 id="order-wizard-title">Заказать сервер</h2><p>{providerName} · Debian 13</p></div>
   <button type="button" className="icon-button" aria-label="Закрыть заказ" onClick={onClose} disabled={busy}><X size={19}/></button>
  </div>
  <form className="order-wizard-body" onSubmit={submit}>
   <ol className="order-steps" aria-label="Этапы заказа">
    {steps.map(({kind,label},index)=><li key={kind} aria-current={index===step?'step':undefined} data-complete={index<step}>{label}</li>)}
    <li aria-current={step===steps.length?'step':undefined}>Подтверждение</li>
   </ol>
   <h3 ref={heading} tabIndex={-1}>{current?current.label:'Проверьте заказ'}</h3>
   {current? <div className="order-step-body" aria-busy={!result}>
    {!result&&<p className="loading-label" role="status"><LoaderCircle className="spin" size={16}/>Загрузка вариантов…</p>}
    {result?.error&&<><div className="error-box" role="alert"><TriangleAlert size={17}/><span>{result.error}</span></div><button type="button" className="button secondary" onClick={refreshOptions}>Загрузить варианты снова</button></>}
    {result&&!result.error&&(hasChoices?<>
     {chooseFamily&&<label className="field">
      <span>Линейка тарифов</span>
      <select value={selectedFamily?.id??''} onChange={event=>{setPlanFamily(event.target.value);select('plan',undefined);}}>
       <option value="" disabled>Выберите линейку</option>
       {availableFamilies.map(family=><option key={family.id} value={family.id}>{family.label}</option>)}
      </select>
     </label>}
     {(!chooseFamily||selectedFamily)&&<label className="field">
      <select aria-label={current.label} value={chosen?.id??''} onChange={event=>select(current.kind,choices.find(choice=>choice.id===event.target.value))}>
       <option value="" disabled>{isPlan?'Выберите конфигурацию':'Выберите вариант'}</option>
       {choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
      {isPlan&&chosen&&<small>{chosen.label}</small>}
     </label>}
    </>:<><p className="field-help" role="status">{provider==='virtua'&&current.kind==='zone'?'Нет доступных локаций Virtua.Cloud.':provider==='virtua'&&isPlan?'В этой локации нет доступных почасовых тарифов.':current.empty}</p><button type="button" className="button secondary" onClick={refreshOptions}>Обновить варианты</button></>)}
   </div>:<>
    <dl className="order-details">
     {steps.map(({kind,label})=><div key={kind}><dt>{label}</dt><dd>{selection[kind]?.label}</dd></div>)}
     <div><dt>Операционная система</dt><dd>Debian 13</dd></div>
    </dl>
    <NodePluginSelect value={plugin} defaultLabel="Без плагина" disabled={busy||pending} active={!pending} onAuthError={onAuthError} onChange={choice=>{setPlugin(choice);setConfirmed(false);setError('');}}/>
    <label className="checkbox-field order-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/><span>Подтверждаю платный заказ. {providerName} будет списывать средства по указанному тарифу. Если через 10 минут после настройки проверки подтвердят недоступность сервера, DNS Guard удалит его и один раз повторит заказ.</span></label>
    {error&&<div className="error-box" role="alert"><TriangleAlert size={17}/><span>{error}</span></div>}
    {pending&&<p className="field-help">Подтверждение от панели ещё не получено. При повторе будет отправлен тот же заказ.</p>}
   </>}
   <div className="order-wizard-actions">
    <button type="button" className="button secondary" disabled={busy||pending} onClick={()=>{if(step>0){setStep(step-1);setConfirmed(false);setError('');}else onClose();}}>{step>0&&<ArrowLeft size={15}/>} {step>0?'Назад':'Отмена'}</button>
    {current?<button className="button primary" disabled={!chosen}>Продолжить<ArrowRight size={15}/></button>:<button className="button primary" disabled={busy||!complete||!confirmed}>{busy&&<LoaderCircle className="spin" size={15}/>}{pending?'Повторить запрос заказа':'Подтвердить платный заказ'}</button>}
   </div>
  </form>
 </section>;
}
