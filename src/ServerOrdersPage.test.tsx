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
 it('selects all deletion options by default and sends only the confirmed selection',async()=>{
  const complete={...job,stage:'complete',provider:'virtua',ip:'8.8.4.4'};
  let deleting=false;
  mockOrders((path,options)=>{
   if(options?.method==='DELETE'){
    expect(path).toBe('/server-orders/job-1');
    expect(options).toEqual(json('DELETE',{hosting:false,remnawave:true,dns:true}));
    deleting=true;
    return {ok:true};
   }
   return {orders:[deleting?{...complete,stage:'deleting'}:complete],pools:[pool],stages:{...stages,deleting:'Удаление'}};
  });
  await act(async()=>root.render(<App/>));
  await click('Удалить сервер');
  const dialog=host.querySelector('[role="dialog"]')!;
  const checks=[...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(checks.map(input=>input.checked)).toEqual([true,true,true]);
  expect(dialog.textContent).toContain('Virtua.Cloud');
  await act(async()=>checks.forEach(input=>input.click()));
  expect(button('Удалить выбранное').disabled).toBe(true);
  await act(async()=>{checks[1].click();checks[2].click();});
  await click('Удалить выбранное');
  expect(deleting).toBe(true);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('.server-order .badge')?.textContent).toBe('Удаление');
 });
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
   ['kind=profile&pool_id=pool-1&group=nodes_wl']:[{id:'profile-1',label:'VLESS'}],
   ['kind=profile&pool_id=pool-2&group=nodes_wl']:[{id:'profile-1',label:'VLESS'},{id:'profile-2',label:'Hysteria'}],
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
  const hostings=host.querySelector('section[aria-labelledby="server-hostings-title"]');
  expect(hostings?.querySelector('button')).toBe(button('Заказать сервер'));
  expect(hostings?.querySelector('a')?.getAttribute('href')).toBe('https://virtua.cloud/');
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

 it('connects Virtua.Cloud and resumes its paid order after a lost response',async()=>{
  let configured=false;
  const requests:unknown[]=[];
  const choices:Record<string,{id:string;label:string}[]>={
   ['kind=zone&provider=virtua']:[{id:'par01fr',label:'Paris · FR'}],
   ['kind=plan&zone=par01fr&provider=virtua']:[{id:'paris-quote',label:'vCS-2 · 0.0167 EUR/ч без НДС'}],
   ['kind=pool']:[{id:pool.id,label:pool.name}],
   ['kind=group']:[{id:'nodes',label:'Обычная нода'}],
   ['kind=profile&pool_id=pool-1&group=nodes']:[{id:'profile-1',label:'VLESS'}],
  };
  mockOrders((path,options)=>{
   if(path==='/server-orders/settings/virtua'){
    expect(options).toEqual(json('PUT',{virtua_token:'test-key'}));
    configured=true;
    return {ok:true};
   }
   if(options?.method==='POST'){
    requests.push(JSON.parse(String(options.body)));
    if(requests.length===1)throw new ApiError(0,'Ответ потерян.');
    return {id:job.id};
   }
   if(path.startsWith('/server-orders/options?'))return {choices:choices[path.split('?')[1]]};
   return {orders:requests.length>1?[{...job,zone:'par01fr',provider:'virtua'}]:[],pools:[pool],stages,virtua_configured:configured};
  });
  await act(async()=>root.render(<App/>));
  const settings=host.querySelector<HTMLDetailsElement>('.virtua-settings')!;
  expect(settings.textContent).toContain('Подключить Virtua.Cloud');
  settings.open=true;
  await type(settings.querySelector('input')!,'test-key');
  await click('Сохранить токен');
  expect(settings.querySelector('input')?.value).toBe('');
  await click('Заказать сервер Virtua.Cloud');
  await choose('par01fr');
  expect(wizardSelect('Тариф')).toBeTruthy();
  expect(host.querySelector('.order-wizard')?.textContent).not.toContain('Линейка тарифов');
  await choose('paris-quote','Тариф');
  await choose(pool.id);
  await choose('nodes');
  await choose('profile-1');
  expect(host.querySelector('.order-wizard')?.textContent).toContain('Virtua.Cloud будет списывать средства');
  await act(async()=>host.querySelector<HTMLInputElement>('.order-wizard input[type="checkbox"]')?.click());
  await click('Подтвердить платный заказ');
  await click('Закрыть заказ');
  expect(button('Заказать сервер').disabled).toBe(true);
  await click('Проверить отправку заказа Virtua.Cloud');
  await act(async()=>host.querySelector<HTMLInputElement>('.order-wizard input[type="checkbox"]')?.click());
  await click('Повторить запрос заказа');
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual({
   request_id:expect.stringMatching(/^[0-9a-f-]{36}$/),provider:'virtua',zone:'par01fr',plan:'paris-quote',pool_id:pool.id,group:'nodes',profile_id:'profile-1',
  });
  expect(requests[1]).toEqual(requests[0]);
  expect(host.querySelector('.server-order')?.textContent).toContain('Virtua.Cloud');
 });

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

 it('shows the selected node type configuration error before payment confirmation',async()=>{
  mockOrders(path=>{
   if(path==='/server-orders/options?kind=zone')return {choices:[{id:'fi-hel1',label:'Финляндия'}]};
   if(path==='/server-orders/options?kind=plan&zone=fi-hel1')return {choices:[{id:'hel-plan',label:price,family:'starter'}]};
   if(path==='/server-orders/options?kind=pool')return {choices:[{id:pool.id,label:pool.name}]};
   if(path==='/server-orders/options?kind=group')return {choices:[{id:'nodes_wl',label:'CDN'}]};
   if(path==='/server-orders/options?kind=profile&pool_id=pool-1&group=nodes_wl')throw new ApiError(409,'Укажите REPLACEMENT_ANSIBLE_XHTTP_PATH.');
   return {orders:[],pools:[pool],stages};
  });
  await act(async()=>root.render(<App/>));
  await click('Заказать сервер');
  await choose('fi-hel1');
  await changeSelect('starter');
  await choose('hel-plan','Тариф');
  await choose(pool.id);
  await choose('nodes_wl');
  expect(host.querySelector('.order-wizard [role="alert"]')?.textContent).toContain('REPLACEMENT_ANSIBLE_XHTTP_PATH');
  expect(host.querySelector('.order-confirm')).toBeNull();
  expect(button('Продолжить').disabled).toBe(true);
 });

 it('explains an empty pool list and refreshes the wizard from both buttons',async()=>{
  const loadPoolOptions=vi.fn(()=>({choices:[] as {id:string;label:string}[]}));
  mockOrders(path=>{
   if(path==='/server-orders/options?kind=zone')return {choices:[{id:'fi-hel1',label:'Финляндия'}]};
   if(path==='/server-orders/options?kind=plan&zone=fi-hel1')return {choices:[{id:'hel-plan',label:price,family:'starter'}]};
   if(path==='/server-orders/options?kind=pool')return loadPoolOptions();
   return {orders:[],pools:[pool],stages};
  });
  await act(async()=>root.render(<App/>));
  await click('Заказать сервер');
  await choose('fi-hel1');
  await changeSelect('starter');
  await choose('hel-plan','Тариф');

  const wizard=host.querySelector('.order-wizard')!;
  expect(wizard.textContent).toContain('Нет доступных DNS-пулов.');
  expect(wizard.textContent).toContain('Домены серверов');
  expect(wizard.textContent).toContain('профиль проверок');
  expect(button('Продолжить').disabled).toBe(true);
  await click('Обновить варианты');
  expect(loadPoolOptions).toHaveBeenCalledTimes(2);
  expect(wizard.textContent).toContain('Нет доступных DNS-пулов.');

  loadPoolOptions.mockReturnValue({choices:[{id:pool.id,label:pool.name}]});
  await click('Обновить');
  expect(loadPoolOptions).toHaveBeenCalledTimes(3);
  expect(wizard.textContent).not.toContain('Нет доступных DNS-пулов.');
  await changeSelect(pool.id,'DNS-пул');
  expect(button('Продолжить').disabled).toBe(false);
 });

 it('loads only the expanded order journal, retries on failure and follows new entries',async()=>{
  let updated_at='2026-11-20T15:00:00Z';
  const diagnostic='Virtua.Cloud GET /v1/cloud/systems (HTTP 200): поле systems.version';
  const logs=vi.fn().mockRejectedValueOnce(new Error('Ошибка загрузки')).mockImplementation(async()=>[
   {id:1,recorded_at:updated_at,stage:'provision',level:'error',message:diagnostic,occurrences:2},
  ]);
  mockOrders(path=>{
   if(path.endsWith('/logs')){
    expect(path).toBe('/server-orders/job-1/logs');
    return logs();
   }
   return {orders:[{...job,updated_at},{...job,id:'job-2',stage:'complete',updated_at}],pools:[],stages};
  });
  await act(async()=>root.render(<App/>));
  const buttons=[...host.querySelectorAll<HTMLButtonElement>('button')].filter(b=>b.textContent==='Логи');
  expect(buttons).toHaveLength(2);
  expect(logs).not.toHaveBeenCalled();
  await click('Логи');
  expect(host.textContent).toContain('Ошибка загрузки');
  await click('Повторить загрузку');
  const log=host.querySelector('.server-order-log')!;
  expect(log.textContent).toContain(stages.provision);
  expect(log.textContent).toContain(diagnostic);
  expect(log.textContent).toContain('Повторений: 1');
  expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
  updated_at='2026-11-20T15:01:00Z';
  await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
  expect(log.querySelector('time')?.dateTime).toBe(updated_at);
  await click('Скрыть логи');
  expect(host.querySelector('.server-order-log')).toBeNull();
  updated_at='2026-11-20T15:02:00Z';
  await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
  expect(logs).toHaveBeenCalledTimes(3);
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
