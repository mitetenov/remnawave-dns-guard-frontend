export class ApiError extends Error { constructor(public status:number,message:string) {super(message);this.name='ApiError';} }
export async function api<T>(path:string,options:RequestInit={}):Promise<T> {
  let response:Response;
  try { response=await fetch(`/api${path}`,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'DNSGuard',...options.headers}}); }
  catch {throw new ApiError(0,'Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok) {const detail=body?.detail;throw new ApiError(response.status,typeof detail==='string'?detail:response.status===401?'Сессия завершена. Войдите снова.':`Сервер вернул ошибку ${response.status}. Повторите попытку.`);}
  return body as T;
}
export const json=(method:string,body?:unknown):RequestInit=>({method,...(body===undefined?{}:{body:JSON.stringify(body)})});
