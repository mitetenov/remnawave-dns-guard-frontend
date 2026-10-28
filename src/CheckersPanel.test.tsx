import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CheckersPanel,checkerCount} from './CheckersPanel';
import {TargetChecks} from './TargetChecks';
import type {Pool,Settings,Target} from './types';

const agents=[
 {id:'ru-moscow',version:'1.2.0',last_seen:'2026-10-29T00:00:00Z',healthy:true,status:'online'},
 {id:'ru-spb',version:'1.2.0',last_seen:'2026-10-29T00:00:00Z',healthy:false,status:'control_unhealthy'},
 {id:'ru-kazan',version:'1.1.0',last_seen:'2026-10-28T00:00:00Z',healthy:false,status:'offline'},
] as const;

describe('checker discovery and evidence',()=>{
 it('shows every checker with its individual health and version',()=>{
  const view=renderToStaticMarkup(<CheckersPanel settings={{agents:[...agents],agents_total:3,agents_healthy:1} as Settings}/>);
  for(const text of ['ru-moscow','ru-spb','ru-kazan','Проверки доступны','Контроль недоступен','Нет связи','1.2.0','Чекеры: 1/3','регистрируется автоматически','уникальный AGENT_ID'])expect(view).toContain(text);
 });
 it('shows an empty installation without invented nodes',()=>{
  const view=renderToStaticMarkup(<CheckersPanel settings={{agents:[],agents_total:0,agents_healthy:0} as unknown as Settings}/>);
  expect(view).toContain('Чекеры пока не подключены');
  expect(view).not.toContain('ru-moscow');
 });
 it('does not infer a healthy fleet from the last heartbeat',()=>{
  expect(checkerCount({agents_total:3,agents_healthy:1,agent_healthy:true})).toBe('Чекеры: 1/3');
 });
 it('renders conflicting results independently',()=>{
  const target={checkers_active:2,checkers_checked:2,checks:[
   {agent_id:'ru-moscow',fresh:true,failures:3,successes:0,last_checked_at:'2026-10-29T00:00:00Z',last_latency_ms:null,last_error:'probe_failed',outcome:false},
   {agent_id:'ru-spb',fresh:true,failures:0,successes:5,last_checked_at:'2026-10-29T00:00:00Z',last_latency_ms:24,last_error:null,outcome:true},
  ]} as Target;
  const view=renderToStaticMarkup(<TargetChecks target={target} pool={{failure_threshold:3,recovery_threshold:5} as Pool}/>);
  for(const text of ['Чекеры: 2/2','ru-moscow','ru-spb','Сбой','Доступен','Сбои: 3/3','Успехи: 5/5','probe_failed'])expect(view).toContain(text);
 });
});
