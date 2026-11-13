import {describe,expect,it} from 'vitest';
import {blankProfile,parseHysteria2,parseProfileURI,profileForProtocol,validateProfile} from './profile';
import {subscriptionServers} from './subscription';

describe('Hysteria2 profiles',()=>{
 it.each(['hysteria2','hy2'])('imports %s with authentication, SNI, Salamander and a certificate pin',scheme=>{
  const pin='ab'.repeat(32);
  const p=parseProfileURI(`${scheme}://user:p%40ss%3Aword@1.1.1.1:8443/?sni=edge.example.com&obfs=salamander&obfs-password=obfs%3Asecret&pinSHA256=${pin}&insecure=1#Node`);
  expect(p).toMatchObject({protocol:'hysteria2',port:8443,password:'user:p@ss:word',transport:'udp',security:'tls',server_name:'edge.example.com',obfs:'salamander',obfs_password:'obfs:secret',pin_sha256:pin});
  expect(p.uuid).toBe('');expect(p).not.toHaveProperty('ip');expect(p).not.toHaveProperty('address');
 });
 it('uses port 443 and hostname as SNI when omitted',()=>{
  expect(parseHysteria2('hy2://secret@edge.example.com')).toMatchObject({port:443,server_name:'edge.example.com',password:'secret'});
  expect(parseHysteria2('hy2://edge.example.com').password).toBe('');
  expect(parseHysteria2('hy2://edge.example.com:8443').password).toBe('');
  expect(parseHysteria2('hy2://user%3Asecret@edge.example.com').password).toBe('user:secret');
  expect(parseHysteria2('hy2://user:@edge.example.com').password).toBe('user:');
 });
 it('normalizes OpenSSL certificate hashes and accepts h3',()=>{
  const pin=Array(32).fill('AB').join(':');
  expect(parseHysteria2(`hy2://secret@edge.example.com?pinSHA256=${pin}&alpn=h3`).pin_sha256).toBe('ab'.repeat(32));
 });
 it.each([
  'hy2://secret@edge.example.com:0','hy2://secret@edge.example.com:65536',
  'hy2://secret@edge.example.com:443,8443','hy2://secret@edge.example.com/path',
  'hy2://secret@edge.example.com?sni=one&sni=two','hy2://secret@edge.example.com?obfs=gecko',
  'hy2://secret@edge.example.com?obfs=salamander','hy2://secret@edge.example.com?obfs-password=orphan',
  'hy2://secret@edge.example.com?alpn=h2','hy2://secret@edge.example.com?insecure=2',
  'hy2://secret@edge.example.com?pinSHA256=abcd','hy2://secret@edge.example.com?ech=unsupported',
  'hy2://secret%0Aheader@edge.example.com',
 ])('rejects unsupported connection parameters: %s',uri=>expect(()=>parseHysteria2(uri)).toThrow());
 it('explains how to use a self-signed certificate with the pinned Xray version',()=>{
  expect(()=>parseHysteria2('hy2://secret@edge.example.com?insecure=1')).toThrow('pinSHA256');
 });
 it('clears settings from the previous protocol',()=>{
  const vless={...blankProfile(),uuid:'550e8400-e29b-41d4-a716-446655440000',server_name:'edge.example.com',flow:'xtls-rprx-vision',public_key:'A'.repeat(43),alpn:[],xhttp_extra:{headers:{'X-Test':'test'}}};
  const hy2=profileForProtocol(vless,'hysteria2');
  expect(()=>validateProfile(hy2)).not.toThrow();
  expect(hy2).not.toHaveProperty('xhttp_extra');expect(hy2).not.toHaveProperty('alpn');expect(hy2.uuid).toBe('');expect(hy2.public_key).toBe('');
  const restored=profileForProtocol({...hy2,password:'secret',obfs:'salamander',obfs_password:'obfs'},'vless');
  expect(restored).not.toHaveProperty('password');expect(restored).not.toHaveProperty('obfs');expect(restored.transport).toBe('tcp');
 });
 it('lists Hysteria2 and VLESS together and isolates invalid entries',()=>{
  const servers=subscriptionServers(['hy2://secret@edge.example.com#Hysteria','vless://550e8400-e29b-41d4-a716-446655440000@edge.example.com:443?security=tls&sni=edge.example.com','hy2://secret@edge.example.com?obfs=unknown']);
  expect(servers[0]).toMatchObject({name:'Hysteria',profile:{protocol:'hysteria2'},error:''});
  expect(servers[1].profile?.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
  expect(servers[2].profile).toBeNull();
 });
});
