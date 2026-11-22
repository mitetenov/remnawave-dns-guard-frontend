import type {Settings,TargetStatus} from './types';

export function statusTone(status:TargetStatus) {
 return status==='healthy'?'green':status==='excluded'?'red':status==='protected'||status==='suspect'?'amber':status==='recovering'?'blue':'muted';
}


export function checkerCount(state:Pick<Settings,'agents_total'|'agents_healthy'|'agent_healthy'>|null){
 if(state?.agents_total!==undefined)return `Чекеры: ${state.agents_healthy??0}/${state.agents_total}`;
 return state?.agent_healthy?'Чекер подключён':'Нет готовых чекеров';
}
