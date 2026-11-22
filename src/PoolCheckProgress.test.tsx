import {describe,expect,it} from 'vitest';
import {summarizePoolCheck,type PoolCheckRun} from './PoolCheckProgress';
import type {Target,TargetCheck} from './types';

const run:PoolCheckRun={started_at:'2026-11-22T17:25:30.010500Z',expected_agents:['ru-one','ru-two'],target_ids:['t1','t2'],waitUntil:0};
function target(id:string,checks:Record<string,string>){
 return {id,checks:Object.entries(checks).map(([agent_id,last_checked_at])=>({agent_id,last_checked_at} as TargetCheck))} as Target;
}

describe('manual check results received after request',()=>{
 it('distinguishes earlier and later results in the same millisecond',()=>{
  const result=summarizePoolCheck(run,[
   target('t1',{'ru-one':'2026-11-22T17:25:30.010501Z','ru-two':'2026-11-22T17:25:30.010499Z'}),
   target('t2',{'ru-one':'2026-11-22T17:25:30.010502Z','ru-two':'2026-11-22T17:25:30.010500Z'}),
   target('unrequested',{'ru-two':'2026-11-22T17:26:30Z'}),
  ]);
  expect(result).toEqual({responded:['ru-one'],lastResponse:'2026-11-22T17:25:30.010502Z',responses:2,total:4,complete:false});
 });
});
