import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TargetDNS} from './TargetDNS';
import type {Target} from './types';

const target={dns_present:true,dns_uncertain:false,dns_pending_action:null,dns_error:null,dns_checked_at:null,dns_drift:false} as Target;
describe('DNS confirmation',()=>{
 it('never presents a pending removal as verified DNS',()=>{
  const view=renderToStaticMarkup(<TargetDNS target={{...target,dns_pending_action:'disable'}}/>);
  expect(view).toContain('Ожидает подтверждения');expect(view).not.toContain('В DNS');
 });
 it('shows uncertainty after an API timeout',()=>{
  expect(renderToStaticMarkup(<TargetDNS target={{...target,dns_uncertain:true}}/>)).toContain('DNS не подтверждён');
 });
 it('separates observed drift from verified presence',()=>{
  const view=renderToStaticMarkup(<TargetDNS target={{...target,dns_drift:true,dns_present:false}}/>);
  expect(view).toContain('Расхождение DNS');expect(view).toContain('записи нет');
 });
 it('marks only confirmed presence as present',()=>{
  expect(renderToStaticMarkup(<TargetDNS target={target}/>)).toContain('В DNS');
 });
});
