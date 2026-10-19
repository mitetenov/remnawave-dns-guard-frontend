import type {Pool,Target} from './types';
import {TargetDNS} from './TargetDNS';
import {TargetIP} from './TargetIP';

export function TargetCards({targets,pool,statusNames,onAction,busy}:{targets:Target[];pool:Pool;statusNames:Record<Target['status'],string>;onAction:(target:Target,action:'edit'|'disable'|'enable'|'delete')=>void;busy:Set<string>}){
 return <div className="target-cards">{targets.map(target=><article className="target-card" key={target.id}>
  <header><strong>{target.name}</strong><TargetIP ip={target.ip}/></header>
  <dl><div><dt>Проверка туннеля</dt><dd className={target.status==='healthy'?'text-green':''}>{statusNames[target.status]}</dd></div><div><dt>DNS</dt><dd><TargetDNS target={target}/></dd></div><div><dt>Последняя проверка</dt><dd>{target.last_checked_at?new Date(target.last_checked_at).toLocaleString('ru-RU'):'Ещё не было'}</dd></div><div><dt>Сбой / успех</dt><dd title="Сбои подряд до исключения / успехи подряд до возврата. Счётчики ограничены порогами.">{Math.min(target.failures,pool.failure_threshold)}/{pool.failure_threshold} · {Math.min(target.successes,pool.recovery_threshold)}/{pool.recovery_threshold}</dd></div></dl>
  {target.last_error&&<p className="target-error">{target.last_error}</p>}
  <footer><button className="button secondary" disabled={busy.has(target.id)||!!target.dns_pending_action} onClick={()=>onAction(target,'edit')}>Редактировать</button><button className="button secondary" disabled={busy.has(target.id)||target.dns_pending_action==='replace_ip'} onClick={()=>onAction(target,target.manual_enabled?'disable':'enable')}>{target.manual_enabled?'Отключить':'Включить'}</button><button className="button secondary danger-hover" disabled={busy.has(target.id)||target.dns_pending_action==='replace_ip'} onClick={()=>onAction(target,'delete')}>Удалить</button></footer>
 </article>)}</div>;
}
