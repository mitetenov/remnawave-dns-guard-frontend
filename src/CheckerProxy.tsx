import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
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

export function proxyInputValue(value:string){
 if(!value)return '';
 try{const url=new URL(value);if(url.username&&url.password)return `${url.hostname}:${url.port}:${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;}catch{/* Display legacy settings verbatim when they cannot be represented in the input format. */}
 return value;
}

export function proxyTestRequest(input:string,proxy:ProxySettings){
 const saved=proxyInputValue(proxy.url??'');
 return input.trim()&&input!==saved?proxyPayload(input):{};
}

export function CheckerProxy({agent,onAuthError,onChanged}:{agent:Checker;onAuthError?:(error:unknown)=>string;onChanged?:(proxy:ProxySettings)=>void}){
 const [proxy,setProxy]=useState(agent.proxy),[input,setInput]=useState(()=>proxyInputValue(agent.proxy?.url??'')),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lastSaved=useRef(proxyInputValue(agent.proxy?.url??''));
 const applyProxy=useCallback((value:ProxySettings|undefined,replaceInput=false)=>{
  const saved=proxyInputValue(value?.url??''),previous=lastSaved.current;lastSaved.current=saved;setProxy(value);setInput(current=>replaceInput||current===previous?saved:current);
 },[]);
 useEffect(()=>{applyProxy(agent.proxy);},[agent.proxy,applyProxy]);
 const path=`/agents/${encodeURIComponent(agent.id)}/proxy`;
 const pending=proxy?.test?.status==='pending';
 useEffect(()=>{
  if(!pending)return;
  let active=true;
  const id=window.setInterval(()=>{void api<Checker>(`/agents/${encodeURIComponent(agent.id)}`).then(current=>{if(active&&current.proxy){applyProxy(current.proxy);onChanged?.(current.proxy);}}).catch(err=>{if(active)setError(onAuthError?onAuthError(err):String(err instanceof Error?err.message:err));});},2000);
  return()=>{active=false;window.clearInterval(id);};
 },[pending,agent.id,onAuthError,onChanged,applyProxy]);
 async function update(action:'save'|'disable'|'test'){
  if(!proxy)return;setError('');setMessage('');setBusy(action);
  try{
   const options=action==='test'?json('POST',proxyTestRequest(input,proxy)):json('PUT',action==='disable'?{url:''}:proxyPayload(input));
   const value=await api<ProxySettings>(action==='test'?`${path}/test`:path,options);
   applyProxy(value,action!=='test');onChanged?.(value);
   if(action!=='test')setMessage(action==='disable'?'Настройки прокси удалены.':'Прокси сохранён. Включите маршрут «Через SOCKS5», чтобы использовать его в проверках.');
  }catch(err){setError(onAuthError?onAuthError(err):String(err instanceof Error?err.message:err));}finally{setBusy('');}
 }
 function submit(event:FormEvent){event.preventDefault();void update('save');}
 if(!proxy)return <p className="checker-proxy-help">Настройки прокси станут доступны после обновления панели.</p>;
 const saved=proxyInputValue(proxy.url??''),hasDraft=!!input.trim()&&input!==saved,blocked=!!busy||pending;
 const canTest=(!!input.trim()||proxy.configured)&&(!hasDraft||proxy.draft_test_supported===true);
 const test=proxy.test;
 const testLabel=test?.status==='passed'?'Тест прокси завершён успешно.':test?.status==='failed'?'Прокси недоступен с сервера агента. Проверьте адрес, порт и учётные данные.':test?.status==='timeout'?'Агент не вернул результат за 60 секунд. Проверьте его подключение.':'';
 return <form className="checker-proxy" aria-label={`Прокси чекера ${agent.id}`} onSubmit={submit}>
  <div className="checker-proxy-heading"><strong>SOCKS5-прокси</strong><span className={`badge ${proxy.configured?(proxy.healthy?'green':'amber'):'gray'}`}>{proxy.configured?(proxy.healthy?'Доступен':'Ожидает проверки / недоступен'):'Не настроен'}</span></div>
  {proxy.configured&&<p className="checker-proxy-endpoint">Сохранённый прокси: <code>{saved||proxy.endpoint}</code></p>}
  {!proxy.supported?<p className="checker-proxy-help">Для SOCKS5 обновите агент до версии 1.4.0 или новее.</p>:<>
   <label className="field"><span>Прокси</span><input type="text" autoComplete="off" spellCheck={false} value={input} onChange={event=>{setInput(event.target.value);setMessage('');setError('');}} placeholder="IP:PORT:LOGIN:PASS" disabled={blocked}/><small>Принимается только формат IP:PORT:LOGIN:PASS. Пример: 192.0.2.10:1080:login:password. Данные отображаются открытым текстом. Пустое поле сохраняет текущий прокси.</small></label>
   <div className="checker-proxy-actions"><button className="button primary" disabled={blocked||!input.trim()||!hasDraft}>{busy==='save'?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}Сохранить прокси</button><button type="button" className="button secondary" onClick={()=>void update('test')} disabled={blocked||!canTest||agent.status==='offline'}>{pending||busy==='test'?<LoaderCircle className="spin" size={15}/>:<Zap size={15}/>}Проверить прокси</button></div>
   <p className="checker-proxy-help">Можно проверить введённый прокси до сохранения. Проверка выполняется с этого агента и не меняет рабочие настройки.</p>
   {hasDraft&&!proxy.draft_test_supported&&<p className="checker-proxy-help">Для проверки до сохранения обновите агент до версии 1.5.0 или новее.</p>}
  </>}
  {proxy.configured&&<button type="button" className="button secondary" disabled={blocked} onClick={()=>void update('disable')}><Unplug size={15}/>Удалить прокси</button>}
  {pending&&<p className="checker-proxy-help" role="status">Ожидаем проверку с сервера агента…</p>}
  {test&&<div className="checker-proxy-test" aria-label="Последняя проверка прокси">{test.endpoint&&<p className="checker-proxy-help">Проверяемый прокси: {test.endpoint}{test.draft?' · без сохранения':''}</p>}{testLabel&&<p className={test.status==='passed'?'test-success':'error-box'} role={test.status==='passed'?'status':'alert'}>{testLabel}</p>}{test.checked_at&&<p className="checker-proxy-help">Проверено: {new Date(test.checked_at).toLocaleString('ru-RU')}{test.latency_ms!=null?` · ${test.latency_ms} мс`:''}{test.exit_ip?` · Внешний IP: ${test.exit_ip}`:''}</p>}</div>}
  {proxy.configured&&proxy.checked_at&&<p className="checker-proxy-help">Контроль рабочего прокси: {new Date(proxy.checked_at).toLocaleString('ru-RU')}{proxy.latency_ms!==null?` · ${proxy.latency_ms} мс`:''}{proxy.exit_ip?` · Внешний IP: ${proxy.exit_ip}`:''}</p>}
  {error&&<p className="error-box" role="alert">{error}</p>}{message&&<p className="test-success" role="status">{message}</p>}
  <p className="checker-proxy-help">Маршрут: агент → SOCKS5 → проверяемая нода. При недоступном прокси пропускается только SOCKS5-маршрут. Прямая проверка продолжается.</p>
 </form>;
}
