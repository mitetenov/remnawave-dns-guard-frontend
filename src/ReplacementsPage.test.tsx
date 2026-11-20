// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import App from './App';
import {api,ApiError,json} from './api';

vi.mock('./api',async importOriginal=>({...await importOriginal<typeof import('./api')>(),api:vi.fn()}));

const serverID='00d18f37-2eed-4e44-a7ac-cfed28fb678a';
const nodeID='0cfe3994-85ba-4487-8d41-512604919aae';
const target={id:'target',name:'Первый узел',ip:'203.0.113.2',pool_name:'Основной пул',remnawave_uuid:nodeID,provider:null as string|null,server_uuid:null as string|null,enabled:false,pool_enabled:true,manual_enabled:true,blocked_since:null};
const configuredTarget={...target,provider:'upcloud',server_uuid:serverID,enabled:true};
const snapshot={upcloud_configured:true,ansible_ready:false,ansible_error:'Не найден плейбук Ansible',targets:[target],jobs:[]};
const job={id:'job',target_id:target.id,name:target.name,stage:'verify',old_ip:target.ip,new_ip:'203.0.113.9',error:'Ожидаются свежие результаты проверок',created_at:'2026-11-19T02:00:00Z',updated_at:'2026-11-19T02:08:00Z'};

let root:Root,container:HTMLDivElement;

beforeEach(()=>{
 vi.useFakeTimers();
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 window.location.hash='#replacements';
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 vi.mocked(api).mockReset();
});

afterEach(async()=>{
 await act(async()=>root.unmount());
 container.remove();vi.useRealTimers();vi.unstubAllGlobals();
});

function mockRequests(replacements:(path:string,options?:RequestInit)=>unknown){
 vi.mocked(api).mockImplementation(async <T,>(path:string,options?:RequestInit)=>{
  if(path==='/auth/me')return {username:'review'} as T;
  if(path==='/settings'||path==='/overview')return {} as T;
  if(path.startsWith('/replacements')||path.startsWith('/server-orders/options?'))return await replacements(path,options) as T;
  return [] as T;
 });
}

async function render(){await act(async()=>root.render(<App/>));}

function button(label:string){
 const match=[...container.querySelectorAll('button')].find(node=>node.textContent===label);
 if(!match)throw new Error(`Кнопка «${label}» не найдена`);
 return match;
}

function input(selector:string){
 const match=container.querySelector<HTMLInputElement>(selector);
 if(!match)throw new Error(`Поле ${selector} не найдено`);
 return match;
}

async function type(field:HTMLInputElement,value:string){
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);
  field.dispatchEvent(new Event('input',{bubbles:true}));
 });
}

