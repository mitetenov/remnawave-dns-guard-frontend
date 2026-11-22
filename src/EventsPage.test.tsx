// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {api} from './api';
import {EventsPage} from './EventsPage';
import {eventsHash,routeFromHash} from './navigation';
import type {GuardEvent} from './types';

vi.mock('./api',()=>({api:vi.fn()}));

const event=(id:string):GuardEvent=>({id,created_at:'2026-11-22T10:00:00Z',level:'info',type:'check',message:id,pool_id:'pool',target_id:'old-target'});
const onAuthError=(error:unknown)=>String(error);
let root:Root,container:HTMLDivElement;

beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 window.history.replaceState(null,'','#events');
 container=document.createElement('div');
 document.body.append(container);
 root=createRoot(container);
 vi.mocked(api).mockReset();
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 container.remove();
 vi.unstubAllGlobals();
});

async function render(sequence=0,quiet=false){
 await act(async()=>root.render(<EventsPage pools={[]} onAuthError={onAuthError} refresh={{sequence,quiet}}/>));
}

it('loads older pages through the cursor and keeps them on quiet refresh',async()=>{
 vi.mocked(api).mockResolvedValueOnce({events:[event('Newest event')],next_cursor:'c+/'}).mockResolvedValueOnce({events:[event('Older event')],next_cursor:null});
 await render();
 expect(vi.mocked(api).mock.calls[0][0]).toBe('/events?limit=100&paginated=1');
 const more=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Показать ещё'));
 await act(async()=>more?.click());
 expect(vi.mocked(api).mock.calls[1][0]).toBe('/events?limit=100&paginated=1&cursor=c%2B%2F');
 expect(container.textContent).toContain('Newest event');
 expect(container.textContent).toContain('Older event');
 expect(container.querySelector('a[href="#pools/pool/targets/old-target"]')?.textContent).toBe('Открыть узел');
 await render(1,true);
 expect(vi.mocked(api)).toHaveBeenCalledTimes(2);
 expect(container.textContent).toContain('Older event');
 expect(container.textContent).toContain('Автообновление приостановлено');
 vi.mocked(api).mockResolvedValueOnce({events:[event('Fresh event')],next_cursor:null});
 await render(2,false);
 expect(container.textContent).toContain('Fresh event');
 expect(container.textContent).not.toContain('Older event');
 expect(container.textContent).not.toContain('Автообновление приостановлено');
});

it('opens a scoped journal and ignores an old cursor response after changing filters',async()=>{
 const hash=eventsHash('pool','old-target');
 window.history.replaceState(null,'',hash);
 expect(routeFromHash(hash).page).toBe('events');
 let resolveOlder!:(value:unknown)=>void;
 const older=new Promise(resolve=>{resolveOlder=resolve;});
 vi.mocked(api).mockResolvedValueOnce({events:[event('Target event')],next_cursor:'older'})
  .mockReturnValueOnce(older)
  .mockResolvedValueOnce({events:[],next_cursor:null});
 await render();
 expect(vi.mocked(api).mock.calls[0][0]).toBe('/events?limit=100&paginated=1&pool_id=pool&target_id=old-target');
 const more=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Показать ещё'));
 await act(async()=>more?.click());

 const filter=container.querySelector<HTMLSelectElement>('#level-filter')!;
 await act(async()=>{filter.value='error';filter.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(vi.mocked(api).mock.calls[1][1]?.signal?.aborted).toBe(true);
 expect(vi.mocked(api).mock.calls[2][0]).toBe('/events?limit=100&paginated=1&level=error&pool_id=pool&target_id=old-target');
 await act(async()=>resolveOlder({events:[event('Stale response')],next_cursor:null}));
 expect(container.textContent).toContain('Пока нет событий по этому узлу');
 expect(container.textContent).not.toContain('Stale response');
});
