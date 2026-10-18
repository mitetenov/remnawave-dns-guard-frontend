import {Check,LoaderCircle,TriangleAlert,X} from 'lucide-react';
import type {Target} from './types';

export function TargetDNS({target}:{target:Target}) {
 const pending=!!target.dns_pending_action;
 const uncertain=pending||target.dns_uncertain;
 const label=pending?'Ожидает подтверждения':uncertain?'DNS не подтверждён':target.dns_drift?'Расхождение DNS':target.dns_present?'В DNS':'Нет в DNS';
 const Icon=pending?LoaderCircle:uncertain||target.dns_drift?TriangleAlert:target.dns_present?Check:X;
 return <span className={`dns-state ${!uncertain&&!target.dns_drift&&target.dns_present?'present':''} ${uncertain||target.dns_drift?'unconfirmed':''}`} title={target.dns_error|| (target.dns_checked_at?`DNS проверен: ${new Date(target.dns_checked_at).toLocaleString('ru-RU')}`:'DNS ещё не проверен')}><Icon size={15} className={pending?'spin':''}/>{label}{target.dns_drift&&!uncertain&&<span> · {target.dns_present?'запись есть':'записи нет'}</span>}</span>;
}
