import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadSubscription,subscriptionServers} from './subscription';
const uuid='e764ae13-9e06-4e6d-a870-2898c984ca22';
const uri=`vless://${uuid}@node.example.com:8443?type=xhttp&security=tls&sni=tls.example.com&path=%2Fprobe&mode=stream-up`;
afterEach(()=>vi.unstubAllGlobals());

describe('subscription server selection',()=>{
 it('decodes server names and keeps only shared profile fields',()=>{
  const [server]=subscriptionServers([`${uri}#${encodeURIComponent('🇫🇮 Финляндия')}`]);
  expect(server.name).toBe('🇫🇮 Финляндия');
  expect(server.address).toBe('node.example.com:8443');
  expect(server.profile).toMatchObject({uuid,port:8443,transport:'xhttp',security:'tls',server_name:'tls.example.com',path:'/probe',xhttp_mode:'stream-up'});
  expect(server.profile).not.toHaveProperty('ip');
  expect(server).not.toHaveProperty('uri');
 });
 it('keeps unsupported servers visible with a reason without preventing valid choices',()=>{
  const servers=subscriptionServers([uri.replace('type=xhttp','type=ws')+'#WebSocket',uri]);
  expect(servers[0]).toMatchObject({name:'WebSocket',profile:null,error:expect.stringContaining('не поддерживается')});
  expect(servers[1].profile?.uuid).toBe(uuid);
 });
 it('labels unnamed and malformed links safely',()=>{
  expect(subscriptionServers([uri,'not a URI',uri+'#%broken']).map(item=>item.name)).toEqual(['Сервер 1','Сервер 2','Сервер 3']);
  expect(subscriptionServers(['not a URI'])[0].profile).toBeNull();
 });
 it('loads through the same-origin API without sending the subscription URL in a query',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({uris:[uri]})));
  vi.stubGlobal('fetch',fetch);
  const servers=await loadSubscription(' https://sub.example.com/private-token ');
  expect(fetch).toHaveBeenCalledWith('/api/subscriptions/preview',expect.objectContaining({method:'POST',body:JSON.stringify({url:'https://sub.example.com/private-token'}),credentials:'same-origin'}));
  expect(servers[0].profile?.port).toBe(8443);
 });
 it.each(['vless://abc','http://sub.example.com/token','https://user:password@sub.example.com','https://sub.example.com/#token','invalid'])('rejects invalid subscription URL %s before fetching',async(value)=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(loadSubscription(value)).rejects.toThrow('HTTPS');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('shows a failed download instead of returning selectable profiles',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Подписка недоступна'}),{status:422})));
  await expect(loadSubscription('https://sub.example.com/token')).rejects.toThrow('Подписка недоступна');
 });
 it('sends HWID opt-in only when the operator explicitly selects it',async()=>{
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({uris:[uri]}))));
  vi.stubGlobal('fetch',fetch);
  await loadSubscription('https://sub.example.com/token',true);
  expect(fetch).toHaveBeenLastCalledWith('/api/subscriptions/preview',expect.objectContaining({body:JSON.stringify({url:'https://sub.example.com/token',use_hwid:true})}));
  await loadSubscription('https://sub.example.com/token',false);
  expect(fetch).toHaveBeenLastCalledWith('/api/subscriptions/preview',expect.objectContaining({body:JSON.stringify({url:'https://sub.example.com/token'})}));
 });
 it('preserves actionable HWID errors instead of presenting a placeholder as a server',async()=>{
  const detail='Подписка требует HWID. Отметьте «Использовать DNS Guard как отдельное устройство» и повторите загрузку.';
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail}),{status:422})));
  await expect(loadSubscription('https://sub.example.com/token')).rejects.toThrow(detail);
 });
});
