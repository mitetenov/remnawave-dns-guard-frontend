import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PoolDetail,PoolTable,TargetForm,TargetDeleteModal} from './App';
import {TargetCards} from './TargetCards';
import type {Pool,Target} from './types';

const pool={id:'pool-1',failure_threshold:3,recovery_threshold:5,name:'Germany',hostname:'vpn.example.com',automation_enabled:false,profile_configured:true} as Pool;
const target={id:'target-1',failures:0,successes:0,name:'Germany 01',ip:'1.1.1.1',manual_enabled:true,status:'unknown',last_checked_at:null,last_latency_ms:null} as Target;
const noop=()=>{};
const saved=async()=>{};
const statusNames={unknown:'Ожидает проверки'} as Record<Target['status'],string>;

describe('pool deletion and target editing controls',()=>{
 it('offers pool deletion in the pool list',()=>{
  const view=renderToStaticMarkup(<PoolTable pools={[pool]} onSelect={noop} onEdit={noop} onDelete={noop} onToggle={noop} onCreate={noop} busy={new Set()}/>);
  expect(view).toContain('aria-label="Удалить пул"');
 });
 it('offers pool deletion and node editing in the pool details',()=>{
  const view=renderToStaticMarkup(<PoolDetail pool={pool} targets={[target]} targetsLoading={false} busy={new Set()} onEdit={noop} onDelete={noop} onProfile={noop} onAdd={noop} onImport={noop} onToggle={noop} onSync={noop} onCheck={noop} onTargetAction={noop}/>);
  expect(view).toContain('Удалить пул');
  expect(view).toContain('aria-label="Редактировать узел"');
 });
 it.each([true,false])('offers mobile editing for manual_enabled=%s',manual_enabled=>{
  const view=renderToStaticMarkup(<TargetCards pool={pool} targets={[{...target,manual_enabled}]} statusNames={statusNames} busy={new Set()} onAction={noop}/>);
  expect(view).toContain('Редактировать');
 });
 it('blocks mobile changes while an IP replacement is pending',()=>{
  const view=renderToStaticMarkup(<TargetCards pool={pool} targets={[{...target,dns_pending_action:'replace_ip'}]} statusNames={statusNames} busy={new Set()} onAction={noop}/>);
  const buttons=view.match(/<footer>([\s\S]*?)<\/footer>/)![1].match(/<button\b[^>]*>/g);
  expect(buttons).toHaveLength(3);
  expect(buttons!.every(button=>button.includes('disabled'))).toBe(true);
 });
 it('keeps DNS deletion unchecked and clearly preserves the record by default',()=>{
  const view=renderToStaticMarkup(<TargetDeleteModal target={target} onClose={noop} onDeleted={saved} onFailure={saved}/>);
  const checkbox=view.match(/<input\b[^>]*type="checkbox"[^>]*>/)?.[0];
  expect(checkbox).toBeDefined();
  expect(checkbox).not.toContain('checked');
  expect(view).toContain('Удалить также A-запись');
  expect(view).toContain('A-запись в Cloudflare сохранится.');
  expect(view).not.toContain('Последнюю A-запись удалить нельзя.');
 });
 it('prefills the edit form and explains the DNS replacement',()=>{
  const view=renderToStaticMarkup(<TargetForm pool={pool} target={target} onClose={noop} onSaved={saved} onFailure={saved}/>);
  expect(view).toContain('Редактировать узел');
  expect(view).toContain('value="Germany 01"');
  expect(view).toContain('value="1.1.1.1"');
  expect(view).toContain('Сохранить изменения');
  expect(view).toContain('новая A-запись будет подтверждена до удаления старой');
 });
 it('keeps the add form empty and uses creation wording',()=>{
  const view=renderToStaticMarkup(<TargetForm pool={pool} onClose={noop} onSaved={saved} onFailure={saved}/>);
  expect(view).toContain('Добавить и создать A-запись');
  expect(view).not.toContain('value="Germany 01"');
  expect(view).not.toContain('Сохранить изменения');
 });
});
