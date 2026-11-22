import {LoaderCircle,Pause,Pencil,Play,Server,Trash2} from 'lucide-react';
import type {Pool,Target} from './types';
import {statusTone} from './status';
import {TargetDNS} from './TargetDNS';
import {TargetIP} from './TargetIP';
import {TargetChecks} from './TargetChecks';
import {eventsHash} from './navigation';

export function targetAnchorId(targetId:string){
 return `pool-target-${targetId}`;
}

const lastCheckFormat=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});

export function TargetCards({targets,pool,statusNames,onAction,busy,targetId}:{targets:Target[];pool:Pool;statusNames:Record<Target['status'],string>;onAction:(target:Target,action:'edit'|'disable'|'enable'|'delete')=>void;busy:Set<string>;targetId?:string}){
 return <div className="target-list">
  <div className="target-list-head target-grid" aria-hidden="true"><span>Узел / IPv4</span><span>Проверка туннеля</span><span>DNS</span><span>Сбои / успехи</span><span>Последняя проверка</span><span>Действия</span></div>
  <ul className="target-list-items" aria-label="Узлы пула">
   {targets.map(target=>{
    const pending=busy.has(target.id);
    const changeBlocked=pending||target.dns_pending_action==='replace_ip';
    const Toggle=pending?LoaderCircle:target.manual_enabled?Pause:Play;
    const toggleLabel=target.manual_enabled?'Отключить узел вручную':'Включить узел';
    return <li key={target.id} id={targetAnchorId(target.id)} tabIndex={-1} className={`target-row target-grid ${target.id===targetId?'target-highlight':''}`}>
     <div className="target-name">
      <span className={`target-symbol ${target.status}`}><Server size={17} aria-hidden="true"/></span>
      <div><strong>{target.name}</strong>{target.remnawave_uuid&&<span title="Импортирован из Remnawave" className="source-tag">RW</span>}<TargetIP ip={target.ip}/></div>
     </div>
     <div className="target-cell target-status-cell">
      <span className="target-cell-label">Проверка туннеля</span>
      <span className={`badge ${statusTone(target.status)}`}><span className="badge-dot"/>{statusNames[target.status]}</span>
      <TargetChecks target={target} pool={pool}/>
      {target.last_error&&<p className="target-error">{target.last_error}</p>}
      {target.id===targetId&&<a className="target-event-link" href={eventsHash(pool.id,target.id)}>События узла</a>}
     </div>
     <div className="target-cell"><span className="target-cell-label">DNS</span><TargetDNS target={target}/></div>
     <div className="target-cell">
      <span className="target-cell-label">Сбои / успехи</span>
      <div className="streak" title="Максимум сбоев среди чекеров / минимум успехов среди активных чекеров.">
       <span className={target.failures?'text-red':''}>{Math.min(target.failures,pool.failure_threshold)}<small>/{pool.failure_threshold}</small></span>
       <span className="streak-divider">/</span>
       <span className={target.successes?'text-green':''}>{Math.min(target.successes,pool.recovery_threshold)}<small>/{pool.recovery_threshold}</small></span>
      </div>
     </div>
     <div className="target-cell">
      <span className="target-cell-label">Последняя проверка</span>
      {target.last_checked_at?<time className="table-date" dateTime={target.last_checked_at}>{lastCheckFormat.format(new Date(target.last_checked_at))}</time>:<span className="table-date">Ещё не было</span>}
      {target.last_latency_ms!=null&&<span className="target-latency mono" title="Задержка">{Math.round(target.last_latency_ms)} мс</span>}
     </div>
     <div className="target-row-actions">
      <button className="icon-button" title="Редактировать узел" aria-label="Редактировать узел" disabled={pending||!!target.dns_pending_action} onClick={()=>onAction(target,'edit')}><Pencil size={16}/><span>Редактировать</span></button>
      <button className="icon-button" title={toggleLabel} aria-label={toggleLabel} disabled={changeBlocked} onClick={()=>onAction(target,target.manual_enabled?'disable':'enable')}><Toggle className={pending?'spin':undefined} size={16}/><span>{target.manual_enabled?'Отключить':'Включить'}</span></button>
      <button className="icon-button danger-hover" title="Удалить узел из пула" aria-label="Удалить узел из пула" disabled={changeBlocked} onClick={()=>onAction(target,'delete')}><Trash2 size={16}/><span>Удалить</span></button>
     </div>
    </li>;
   })}
  </ul>
 </div>;
}
