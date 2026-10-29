import {useEffect,useState,type FormEvent} from 'react';
import {Bell,Check,CheckCircle2,LoaderCircle,Send,TriangleAlert} from 'lucide-react';
import {api,json} from './api';

export interface TelegramSettings {enabled:boolean;bot_token_configured:boolean;chat_id:string}

export function telegramPayload(token:string,chat:string){
 const chatID=chat.trim();
 if(!/^-?[1-9]\d*$/.test(chatID))throw new Error('Введите числовой Chat ID: для ЛС — положительный, для группы — отрицательный, например -1001234567890.');
 const botToken=token.trim();
 if(botToken&&!/^\d+:[A-Za-z0-9_-]+$/.test(botToken))throw new Error('Проверьте токен бота: ожидается формат 123456:ABC…');
 return {chat_id:chatID,...(botToken?{bot_token:botToken}:{})};
}

export function NotificationsSettings({onAuthError}:{onAuthError:(error:unknown)=>string}){
 const [settings,setSettings]=useState<TelegramSettings|null>(null),[token,setToken]=useState(''),[chat,setChat]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;api<TelegramSettings>('/notifications/telegram').then(value=>{if(active){setSettings(value);setChat(value.chat_id);}}).catch(err=>{if(active)setError(onAuthError(err));});return()=>{active=false;};},[onAuthError]);
 async function save(event:FormEvent){
  event.preventDefault();if(!settings)return;setBusy('save');setError('');setMessage('');
  try{const value=await api<TelegramSettings>('/notifications/telegram',json('PUT',{...telegramPayload(token,chat),enabled:settings.bot_token_configured?settings.enabled:true}));setSettings(value);setChat(value.chat_id);setToken('');setMessage('Настройки Telegram сохранены.');}catch(err){setError(onAuthError(err));}finally{setBusy('');}
 }
 async function toggle(){
  if(!settings)return;setBusy('toggle');setError('');setMessage('');
  try{const value=await api<TelegramSettings>('/notifications/telegram',json('PUT',{enabled:!settings.enabled}));setSettings(value);setMessage(value.enabled?'Уведомления включены.':'Уведомления выключены. Токен и чат сохранены.');}catch(err){setError(onAuthError(err));}finally{setBusy('');}
 }
 async function test(){
  setBusy('test');setError('');setMessage('');
  try{const result=await api<{message:string}>('/notifications/telegram/test',json('POST',telegramPayload(token,chat)));setMessage(result.message);}catch(err){setError(onAuthError(err));}finally{setBusy('');}
 }
 const configured=!!settings?.bot_token_configured&&!!settings.chat_id;
 return <form className="panel notification-settings" onSubmit={save}>
  <div className="panel-heading"><div><h2><Bell size={17}/> Уведомления</h2><p>Отключение и восстановление хостов</p></div></div>
  {error&&<div className="error-box" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
  {!settings?<div className="settings-section">{!error&&<span className="loading-label"><LoaderCircle className="spin" size={17}/>Загрузка настроек…</span>}</div>:<>
   <div className="settings-section">
    <div className="settings-section-header"><div className="integration-icon telegram"><Send size={23}/></div><div><h3>Telegram</h3><p>{configured?(settings.enabled?'Уведомления включены':'Уведомления на паузе'):'Подключите бота и выберите чат'}</p></div><button type="button" role="switch" aria-label="Уведомления Telegram" aria-checked={settings.enabled} className={`notification-switch ${settings.enabled?'on':''}`} onClick={()=>void toggle()} disabled={!!busy||!configured}><span/></button></div>
    <label className="field"><span>Токен бота</span><input type="password" autoComplete="new-password" value={token} onChange={e=>{setToken(e.target.value);setMessage('');}} placeholder={settings.bot_token_configured?'Токен сохранён · введите новый для замены':'123456789:ABC…'} disabled={!!busy}/><small>Создайте бота через <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a>. Пустое поле сохраняет текущий токен.</small></label>
    <label className="field"><span>Chat ID</span><input type="text" value={chat} onChange={e=>{setChat(e.target.value);setMessage('');}} placeholder="123456789 или -1001234567890" autoComplete="off" spellCheck={false} required disabled={!!busy}/><small>Для ЛС укажите свой положительный Chat ID и нажмите «Старт» у бота. Для группы укажите отрицательный ID (например, -100…) и добавьте бота с правом отправлять сообщения.</small></label>
    <button type="button" className="button secondary" onClick={()=>void test()} disabled={!!busy||!(token.trim()||settings.bot_token_configured)||!chat.trim()}>{busy==='test'?<><LoaderCircle className="spin" size={16}/>Отправка…</>:<><Send size={16}/>Отправить тестовое сообщение</>}</button>
    {message&&<div className="inline-success" role="status"><CheckCircle2 size={17}/><span>{message}</span></div>}
    <p className="notification-help">Уведомления об отключении приходят при переходе в «Исключён» или «Отключён вручную». О восстановлении в «Доступен» — только после реального отключения. Возврат свежих данных и промежуточные статусы не создают сообщений. В сообщении — имя и IP хоста, пул, предыдущий и новый статус. Повторные проверки с тем же статусом не создают уведомлений. Переключатель сразу ставит уведомления на паузу, сохраняя токен и чат.</p>
   </div>
   <div className="settings-save"><span>{configured?'Тест использует введённые данные без сохранения.':'Сохранение подключит Telegram и включит уведомления.'}</span><button className="button primary" disabled={!!busy||!(token.trim()||settings.bot_token_configured)||!chat.trim()}>{busy==='save'?<><LoaderCircle className="spin" size={17}/>Сохранение…</>:<><Check size={17}/>Сохранить Telegram</>}</button></div>
  </>}
 </form>;
}
