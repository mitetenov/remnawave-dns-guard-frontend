import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

interface ModalProps {
 title:string;
 subtitle?:string;
 children:ReactNode;
 onClose:()=>void;
 busy?:boolean;
}

export function Modal({title,subtitle,children,onClose,busy=false}:ModalProps){
 const dialog=useRef<HTMLDivElement>(null);
 const stateRef=useRef({busy,onClose});
 stateRef.current={busy,onClose};
 const controls='button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)';

 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLElement>(controls)?.focus();
  const handle=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!stateRef.current.busy)stateRef.current.onClose();
   if(event.key!=='Tab')return;
   const all=dialog.current?.querySelectorAll<HTMLElement>(`${controls},[tabindex="0"]`);
   const first=all?.[0],last=all?.[all.length-1];
   if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();
    last?.focus();
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();
    first?.focus();
   }
  };
  document.addEventListener('keydown',handle);
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return ()=>{
   document.removeEventListener('keydown',handle);
   document.body.style.overflow=oldOverflow;
   previous?.focus();
  };
 },[]);

 return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
  <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
   <header className="modal-header">
    <div><h2 id="modal-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>
    <button type="button" className="icon-button" aria-label="Закрыть" title="Закрыть" onClick={onClose} disabled={busy}><X size={20}/></button>
   </header>
   {children}
  </div>
 </div>;
}