describe('automatic replacement settings',()=>{
 it('binds an existing Virtua server to a quoted plan after opt-in',async()=>{
  mockRequests((path,options)=>{
   if(path.startsWith('/server-orders/options?')){
    const query=new URLSearchParams(path.split('?')[1]);
    expect(query.get('provider')).toBe('virtua');
    if(query.get('kind')==='zone')return {choices:[{id:'par01fr',label:'Paris'}]};
    expect(query.get('zone')).toBe('par01fr');
    return {choices:[{id:'plan@quote',label:'Linux · 0.02 EUR/ч'}]};
   }
   if(options?.method==='PUT')return {ok:true};
   return {...snapshot,virtua_configured:true,order_ansible_ready:true,order_ansible_error:''};
  });
  await render();
  const details=container.querySelector<HTMLDetailsElement>('.replacement-target')!;
  await act(async()=>{
   details.open=true;
   details.dispatchEvent(new Event('toggle'));
  });
  async function choose(name:string,value:string){
   const field=[...details.querySelectorAll('label')].find(label=>label.querySelector('span')?.textContent===name)?.querySelector('select');
   if(!field)throw new Error(`Поле «${name}» не найдено`);
   await act(async()=>{
    field.value=value;
    field.dispatchEvent(new Event('change',{bubbles:true}));
   });
  }
  await choose('Провайдер','virtua');
  await type(details.querySelector<HTMLInputElement>('input[type=text]')!,serverID);
  expect(button('Сохранить привязку').disabled).toBe(true);
  await choose('Локация нового сервера','par01fr');
  await choose('Тариф нового сервера','plan@quote');
  await choose('Тип ноды','nodes');
  await type(input('[placeholder="node.example.com"]'),'node.example.com');
  await act(async()=>input('.replacement-binding input[type=checkbox]').click());
  await act(async()=>button('Сохранить привязку').click());
  expect(api).toHaveBeenCalledWith('/replacements/targets/target',json('PUT',{
   provider:'virtua',server_uuid:serverID,remnawave_uuid:nodeID,enabled:true,
   virtua_zone:'par01fr',virtua_quote:'plan@quote',virtua_group:'nodes',virtua_domain:'node.example.com',
  }));
 });

 it('opens from a hash, reports Ansible readiness, and writes a new token without redisplaying it',async()=>{
  mockRequests((path,options)=>{
   if(path==='/replacements/settings'&&options?.method==='PUT')return {ok:true};
   return snapshot;
  });
  await render();
  expect(container.querySelector('h1')?.textContent).toBe('Автозамена');
  expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe('Автозамена');
  expect(container.textContent).toContain('5 минут подтверждённой непрерывной блокировки');
  expect(container.textContent).toContain('Не найден плейбук Ansible');
  expect(container.textContent).toContain('Токен сохранён');
  const password=input('input[type="password"]');
  expect(password.value).toBe('');
  expect(button('Сохранить токен').disabled).toBe(true);

  await type(password,' secret-only-input ');
  await act(async()=>button('Сохранить токен').click());
  expect(api).toHaveBeenCalledWith('/replacements/settings',json('PUT',{upcloud_token:'secret-only-input'}));
  expect(vi.mocked(api).mock.calls.filter(([path])=>path==='/replacements')).toHaveLength(2);
  expect(password.value).toBe('');
  expect(container.textContent).toContain('Токен UpCloud сохранён.');
  expect(container.innerHTML).not.toContain('secret-only-input');
 });

 it('shows bundled Ansible readiness for purchased nodes independently of manual bindings',async()=>{
  mockRequests(()=>({
   ...snapshot,order_ansible_ready:true,order_ansible_error:'',
   targets:[{...configuredTarget,order_managed:true},{...configuredTarget,id:'manual',name:'Ручной узел'}],
  }));
  await render();
  const bindings=container.querySelectorAll('.replacement-target summary');
  expect(bindings[0]?.textContent).toContain('Включена');
  expect(bindings[1]?.textContent).toContain('Ожидает настройки');
 });

 it('requires an explicit server binding and opt-in, and displays the API error',async()=>{
  let value=snapshot;
  let reject=true;
  mockRequests((_path,options)=>{
   if(options?.method==='PUT'){
    if(reject)throw new ApiError(409,'Сервер уже привязан к другому узлу');
    value={...snapshot,targets:[configuredTarget]};
    return {ok:true};
   }
   return value;
  });
  await render();
  await act(async()=>container.querySelector('summary')!.click());
  const fields=[...container.querySelectorAll<HTMLInputElement>('.replacement-binding input[type="text"]')];
  const optIn=input('.replacement-binding input[type="checkbox"]');
  expect(fields[0].value).toBe('');
  expect(fields[1].value).toBe(nodeID);
  expect(optIn.checked).toBe(false);
  expect(button('Сохранить привязку').disabled).toBe(true);

  await type(fields[0],` ${serverID} `);
  await act(async()=>optIn.click());
  expect(vi.mocked(api).mock.calls.every(([,options])=>options?.method!=='PUT')).toBe(true);
  await act(async()=>button('Сохранить привязку').click());
  expect(api).toHaveBeenCalledWith('/replacements/targets/target',json('PUT',{provider:'upcloud',server_uuid:serverID,remnawave_uuid:nodeID,enabled:true}));
  expect(container.textContent).toContain('Сервер уже привязан к другому узлу');
  reject=false;
  await act(async()=>button('Сохранить привязку').click());
  expect(container.textContent).toContain('Привязка сохранена.');
  expect(container.textContent).not.toContain('Сервер уже привязан к другому узлу');
 });

 it('updates stages on refresh and allows pausing a committed job without editing its binding',async()=>{
  let value={...snapshot,ansible_ready:true,ansible_error:'',targets:[{...configuredTarget,pool_enabled:false}],jobs:[job]};
  mockRequests((_path,options)=>{
   if(options?.method==='PUT'){
    value={...value,targets:[{...value.targets[0],enabled:false}]};
    return {ok:true};
   }
   return value;
  });
  await render();
  await act(async()=>container.querySelector('summary')!.click());
  expect(container.textContent).toContain('Пул на паузе');
  expect(container.textContent).toContain('Проверка нового IP');
  expect(container.textContent).toContain(job.error);
  expect(container.textContent).toContain(job.old_ip);
  expect(container.textContent).toContain(job.new_ip);
  const server=input('.replacement-binding input[type="text"]');
  const optIn=input('.replacement-binding input[type="checkbox"]');
  expect(server.disabled).toBe(true);
  expect(optIn.disabled).toBe(false);
  await act(async()=>optIn.click());
  await act(async()=>button('Сохранить привязку').click());
  expect(api).toHaveBeenCalledWith('/replacements/targets/target',json('PUT',{provider:'upcloud',server_uuid:serverID,remnawave_uuid:nodeID,enabled:false}));

  value={...value,jobs:[{...job,stage:'cleanup',error:''}]};
  await act(async()=>button('Обновить').click());
  expect(container.textContent).toContain('Освобождение прежнего IP');
  expect(server.disabled).toBe(true);

  value={...value,jobs:[{...job,stage:'complete',error:''}]};
  await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
  expect(container.textContent).toContain('Завершена');
  expect(server.disabled).toBe(false);
 });

 it('returns to sign-in when the replacement endpoint reports an expired session',async()=>{
  mockRequests(()=>{throw new ApiError(401,'Сессия завершена.');});
  await render();
  expect(container.textContent).toContain('Войдите, чтобы управлять пулами');
  expect(container.querySelector('nav')).toBeNull();
 });

 it('authorizes a create retry only after an explicit confirmation for an eligible job',async()=>{
  const eligible={...job,id:'retry-job',stage:'provision',can_retry_create:true};
  const otherJobs=[{...job,id:'unavailable',stage:'provision',can_retry_create:false},{...job,id:'verifying',can_retry_create:true}];
  let value={...snapshot,jobs:[eligible,...otherJobs]};
  let reject=true;
  mockRequests((_path,options)=>{
   if(options?.method==='POST'){
    if(reject)throw new ApiError(409,'UpCloud вернул новый сервер для этой замены');
    value={...value,jobs:[{...eligible,can_retry_create:false},...otherJobs]};
    return {ok:true};
   }
   return value;
  });
  await render();
  const retryButtons=[...container.querySelectorAll('button')].filter(node=>node.textContent==='Повторить создание');
  expect(retryButtons).toHaveLength(1);
  expect(container.textContent).toContain('dns-guard-replacement=retry-job');
  await act(async()=>retryButtons[0].click());
  expect(container.textContent).toContain('журнал действий UpCloud');
  expect(container.textContent).toContain('выполняемых или ожидающих запросов');
  await act(async()=>button('Отмена').click());
  expect(vi.mocked(api).mock.calls.every(([,options])=>options?.method!=='POST')).toBe(true);

  await act(async()=>button('Повторить создание').click());
  await act(async()=>button('Подтвердить отсутствие и повторить').click());
  expect(api).toHaveBeenCalledWith('/replacements/jobs/retry-job/retry-create',json('POST',{confirmed_absent:true}));
  expect(container.textContent).toContain('UpCloud вернул новый сервер для этой замены');
  expect(container.textContent).not.toContain('Подтвердить отсутствие и повторить');

  reject=false;
  await act(async()=>button('Повторить создание').click());
  await act(async()=>button('Подтвердить отсутствие и повторить').click());
  expect(vi.mocked(api).mock.calls.filter(([path])=>path==='/replacements')).toHaveLength(2);
  expect(container.textContent).toContain('Повторное создание разрешено.');
  expect(container.textContent).not.toContain('Повторить создание');
 });
});
