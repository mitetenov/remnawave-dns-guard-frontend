import type {HysteriaCongestion,ProbeProfile} from './types';
import {parseALPN,validateALPN} from './alpn';
import {parseXHTTPExtra,validateXHTTPExtra} from './xhttpExtra';
const URI_PARAMETERS=new Set(['security','type','sni','serverName','pbk','sid','flow','fp','path','host','mode','encryption','extra','alpn']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const blankProfile=():ProbeProfile=>({port:443,uuid:'',transport:'tcp',security:'reality',server_name:'',public_key:'',short_id:'',flow:'',fingerprint:'chrome',path:'/',host:'',xhttp_mode:'auto'});
export function profileForProtocol(p:ProbeProfile,protocol:'vless'|'hysteria2'):ProbeProfile {
 const base={...blankProfile(),port:p.port,server_name:p.server_name};
 return protocol==='hysteria2'?{...base,protocol,transport:'udp',security:'tls',password:''}:base;
}
export function validateProfile(p:ProbeProfile):ProbeProfile {
 if(!Number.isInteger(p.port)||p.port<1||p.port>65535) throw new Error('Порт должен быть целым числом от 1 до 65535.');
 if(p.protocol==='hysteria2')return validateHysteriaProfile(p);
 if(p.protocol!==undefined&&p.protocol!=='vless')throw new Error('Неподдерживаемый протокол проверки.');
 if(p.password||p.obfs||p.obfs_password||p.pin_sha256||p.hysteria_congestion!==undefined)throw new Error('Параметры Hysteria2 нельзя использовать в профиле VLESS.');
 if(!UUID.test(p.uuid)) throw new Error('Укажите корректный UUID пользователя VLESS.');
 if(!['tcp','xhttp'].includes(p.transport)) throw new Error('Поддерживаются только TCP / RAW и XHTTP.');
 if(!['reality','tls'].includes(p.security)) throw new Error('Поддерживаются только REALITY и TLS.');
 if(!p.server_name.trim()||/[\s/@?#]/.test(p.server_name)) throw new Error('Укажите корректное имя сервера (SNI).');
 if(p.security==='reality'&&!/^[A-Za-z0-9_-]{43}$/.test(p.public_key)) throw new Error('Для REALITY нужен публичный ключ из 43 символов base64url.');
 if(p.security==='reality'&&!/^(?:[0-9a-fA-F]{2}){0,8}$/.test(p.short_id)) throw new Error('Short ID должен содержать чётное число hex-символов (не более 16).');
 if(!['','xtls-rprx-vision'].includes(p.flow)) throw new Error('Поддерживается только flow xtls-rprx-vision или пустое значение.');
 if(p.transport==='xhttp'&&p.flow) throw new Error('XHTTP не поддерживает flow. Оставьте поле пустым.');
 if(!['chrome','firefox','safari','ios','android','edge','360','qq','random','randomized'].includes(p.fingerprint)) throw new Error('Неподдерживаемый fingerprint. Выберите поддерживаемый вариант.');
 if(!['auto','packet-up','stream-up','stream-one'].includes(p.xhttp_mode)) throw new Error('Неподдерживаемый режим XHTTP.');
 if(p.transport==='xhttp'&&!p.path.startsWith('/')) throw new Error('Путь XHTTP должен начинаться с /.');
 if(p.xhttp_extra!==undefined)validateXHTTPExtra(p.xhttp_extra,p.transport,p.xhttp_mode);
 if(p.alpn!==undefined)validateALPN(p.alpn,p.security);
 return p;
}
function validateHysteriaProfile(p:ProbeProfile):ProbeProfile {
 if(p.transport!=='udp'||p.security!=='tls')throw new Error('Hysteria2 использует UDP / QUIC и TLS.');
 if(!p.server_name||p.server_name.length>253||p.server_name.split('.').some(label=>!(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i).test(label)))throw new Error('Укажите корректное имя сервера (SNI).');
 if([p.password||'',p.obfs_password||''].some(value=>[...value].length>2048||/[\x00-\x1f\x7f]/.test(value)))throw new Error('Пароль: до 2048 символов без управляющих символов.');
 if(!['','salamander'].includes(p.obfs||''))throw new Error('Поддерживается только обфускация Salamander.');
 if(Boolean(p.obfs)!==Boolean(p.obfs_password))throw new Error('Для Salamander укажите пароль обфускации.');
 if(p.pin_sha256&&!/^[a-f0-9]{64}$/i.test(p.pin_sha256))throw new Error('SHA-256 сертификата должен содержать 64 hex-символа.');
 if(p.hysteria_congestion!==undefined&&!isHysteriaCongestion(p.hysteria_congestion))throw new Error('Алгоритм QUIC: выберите BBR, Reno или Brutal.');
 if(p.alpn!==undefined){validateALPN(p.alpn,'tls');if(p.alpn.length&&(p.alpn.length!==1||p.alpn[0]!=='h3'))throw new Error('Hysteria2 поддерживает только ALPN h3.');}
 if(p.uuid||p.public_key||p.short_id||p.flow||p.host||p.xhttp_extra!==undefined||!['','chrome'].includes(p.fingerprint)||!['','/'].includes(p.path)||!['','auto'].includes(p.xhttp_mode))throw new Error('Уберите параметры VLESS / XHTTP из профиля Hysteria2.');
 return p;
}
export function parseProfileURI(value:string):ProbeProfile {
 return /^(hysteria2|hy2):\/\//i.test(value.trim())?parseHysteria2(value):parseVless(value);
}
function isHysteriaCongestion(value:unknown):value is HysteriaCongestion {
 return value==='bbr'||value==='reno'||value==='brutal';
}
function isObject(value:unknown):value is Record<string,unknown> {
 return typeof value==='object'&&value!==null&&!Array.isArray(value);
}
function parseHysteriaCongestion(value:string):HysteriaCongestion|undefined {
 let finalmask:unknown;
 if(value.length>4096)throw new Error('Параметр fm слишком большой.');
 try{finalmask=JSON.parse(value);}catch{throw new Error('Параметр fm должен содержать корректный JSON.');}
 if(!isObject(finalmask)||Object.keys(finalmask).some(key=>key!=='quicParams'))throw new Error('В параметре fm поддерживаются только настройки quicParams.');
 if(!Object.hasOwn(finalmask,'quicParams'))return undefined;
 const quic=finalmask.quicParams;
 if(!isObject(quic)||Object.keys(quic).some(key=>key!=='congestion'&&key!=='debug')||Object.hasOwn(quic,'debug')&&quic.debug!==false){
  throw new Error('В fm.quicParams поддерживаются только congestion и debug: false.');
 }
 if(quic.congestion===undefined||quic.congestion==='')return undefined;
 if(!isHysteriaCongestion(quic.congestion))throw new Error('Параметр fm: поддерживаются алгоритмы QUIC bbr, reno и brutal.');
 return quic.congestion;
}
export function parseHysteria2(value:string):ProbeProfile {
 let uri:URL;
 try{uri=new URL(value.trim());}catch{throw new Error('Не удалось прочитать Hysteria2-ссылку. Используйте hysteria2://пароль@сервер:порт с одним портом.');}
 if(!['hysteria2:','hy2:'].includes(uri.protocol)||!uri.hostname||!['','/'].includes(uri.pathname))throw new Error('Ожидается hysteria2://пароль@сервер:порт или hy2://пароль@сервер:порт.');
 const q=uri.searchParams,allowed=new Set(['sni','obfs','obfs-password','insecure','pinSHA256','alpn','fm']);
 for(const key of new Set(q.keys())){
  if(q.getAll(key).length>1)throw new Error(`Параметр ${key} указан несколько раз.`);
  if(!allowed.has(key))throw new Error(`Параметр «${key}» не поддерживается профилем Hysteria2.`);
 }
 const pin=(q.get('pinSHA256')||'').replaceAll(':','').toLowerCase();
 if(q.has('pinSHA256')&&!/^[a-f0-9]{64}$/.test(pin))throw new Error('SHA-256 сертификата должен содержать 64 hex-символа.');
 if(q.has('insecure')&&!['0','1'].includes(q.get('insecure')!))throw new Error('Параметр insecure должен быть 0 или 1.');
 if(q.get('insecure')==='1'&&!pin)throw new Error('Эта версия Xray требует проверки сертификата. Для самоподписанного сертификата добавьте pinSHA256.');
 const authority=value.trim().split('://')[1].split(/[/?#]/)[0];
 const userinfoEnd=authority.lastIndexOf('@');
 const hasPassword=userinfoEnd>=0&&authority.slice(0,userinfoEnd).includes(':');
 let password:string;
 try{password=decodeURIComponent(uri.username)+(hasPassword?':'+decodeURIComponent(uri.password):'');}catch{throw new Error('Не удалось прочитать пароль Hysteria2.');}
 const profile:ProbeProfile={...profileForProtocol(blankProfile(),'hysteria2'),port:Number(uri.port||443),password,server_name:q.get('sni')||uri.hostname};
 if(q.has('obfs'))profile.obfs=q.get('obfs') as ProbeProfile['obfs'];
 if(q.has('obfs-password'))profile.obfs_password=q.get('obfs-password')!;
 if(pin)profile.pin_sha256=pin;
 if(q.has('fm')){
  const congestion=parseHysteriaCongestion(q.get('fm')!);
  if(congestion!==undefined)profile.hysteria_congestion=congestion;
 }
 if(q.has('alpn')){const alpn=parseALPN(q.get('alpn')!,'tls');if(alpn)profile.alpn=alpn;}
 return validateProfile(profile);
}
export function parseVless(value:string):ProbeProfile {
 let uri:URL;
 try {uri=new URL(value.trim());} catch {throw new Error('Не удалось прочитать ссылку. Ожидается vless://UUID@адрес:порт?...');}
 if(uri.protocol!=='vless:') throw new Error('Поддерживаются только ссылки vless://.');
 if(uri.password) throw new Error('VLESS не поддерживает пароль в ссылке.');
 const q=uri.searchParams;
 for(const key of new Set(q.keys())) if(q.getAll(key).length>1) throw new Error(`Параметр ${key} указан несколько раз.`);
 const transport=q.get('type')||'tcp';
 if(!['tcp','raw','xhttp'].includes(transport)) throw new Error(`Транспорт «${transport}» не поддерживается. Используйте TCP / RAW или XHTTP.`);
 const security=q.get('security')||'';
 if(!['reality','tls'].includes(security)) throw new Error('В ссылке должен быть security=reality или security=tls.');
 if(q.get('encryption')&&q.get('encryption')!=='none') throw new Error('Поддерживается только encryption=none.');
 const unsupported=[...new Set(q.keys())].filter(key=>!URI_PARAMETERS.has(key));
 if(unsupported.length)throw new Error(unsupported.length===1?`Параметр «${unsupported[0]}» не поддерживается профилем проверки. Используйте ручную настройку, если он не нужен вашему подключению.`:`Параметры ${unsupported.map(key=>`«${key}»`).join(', ')} не поддерживаются профилем проверки. Используйте ручную настройку, только если они не нужны вашему подключению.`);
 if(q.get('sni')&&q.get('serverName')&&q.get('sni')!==q.get('serverName')) throw new Error('Параметры sni и serverName противоречат друг другу.');
 const profile:ProbeProfile={port:Number(uri.port),uuid:decodeURIComponent(uri.username),transport:transport==='xhttp'?'xhttp':'tcp',security:security as ProbeProfile['security'],server_name:q.get('sni')||q.get('serverName')||'',public_key:q.get('pbk')||'',short_id:q.get('sid')||'',flow:q.get('flow')||'',fingerprint:q.get('fp')||'chrome',path:q.get('path')||'/',host:q.get('host')||'',xhttp_mode:q.get('mode')||'auto'};
 if(!uri.hostname||!uri.port) throw new Error('В ссылке нужны адрес сервера и явный порт.');
 if(q.has('extra'))profile.xhttp_extra=parseXHTTPExtra(q.get('extra')!,profile.transport,profile.xhttp_mode);
 const alpn=q.has('alpn')?parseALPN(q.get('alpn')!,profile.security):undefined;
 if(alpn)profile.alpn=alpn;
 return validateProfile(profile);
}
export function isPublicIPv4(value:string):boolean {
 const p=value.split('.'); if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255||String(Number(x))!==x)) return false;
 const [a,b,c]=p.map(Number);
 if(value==='192.0.0.9'||value==='192.0.0.10')return true;
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0&&(c===0||c===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
