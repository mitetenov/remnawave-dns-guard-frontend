// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import App from './App';
import {api,ApiError,json} from './api';

vi.mock('./api',async importOriginal=>({...await importOriginal<typeof import('./api')>(),api:vi.fn()}));

const pool={id:'pool-1',name:'Основной',hostname:'vpn.example.net',domain_template:'{country}-{n}.{pool}'};
const stages={provision:'Создание сервера',complete:'Готов',cancelled:'Отменён'};
const job={id:'job-1',domain:'fi-12.vpn.example.net',stage:'provision',zone:'fi-hel1',plan:'1xCPU-1GB',pool_hostname:pool.hostname,group_name:'CDN',profile_name:'VLESS',created_at:'2026-11-19T12:00:00Z',ip:null,error:null};
const price='≈ 4.00 EUR/мес. · STARTER-1xCPU-1GB · 1 vCPU · 1024 МиБ RAM · 10 ГиБ standard · 0.00595238 EUR/ч';
const premiumPrice='≈ 5.00 EUR/мес. · PREMIUM-1xCPU-1GB · 1 vCPU · 1024 МиБ RAM · 25 ГиБ maxiops · 0.00744048 EUR/ч';
let host:HTMLDivElement,root:Root;

beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 sessionStorage.clear();window.location.hash='#servers';
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.mocked(api).mockReset();
});

afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();
 sessionStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();
});

function mockOrders(handle:(path:string,options?:RequestInit)=>unknown){
 vi.mocked(api).mockImplementation(async <T,>(path:string,options?:RequestInit)=>{
  if(path==='/auth/me')return {username:'admin'} as T;
  if(path==='/auth/login')return {username:'admin'} as T;
  if(path==='/settings'||path==='/overview')return {} as T;
  if(path.startsWith('/server-orders'))return await handle(path,options) as T;
  return [] as T;
 });
}

function button(text:string){
 const element=[...host.querySelectorAll('button')].find(element=>element.textContent?.trim()===text||element.getAttribute('aria-label')===text);
 if(!element)throw new Error(`Missing button ${text}`);
 return element;
}

async function click(text:string){await act(async()=>button(text).click());}

function wizardSelect(label?:string){
 return host.querySelector<HTMLSelectElement>(label?`.order-wizard select[aria-label="${label}"]`:'.order-wizard select');
}

async function changeSelect(value:string,label?:string){
 const select=wizardSelect(label)!;
 expect(select).toBeTruthy();
 await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
}

async function choose(value:string,label?:string){await changeSelect(value,label);await click('Продолжить');}

async function type(input:HTMLInputElement,value:string){
 await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
}

