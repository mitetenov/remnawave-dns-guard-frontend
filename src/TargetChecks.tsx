import type {Pool,Target} from './types';

export function TargetChecks({target,pool}:{target:Target;pool:Pool}){
 if(!target.checks?.length)return null;
 return <details className="target-checks"><summary>Чекеры: {target.checkers_checked??0}/{target.checkers_active??0} · результаты</summary>
  <ul>{target.checks.map(check=><li key={check.agent_id}>
   <strong>{check.agent_id}</strong><span className={check.fresh?(check.outcome?'text-green':'text-amber'):''}>{!check.last_checked_at?'Ожидает проверки':!check.fresh?'Нет свежих данных':check.outcome?'Доступен':'Сбой'}</span>
   <small>Сбои: {check.failures}/{pool.failure_threshold} · Успехи: {check.successes}/{pool.recovery_threshold}</small>
   {check.last_checked_at&&<time dateTime={check.last_checked_at}>{new Date(check.last_checked_at).toLocaleString('ru-RU')}</time>}
   {check.last_latency_ms!==null&&<small>{Math.round(check.last_latency_ms)} мс</small>}
   {check.last_error&&<small>{check.last_error}</small>}
   {check.routes&&Object.entries(check.routes).map(([route,result])=><small key={route}>{route==='direct'?'Напрямую':'Через SOCKS5'}: {result.outcome==='success'?'успех':result.outcome==='failure'?'ошибка':'пропущено'}{result.error?` · ${result.error}`:''}</small>)}
  </li>)}</ul>
 </details>;
}
