import type {ProbeProfile} from './types';
import {parseXHTTPExtra,validateXHTTPExtra} from './xhttpExtra';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const blankProfile=():ProbeProfile=>({port:443,uuid:'',transport:'tcp',security:'reality',server_name:'',public_key:'',short_id:'',flow:'',fingerprint:'chrome',path:'/',host:'',xhttp_mode:'auto'});
export function validateProfile(p:ProbeProfile):ProbeProfile {
 if(!Number.isInteger(p.port)||p.port<1||p.port>65535) throw new Error('Порт должен быть целым числом от 1 до 65535.');
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
 return p;
}
export function parseVless(value:string):ProbeProfile {
 let uri:URL;
 try {uri=new URL(value.trim());} catch {throw new Error('Не удалось прочитать ссылку. Ожидается vless://UUID@адрес:порт?...');}
 if(uri.protocol!=='vless:') throw new Error('Поддерживаются только ссылки vless://.');
 if(uri.password) throw new Error('VLESS не поддерживает пароль в ссылке.');
 const q=uri.searchParams;
 for(const key of ['security','type','sni','serverName','pbk','sid','flow','fp','path','host','mode','encryption','extra']) if(q.getAll(key).length>1) throw new Error(`Параметр ${key} указан несколько раз.`);
 const transport=q.get('type')||'tcp';
 if(!['tcp','raw','xhttp'].includes(transport)) throw new Error(`Транспорт «${transport}» не поддерживается. Используйте TCP / RAW или XHTTP.`);
 const security=q.get('security')||'';
 if(!['reality','tls'].includes(security)) throw new Error('В ссылке должен быть security=reality или security=tls.');
 if(q.get('encryption')&&q.get('encryption')!=='none') throw new Error('Поддерживается только encryption=none.');
 const supported=new Set(['security','type','sni','serverName','pbk','sid','flow','fp','path','host','mode','encryption','extra']);
 for(const [key] of q) if(!supported.has(key)) throw new Error(`Параметр «${key}» не поддерживается профилем проверки. Используйте ручную настройку, если он не нужен вашему подключению.`);
 if(q.get('sni')&&q.get('serverName')&&q.get('sni')!==q.get('serverName')) throw new Error('Параметры sni и serverName противоречат друг другу.');
 const profile:ProbeProfile={port:Number(uri.port),uuid:decodeURIComponent(uri.username),transport:transport==='xhttp'?'xhttp':'tcp',security:security as ProbeProfile['security'],server_name:q.get('sni')||q.get('serverName')||'',public_key:q.get('pbk')||'',short_id:q.get('sid')||'',flow:q.get('flow')||'',fingerprint:q.get('fp')||'chrome',path:q.get('path')||'/',host:q.get('host')||'',xhttp_mode:q.get('mode')||'auto'};
 if(!uri.hostname||!uri.port) throw new Error('В ссылке нужны адрес сервера и явный порт.');
 if(q.has('extra'))profile.xhttp_extra=parseXHTTPExtra(q.get('extra')!,profile.transport,profile.xhttp_mode);
 return validateProfile(profile);
}
export function isPublicIPv4(value:string):boolean {
 const p=value.split('.'); if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255||String(Number(x))!==x)) return false;
 const [a,b,c]=p.map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===192&&b===2||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
