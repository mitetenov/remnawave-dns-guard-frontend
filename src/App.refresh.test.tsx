// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import App from './App';
import {api,ApiError} from './api';

vi.mock('./api',async importOriginal=>({...await importOriginal<typeof import('./api')>(),api:vi.fn()}));

function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
 const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});
 return {promise,resolve,reject};
}
const settings={cloudflare_configured:true,remnawave_configured:false,remnawave_url:'',agents:[],agents_total:0,agents_healthy:0,agent_last_seen:null,agent_healthy:false};
const pool={id:'one',name:'Original snapshot',hostname:'vpn.example.com',zone_id:'zone',ttl:120,interval_seconds:60,failure_threshold:3,recovery_threshold:5,automation_enabled:false,profile_configured:true,disable_host_when_all_down:false,remnawave_error:null,remnawave_host_disabled:null,dns_error:null,dns_checked_at:null,dns_drift_count:0,created_at:'2026-11-06T00:00:00Z',target_summary:{active:1,total:1,status:'healthy'}};
let root:Root,container:HTMLDivElement;

beforeEach(()=>{
 vi.useFakeTimers();
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 window.location.hash='#pools';
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 vi.mocked(api).mockReset();
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 container.remove();vi.useRealTimers();vi.unstubAllGlobals();
});

function mockRequests(pools:(call:number)=>Promise<unknown>,overview?:(call:number)=>Promise<unknown>){
 let poolCalls=0,overviewCalls=0;
 vi.mocked(api).mockImplementation(async <T,>(path:string):Promise<T>=>{
  let value:unknown;
  if(path==='/auth/me')value={username:'review'};
  else if(path==='/settings')value=settings;
  else if(path==='/overview')value=overview?await overview(++overviewCalls):{...settings,pools:1,targets:1,healthy:1,excluded:0};
  else if(path==='/pools')value=await pools(++poolCalls);
  else if(path==='/auth/logout')value={ok:true};
  else value=[];
  return value as T;
 });
}
async function render(){await act(async()=>root.render(<App/>));}
async function backgroundRefresh(){await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});}
async function refresh(){
 const button=[...container.querySelectorAll('button')].find(button=>button.textContent==='Обновить');
 expect(button).toBeDefined();
 await act(async()=>button!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
}

describe('dashboard request ordering',()=>{
 it.each(['success','error'] as const)('ignores a late older %s after a newer refresh',async outcome=>{
  const old=deferred<unknown>();
  mockRequests(async call=>call===2?old.promise:[{...pool,name:call>=3?'Updated snapshot':pool.name}]);
  await render();expect(container.textContent).toContain('Original snapshot');
  await backgroundRefresh();await refresh();
  expect(container.textContent).toContain('Updated snapshot');
  await act(async()=>{if(outcome==='success')old.resolve([pool]);else old.reject(new ApiError(0,'Old request failed'));});
  expect(container.textContent).toContain('Updated snapshot');
  expect(container.textContent).not.toContain('Original snapshot');
  expect(container.textContent).not.toContain('Old request failed');
 });
 it('handles an expired session even when another endpoint failed first',async()=>{
  mockRequests(async()=>{throw new ApiError(401,'Session expired');},async()=>{throw new ApiError(502,'Unavailable');});
  await render();
  expect(container.textContent).toContain('Войдите, чтобы управлять пулами');
  expect(container.querySelector('nav')).toBeNull();
 });
 it('invalidates pending dashboard requests on logout',async()=>{
  const old=deferred<unknown>();
  mockRequests(async call=>call===2?old.promise:[pool]);
  await render();await backgroundRefresh();
  const logout=container.querySelector<HTMLButtonElement>('button[title="Выйти из системы"]');
  expect(logout).not.toBeNull();
  await act(async()=>logout!.click());
  await act(async()=>old.resolve([{...pool,name:'Late secret data'}]));
  expect(container.textContent).toContain('Войдите, чтобы управлять пулами');
  expect(container.textContent).not.toContain('Late secret data');
 });
});
