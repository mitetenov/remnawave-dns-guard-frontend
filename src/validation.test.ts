import {expect,it} from 'vitest';
import {validationMessage} from './validation';

it('uses the UpCloud token field label for validation errors',()=>{
 expect(validationMessage('Invalid request fields: upcloud_token','/replacements/settings'))
  .toBe('Проверьте поле «API-токен UpCloud».');
});
