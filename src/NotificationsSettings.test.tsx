import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NotificationsSettings,telegramPayload} from './NotificationsSettings';

describe('Telegram notification settings',()=>{
 it.each(['123456789','-1001234567890123','-123456789'])('preserves the full chat ID %s as a string',chat=>{
  expect(telegramPayload(' 123:secret_token ',` ${chat} `)).toEqual({bot_token:'123:secret_token',chat_id:chat});
 });
 it('omits an empty token so saved credentials can be reused',()=>{
  expect(telegramPayload(' ','-1001234567890')).toEqual({chat_id:'-1001234567890'});
 });
 it.each(['','0','-0','1.5','abc','1e12','+123','123 456'])('rejects an invalid chat ID %s',chat=>{
  expect(()=>telegramPayload('123:secret',chat)).toThrow('Chat ID');
 });
 it('rejects a malformed token before submitting it',()=>{
  expect(()=>telegramPayload('invalid','123')).toThrow('токен');
 });
 it('shows a separate notifications section while loading',()=>{
  const html=renderToStaticMarkup(<NotificationsSettings onAuthError={()=>''}/>);
  expect(html).toContain('Уведомления');
  expect(html).toContain('Отключение и восстановление хостов');
  expect(html).toContain('Загрузка настроек');
 });
});
