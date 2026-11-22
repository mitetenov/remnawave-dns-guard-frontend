import {useState} from 'react';
import type {Pool,Target} from './types';

export function TargetChecks({target,pool}:{target:Target;pool:Pool}){
 const [open,setOpen]=useState(false);
 if(!target.checks?.length)return null;
 return <details className="target-checks" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>Чекеры: {target.checkers_checked??0}/{target.checkers_active??0} · результаты</summary>
  {open&&<ul>{target.checks.map(check=><li key={check.agent_id}>
   <strong>{check.agent_id}</strong><span className={check.fresh?(check.outcome?'text-green':'text-amber'):''}>{!check.last_checked_at?'Ожидает проверки':!check.fresh?'Нет свежих данных':check.outcome?'Доступен':'Сбой'}</span>
   <small>Сбои: {check.failures}/{pool.failure_threshold} · Успехи: {check.successes}/{pool.recovery_threshold}</small>
   {check.last_checked_at&&<time dateTime={check.last_checked_at}>{new Date(check.last_checked_at).toLocaleString('ru-RU')}</time>}
   {check.last_latency_ms!==null&&<small>{Math.round(check.last_latency_ms)} мс</small>}
   {check.last_error&&<small>{check.last_error}</small>}
   {(['direct','socks5'] as const).map(route=>{
    const result=check.routes?.[route];
    if(!result)return null;
    const name=route==='direct'?'Напрямую':'Через SOCKS5';
    return <small key={route}>{name}: {result.outcome==='success'?'успех':result.outcome==='failure'?'ошибка':'пропущено'}{result.error?` · ${result.error}`:''}</small>;
   })}
  </li>)}</ul>}
 </details>;
}
