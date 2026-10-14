import {describe,it,expect} from 'vitest';
import {parseVless,validateProfile,blankProfile,isPublicIPv4} from './profile';
const uuid='e764ae13-9e06-4e6d-a870-2898c984ca22';
const pbk='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
describe('VLESS profile parser',()=>{
 it('parses raw Reality while leaving server IP out of the shared profile',()=>{const p=parseVless(`vless://${uuid}@1.1.1.1:443?type=raw&security=reality&sni=example.com&pbk=${pbk}&sid=abcd&fp=chrome&flow=xtls-rprx-vision#node`);expect(p).toEqual({port:443,uuid,transport:'tcp',security:'reality',server_name:'example.com',public_key:pbk,short_id:'abcd',flow:'xtls-rprx-vision',fingerprint:'chrome',path:'/',host:'',xhttp_mode:'auto'});expect(p).not.toHaveProperty('ip');});
 it('parses URL-encoded XHTTP TLS fields',()=>{const p=parseVless(`vless://${uuid}@node.example.com:8443?type=xhttp&security=tls&sni=tls.example.com&path=%2Fapi%2Fprobe&host=edge.example.com&mode=stream-up&encryption=none`);expect(p.transport).toBe('xhttp');expect(p.path).toBe('/api/probe');expect(p.xhttp_mode).toBe('stream-up');expect(p.port).toBe(8443);});
 it.each(['ws','grpc','httpupgrade','h2'])('rejects unsupported transport %s',type=>expect(()=>parseVless(`vless://${uuid}@1.1.1.1:443?type=${type}&security=tls&sni=example.com`)).toThrow('не поддерживается'));
 it.each(['https://example.com','vless://bad@1.1.1.1:443?security=tls&sni=example.com',`vless://${uuid}@1.1.1.1?security=tls&sni=example.com`,`vless://${uuid}@1.1.1.1:443?security=none`,`vless://${uuid}@1.1.1.1:443?security=reality&sni=example.com`,`vless://${uuid}@1.1.1.1:443?security=tls&sni=example.com&allowInsecure=1`,`vless://${uuid}@1.1.1.1:443?security=tls&sni=example.com&type=tcp&type=xhttp`])('rejects malformed or unsupported URI %s',value=>expect(()=>parseVless(value)).toThrow());
 it('rejects XHTTP with Vision flow and malformed short ID',()=>{expect(()=>validateProfile({...blankProfile(),uuid,server_name:'example.com',public_key:pbk,transport:'xhttp',flow:'xtls-rprx-vision'})).toThrow('не поддерживает flow');expect(()=>validateProfile({...blankProfile(),uuid,server_name:'example.com',public_key:pbk,short_id:'abc'})).toThrow('Short ID');});
 it('requires TLS SNI and preserves explicit port',()=>{expect(()=>parseVless(`vless://${uuid}@1.1.1.1:443?security=tls`)).toThrow('SNI');expect(parseVless(`vless://${uuid}@1.1.1.1:12345?security=tls&sni=example.com`).port).toBe(12345);});
});
describe('public IPv4 input',()=>{
 it.each(['1.1.1.1','8.8.8.8','93.184.216.34'])('accepts %s',ip=>expect(isPublicIPv4(ip)).toBe(true));
 it.each(['localhost','node.example.com','::1','10.0.0.1','127.0.0.1','192.168.1.1','172.16.0.1','100.64.0.1','169.254.1.1','192.0.2.1','198.51.100.1','203.0.113.1','198.18.1.1','224.0.0.1','255.255.255.255','1.1.1.256','01.1.1.1'])('rejects %s',ip=>expect(isPublicIPv4(ip)).toBe(false));
});
