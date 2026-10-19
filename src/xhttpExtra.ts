import type {ProbeProfile} from './types';

const MAX_BYTES=16*1024;
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const integer=(value:unknown,bits=64)=>typeof value==='number'&&Number.isSafeInteger(value)&&(bits===64||value>=-2147483648&&value<=2147483647);
const text=(value:unknown):value is string=>typeof value==='string'&&!/[\x00-\x1f\x7f]/.test(value);
function range(value:unknown):[number,number]|null {
 if(value===null||value==='')return [0,0];
 if(integer(value,32))return [Number(value),Number(value)];
 if(typeof value!=='string')return null;
 const match=/^(-?[0-9]+)(?:-(-?[0-9]+))?$/.exec(value);
 if(!match)return null;
 const lo=Number(match[1]),hi=Number(match[2]??match[1]);
 return integer(lo,32)&&integer(hi,32)?[Math.min(lo,hi),Math.max(lo,hi)]:null;
}

// Match SplitHTTPConfig in the pinned Xray v26.3.27 and both Go validators.
// Keep extra nested: Xray takes host/path/mode from the surrounding settings.
export function validateXHTTPExtra(value:unknown,transport:string,mode:string):Record<string,unknown> {
 const fail=(key='JSON'):never=>{throw new Error(`Некорректный XHTTP extra: ${key}.`);};
 if(transport!=='xhttp')throw new Error('Параметр extra доступен только для XHTTP.');
 const wire=JSON.stringify(value)?.replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(!object(value)||new TextEncoder().encode(wire).length>MAX_BYTES)fail('нужен JSON-объект до 16 КиБ');
 const fields=value as Record<string,unknown>;
 for(const [key,item] of Object.entries(fields)) {
  if(key==='downloadSettings') {
   if(item!==null)throw new Error('XHTTP extra: downloadSettings с отдельным подключением не поддерживается проверкой IP узла.');
   continue;
  }
  switch(key) {
   case 'host':case 'path':case 'mode':case 'xPaddingKey':case 'xPaddingHeader':case 'xPaddingPlacement':case 'xPaddingMethod':case 'uplinkHTTPMethod':case 'sessionPlacement':case 'sessionKey':case 'seqPlacement':case 'seqKey':case 'uplinkDataPlacement':case 'uplinkDataKey': {
    if(item===null)break;
    if(!text(item))fail(key);
    const s=item as string;
    if(key==='xPaddingPlacement'&&!['','cookie','header','query','queryInHeader'].includes(s)||key==='xPaddingMethod'&&!['','repeat-x','tokenish'].includes(s)||['sessionPlacement','seqPlacement'].includes(key)&&!['','path','cookie','header','query'].includes(s)||key==='uplinkDataPlacement'&&(!['','auto','body','header','cookie'].includes(s)||['header','cookie'].includes(s)&&mode!=='packet-up')||key==='uplinkHTTPMethod'&&s.toUpperCase()==='GET'&&mode!=='packet-up')fail(key);
    break;
   }
   case 'xPaddingBytes':case 'uplinkChunkSize':case 'scMaxEachPostBytes':case 'scMinPostsIntervalMs':case 'scStreamUpServerSecs': {
    const bounds=range(item);
    if(!bounds||key==='xPaddingBytes'&&bounds.some(n=>n!==0)&&bounds.some(n=>n<=0))fail(key);
    break;
   }
   case 'scMaxBufferedPosts':case 'serverMaxHeaderBytes':
    if(item!==null&&(!integer(item,key==='serverMaxHeaderBytes'?32:64)||key==='serverMaxHeaderBytes'&&Number(item)<0))fail(key);
    break;
   case 'xPaddingObfsMode':case 'noGRPCHeader':case 'noSSEHeader':
    if(item!==null&&typeof item!=='boolean')fail(key);
    break;
   case 'headers':
    if(item===null)break;
    if(!object(item))fail(key);
    for(const [name,value] of Object.entries(item as Record<string,unknown>))if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||name.toLowerCase()==='host'||value!==null&&!text(value))fail('headers');
    break;
   case 'xmux': {
    if(item===null)break;
    if(!object(item))fail(key);
    let concurrency=0,connections=0;
    for(const [name,value] of Object.entries(item as Record<string,unknown>)) {
     if(name==='hKeepAlivePeriod') {if(value!==null&&!integer(value))fail('xmux.'+name);}
     else {
      if(!['maxConcurrency','maxConnections','cMaxReuseTimes','hMaxRequestTimes','hMaxReusableSecs'].includes(name))fail('xmux.'+name);
      const bounds=range(value);if(!bounds)fail('xmux.'+name);
      if(name==='maxConcurrency')concurrency=bounds![1];if(name==='maxConnections')connections=bounds![1];
     }
    }
    if(concurrency>0&&connections>0)fail('xmux: задайте maxConcurrency или maxConnections');
    break;
   }
   default:fail('неподдерживаемый параметр '+key);
  }
 }
 return fields;
}

export function parseXHTTPExtra(value:string,transport:string,mode:string):Record<string,unknown> {
 let parsed:unknown;
 try {parsed=JSON.parse(value);}catch {throw new Error('XHTTP extra должен содержать корректный JSON-объект.');}
 return validateXHTTPExtra(parsed,transport,mode);
}

export function profileWithExtra(profile:ProbeProfile,text:string):ProbeProfile {
 const {xhttp_extra:_,...base}=profile;
 return profile.transport==='xhttp'&&text.trim()?{...base,xhttp_extra:parseXHTTPExtra(text,profile.transport,profile.xhttp_mode)}:base;
}
