import type {TargetStatus} from './types';

export function statusTone(status:TargetStatus) {
 return status==='healthy'?'green':status==='excluded'?'red':status==='protected'||status==='suspect'?'amber':status==='recovering'?'blue':'muted';
}
