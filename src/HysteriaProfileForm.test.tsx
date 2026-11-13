// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ProfileForm} from './App';
import {api} from './api';
import type {Pool} from './types';

vi.mock('./api',async importOriginal=>({...await importOriginal<typeof import('./api')>(),api:vi.fn()}));
const pool={id:'one',name:'Hysteria pool',profile_configured:false} as Pool;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 vi.mocked(api).mockReset().mockResolvedValue({ok:true});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function click(text:string){
 const button=[...container.querySelectorAll('button')].find(button=>button.textContent===text);
 expect(button).toBeDefined();await act(async()=>button!.click());
}
function field<T extends HTMLElement>(label:string):T {
 const element=[...container.querySelectorAll('label.field')].find(item=>item.querySelector('span')?.textContent===label)?.querySelector('input,textarea,select');
 expect(element).toBeDefined();return element as T;
}
async function importHysteria(){
 const saved=vi.fn().mockResolvedValue(undefined);
 await act(async()=>root.render(<ProfileForm pool={pool} onClose={()=>{}} onSaved={saved}/>));
 const input=field<HTMLTextAreaElement>('VLESS / Hysteria2 URI');
 await act(async()=>{
  const fm=encodeURIComponent('{"quicParams":{"debug":false,"congestion":"bbr"}}');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,`hy2://secret%3Apass@node.example.com:8443?sni=edge.example.com&obfs=salamander&obfs-password=obfs-secret&fm=${fm}`);
  input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await click('Прочитать и проверить параметры');
 return saved;
}
describe('Hysteria2 profile form',()=>{
 it('imports a link, displays Hysteria fields and saves the shared profile',async()=>{
  const saved=await importHysteria();
  expect(field<HTMLSelectElement>('Протокол').value).toBe('hysteria2');
  expect(field<HTMLInputElement>('Пароль Hysteria2').value).toBe('secret:pass');
  expect(field<HTMLInputElement>('Пароль Salamander').value).toBe('obfs-secret');
  expect(field<HTMLSelectElement>('Алгоритм QUIC').value).toBe('bbr');
  expect(container.textContent).not.toContain('UUID пользователя VLESS');
  await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(api).toHaveBeenCalledWith('/pools/one/profile',expect.objectContaining({method:'PUT',body:expect.any(String)}));
  const body=JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({protocol:'hysteria2',transport:'udp',security:'tls',port:8443,server_name:'edge.example.com',password:'secret:pass',obfs:'salamander',obfs_password:'obfs-secret',hysteria_congestion:'bbr'});
  expect(body).not.toHaveProperty('ip');expect(body).not.toHaveProperty('address');expect(saved).toHaveBeenCalledOnce();
 });
 it('clears Hysteria credentials when switching to VLESS',async()=>{
  await importHysteria();
  const protocol=field<HTMLSelectElement>('Протокол');
  await act(async()=>{protocol.value='vless';protocol.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(field<HTMLInputElement>('UUID пользователя VLESS').value).toBe('');
  expect(container.textContent).not.toContain('Пароль Hysteria2');
  await act(async()=>{protocol.value='hysteria2';protocol.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(field<HTMLInputElement>('Пароль Hysteria2').value).toBe('');
  expect(field<HTMLSelectElement>('Обфускация').value).toBe('');
  expect(field<HTMLSelectElement>('Алгоритм QUIC').value).toBe('');
 });
});
