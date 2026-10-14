import {afterEach,describe,expect,it,vi} from 'vitest';
import {api,ApiError,json} from './api';
afterEach(()=>vi.unstubAllGlobals());
describe('same-origin API adapter',()=>{
 it('sends session cookies and required mutation header',async()=>{const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200}));vi.stubGlobal('fetch',fetch);await api('/targets/a/disable',json('POST'));expect(fetch).toHaveBeenCalledWith('/api/targets/a/disable',expect.objectContaining({method:'POST',credentials:'same-origin',headers:expect.objectContaining({'X-Requested-With':'DNSGuard','Content-Type':'application/json'})}));});
 it('preserves server reason for blocked final A-record deletion',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Cannot remove the last actual A record'}),{status:409})));await expect(api('/targets/a',json('DELETE'))).rejects.toEqual(new ApiError(409,'Cannot remove the last actual A record'));});
 it('does not fabricate successful results on network errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));await expect(api('/pools/a/check',json('POST'))).rejects.toMatchObject({status:0});});
 it('handles a non-JSON server error with its status',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('upstream unavailable',{status:502})));await expect(api('/overview')).rejects.toMatchObject({status:502});});
 it('reports expired sessions clearly',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:401})));await expect(api('/settings')).rejects.toMatchObject({status:401,message:'Сессия завершена. Войдите снова.'});});
});
