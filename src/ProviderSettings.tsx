import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,CheckCircle2,LoaderCircle,ServerCog,Terminal,TriangleAlert} from 'lucide-react';
import {api,json} from './api';

export const providerSettingsHash='#settings/providers';

interface ProviderReadiness{
 upcloud_configured:boolean;
 virtua_configured:boolean;
 ansible_ready:boolean;
 ansible_error:string;
 order_ansible_ready:boolean;
 order_ansible_error:string;
 ansible_vault_password_configured?:boolean;
 ansible_vault_file_configured?:boolean;
 ansible_ssh_key_configured?:boolean;
}

type ReportError=(error:unknown)=>string;
const providers={
 upcloud:{name:'UpCloud',path:'/replacements/settings',key:'upcloud_token'},
 virtua:{name:'Virtua.Cloud',path:'/server-orders/settings/virtua',key:'virtua_token'},
} as const;
type Provider=keyof typeof providers;

function SettingsError({message}:{message:string}){
 return <div className="error-box" role="alert"><TriangleAlert size={17}/><span>{message}</span></div>;
}

export function ReadinessBadge({ready,positive='Готов',negative='Требуется настройка'}:{ready:boolean;positive?:string;negative?:string}){
 return <span className={`badge ${ready?'green':'amber'}`}><span className="badge-dot"/>{ready?positive:negative}</span>;
}

function ProviderTokenForm({provider,configured,onSaved,onAuthError}:{provider:Provider;configured:boolean;onSaved:()=>void;onAuthError:ReportError}){
 const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const {name,path,key}=providers[provider];

 async function submit(event:FormEvent){
  event.preventDefault();
  const value=token.trim();
  if(busy||!value)return;
  setBusy(true);setError('');setSaved(false);
  try{
   await api(path,json('PUT',{[key]:value}));
   setToken('');setSaved(true);
   onSaved();
  }catch(error){
   setError(onAuthError(error).replaceAll(value,'•••'));
  }finally{
   setBusy(false);
  }
 }

 return <form className="settings-section" onSubmit={submit}>
  <div className="settings-section-header">
   <div className="integration-icon purple"><ServerCog size={21}/></div>
   <h3>{name}</h3>
   <ReadinessBadge ready={configured} positive="Токен сохранён" negative="Требуется токен"/>
  </div>
  <label className="field">
   <span>API-токен {name}</span>
   <input type="password" autoComplete="new-password" value={token} onChange={event=>{setToken(event.target.value);setSaved(false);setError('');}} placeholder={configured?'Введите новый токен для замены':undefined} disabled={busy}/>
  </label>
  <button className="button secondary" disabled={busy||!token.trim()}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Сохранить токен<span className="sr-only"> {name}</span></button>
  {error&&<SettingsError message={error}/>}
  {saved&&<p className="inline-success" role="status"><CheckCircle2 size={16}/>Токен {name} сохранён.</p>}
 </form>;
}