describe('server ordering',()=>{
 it('filters tariffs by location and family, confirms both prices and reuses the request after session expiry',async()=>{
  const post:unknown[]=[];
  const choices:Record<string,{id:string;label:string;family?:string}[]>={
   ['kind=zone']:[{id:'nl-ams1',label:'Нидерланды · Амстердам'},{id:'fi-hel1',label:'Финляндия · Хельсинки'}],
   ['kind=plan&zone=nl-ams1']:[{id:'ams-opaque',label:'PREMIUM-1xCPU-2GB · ≈ 12.00 EUR/мес.',family:'premium'}],
   ['kind=plan&zone=fi-hel1']:[
    {id:'hel-opaque-price-quote',label:price,family:'starter'},
    {id:'hel-opaque-premium',label:premiumPrice,family:'premium'},
   ],
   ['kind=pool']:[{id:pool.id,label:pool.name},{id:'pool-2',label:'Резервный'}],
   ['kind=group']:[{id:'nodes_wl',label:'CDN'}],
   ['kind=profile&pool_id=pool-1']:[{id:'profile-1',label:'VLESS'}],
   ['kind=profile&pool_id=pool-2']:[{id:'profile-1',label:'VLESS'},{id:'profile-2',label:'Hysteria'}],
  };
  mockOrders((path,options)=>{
   if(options?.method==='POST'){
    post.push(JSON.parse(String(options.body)));
    if(post.length===1)throw new ApiError(0,'Ответ потерян.');
    if(post.length===2)throw new ApiError(401,'Сессия завершена.');
    return {id:job.id};
   }
   if(path.startsWith('/server-orders/options?'))return {choices:choices[path.split('?')[1]]};
   return {orders:post.length>1?[job]:[],pools:[pool],stages};
  });
  await act(async()=>root.render(<App/>));
  expect(host.querySelector('h1')?.textContent).toBe('Серверы');
  expect(host.querySelector('nav [aria-current="page"]')?.textContent).toBe('Серверы');
  await click('Заказать сервер');
  await choose('nl-ams1');
  expect(wizardSelect()?.textContent).toContain('Premium');
  expect(wizardSelect()?.textContent).not.toContain('Starter');
  expect(wizardSelect('Тариф')).toBeNull();
  await changeSelect('premium');
  await choose('ams-opaque','Тариф');
  await click('Назад');
  expect(wizardSelect()?.value).toBe('premium');
  expect(wizardSelect('Тариф')?.value).toBe('ams-opaque');
  await click('Назад');
  await choose('fi-hel1');
  expect(wizardSelect()?.value).toBe('');
  expect(wizardSelect('Тариф')).toBeNull();
  await changeSelect('premium');
  expect(wizardSelect('Тариф')?.textContent).toContain(premiumPrice);
  expect(wizardSelect('Тариф')?.textContent).not.toContain('STARTER-1xCPU-1GB');
  expect(wizardSelect('Тариф')?.textContent).not.toContain('12.00 EUR/мес.');
  await changeSelect('hel-opaque-premium','Тариф');
  expect(button('Продолжить').disabled).toBe(false);
  await changeSelect('starter');
  expect(button('Продолжить').disabled).toBe(true);
  expect(wizardSelect('Тариф')?.textContent).toContain(price);
  expect(wizardSelect('Тариф')?.textContent).not.toContain('PREMIUM-1xCPU-1GB');
  await changeSelect('premium');
  expect(wizardSelect('Тариф')?.value).toBe('');
  await changeSelect('starter');
  await choose('hel-opaque-price-quote','Тариф');
  await choose(pool.id);
  await choose('nodes_wl');
  await choose('profile-1');
  await click('Назад');
  await click('Назад');
  await click('Назад');
  await choose('pool-2');
  await choose('nodes_wl');
  expect(button('Продолжить').disabled).toBe(true);
  expect(host.querySelector('.order-wizard select')?.textContent).toContain('Hysteria');
  await choose('profile-2');
  const review=host.querySelector('.order-wizard');
  expect(review?.textContent).toContain(price);
  expect(review?.textContent).toContain('Debian 13');
  expect(review?.textContent).toContain('UpCloud будет списывать средства');
  expect(post).toHaveLength(0);
  expect(button('Подтвердить платный заказ').disabled).toBe(true);
  await act(async()=>review?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
  await click('Подтвердить платный заказ');
  expect(post).toHaveLength(1);
  expect(host.textContent).toContain('Ответ потерян.');
  expect(button('Назад').disabled).toBe(true);
  await click('Закрыть заказ');
  await click('Проверить отправку заказа');
  expect(button('Повторить запрос заказа').disabled).toBe(true);
  await act(async()=>host.querySelector<HTMLInputElement>('.order-wizard input[type="checkbox"]')?.click());
  await click('Повторить запрос заказа');
  expect(post).toHaveLength(2);
  const pendingId=post[0]&& (post[0] as {request_id:string}).request_id;
  expect(JSON.parse(sessionStorage.getItem('dns-guard:pending-server-order')||'null')).toMatchObject({id:pendingId});
  expect(host.querySelector('.auth-page')).toBeTruthy();
  await type(host.querySelector<HTMLInputElement>('input[autocomplete="username"]')!,'admin');
  await type(host.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!,'password');
  await click('Войти в панель');
  expect(host.textContent).toContain('При повторе будет отправлен тот же заказ.');
  await act(async()=>host.querySelector<HTMLInputElement>('.order-wizard input[type="checkbox"]')?.click());
  await click('Повторить запрос заказа');
  expect(post).toHaveLength(3);
  expect(post[0]).toEqual({request_id:expect.stringMatching(/^[0-9a-f-]{36}$/),zone:'fi-hel1',plan:'hel-opaque-price-quote',pool_id:'pool-2',group:'nodes_wl',profile_id:'profile-2'});
  expect(post[1]).toEqual(post[0]);
  expect(post[2]).toEqual(post[0]);
  expect(host.textContent).toContain('Заказ принят.');
  expect(host.textContent).toContain(job.domain);
  expect(sessionStorage.length).toBe(0);
 },20000);

 it('validates, previews and clears the template for a specific pool',async()=>{
  let template=pool.domain_template;
  mockOrders((_path,options)=>{
   if(options?.method==='PUT'){template=JSON.parse(String(options.body)).domain_template;return {ok:true};}
   return {orders:[],pools:[{...pool,domain_template:template}],stages};
  });
  await act(async()=>root.render(<App/>));
  const input=host.querySelector<HTMLInputElement>('.order-pool-template input')!;
  const save=host.querySelector<HTMLButtonElement>('.order-pool-template button')!;
  await type(input,'{country}.{pool}');
  expect(save.disabled).toBe(true);
  await type(input,'edge-{country}-{n}.{pool}');
  expect(host.textContent).toContain('edge-fi-01.vpn.example.net');
  await act(async()=>save.click());
  expect(api).toHaveBeenCalledWith(`/server-orders/pools/${pool.id}`,json('PUT',{domain_template:'edge-{country}-{n}.{pool}'}));
  await type(input,'');
  await act(async()=>save.click());
  expect(api).toHaveBeenCalledWith(`/server-orders/pools/${pool.id}`,json('PUT',{domain_template:''}));
  expect(host.textContent).toContain('Заказы для пула выключены.');
 });

 it('refreshes order status and requires explicit confirmation for cancel and retry',async()=>{
  let orders=[{...job,can_cancel:true,can_retry_create:false}];
  mockOrders((path,options)=>{
   if(options?.method==='POST'){
    if(path.endsWith('/cancel'))orders=[{...job,stage:'cancelled',can_cancel:false,can_retry_create:false}];
    if(path.endsWith('/retry-create'))orders=[{...job,stage:'complete',can_cancel:false,can_retry_create:false}];
    return {ok:true};
   }
   return {orders,pools:[pool],stages};
  });
  await act(async()=>root.render(<App/>));
  await click('Отменить заказ');
  expect(api).not.toHaveBeenCalledWith(`/server-orders/${job.id}/cancel`,expect.anything());
  await click('Да, отменить заказ');
  expect(api).toHaveBeenCalledWith(`/server-orders/${job.id}/cancel`,json('POST',{}));
  expect(host.textContent).toContain('Отменён');

  orders=[{...job,can_cancel:false,can_retry_create:true}];
  await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
  await click('Повторить создание');
  expect(host.textContent).toContain('журнал действий UpCloud');
  expect(api).not.toHaveBeenCalledWith(`/server-orders/${job.id}/retry-create`,expect.anything());
  await click('Подтвердить отсутствие и повторить');
  expect(api).toHaveBeenCalledWith(`/server-orders/${job.id}/retry-create`,json('POST',{confirmed_absent:true}));
  expect(host.textContent).toContain('Готов');
 });
});
