export const pageNames = {overview:'Обзор',pools:'DNS-пулы',agents:'Агенты',events:'Журнал событий',settings:'Настройки'} as const;
export type Page = keyof typeof pageNames;

export function pageFromHash(hash:string):Page {
 const value=hash.startsWith('#')?hash.slice(1):hash;
 if(value.startsWith('agents/'))return 'agents';
 return Object.hasOwn(pageNames,value)?value as Page:'overview';
}
