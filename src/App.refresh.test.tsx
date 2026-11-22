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

describe('pool route polling',()=>{
 it('stops target requests after leaving, including an in-flight response',async()=>{
  const old=deferred<unknown>();
  const targetRequest=vi.fn();
  vi.mocked(api).mockImplementation(async <T,>(path:string,options?:RequestInit):Promise<T>=>{
   if(path==='/auth/me')return {username:'review'} as T;
   if(path==='/pools')return [pool] as T;
   if(path==='/header')return {pools:1,agents_total:2,agents_healthy:1,agent_healthy:true} as T;
   if(path==='/pools/one/targets'){
    targetRequest(options?.signal);
    return await old.promise as T;
   }
   return [] as T;
  });
  window.location.hash='#pools/one';
  await render();
  expect(targetRequest).toHaveBeenCalledTimes(1);
  const agents=[...container.querySelectorAll('nav button')].find(button=>button.textContent?.startsWith('Агенты'));
  await act(async()=>agents?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(targetRequest.mock.calls[0][0]?.aborted).toBe(true);
  await backgroundRefresh();
  await act(async()=>old.resolve([{id:'late',name:'Late target'}]));
  expect(targetRequest).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain('Late target');
  expect(vi.mocked(api).mock.calls.some(([path])=>path==='/overview')).toBe(false);
 });
 it('focuses a linked target and renders one copy of its actions',async()=>{
  vi.mocked(api).mockImplementation(async <T,>(path:string):Promise<T>=>{
   if(path==='/auth/me')return {username:'review'} as T;
   if(path==='/pools')return [pool] as T;
   if(path==='/pools/one/targets')return [{id:'linked',name:'Linked target',ip:'1.1.1.1',status:'healthy',manual_enabled:true,failures:0,successes:2}] as T;
   return {} as T;
  });
  window.location.hash='#pools/one/targets/linked';
  await render();
  expect(document.activeElement?.id).toBe('pool-target-linked');
  expect(container.querySelectorAll('[aria-label="Редактировать узел"]')).toHaveLength(1);
  expect(container.querySelector('a[href="#events?pool_id=one&target_id=linked"]')).not.toBeNull();
  const back=container.querySelector<HTMLButtonElement>('.back-link');
  await act(async()=>back?.click());
  expect(window.location.hash).toBe('#pools');
  expect(container.querySelector('#pool-target-linked')).toBeNull();
 });
 it('moves focus into the mobile menu, traps it and restores it on Escape',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  mockRequests(async()=>[pool]);
  await render();
  const open=container.querySelector<HTMLButtonElement>('button[aria-label="Открыть меню"]')!;
  const menu=container.querySelector('aside')!;
  const main=container.querySelector('main')!;
  expect(menu.hasAttribute('inert')).toBe(true);
  await act(async()=>open.click());
  const close=container.querySelector<HTMLButtonElement>('button[aria-label="Закрыть меню"]')!;
  expect(main.hasAttribute('inert')).toBe(true);
  expect(menu.getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(close);
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true})));
  expect(document.activeElement).toBe(menu.querySelector('.user-button'));
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  expect(main.hasAttribute('inert')).toBe(false);
  expect(menu.hasAttribute('inert')).toBe(true);
  expect(document.activeElement).toBe(open);
 });
});
