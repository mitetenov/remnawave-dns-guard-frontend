import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,CheckCircle2,ChevronRight,LoaderCircle,TriangleAlert} from 'lucide-react';
import {api,json} from './api';
import {providerSettingsHash,ReadinessBadge} from './ProviderSettings';
import {orderProviderNames,type OrderProvider} from './ServerOrderWizard';
import {NodePluginSelect} from './NodePluginSelect';

interface ReplacementTarget {
 id:string;
 name:string;
 ip:string;
 pool_name:string;
 remnawave_uuid:string|null;
 provider:string|null;
 server_uuid:string|null;
 enabled:boolean;
 pool_enabled:boolean;
 manual_enabled:boolean;
 order_managed?:boolean;
 virtua_zone?:string;
 virtua_quote?:string;
 virtua_group?:string;
 virtua_domain?:string;
 plugin_uuid?:string|null;
 blocked_since:string|null;
}

interface ReplacementJob {
 id:string;
 target_id:string;
 provider?:OrderProvider;
 name:string;
 stage:string;
 old_ip:string;
 new_ip:string|null;
 error:string|null;
 created_at:string;
 updated_at:string;
 release_after?:string;
 can_retry_create?:boolean;
}

interface ReplacementSnapshot {
 upcloud_configured:boolean;
 virtua_configured?:boolean;
 ansible_ready:boolean;
 ansible_error:string;
 order_ansible_ready?:boolean;
 order_ansible_error?:string;
 targets:ReplacementTarget[];
 jobs:ReplacementJob[];
}

type ReportError=(error:unknown)=>string;

const stageNames:Record<string,string>={
 preflight:'Предварительные проверки',
 retire:'Удаление старого сервера',
 provision:'Создание сервера UpCloud',
 enrollment:'Ожидание SSH-ключа сервера',
 ansible:'Настройка через Ansible',
 remnawave:'Обновление узла Remnawave',
 verify:'Проверка нового IP',
 dns:'Обновление DNS',
 cleanup:'Освобождение прежнего IP',
 complete:'Завершена',
 cancelled:'Отменена',
};
const virtuaStageNames:Record<string,string>={
 provision:'Создание VPS Virtua.Cloud',
 cleanup:'Удаление старого VPS Virtua.Cloud',
};

export function useReplacements(active:boolean,onAuthError:ReportError){
 const [snapshot,setSnapshot]=useState<ReplacementSnapshot|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const activeRef=useRef(active), requestRef=useRef(0);
 activeRef.current=active;

 const reload=useCallback(async(quiet=false)=>{
  if(!activeRef.current)return;
  const request=++requestRef.current;
  if(!quiet)setLoading(true);
  try{
   const value=await api<ReplacementSnapshot>('/replacements');
   if(!value)throw new Error('Сервер вернул пустой ответ об автозамене.');
   if(request===requestRef.current){setSnapshot(value);setError('');}
  }catch(error){
   if(request===requestRef.current)setError(onAuthError(error));
  }finally{
   if(request===requestRef.current)setLoading(false);
  }
 },[onAuthError]);

 useEffect(()=>{
  if(active)void reload();
  else{setSnapshot(null);setError('');setLoading(false);}
  return()=>{requestRef.current++;};
 },[active,reload]);

 return {snapshot,loading,error,reload};
}

function ErrorMessage({message}:{message:string}){
 return <div className="error-box" role="alert"><TriangleAlert size={17}/><span>{message}</span></div>;
}

function Badge({tone,label}:{tone:string;label:string}){
 return <span className={`badge ${tone}`}><span className="badge-dot"/>{label}</span>;
}

function timestamp(value:string){
 const time=new Date(value);
 return Number.isNaN(time.getTime())?value:time.toLocaleString('ru-RU');
}

type Save=(path:string,body:unknown)=>Promise<void>;

