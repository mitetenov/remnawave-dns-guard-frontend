// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {TargetChecks} from './TargetChecks';
import type {Pool,Target} from './types';

it('mounts checker and route details only while open',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div');
 const root=createRoot(host);
 const target={checkers_active:1,checkers_checked:1,checks:[{agent_id:'ru-residential',fresh:true,failures:0,successes:1,last_checked_at:null,last_latency_ms:null,last_error:null,outcome:true,routes:{direct:{outcome:'success'},socks5:{outcome:'skipped',error:'proxy_unavailable'}}}]} as Target;
 try{
  await act(async()=>root.render(<TargetChecks target={target} pool={{failure_threshold:3,recovery_threshold:2} as Pool}/>));
  expect(host.querySelector('summary')?.textContent).toContain('Чекеры: 1/1');
  expect(host.querySelector('ul')).toBeNull();
  const details=host.querySelector('details')!;
  await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});
  expect(host.textContent).toContain('ru-residential');
  expect(host.textContent).toContain('Напрямую: успех');
  expect(host.textContent).toContain('Через SOCKS5: пропущено');
  await act(async()=>{details.open=false;details.dispatchEvent(new Event('toggle'));});
  expect(host.querySelector('ul')).toBeNull();
 }finally{
  await act(async()=>root.unmount());
  vi.unstubAllGlobals();
 }
});
