import {useEffect,useRef,useState} from 'react';
import {Check,Copy,TriangleAlert} from 'lucide-react';

export function TargetIP({ip}:{ip:string}) {
 const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle');
 const resetTimer=useRef<number|undefined>(undefined);
 useEffect(()=>{
  setStatus('idle');
  return ()=>window.clearTimeout(resetTimer.current);
 },[ip]);
 async function copy() {
  window.clearTimeout(resetTimer.current);
  try {
   await navigator.clipboard.writeText(ip);
   setStatus('copied');
   resetTimer.current=window.setTimeout(()=>setStatus('idle'),2000);
  } catch {
   setStatus('error');
  }
 }
 const message=status==='copied'?`IP ${ip} скопирован`:status==='error'?'Не удалось скопировать IP. Скопируйте адрес вручную.':'';
 const label=message||`Скопировать IP ${ip}`;
 const Icon=status==='copied'?Check:status==='error'?TriangleAlert:Copy;
 return <span className="target-ip mono"><span>{ip}</span><button type="button" className={`icon-button copy-ip ${status}`} title={label} aria-label={label} onClick={event=>{event.stopPropagation();void copy();}}><Icon size={14} aria-hidden="true"/></button><span className="sr-only" role="status">{message}</span></span>;
}