function ReplacementReadiness({snapshot}:{snapshot:ReplacementSnapshot}){
 return <section className="panel">
  <div className="panel-heading"><h2>Готовность к замене</h2><a className="button secondary" href={providerSettingsHash}>Настроить хостинги и Ansible</a></div>
  <div className="replacement-readiness settings-section">
   <div className="provider-ansible"><p>Ручные привязки UpCloud</p><ReadinessBadge ready={snapshot.upcloud_configured&&snapshot.ansible_ready}/></div>
   {snapshot.virtua_configured!==undefined&&<div className="provider-ansible"><p>Virtua.Cloud</p><ReadinessBadge ready={snapshot.virtua_configured&&(snapshot.order_ansible_ready??snapshot.ansible_ready)}/></div>}
   {snapshot.order_ansible_ready!==undefined&&<div className="provider-ansible"><p>Узлы из заказов UpCloud</p><ReadinessBadge ready={snapshot.upcloud_configured&&snapshot.order_ansible_ready}/></div>}
  </div>
 </section>;
}

function targetStatus(target:ReplacementTarget,ready:boolean){
 if(!target.server_uuid)return {label:'Нет привязки',tone:'muted'};
 if(!target.enabled)return {label:'Выключена',tone:'muted'};
 if(!target.manual_enabled)return {label:'Узел отключён вручную',tone:'amber'};
 if(!target.pool_enabled)return {label:'Пул на паузе',tone:'amber'};
 if(!ready)return {label:'Ожидает настройки',tone:'amber'};
 if(target.blocked_since)return {label:'Блокировка обнаружена',tone:'amber'};
 return {label:'Включена',tone:'green'};
}

type HostingChoice={id:string;label:string};

function useVirtuaChoices(kind:'zone'|'plan',zone:string,active:boolean,onAuthError:ReportError){
 const query=new URLSearchParams({kind,provider:'virtua',...(kind==='plan'?{zone}:{})}).toString();
 const [result,setResult]=useState<{query:string;choices:HostingChoice[];error:string}>();
 useEffect(()=>{
  if(!active)return;
  let current=true;
  void api<{choices:HostingChoice[]}>(`/server-orders/options?${query}`).then(
   value=>{if(current)setResult({query,choices:value.choices,error:''});},
   error=>{if(current)setResult({query,choices:[],error:onAuthError(error)});},
  );
  return ()=>{current=false;};
 },[active,query,onAuthError]);
 return result?.query===query?result:undefined;
}

