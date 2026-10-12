import type {Graph} from './activity-console.mjs';
export function createRelationshipScene(host:HTMLElement,graph:Graph,onSelect:(key:string)=>void,options?:Record<string,unknown>):{available:boolean;select:(key:string|null)=>void;dispose:()=>void};
