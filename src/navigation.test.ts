import {describe,expect,it} from 'vitest';
import {pageFromHash} from './navigation';

describe('hash navigation',()=>{
 it.each(['overview','pools','agents','events','settings'] as const)('opens %s',page=>expect(pageFromHash('#'+page)).toBe(page));
 it.each(['#__proto__','#constructor','#toString','#hasOwnProperty','#missing','','#'])('falls back safely for %s',hash=>expect(pageFromHash(hash)).toBe('overview'));
});
