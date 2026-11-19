import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,LoaderCircle,TriangleAlert,X} from 'lucide-react';
import {api,ApiError,json} from './api';

const steps=[
 {kind:'zone',label:'Локация',empty:'Нет доступных локаций UpCloud.'},
 {kind:'plan',label:'Тариф',empty:'В этой локации нет доступных тарифов.'},
 {kind:'pool',label:'DNS-пул',empty:'Укажите шаблон домена и профиль проверок пула.'},
 {kind:'group',label:'Тип узла',empty:'Нет доступных групп Ansible.'},
 {kind:'profile',label:'Профиль Remnawave',empty:'Для выбранного DNS-пула нет совместимых профилей. Проверьте, что хост Remnawave с адресом пула использует входящие подключения профиля.'},
] as const;
type Kind=typeof steps[number]['kind'];
type Choice={id:string;label:string};
type Selection=Partial<Record<Kind,Choice>>;
type PendingOrder={id:string;selection:Selection};
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
  if(value&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.id)&&steps.every(({kind})=>{
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

export function ServerOrderWizard({onClose,onOrdered,onAuthError}:{onClose:()=>void;onOrdered:()=>void;onAuthError:(error:unknown)=>string}){
 const [restored]=useState(pendingServerOrder);
 const [id]=useState(()=>restored?.id??requestID());
 const [selection,setSelection]=useState<Selection>(restored?.selection??{});
 const [step,setStep]=useState(restored?steps.length:0);
 const [options,setOptions]=useState<{key:string;choices:Choice[];error:string}|null>(null);
 const [revision,retryOptions]=useState(0);
 const [confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(!!restored),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sending=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const current=steps[step];
 const query=new URLSearchParams({kind:current?.kind??''});
 if(current?.kind==='plan'&&selection.zone)query.set('zone',selection.zone.id);
 if(current?.kind==='profile'&&selection.pool)query.set('pool_id',selection.pool.id);
 const requestKey=current?query.toString():'';
 const optionKey=`${requestKey}:${revision}`;
 const result=options?.key===optionKey?options:null;
 const chosen=current?result?.choices.find(choice=>choice.id===selection[current.kind]?.id):null;
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
  setSelection(previous=>{
   const updated={...previous,[kind]:next};
   if(kind==='zone'&&previous.zone?.id!==next?.id)delete updated.plan;
   if(kind==='pool'&&previous.pool?.id!==next?.id)delete updated.profile;
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
  storePending({id,selection});
  try{
   const value=await api<{id:string}>('/server-orders',json('POST',{request_id:id,zone:zone.id,plan:plan.id,pool_id:pool.id,group:group.id,profile_id:profile.id}));
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
   <div><h2 id="order-wizard-title">Заказать сервер</h2><p>UpCloud · Debian 13</p></div>
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
    {result?.error&&<><div className="error-box" role="alert"><TriangleAlert size={17}/><span>{result.error}</span></div><button type="button" className="button secondary" onClick={()=>retryOptions(value=>value+1)}>Загрузить варианты снова</button></>}
    {result&&!result.error&&(result.choices.length?<label className="field">
     <select aria-label={current.label} value={chosen?.id??''} onChange={event=>select(current.kind,result.choices.find(choice=>choice.id===event.target.value))}>
      <option value="" disabled>Выберите вариант</option>
      {result.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
     </select>
     {current.kind==='plan'&&chosen&&<small>{chosen.label}</small>}
    </label>:<><p className="field-help">{current.empty}</p><button type="button" className="button secondary" onClick={()=>retryOptions(value=>value+1)}>Обновить варианты</button></>)}
   </div>:<>
    <dl className="order-details">
     {steps.map(({kind,label})=><div key={kind}><dt>{label}</dt><dd>{selection[kind]?.label}</dd></div>)}
     <div><dt>Операционная система</dt><dd>Debian 13</dd></div>
    </dl>
    <label className="checkbox-field order-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/><span>Подтверждаю заказ платного сервера. UpCloud будет списывать средства по указанному тарифу.</span></label>
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
