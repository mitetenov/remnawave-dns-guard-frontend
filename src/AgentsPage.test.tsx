import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentDetail,AgentsPage,agentIDFromHash} from './AgentsPage';
import {pageFromHash} from './navigation';
import {TargetChecks} from './TargetChecks';
import type {Checker,Pool,Target} from './types';

const agent:Checker={id:'ru-residential',version:'1.4.0',last_seen:'2026-10-29T01:00:00Z',status:'online',healthy:true,direct_healthy:true,routes:{direct:true,socks5:true,revision:2,supported:true},proxy:{configured:true,supported:true,endpoint:'socks5://proxy.example.com:1080',healthy:true,checked_at:null,latency_ms:null,exit_ip:null,test:null}};
const error=()=>'';
function detail(value:Checker){return renderToStaticMarkup(<AgentDetail agent={value} onChanged={()=>{}} onReload={async()=>{}} onAuthError={error}/>);}

describe('agents navigation and independent routes',()=>{
 it('resolves list and deep links into agent details',()=>{
  expect(pageFromHash('#agents')).toBe('agents');expect(pageFromHash('#agents/ru-residential')).toBe('agents');expect(agentIDFromHash('#agents/ru-residential')).toBe('ru-residential');
  for(const hash of ['#settings','#agents/','#agents/%E0%A4','#agents/a/b','#agents/%3Cscript%3E'])expect(agentIDFromHash(hash)).toBeNull();
 });
 it('shows connected agents and a way to include offline agents',()=>{
  const view=renderToStaticMarkup(<AgentsPage agents={[agent,{...agent,id:'offline-node',status:'offline',healthy:false}]} loading={false} onAuthError={error}/>);
  expect(view).toContain('ru-residential');expect(view).not.toContain('offline-node');expect(view).toContain('Показать офлайн');expect(view).toContain('Напрямую: вкл.');expect(view).toContain('SOCKS5: вкл.');
 });
 it('keeps both route switches enabled when SOCKS is healthy',()=>{
  const view=detail(agent);
  expect(view).toMatch(/aria-label="Проверять напрямую" aria-checked="true"/);expect(view).toMatch(/aria-label="Проверять через SOCKS5" aria-checked="true"/);expect(view).toContain('Проверить прокси');
 });
 it('keeps the direct route enabled when the proxy fails',()=>{
  const view=detail({...agent,proxy:{...agent.proxy!,healthy:false}});
  expect(view).toMatch(/aria-label="Проверять напрямую" aria-checked="true"/);expect(view).toContain('Прямая проверка продолжает работать');expect(view).toContain('пропускает только этот маршрут');
 });
 it('renders both routes switched off while retaining saved proxy settings',()=>{
  const view=detail({...agent,status:'paused',healthy:false,routes:{...agent.routes!,direct:false,socks5:false}});
  expect(view).toMatch(/aria-label="Проверять напрямую" aria-checked="false"/);expect(view).toMatch(/aria-label="Проверять через SOCKS5" aria-checked="false"/);expect(view).toContain('proxy.example.com');expect(view).toContain('Проверки выключены');
 });
 it('shows skipped SOCKS and successful direct results separately',()=>{
  const target={checks:[{agent_id:'ru-residential',fresh:true,failures:0,successes:1,last_checked_at:null,last_latency_ms:null,last_error:null,outcome:true,routes:{direct:{outcome:'success'},socks5:{outcome:'skipped',error:'proxy_unavailable'}}}]} as Target;
  const view=renderToStaticMarkup(<TargetChecks target={target} pool={{failure_threshold:3,recovery_threshold:2} as Pool}/>);
  expect(view).toContain('Напрямую: успех');expect(view).toContain('Через SOCKS5: пропущено');
 });
});
