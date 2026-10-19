import type {ProbeProfile} from './types';

export function validateALPN(value:unknown,security:string):string[] {
 if(!Array.isArray(value)||value.length>16||value.some(item=>typeof item!=='string'||!(/^[\x21-\x7e]{1,255}$/).test(item)||item.includes(',')||item.toLowerCase()==='frommitm'))throw new Error('ALPN: укажите до 16 непустых протоколов через запятую, например h2,http/1.1.');
 if(value.length&&security!=='tls')throw new Error('ALPN задаётся только для TLS. В REALITY параметры согласования определяет fingerprint.');
 return value;
}
export function parseALPN(value:string,security:string):string[]|undefined {
 if(!value.trim())return undefined;
 return validateALPN(value.split(',').map(item=>item.trim()),security);
}
export function profileWithALPN(profile:ProbeProfile,value:string):ProbeProfile {
 const {alpn:_,...base}=profile;
 const alpn=parseALPN(value,profile.security);
 return alpn?{...base,alpn}:base;
}
