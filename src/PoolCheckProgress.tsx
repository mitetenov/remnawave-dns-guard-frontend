import type {Target} from './types';

export interface PoolCheckReceipt {
 started_at:string;
 expected_agents:string[];
 target_ids:string[];
}

export interface PoolCheckRun extends PoolCheckReceipt {
 waitUntil:number;
}

function compareTimestamp(left:string,right:string){
 const milliseconds=Date.parse(left)-Date.parse(right);
 if(milliseconds!==0)return milliseconds;
 // Date.parse keeps only three fractional digits. The API sends six.
 const fraction=(value:string)=>value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1].padEnd(9,'0')??'';
 return Number(fraction(left))-Number(fraction(right));
}

export function summarizePoolCheck(run:PoolCheckRun,targets:Target[]){
 const expected=new Set(run.expected_agents);
 const targetsInRun=new Set(run.target_ids);
 const resultsByAgent=new Map<string,number>();
 let lastResponse:string|null=null;
 let responses=0;
 for(const target of targets){
  if(!targetsInRun.has(target.id))continue;
  for(const check of target.checks??[]){
   const checkedAt=check.last_checked_at;
   if(!checkedAt||!expected.has(check.agent_id)||!(compareTimestamp(checkedAt,run.started_at)>0))continue;
   responses++;
   resultsByAgent.set(check.agent_id,(resultsByAgent.get(check.agent_id)??0)+1);
   if(!lastResponse||compareTimestamp(checkedAt,lastResponse)>0)lastResponse=checkedAt;
  }
 }
 const responded=run.expected_agents.filter(agent=>resultsByAgent.get(agent)===targetsInRun.size&&targetsInRun.size>0);
 return {responded,lastResponse,responses,total:expected.size*targetsInRun.size,complete:expected.size>0&&responded.length===expected.size};
}

const timeFormat=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

export function PoolCheckProgress({run,summary,waiting}:{run:PoolCheckRun;summary:ReturnType<typeof summarizePoolCheck>;waiting:boolean}){
 const {responded,lastResponse,responses,total,complete}=summary;
 const started=<time dateTime={run.started_at}>{timeFormat.format(new Date(run.started_at))}</time>;
 return <div className="pool-check-progress" role="status">
  <strong>Ручная проверка · запрос в {started}</strong>
  {!run.expected_agents.length?<span>{run.target_ids.length?'На момент запроса нет готовых чекеров.':'Нет узлов, готовых к проверке.'}</span>:<>
   <span>Ожидаемые чекеры: {run.expected_agents.join(', ')}</span>
   <span>Ответы по всем узлам получили от {responded.length} из {run.expected_agents.length} чекеров</span>
   <span>Ответы по отдельным узлам после запроса: {responses} из {total}</span>
   {responded.length>0&&<span>Ответили: {responded.join(', ')}</span>}
   {lastResponse&&<span>Последний ответ в <time dateTime={lastResponse}>{timeFormat.format(new Date(lastResponse))}</time></span>}
   {!complete&&<span>{waiting?'Ожидаем остальные результаты.':'Окно ожидания завершилось. Оставшиеся результаты появятся по мере поступления.'}</span>}
  </>}
 </div>;
}