function TargetBinding({target,locked,ready,virtuaConfigured,save,onAuthError}:{target:ReplacementTarget;locked:boolean;ready:boolean;virtuaConfigured?:boolean;save:Save;onAuthError:ReportError}){
 const initial={
  provider:target.provider==='virtua'?'virtua' as const:'upcloud' as const,
  server_uuid:target.server_uuid??'',remnawave_uuid:target.remnawave_uuid??'',enabled:target.enabled,
  virtua_zone:target.virtua_zone??'',virtua_quote:target.virtua_quote??'',
  virtua_group:target.virtua_group??'',virtua_domain:target.virtua_domain??'',
  plugin_uuid:target.plugin_uuid??'',
 };
 const source=JSON.stringify(initial);
 const [draft,setDraft]=useState<(typeof initial&{source:string})|null>(null),[open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const pending=draft?.source===source?draft:initial;
 const values=locked?{...initial,enabled:pending.enabled}:pending;
 const virtua=values.provider==='virtua';
 const loadChoices=open&&virtua&&virtuaConfigured===true&&!locked;
 const zones=useVirtuaChoices('zone','',loadChoices,onAuthError);
 const plans=useVirtuaChoices('plan',values.virtua_zone,loadChoices&&!!values.virtua_zone,onAuthError);
 const selectedPlan=plans?.choices.find(choice=>choice.id===values.virtua_quote);
 const virtuaSettings={virtua_zone:values.virtua_zone,virtua_quote:values.virtua_quote,
  virtua_group:values.virtua_group,virtua_domain:values.virtua_domain.trim()};
 const binding={
  provider:values.provider,
  server_uuid:locked?initial.server_uuid:values.server_uuid.trim(),
  remnawave_uuid:locked?initial.remnawave_uuid:values.remnawave_uuid.trim(),
  enabled:values.enabled,
  ...(virtua?virtuaSettings:{}),
  ...(values.plugin_uuid!==initial.plugin_uuid?{plugin_uuid:values.plugin_uuid}:{}),
 };
 const valid=!!binding.server_uuid&&!!binding.remnawave_uuid&&(!virtua||Object.values(virtuaSettings).every(Boolean));
 const changed=binding.provider!==initial.provider||binding.server_uuid!==initial.server_uuid||
  binding.remnawave_uuid!==initial.remnawave_uuid||binding.enabled!==initial.enabled||values.plugin_uuid!==initial.plugin_uuid||
  virtua&&Object.entries(virtuaSettings).some(([key,value])=>initial[key as keyof typeof virtuaSettings]!==value);

 function change(fields:Partial<typeof initial>){
  setDraft({...values,...fields,source});setSaved(false);setError('');
 }

 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!valid||!changed)return;
  setBusy(true);setError('');setSaved(false);
  try{
   await save(`/replacements/targets/${encodeURIComponent(target.id)}`,binding);
   setDraft(null);setSaved(true);
  }catch(error){setError(onAuthError(error));}
  finally{setBusy(false);}
 }

 return <details className="replacement-target" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>
   <ChevronRight className="replacement-target-chevron" size={17}/>
   <span className="replacement-target-name"><strong>{target.name}</strong><small>{target.pool_name} · <code>{target.ip}</code></small></span>
   <Badge {...targetStatus(target,ready)}/>
  </summary>
  <form className="replacement-binding" onSubmit={submit}>
   {target.blocked_since&&<p className="replacement-blocked">Блокировка обнаружена <time dateTime={target.blocked_since}>{timestamp(target.blocked_since)}</time>.</p>}
   {locked&&<p className="field-help">Идентификаторы можно изменить после завершения замены.</p>}
   <div className="replacement-binding-fields">
    {virtuaConfigured!==undefined&&<label className="field"><span>Провайдер</span><select value={values.provider} disabled={busy||locked||target.order_managed} onChange={event=>change({provider:event.target.value as OrderProvider,server_uuid:'',virtua_zone:'',virtua_quote:'',virtua_group:'',virtua_domain:'',enabled:false})}>
     <option value="upcloud">UpCloud</option><option value="virtua">Virtua.Cloud</option>
    </select></label>}
    <label className="field"><span>UUID сервера {orderProviderNames[values.provider]}</span><input type="text" value={locked?initial.server_uuid:values.server_uuid} onChange={event=>change({server_uuid:event.target.value})} autoComplete="off" spellCheck={false} required disabled={busy||locked}/></label>
    <label className="field"><span>UUID узла Remnawave</span><input type="text" value={locked?initial.remnawave_uuid:values.remnawave_uuid} onChange={event=>change({remnawave_uuid:event.target.value})} autoComplete="off" spellCheck={false} required disabled={busy||locked||(virtua&&target.order_managed)}/></label>
    {virtua&&<>
     <label className="field"><span>Локация нового сервера</span><select required value={values.virtua_zone} disabled={busy||locked||!zones?.choices.length} onChange={event=>change({virtua_zone:event.target.value,virtua_quote:''})}>
      <option value="">Выберите локацию</option>
      {values.virtua_zone&&!zones?.choices.some(choice=>choice.id===values.virtua_zone)&&<option value={values.virtua_zone}>{values.virtua_zone}</option>}
      {zones?.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
     </select></label>
     <label className="field"><span>Тариф нового сервера</span><select required value={values.virtua_quote} disabled={busy||locked||!plans?.choices.length} onChange={event=>change({virtua_quote:event.target.value})}>
      <option value="">Выберите тариф</option>
      {values.virtua_quote&&!selectedPlan&&<option value={values.virtua_quote}>{plans&&!plans.error?'Сохранённый тариф недоступен':'Сохранённый тариф'}</option>}
      {plans?.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
     </select></label>
     <label className="field"><span>Тип ноды</span><select required value={values.virtua_group} disabled={busy||locked||target.order_managed} onChange={event=>change({virtua_group:event.target.value})}>
      <option value="">Выберите тип ноды</option><option value="nodes">Обычная нода (nodes)</option><option value="nodes_wl">Нода за CDN (nodes_wl)</option>
     </select></label>
     <label className="field"><span>Отдельный домен ноды</span><input required type="text" value={values.virtua_domain} disabled={busy||locked||target.order_managed} onChange={event=>change({virtua_domain:event.target.value})} placeholder="node.example.com" autoComplete="off" spellCheck={false}/></label>
    </>}
    <NodePluginSelect value={values.plugin_uuid?{id:values.plugin_uuid,label:'Сохранённый плагин'}:null} defaultLabel="Сохранить текущий плагин" disabled={busy||locked} active={open&&!locked} onAuthError={onAuthError} onChange={plugin=>change({plugin_uuid:plugin?.id??''})}/>
   </div>
   {virtua&&<>
    {!virtuaConfigured&&<p className="field-help">Сохраните токен Virtua.Cloud в разделе «Серверы».</p>}
    {(zones?.error||plans?.error)&&<ErrorMessage message={zones?.error||plans?.error||''}/>}
    {!target.order_managed&&<p className="field-help">Укажите отдельное имя в зоне Cloudflare этого пула. DNS Guard создаст A-запись или переключит единственную DNS-only A-запись со старого IP на новый.</p>}
   </>}
   <label className="checkbox-field"><input type="checkbox" checked={values.enabled} onChange={event=>change({enabled:event.target.checked})} disabled={busy}/><span>{virtua?'Разрешить платный заказ нового VPS и удаление старого без переноса диска':'Разрешить автоматическое удаление и замену этого сервера'}</span></label>
   <button className="button secondary" disabled={busy||!valid||!changed}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Сохранить привязку</button>
   {error&&<ErrorMessage message={error}/>}
   {saved&&<div className="inline-success" role="status"><CheckCircle2 size={16}/>Привязка сохранена.</div>}
  </form>
 </details>;
}

function RetryReplacementCreate({job,reload,onAuthError}:{job:ReplacementJob;reload:()=>Promise<void>;onAuthError:ReportError}){
 const [confirming,setConfirming]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [acceptedUpdate,setAcceptedUpdate]=useState<string|null>(null);
 const eligible=job.can_retry_create===true;
 const accepted=acceptedUpdate!==null&&(!eligible||acceptedUpdate===job.updated_at);

 useEffect(()=>{if(!eligible)setConfirming(false);},[eligible]);

 async function retry(){
  if(!eligible||!confirming||busy||accepted)return;
  setBusy(true);setError('');
  try{
   await api<{ok:true}>(`/replacements/jobs/${encodeURIComponent(job.id)}/retry-create`,json('POST',{confirmed_absent:true}));
   setAcceptedUpdate(job.updated_at);setConfirming(false);
   await reload();
  }catch(error){setError(onAuthError(error));setConfirming(false);}
  finally{setBusy(false);}
 }

 if(!eligible&&!accepted)return null;
 const virtua=job.provider==='virtua';
 return <div className="replacement-retry">
  <p>{virtua?'Имя сервера в Virtua.Cloud':'Метка в UpCloud'} <code>{virtua?`dns-guard-${job.id}`:`dns-guard-replacement=${job.id}`}</code></p>
  {accepted?<div className="inline-success" role="status"><CheckCircle2 size={16}/>Повторное создание разрешено.</div>:<>
   {confirming&&<p>{virtua?'Проверьте в Virtua.Cloud список серверов и ожидающие заказы. Подтвердите отсутствие сервера с этим именем и запросов на его создание.':'Проверьте список серверов и журнал действий UpCloud. Подтвердите отсутствие сервера с этой меткой и любых выполняемых или ожидающих запросов на его создание.'}</p>}
   <div className="replacement-retry-actions">
    <button type="button" className="button secondary" aria-expanded={confirming} onClick={()=>{setConfirming(!confirming);setError('');}} disabled={busy}>{confirming?'Отмена':'Повторить создание'}</button>
    {confirming&&<button type="button" className="button primary" onClick={()=>void retry()} disabled={busy}>{busy&&<LoaderCircle className="spin" size={16}/>}Подтвердить отсутствие и повторить</button>}
   </div>
  </>}
  {error&&<ErrorMessage message={error}/>}
 </div>;
}

function ReplacementHistory({jobs,reload,onAuthError}:{jobs:ReplacementJob[];reload:()=>Promise<void>;onAuthError:ReportError}){
 return <section className="panel">
  <div className="panel-heading"><div><h2>Замены</h2><p>Текущие операции и история</p></div></div>
  {!jobs.length?<p className="replacement-empty">Замен ещё не было.</p>:<ul className="replacement-jobs">
   {jobs.map(job=><li key={job.id}>
    <div className="replacement-job-heading">
     <strong>{job.name}</strong>
     <Badge tone={job.error?'red':job.stage==='complete'?'green':job.stage==='cancelled'?'muted':'blue'} label={(job.provider==='virtua'?virtuaStageNames[job.stage]:undefined)??stageNames[job.stage]??job.stage}/>
    </div>
    <dl className="replacement-job-details">
     <div><dt>Старый IP</dt><dd><code>{job.old_ip}</code></dd></div>
     {job.new_ip&&<div><dt>Новый IP</dt><dd><code>{job.new_ip}</code></dd></div>}
     {job.stage==='cleanup'&&job.release_after&&<div><dt>{job.provider==='virtua'?'Удаление старого VPS возможно после':'Старый IP зарезервирован до'}</dt><dd><time dateTime={job.release_after}>{timestamp(job.release_after)}</time></dd></div>}
     <div><dt>Создана</dt><dd><time dateTime={job.created_at}>{timestamp(job.created_at)}</time></dd></div>
     <div><dt>Обновлена</dt><dd><time dateTime={job.updated_at}>{timestamp(job.updated_at)}</time></dd></div>
    </dl>
    {job.error&&<p className="replacement-job-error"><TriangleAlert size={16}/><span>{job.error}</span></p>}
    {job.stage==='provision'&&<RetryReplacementCreate job={job} reload={reload} onAuthError={onAuthError}/>}
   </li>)}
  </ul>}
 </section>;
}

export function ReplacementsPage({snapshot,loading,error,reload,onAuthError}:ReturnType<typeof useReplacements>&{onAuthError:ReportError}){
 async function save(path:string,body:unknown){
  await api<{ok:true}>(path,json('PUT',body));
  await reload();
 }

 const jobs=snapshot?.jobs??[];
 const targets=snapshot?.targets??[];
 const lockedTargets=new Set(jobs.filter(job=>job.stage!=='preflight'&&job.stage!=='complete'&&job.stage!=='cancelled').map(job=>job.target_id));

 return <div className="replacements-page" aria-busy={loading}>
  {error&&<ErrorMessage message={error}/>}
  {!snapshot?loading&&<div className="panel panel-loading"><span className="loading-label"><LoaderCircle className="spin" size={17}/>Загрузка автозамены…</span></div>:<>
   <div className="replacement-warning">
    <TriangleAlert size={20}/>
    <div>
     <p>После 5 минут подтверждённой непрерывной блокировки IP из России DNS Guard начинает замену. Он настраивает сервер через Ansible, обновляет узел Remnawave и публикует новый IP в DNS после успешных проверок.</p>
     <p>UpCloud сохраняет диски при замене. Virtua.Cloud создаёт новый VPS с чистым диском и удаляет старый после переключения DNS и истечения TTL.</p>
     <p>Автозамена запускается только для включённых узлов. Пауза автоматизации пула или выключение автозамены приостанавливает замену между этапами. Текущая операция может завершиться.</p>
    </div>
   </div>
   <ReplacementHistory jobs={jobs} reload={reload} onAuthError={onAuthError}/>
   <ReplacementReadiness snapshot={snapshot}/>
   <section className="panel">
    <div className="panel-heading"><div><h2>Привязки узлов</h2><p>Укажите провайдера, UUID сервера и UUID узла Remnawave.</p></div></div>
    {targets.length?targets.map(target=>{
     const virtua=target.provider==='virtua';
     const ansibleReady=target.order_managed||virtua?(snapshot.order_ansible_ready??snapshot.ansible_ready):snapshot.ansible_ready;
     const tokenReady=virtua?snapshot.virtua_configured===true:snapshot.upcloud_configured;
     return <TargetBinding key={target.id} target={target} locked={lockedTargets.has(target.id)} ready={tokenReady&&ansibleReady} virtuaConfigured={snapshot.virtua_configured} save={save} onAuthError={onAuthError}/>;
    }):<p className="replacement-empty">Добавьте узел в разделе «DNS-пулы», чтобы настроить автозамену.</p>}
   </section>
  </>}
 </div>;
}