function AnsibleSettingsForm({readiness,onSaved,onAuthError}:{readiness:ProviderReadiness;onSaved:()=>void;onAuthError:ReportError}){
 const [password,setPassword]=useState(''),[file,setFile]=useState(''),[sshKey,setSSHKey]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const canSave=!!(password.trim()||file.trim()||sshKey.trim());

 async function submit(event:FormEvent){
  event.preventDefault();
  const vaultFile=file.trim();
  if(busy||!canSave)return;
  setBusy(true);setError('');setSaved(false);
  try{
   await api('/settings/providers/ansible',json('PUT',{
    vault_password:password.trim()?password:undefined,
    vault_file:vaultFile||undefined,
    ssh_private_key:sshKey.trim()||undefined,
   }));
   setPassword('');setFile('');setSSHKey('');setSaved(true);onSaved();
  }catch(error){
   let message=onAuthError(error);
   if(password)message=message.replaceAll(password,'•••');
   if(vaultFile)message=message.replaceAll(vaultFile,'•••');
   if(sshKey.trim())message=message.replaceAll(sshKey.trim(),'•••');
   setError(message);
  }finally{
   setBusy(false);
  }
 }

 return <form onSubmit={submit}>
  <label className="field">
   <span>Пароль Ansible Vault</span>
   <input type="password" autoComplete="new-password" value={password} maxLength={4096} disabled={busy}
    onChange={event=>{setPassword(event.target.value);setSaved(false);setError('');}}
    placeholder={readiness.ansible_vault_password_configured?'Пароль сохранён':undefined}/>
  </label>
  <label className="field">
   <span>Vault-файл с токенами Grafana</span>
   <textarea value={file} rows={3} maxLength={65536} spellCheck={false} disabled={busy}
    onChange={event=>{setFile(event.target.value);setSaved(false);setError('');}}
    placeholder={readiness.ansible_vault_file_configured?'Vault-файл сохранён':'Вставьте содержимое файла, начиная с $ANSIBLE_VAULT'}/>
   <small>JSON с ключами grafana_cloud_prometheus_token и grafana_cloud_loki_token, зашифрованный командой ansible-vault encrypt. Пустые поля сохраняют текущие значения.</small>
  </label>
  {readiness.ansible_ssh_key_configured===false&&<details>
   <summary>Перенести действующий SSH-ключ</summary>
   <label className="field">
    <span>Приватный SSH-ключ Ansible</span>
    <textarea value={sshKey} rows={3} maxLength={16384} spellCheck={false} disabled={busy}
     onChange={event=>{setSSHKey(event.target.value);setSaved(false);setError('');}}/>
    <small>При обновлении можно перенести ключ, которым DNS Guard уже подключается к нодам. Для новых установок DNS Guard создаст ключ автоматически.</small>
   </label>
  </details>}
  <button className="button secondary" disabled={busy||!canSave}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Сохранить настройки Ansible</button>
  {error&&<SettingsError message={error}/>}
  {saved&&<p className="inline-success" role="status"><CheckCircle2 size={16}/>Настройки Ansible сохранены.</p>}
 </form>;
}

export function ProviderSettings({revision,focused,onAuthError}:{revision:number;focused:boolean;onAuthError:ReportError}){
 const [readiness,setReadiness]=useState<ProviderReadiness|null>(null),[error,setError]=useState('');
 const [updates,setUpdates]=useState(0);
 const heading=useRef<HTMLHeadingElement>(null);

 useEffect(()=>{
  const request=new AbortController();
  api<ProviderReadiness>('/settings/providers',{signal:request.signal}).then(data=>{
   if(request.signal.aborted)return;
   setReadiness(data);
   setError('');
  }).catch(error=>{
   if(!request.signal.aborted)setError(onAuthError(error));
  });
  return()=>request.abort();
 },[revision,updates,onAuthError]);

 useEffect(()=>{
  if(!focused)return;
  heading.current?.focus({preventScroll:true});
  heading.current?.scrollIntoView?.({block:'start'});
 },[focused]);

 const saved=(key:'upcloud_configured'|'virtua_configured')=>{
  setReadiness(data=>data?{...data,[key]:true}:data);
  setUpdates(value=>value+1);
 };

 return <section className="panel provider-settings" aria-labelledby="provider-settings-title">
  <div className="panel-heading"><h2 id="provider-settings-title" ref={heading} tabIndex={-1}>Хостинги и Ansible</h2></div>
  {error&&<SettingsError message={error}/>}
  {!readiness&&!error&&<div className="panel-loading" role="status">Загрузка подключений…</div>}
  {readiness&&<>
   <ProviderTokenForm provider="upcloud" configured={readiness.upcloud_configured} onSaved={()=>saved('upcloud_configured')} onAuthError={onAuthError}/>
   <ProviderTokenForm provider="virtua" configured={readiness.virtua_configured} onSaved={()=>saved('virtua_configured')} onAuthError={onAuthError}/>
   <div className="settings-section">
    <div className="settings-section-header"><div className="integration-icon"><Terminal size={21}/></div><h3>Ansible</h3></div>
    <AnsibleSettingsForm readiness={readiness} onSaved={()=>setUpdates(value=>value+1)} onAuthError={onAuthError}/>
    <div className="provider-ansible"><p>Заказы серверов и автозамена Virtua.Cloud</p><ReadinessBadge ready={readiness.order_ansible_ready}/></div>
    {readiness.order_ansible_error&&<SettingsError message={readiness.order_ansible_error}/>}
    <div className="provider-ansible"><p>Автозамена для ручных привязок UpCloud</p><ReadinessBadge ready={readiness.ansible_ready}/></div>
    {readiness.ansible_error&&<SettingsError message={readiness.ansible_error}/>}
   </div>
  </>}
 </section>;
}
