import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PoolTable} from './App';
import type {Pool} from './types';

const noop=()=>{};
function render(summary:Pool['target_summary']) {
 const pool={id:'pool-1',name:'Finland',hostname:'vpn.example.com',target_summary:summary} as Pool;
 return renderToStaticMarkup(<PoolTable pools={[pool]} onSelect={noop} onEdit={noop} onToggle={noop} onDelete={noop} onCreate={noop} busy={new Set()}/>);
}

describe('active DNS nodes in pool rows',()=>{
 it.each([
  {active:3,total:3,status:'healthy',tone:'green'},
  {active:1,total:2,status:'healthy',tone:'green'},
  {active:2,total:2,status:'suspect',tone:'amber'},
  {active:1,total:2,status:'protected',tone:'amber'},
  {active:2,total:2,status:'unknown',tone:'muted'},
  {active:2,total:2,status:'stale',tone:'muted'},
  {active:0,total:2,status:'excluded',tone:'red'},
  {active:0,total:0,status:'unknown',tone:'muted'},
 ] as const)('renders $active/$total with $status color only on the active count',({active,total,status,tone})=>{
  const view=render({active,total,status});
  expect(view).toContain('<th>Активные узлы</th>');
  expect(view).toContain(`<span class="pool-target-active ${tone}">${active}</span><span>/${total}</span>`);
  expect(view).toContain(`aria-label="Активных узлов в DNS: ${active} из ${total}.`);
 });
 it('does not invent counts when an older backend omits the summary',()=>{
  const view=render(undefined);
  expect(view).toContain('title="Нет данных об узлах">—</span>');
  expect(view).not.toContain('pool-target-active');
 });
});
