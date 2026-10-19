import {describe,expect,it} from 'vitest';
import fixtures from './testdata/xhttp-extra.json';
import {parseVless,validateProfile} from './profile';
import {parseXHTTPExtra,profileWithExtra,validateXHTTPExtra} from './xhttpExtra';
import {subscriptionServers} from './subscription';

const base='vless://e764ae13-9e06-4e6d-a870-2898c984ca22@node.example.com:443?type=xhttp&security=tls&sni=tls.example.com&mode=stream-up&path=%2Fprobe&host=edge.example.com';
const extra=fixtures.valid[1];
describe('XHTTP extra across URI, subscription and manual editing',()=>{
 it.each(fixtures.valid)('preserves valid pinned-Xray settings: %j',value=>{
  expect(validateXHTTPExtra(value,'xhttp','stream-up')).toEqual(value);
  const profile=parseVless(base+'&extra='+encodeURIComponent(JSON.stringify(value)));
  expect(profile.xhttp_extra).toEqual(value);
  expect(profile.path).toBe('/probe');expect(profile.host).toBe('edge.example.com');
 });
 it.each(fixtures.invalid)('rejects malformed or unsafe extra: %j',value=>expect(()=>validateXHTTPExtra(value,'xhttp','stream-up')).toThrow('extra'));
 it('decodes once and keeps padding, headers and xmux on a selected subscription server',()=>{
  const [server]=subscriptionServers([base+'&extra='+encodeURIComponent(JSON.stringify(extra))+'#LTE']);
  expect(server.error).toBe('');expect(server.profile?.xhttp_extra).toEqual(extra);
  expect(server.profile).not.toHaveProperty('address');
  const body=JSON.parse(JSON.stringify(validateProfile(server.profile!)));
  expect(body.xhttp_extra).toEqual(extra);
  expect(body.xhttp_extra.headers['X-Token']).toBe('a+b%20c');
 });
 it('edits, clears and validates extra without retaining a previous value',()=>{
  const original=parseVless(base+'&extra='+encodeURIComponent(JSON.stringify(extra)));
  expect(profileWithExtra(original,'{"noSSEHeader":true}').xhttp_extra).toEqual({noSSEHeader:true});
  expect(profileWithExtra(original,' ')).not.toHaveProperty('xhttp_extra');
  expect(profileWithExtra({...original,transport:'tcp'},JSON.stringify(extra))).not.toHaveProperty('xhttp_extra');
  expect(()=>profileWithExtra(original,'{')).toThrow('JSON');
 });
 it('accepts mode-specific upload fields only for packet-up',()=>{
  const value={uplinkHTTPMethod:'GET',uplinkDataPlacement:'cookie'};
  expect(validateXHTTPExtra(value,'xhttp','packet-up')).toEqual(value);
  expect(()=>validateXHTTPExtra(value,'xhttp','auto')).toThrow();
 });
 it('rejects empty, double-encoded, oversized, duplicate and TCP extra',()=>{
  for(const value of ['',encodeURIComponent(JSON.stringify(extra)),'{"headers":{"X-Pad":"'+'a'.repeat(16384)+'"}}'])expect(()=>parseXHTTPExtra(value,'xhttp','auto')).toThrow();
  expect(()=>validateXHTTPExtra({headers:{'X-Pad':'<'.repeat(3000)}},'xhttp','auto')).toThrow('16 КиБ');
  expect(()=>parseVless(base+'&extra={}&extra={}')).toThrow('несколько раз');
  expect(()=>parseVless(base.replace('type=xhttp','type=tcp')+'&extra={}')).toThrow('только для XHTTP');
  expect(parseVless(base)).not.toHaveProperty('xhttp_extra');
 });
});
