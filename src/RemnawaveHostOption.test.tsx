import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PoolDetail,PoolForm} from './App';
import type {Pool} from './types';

const pool={id:'pool-1',name:'Germany',hostname:'vpn.example.com',zone_id:'zone',ttl:120,interval_seconds:60,failure_threshold:3,recovery_threshold:5,automation_enabled:true,profile_configured:true,disable_host_when_all_down:false,remnawave_host_disabled:null,remnawave_error:null} as Pool;
const noop=()=>{};
const saved=async()=>{};
const optionLabel='Отключать хост в Remnawave, если все ноды недоступны';

function option(view:string) {
 const checkbox=view.match(/<input\b[^>]*type="checkbox"[^>]*>/)?.[0];
 expect(checkbox).toBeDefined();
 expect(view).toContain(optionLabel);
 return checkbox!;
}

function detail(overrides:Partial<Pool>={}) {
 return renderToStaticMarkup(<PoolDetail pool={{...pool,...overrides}} targets={[]} targetsLoading={false} busy={new Set()} onEdit={noop} onDelete={noop} onProfile={noop} onAdd={noop} onImport={noop} onToggle={noop} onSync={noop} onCheck={noop} onTargetAction={noop}/>);
}

describe('Remnawave host outage option',()=>{
 it('is off by default for new pools',()=>{
  const view=renderToStaticMarkup(<PoolForm onClose={noop} onSaved={saved}/>);
  expect(option(view)).not.toContain('checked');
  expect(view).toContain('Последний IP всегда остаётся в DNS');
 });
 it.each([false,true])('shows the saved pool preference %s',disable_host_when_all_down=>{
  const checkbox=option(renderToStaticMarkup(<PoolForm pool={{...pool,disable_host_when_all_down}} onClose={noop} onSaved={saved}/>));
  expect(checkbox.includes('checked')).toBe(disable_host_when_all_down);
 });
 it('defaults an older pool response to off',()=>{
  const older={...pool};
  delete (older as Partial<Pool>).disable_host_when_all_down;
  expect(option(renderToStaticMarkup(<PoolForm pool={older} onClose={noop} onSaved={saved}/>))).not.toContain('checked');
 });
 it('explains host behavior with the option off',()=>{
  expect(detail()).toContain('хост Remnawave остаётся включённым');
 });
 it('explains recovery and preserves the final IP with the option on',()=>{
  const view=detail({disable_host_when_all_down:true});
  expect(view).toContain('При отказе всех нод хост Remnawave отключается');
  expect(view).toContain('Последний IP сохраняется; после восстановления хост включается');
 });
 it('shows provider errors and the last confirmed disabled state',()=>{
  const view=detail({disable_host_when_all_down:true,remnawave_host_disabled:true,remnawave_error:'Remnawave API unavailable'});
  expect(view).toContain('Remnawave API unavailable');
  expect(view).toContain('Хост Remnawave отключён');
 });
});
