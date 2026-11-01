import {afterEach,describe,expect,it,vi} from 'vitest';
import {api,ApiError,json} from './api';
afterEach(()=>vi.unstubAllGlobals());
describe('same-origin API adapter',()=>{
 it('sends session cookies and required mutation header',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',fetch);await api('/targets/a/disable',json('POST'));expect(fetch).toHaveBeenCalledWith('/api/targets/a/disable',expect.objectContaining({method:'POST',credentials:'same-origin',headers:expect.objectContaining({'X-Requested-With':'DNSGuard','Content-Type':'application/json'})}));});
 it('preserves server reason for blocked final A-record deletion',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Cannot remove the last actual A record'}),{status:409})));await expect(api('/targets/a',json('DELETE'))).rejects.toEqual(new ApiError(409,'Cannot remove the last actual A record'));});
 it('does not fabricate successful results on network errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));await expect(api('/pools/a/check',json('POST'))).rejects.toMatchObject({status:0});});
 it('handles a non-JSON server error with its status',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('upstream unavailable',{status:502})));await expect(api('/overview')).rejects.toMatchObject({status:502});});
 it('reports expired sessions clearly',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:401})));await expect(api('/settings')).rejects.toMatchObject({status:401,message:'Сессия завершена. Войдите снова.'});});
 it('uses the localized DNS field label for the pool validation error',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Invalid request fields: hostname'}),{status:422})));
  await expect(api('/pools',json('POST',{name:'poland',hostname:'poland',zone_id:'zone'}))).rejects.toEqual(new ApiError(422,'Проверьте поле «DNS-имя».'));
 });
 it('lists localized labels for multiple invalid fields',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Invalid request fields: hostname, zone_id, hostname'}),{status:422})));
  await expect(api('/pools',json('POST',{}))).rejects.toMatchObject({status:422,message:'Проверьте поля: «DNS-имя», «Зона Cloudflare».'});
 });
 it.each([
  ['/pools','name','Название пула'],
  ['/pools/pool-1','name','Название пула'],
  ['/pools/pool-1/targets','name','Название узла'],
  ['/targets/target-1','name','Название узла'],
  ['/agents/ru-1/proxy','url','Прокси'],
  ['/subscriptions/preview','url','Ссылка на подписку'],
 ])('uses the field label belonging to %s',async(path,field,label)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:`Invalid request fields: ${field}`}),{status:422})));
  await expect(api(path,json('POST',{}))).rejects.toMatchObject({message:`Проверьте поле «${label}».`});
 });
 it.each(['request','unknown_field',''])('uses a localized fallback for a validation error without a known field: %s',async field=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:`Invalid request fields: ${field}`}),{status:422})));
  await expect(api('/pools',json('POST',{}))).rejects.toMatchObject({message:'Проверьте правильность заполнения формы.'});
 });
 it('keeps known field labels when the server also reports an unknown field',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Invalid request fields: hostname, request'}),{status:422})));
  await expect(api('/pools',json('POST',{}))).rejects.toMatchObject({message:'Проверьте поле «DNS-имя». Проверьте остальные данные формы.'});
 });
 it('preserves other validation reasons from the server',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Subscription URL must use HTTPS'}),{status:422})));
  await expect(api('/subscriptions/preview',json('POST',{}))).rejects.toMatchObject({status:422,message:'Subscription URL must use HTTPS'});
 });
});
