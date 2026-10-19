import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PoolDetail} from './App';
import type {Pool,Target} from './types';

const pool={id:'pool-1',failure_threshold:3,recovery_threshold:5,automation_enabled:false,profile_configured:false} as Pool;
const target={id:'target-1',failures:0,successes:0,name:'Server',ip:'1.1.1.1',manual_enabled:true,status:'unknown',last_checked_at:null,last_latency_ms:null} as Target;
const noop=()=>{};
function render(overrides:Partial<Pool>={},targets=[target],busy=new Set<string>(),targetsLoading=false){
 return renderToStaticMarkup(<PoolDetail pool={{...pool,...overrides}} targets={targets} targetsLoading={targetsLoading} busy={busy} onEdit={noop} onDelete={noop} onProfile={noop} onAdd={noop} onImport={noop} onToggle={noop} onSync={noop} onCheck={noop} onTargetAction={noop}/>);
}
function checkButton(view:string){
 const button=view.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(button=>button.includes('Проверить сейчас'));
 expect(button).toBeDefined();
 return button!;
}
describe('manual pool checks before enabling Guard',()=>{
 it.each([false,true])('offers a check with automation off and profile_configured=%s',profile_configured=>{
  const view=render({profile_configured});
  expect(checkButton(view)).not.toContain('disabled');
  expect(view).toContain('Автоматические изменения DNS отключены.');
  if(!profile_configured)expect(view).toContain('Нажмите «Проверить сейчас», чтобы задать его');
 });
 it('keeps checks available with automation on',()=>{
  expect(checkButton(render({automation_enabled:true,profile_configured:true}))).not.toContain('disabled');
 });
 it('requires a monitored target',()=>{
  expect(checkButton(render({},[]))).toContain('disabled');
  expect(checkButton(render({},[{...target,manual_enabled:false}]))).toContain('disabled');
 });
 it('waits for targets to load and prevents duplicate requests',()=>{
  expect(checkButton(render({},[target],new Set(),true))).toContain('disabled');
  expect(checkButton(render({},[target],new Set(['pool-1-check'])))).toContain('disabled');
 });
});
