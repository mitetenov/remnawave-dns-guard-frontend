import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CheckerProxy,proxyPayload} from './CheckerProxy';
import type {Checker} from './types';

const agent:Checker={id:'ru-proxy',version:'1.4.0',healthy:true,status:'online',last_seen:'2026-10-29T00:00:00Z',proxy:{configured:true,supported:true,endpoint:'socks5://proxy.example.com:1080',healthy:true,checked_at:'2026-10-29T00:00:00Z',latency_ms:128.3,exit_ip:'8.8.8.8',test:null}};

describe('checker SOCKS5 settings',()=>{
 it.each(['192.0.2.10','127.0.0.1','10.0.0.2'])('accepts IP:PORT:LOGIN:PASS for %s',ip=>expect(proxyPayload(` ${ip}:1080:user:pass `)).toEqual({url:`socks5://user:pass@${ip}:1080`}));
 it('encodes credentials without treating reserved URL characters as syntax',()=>{
  expect(proxyPayload('192.0.2.10:1080:user@example.com:p@ss/#?%')).toEqual({url:'socks5://user%40example.com:p%40ss%2F%23%3F%25@192.0.2.10:1080'});
 });
 it.each(['','socks5://user:pass@192.0.2.10:1080','socks5h://user:pass@192.0.2.10:1080','192.0.2.10:1080','proxy.example.com:1080:user:pass','[::1]:1080:user:pass','256.0.0.1:1080:user:pass','192.0.02.10:1080:user:pass','192.0.2.10:0:user:pass','192.0.2.10:65536:user:pass','192.0.2.10:1080::pass','192.0.2.10:1080:user:','192.0.2.10:1080:user:pass:extra','192.0.2.10:1080:user:pa\nss'])('rejects %s',value=>expect(()=>proxyPayload(value)).toThrow('IP:PORT:LOGIN:PASS'));
 it('bounds credentials by the SOCKS5 byte limit',()=>{
  expect(()=>proxyPayload(`192.0.2.10:1080:${'я'.repeat(128)}:pass`)).toThrow('IP:PORT:LOGIN:PASS');
 });
 it('shows a masked field and the test button for the selected checker',()=>{
  const html=renderToStaticMarkup(<CheckerProxy agent={agent}/>);
  for(const text of ['Прокси чекера ru-proxy','SOCKS5','socks5://proxy.example.com:1080','Проверить прокси','Удалить прокси','type="password"','8.8.8.8','128.3 мс','Проверка прокси выполняется с этого чекера','placeholder="IP:PORT:LOGIN:PASS"','Принимается только формат IP:PORT:LOGIN:PASS'])expect(html).toContain(text);
 });
 it('shows pending and failed tests as distinct results',()=>{
  for(const [status,text] of [['pending','Ожидаем проверку с сервера чекера'],['failed','Прокси недоступен с сервера чекера'],['timeout','Чекер не вернул результат за 60 секунд'],['passed','Тест прокси завершён успешно.']] as const){
   const html=renderToStaticMarkup(<CheckerProxy agent={{...agent,proxy:{...agent.proxy!,test:{id:'test-1',status}}}}/>);
   expect(html).toContain(text);
   if(status==='failed'||status==='timeout')expect(html).toContain('role="alert"');
  }
 });
 it('instructs older checkers to update before configuring a proxy',()=>{
  const html=renderToStaticMarkup(<CheckerProxy agent={{...agent,version:'1.2.0',proxy:{...agent.proxy!,supported:false,configured:false}}}/>);
  expect(html).toContain('1.4.0');expect(html).not.toContain('Проверить прокси');
 });
});
