import {useEffect,useState,type FormEvent} from 'react';
import {Check,LoaderCircle,Unplug,Zap} from 'lucide-react';
import {api,json} from './api';
import type {Checker,CheckerProxy as ProxySettings} from './types';

export function proxyPayload(value:string){
 const fields=value.trim().split(':');
 const invalid=()=>new Error('Принимается только формат IP:PORT:LOGIN:PASS. Пример: 192.0.2.10:1080:login:password.');
 if(fields.length!==4)throw invalid();
 const [ip,port,login,password]=fields;
 if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)||ip.split('.').some(part=>Number(part)>255||String(Number(part))!==part)||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535||!login||!password||/[\u0000-\u001f\u007f]/.test(login+password)||new TextEncoder().encode(login).length>255||new TextEncoder().encode(password).length>255)throw invalid();
 try{return {url:`socks5://${encodeURIComponent(login)}:${encodeURIComponent(password)}@${ip}:${Number(port)}`};}catch{throw invalid();}
}

export function CheckerProxy({agent,onAuthError,onChanged}:{agent:Checker;onAuthError?:(error:unknown)=>string;onChanged?:(proxy:ProxySettings)=>void}){
 const [proxy,setProxy]=useState(agent.proxy),[url,setURL]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{setProxy(agent.proxy);},[agent.proxy]);
 const path=`/agents/${encodeURIComponent(agent.id)}/proxy`;
 const pending=proxy?.test?.status==='pending';
 useEffect(()=>{
  if(!pending)return;
  let active=true;
  const id=window.setInterval(()=>{void api<Checker[]>('/agents').then(agents=>{if(active){const current=agents.find(item=>item.id===agent.id);if(current?.proxy){setProxy(current.proxy);onChanged?.(current.proxy);}}}).catch(err=>{if(active)setError(onAuthError?onAuthError(err):String(err instanceof Error?err.message:err));});},2000);
  return()=>{active=false;window.clearInterval(id);};
 },[pending,agent.id,onAuthError,onChanged]);
 async function update(action:'save'|'disable'|'test'){
  setError('');setMessage('');setBusy(action);
  try{
   const options=action==='test'?json('POST'):json('PUT',action==='disable'?{url:''}:proxyPayload(url));
   const value=await api<ProxySettings>(action==='test'?`${path}/test`:path,options);
   setProxy(value);
   onChanged?.(value);
   if(action!=='test'){setURL('');setMessage(action==='disable'?'Настройки прокси удалены.':'Прокси сохранён. Включите маршрут «Через SOCKS5», чтобы использовать его в проверках.');}
  }catch(err){setError(onAuthError?onAuthError(err):String(err instanceof Error?err.message:err));}finally{setBusy('');}
 }
 function submit(event:FormEvent){event.preventDefault();void update('save');}
 if(!proxy)return <p className="checker-proxy-help">Настройки прокси станут доступны после обновления панели.</p>;
 const blocked=!!busy||pending;
 const testLabel=proxy.test?.status==='passed'?'Тест прокси завершён успешно.':proxy.test?.status==='failed'?'Прокси недоступен с сервера чекера. Проверьте адрес, порт и учётные данные.':proxy.test?.status==='timeout'?'Чекер не вернул результат за 60 секунд. Проверьте его подключение.':'';
 return <form className="checker-proxy" aria-label={`Прокси чекера ${agent.id}`} onSubmit={submit}>
  <div className="checker-proxy-heading"><strong>SOCKS5-прокси</strong><span className={`badge ${proxy.configured?(proxy.healthy?'green':'amber'):'gray'}`}>{proxy.configured?(proxy.healthy?'Доступен':'Ожидает проверки / недоступен'):'Не настроен'}</span></div>
  {proxy.configured&&<p className="checker-proxy-endpoint">{proxy.endpoint}</p>}
  {!proxy.supported?<p className="checker-proxy-help">Для SOCKS5 обновите чекер до версии 1.4.0 или новее.</p>:<>
   <label className="field"><span>Прокси</span><input type="password" autoComplete="new-password" spellCheck={false} value={url} onChange={event=>{setURL(event.target.value);setMessage('');setError('');}} placeholder="IP:PORT:LOGIN:PASS" disabled={blocked}/><small>Принимается только формат IP:PORT:LOGIN:PASS. Пример: 192.0.2.10:1080:login:password. Пустое поле сохраняет текущий прокси.</small></label>
   <div className="checker-proxy-actions"><button className="button primary" disabled={blocked||!url.trim()}>{busy==='save'?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}Сохранить прокси</button><button type="button" className="button secondary" onClick={()=>void update('test')} disabled={blocked||!proxy.configured||agent.status==='offline'||!!url.trim()}>{pending||busy==='test'?<LoaderCircle className="spin" size={15}/>:<Zap size={15}/>}Проверить прокси</button></div>
   {url.trim()&&<p className="checker-proxy-help">Сначала сохраните новые данные, затем проверьте прокси.</p>}
  </>}
  {proxy.configured&&<button type="button" className="button secondary" disabled={blocked} onClick={()=>void update('disable')}><Unplug size={15}/>Удалить прокси</button>}
  {pending&&<p className="checker-proxy-help" role="status">Ожидаем проверку с сервера чекера…</p>}
  {testLabel&&<p className={proxy.test?.status==='passed'?'test-success':'error-box'} role={proxy.test?.status==='passed'?'status':'alert'}>{testLabel}</p>}
  {proxy.configured&&proxy.checked_at&&<p className="checker-proxy-help">Проверено: {new Date(proxy.checked_at).toLocaleString('ru-RU')}{proxy.latency_ms!==null?` · ${proxy.latency_ms} мс`:''}{proxy.exit_ip?` · Внешний IP: ${proxy.exit_ip}`:''}</p>}
  {error&&<p className="error-box" role="alert">{error}</p>}{message&&<p className="test-success" role="status">{message}</p>}
  <p className="checker-proxy-help">Маршрут: чекер → SOCKS5 → проверяемая нода. Проверка прокси выполняется с этого чекера. При недоступном прокси пропускается только SOCKS5-маршрут. Прямая проверка продолжается.</p>
 </form>;
}
