import {Activity,Info} from 'lucide-react';
import type {Checker,Settings} from './types';

const labels:Record<Checker['status'],string>={online:'Проверки доступны',control_unhealthy:'Контроль недоступен',offline:'Нет связи'};
function seen(value:string){return new Date(value).toLocaleString('ru-RU');}

export function checkerCount(state:Pick<Settings,'agents_total'|'agents_healthy'|'agent_healthy'>|null){
 if(state?.agents_total!==undefined)return `Чекеры: ${state.agents_healthy??0}/${state.agents_total}`;
 return state?.agent_healthy?'Чекер подключён':'Нет готовых чекеров';
}

export function CheckersPanel({settings}:{settings:Settings}){
 const agents=settings.agents??[];
 return <section className="panel checkers-panel" aria-label="Чекеры">
  <div className="panel-heading"><div><h2>Чекеры · Россия</h2><p>{checkerCount(settings)}</p></div><Activity size={22}/></div>
  {agents.length?<ul className="checker-list">{agents.map(agent=><li key={agent.id}>
   <div className="checker-heading"><strong>{agent.id}</strong><span className={`badge ${agent.healthy?'green':'amber'}`}>{labels[agent.status]}</span></div>
   <dl><div><dt>Версия</dt><dd>{agent.version||'Не сообщена'}</dd></div><div><dt>Последняя связь</dt><dd><time dateTime={agent.last_seen}>{seen(agent.last_seen)}</time></dd></div></dl>
  </li>)}</ul>:<p>Чекеры пока не подключены.</p>}
  <p>Каждый чекер проверяет все IP. Порог ошибок у любого чекера исключает IP из DNS. Для возврата нужны успешные серии у всех чекеров с доступной контрольной связью.</p>
  <div className="info-note"><Info size={17}/><p>Новая нода регистрируется автоматически. Задайте на ней URL панели, общий токен и уникальный AGENT_ID. Менять настройки DNS Guard не требуется.</p></div>
  <p>Чекер без связи более 90 секунд или с недоступным контролем временно не участвует в решениях. Его отключение само по себе не исключает IP.</p>
 </section>;
}
