import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,CheckCircle2,ChevronRight,LoaderCircle,TriangleAlert} from 'lucide-react';
import {api,json} from './api';

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
 blocked_since:string|null;
}

interface ReplacementJob {
 id:string;
 target_id:string;
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
 ansible_ready:boolean;
 ansible_error:string;
 targets:ReplacementTarget[];
 jobs:ReplacementJob[];
}

type ReportError=(error:unknown)=>string;

const stageNames:Record<string,string>={
 preflight:'Предварительные проверки',
 retire:'Удаление старого сервера',
 provision:'Создание сервера UpCloud',
 ansible:'Настройка через Ansible',
 remnawave:'Обновление узла Remnawave',
 verify:'Проверка нового IP',
 dns:'Обновление DNS',
 cleanup:'Освобождение прежнего IP',
 complete:'Завершена',
 cancelled:'Отменена',
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

function ReplacementSettings({snapshot,save,onAuthError}:{snapshot:ReplacementSnapshot;save:Save;onAuthError:ReportError}){
 const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);

 async function submit(event:FormEvent){
  event.preventDefault();
  const value=token.trim();
  if(busy||!value)return;
  setBusy(true);setError('');setSaved(false);
  try{
   await save('/replacements/settings',{upcloud_token:value});
   setToken('');setSaved(true);
  }catch(error){setError(onAuthError(error).replaceAll(value,'•••'));}
  finally{setBusy(false);}
 }

 return <section className="panel">
  <div className="panel-heading"><div><h2>Готовность к замене</h2></div></div>
  <div className="replacement-readiness">
   <form className="settings-section" onSubmit={submit}>
    <div className="settings-section-header">
     <h3>UpCloud</h3>
     <Badge tone={snapshot.upcloud_configured?'green':'amber'} label={snapshot.upcloud_configured?'Токен сохранён':'Требуется токен'}/>
    </div>
    <label className="field"><span>API-токен UpCloud</span><input type="password" autoComplete="new-password" value={token} onChange={event=>{setToken(event.target.value);setSaved(false);setError('');}} placeholder={snapshot.upcloud_configured?'Введите новый токен для замены':''} disabled={busy}/></label>
    <button className="button secondary" disabled={busy||!token.trim()}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Сохранить токен</button>
    {error&&<ErrorMessage message={error}/>}
    {saved&&<div className="inline-success" role="status"><CheckCircle2 size={16}/>Токен UpCloud сохранён.</div>}
   </form>
   <div className="settings-section">
    <div className="settings-section-header">
     <h3>Ansible</h3>
     <Badge tone={snapshot.ansible_ready?'green':'amber'} label={snapshot.ansible_ready?'Готов':'Требуется настройка'}/>
    </div>
    {snapshot.ansible_error&&<ErrorMessage message={snapshot.ansible_error}/>}
   </div>
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

function TargetBinding({target,locked,ready,save,onAuthError}:{target:ReplacementTarget;locked:boolean;ready:boolean;save:Save;onAuthError:ReportError}){
 const initial={server_uuid:target.server_uuid??'',remnawave_uuid:target.remnawave_uuid??'',enabled:target.enabled};
 const source=JSON.stringify(initial);
 const [draft,setDraft]=useState<(typeof initial&{source:string})|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const values=draft?.source===source?draft:initial;
 const binding={
  provider:'upcloud',
  server_uuid:locked?initial.server_uuid:values.server_uuid.trim(),
  remnawave_uuid:locked?initial.remnawave_uuid:values.remnawave_uuid.trim(),
  enabled:values.enabled,
 };
 const valid=!!binding.server_uuid&&!!binding.remnawave_uuid;
 const changed=binding.server_uuid!==initial.server_uuid||binding.remnawave_uuid!==initial.remnawave_uuid||binding.enabled!==initial.enabled;

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

 return <details className="replacement-target">
  <summary>
   <ChevronRight className="replacement-target-chevron" size={17}/>
   <span className="replacement-target-name"><strong>{target.name}</strong><small>{target.pool_name} · <code>{target.ip}</code></small></span>
   <Badge {...targetStatus(target,ready)}/>
  </summary>
  <form className="replacement-binding" onSubmit={submit}>
   {target.blocked_since&&<p className="replacement-blocked">Блокировка обнаружена <time dateTime={target.blocked_since}>{timestamp(target.blocked_since)}</time>.</p>}
   {locked&&<p className="field-help">Идентификаторы можно изменить после завершения замены.</p>}
   <div className="replacement-binding-fields">
    <label className="field"><span>UUID сервера UpCloud</span><input type="text" value={locked?initial.server_uuid:values.server_uuid} onChange={event=>change({server_uuid:event.target.value})} autoComplete="off" spellCheck={false} required disabled={busy||locked}/></label>
    <label className="field"><span>UUID узла Remnawave</span><input type="text" value={locked?initial.remnawave_uuid:values.remnawave_uuid} onChange={event=>change({remnawave_uuid:event.target.value})} autoComplete="off" spellCheck={false} required disabled={busy||locked}/></label>
   </div>
   <label className="checkbox-field"><input type="checkbox" checked={values.enabled} onChange={event=>change({enabled:event.target.checked})} disabled={busy}/><span>Разрешить автоматическое удаление и замену этого сервера</span></label>
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
 return <div className="replacement-retry">
  <p>Метка в UpCloud <code>dns-guard-replacement={job.id}</code></p>
  {accepted?<div className="inline-success" role="status"><CheckCircle2 size={16}/>Повторное создание разрешено.</div>:<>
   {confirming&&<p>Проверьте список серверов и журнал действий UpCloud. Подтвердите отсутствие сервера с этой меткой и любых выполняемых или ожидающих запросов на его создание.</p>}
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
     <Badge tone={job.error?'red':job.stage==='complete'?'green':job.stage==='cancelled'?'muted':'blue'} label={Object.hasOwn(stageNames,job.stage)?stageNames[job.stage]:job.stage}/>
    </div>
    <dl className="replacement-job-details">
     <div><dt>Старый IP</dt><dd><code>{job.old_ip}</code></dd></div>
     {job.new_ip&&<div><dt>Новый IP</dt><dd><code>{job.new_ip}</code></dd></div>}
     {job.stage==='cleanup'&&job.release_after&&<div><dt>Старый IP зарезервирован до</dt><dd><time dateTime={job.release_after}>{timestamp(job.release_after)}</time></dd></div>}
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
     <p>После 5 минут подтверждённой непрерывной блокировки IP из России DNS Guard удаляет привязанный сервер UpCloud и создаёт новый с сохранёнными дисками. DNS Guard настраивает сервер через Ansible, обновляет узел Remnawave и публикует новый IP в DNS после свежих успешных проверок.</p>
     <p>Автозамена запускается только для включённых узлов. Пауза автоматизации пула или выключение автозамены приостанавливает замену между этапами. Текущая операция может завершиться.</p>
    </div>
   </div>
   <ReplacementHistory jobs={jobs} reload={reload} onAuthError={onAuthError}/>
   <ReplacementSettings snapshot={snapshot} save={save} onAuthError={onAuthError}/>
   <section className="panel">
    <div className="panel-heading"><div><h2>Привязки узлов</h2><p>Укажите UUID сервера UpCloud и узла Remnawave для каждой привязки.</p></div></div>
    {targets.length?targets.map(target=><TargetBinding key={target.id} target={target} locked={lockedTargets.has(target.id)} ready={snapshot.upcloud_configured&&snapshot.ansible_ready} save={save} onAuthError={onAuthError}/>):<p className="replacement-empty">Добавьте узел в разделе «DNS-пулы», чтобы настроить автозамену.</p>}
   </section>
  </>}
 </div>;
}
