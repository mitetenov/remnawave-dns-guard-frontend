import {describe,expect,it} from 'vitest';
import fixtures from './testdata/profile-alpn.json';
import {parseALPN,profileWithALPN,validateALPN} from './alpn';
import {parseVless,validateProfile} from './profile';
import {subscriptionServers} from './subscription';
import type {ProbeProfile} from './types';

const expected=fixtures.profile as ProbeProfile;
// Reproduce the reported subscription settings with synthetic credentials/host.
const query=new URLSearchParams({encryption:'none',type:'xhttp',path:expected.path,host:expected.host,mode:expected.xhttp_mode,extra:JSON.stringify(expected.xhttp_extra),security:'tls',sni:expected.server_name,fp:'firefox',alpn:'h2,http/1.1'});
const uri=`vless://${expected.uuid}@edge.example.com:443?${query}#LTE%20test`;
describe('ALPN import and preservation',()=>{
 it('imports all reported XHTTP TLS parameters in one pass',()=>{
  expect(parseVless(uri)).toEqual(expected);
  const [server]=subscriptionServers([uri]);
  expect(server.error).toBe('');expect(server.profile).toEqual(expected);
  expect(JSON.parse(JSON.stringify(validateProfile(server.profile!)))).toEqual(expected);
 });
 it.each(fixtures.valid.map(value=>({value})))('keeps valid ordered TLS ALPN $value',({value})=>expect(validateALPN(value,'tls')).toEqual(value));
 it.each(fixtures.invalid.map(value=>({value})))('rejects malformed ALPN $value',({value})=>expect(()=>validateALPN(value,'tls')).toThrow('ALPN'));
 it('preserves order and slash decoding, trims manual whitespace and omits empty ALPN',()=>{
  expect(parseVless(uri.replace('h2%2Chttp%2F1.1','http%2F1.1%2Ch2')).alpn).toEqual(['http/1.1','h2']);
  expect(parseALPN(' h2, http/1.1 ','tls')).toEqual(['h2','http/1.1']);
  expect(profileWithALPN(expected,'http/1.1').alpn).toEqual(['http/1.1']);
  expect(profileWithALPN(expected,' ')).not.toHaveProperty('alpn');
  expect(parseVless(uri.replace('&alpn=h2%2Chttp%2F1.1',''))).not.toHaveProperty('alpn');
  expect(parseVless(uri.replace('alpn=h2%2Chttp%2F1.1','alpn='))).not.toHaveProperty('alpn');
 });
 it('supports TCP TLS and reports duplicate or unsupported-context ALPN',()=>{
  const tcp=new URL(uri);tcp.searchParams.set('type','tcp');tcp.searchParams.delete('extra');
  expect(parseVless(tcp.href).alpn).toEqual(expected.alpn);
  expect(()=>parseVless(uri.replace('#LTE%20test','&alpn=h3#LTE%20test'))).toThrow('несколько раз');
  expect(()=>validateALPN(['h2'],'reality')).toThrow('только для TLS');
  expect(()=>validateALPN(Array(17).fill('h2'),'tls')).toThrow('ALPN');
  expect(()=>validateALPN(['x'.repeat(256)],'tls')).toThrow('ALPN');
 });
 it('reports all unknown parameter names without their secret values',()=>{
  try {parseVless(uri.replace('#LTE%20test','&unknownOne=private-one&unknownTwo=private-two#LTE%20test'));throw new Error('expected rejection');}
  catch(error){const message=(error as Error).message;expect(message).toContain('«unknownOne», «unknownTwo»');expect(message).not.toContain('private-one');expect(message).not.toContain('private-two');}
 });
});
