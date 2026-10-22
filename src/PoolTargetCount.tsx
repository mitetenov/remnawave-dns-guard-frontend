import type {Pool} from './types';
import {statusTone} from './status';

export function PoolTargetCount({summary}:{summary:Pool['target_summary']}) {
 if(!summary)return <span className="pool-target-count" title="Нет данных об узлах">—</span>;
 const detail=summary.status==='suspect'||summary.status==='protected'?'Есть узлы под подозрением или с защитой последней A-записи':summary.status==='unknown'||summary.status==='stale'?'Нет свежих данных о доступности':summary.status==='healthy'?'Активные узлы доступны':'Нет активных узлов';
 const label=`Активных узлов в DNS: ${summary.active} из ${summary.total}. ${detail}.`;
 return <span className="pool-target-count" title={label} aria-label={label}><span className={`pool-target-active ${statusTone(summary.status)}`}>{summary.active}</span><span>/{summary.total}</span></span>;
}
