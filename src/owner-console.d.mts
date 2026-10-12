export function statusLabel(state: string): string;
export function shortTitle(value: unknown,max?:number):string;
export function outcomeTitle(title:string):string;
export function groupGoals<T extends {path:string;title:string;status:string}>(goals:T[]):{key:string;title:string;goals:T[]}[];
export function messageSummary(text:string):string;
export function resultLinks(text:string):string[];
export function conversationGroups<T extends {author:string;at:number}>(items:T[]):{key:string;items:T[];last:T}[];
export function sessionGroups<T extends {taskId?:string;taskTitle?:string;board?:string;boardName?:string;author:string;at:number;kind:string}>(items:T[]):{key:string;taskTitle?:string;board?:string;boardName?:string;items:T[];last:T;participants:string[];state:'done'|'waiting'|'working';stateLabel:string}[];
export function stepPresentation(step:{done?:boolean;state?:string;workingOn?:string|null;kanban?:{status:string}|null;uses?:{kind:string;status:string}|null}):{state:string;label:string};
export function goalSummary(goal:{status:string;done:number;total:number;steps:Parameters<typeof stepPresentation>[0][]}):{pct:number;working:number;waiting:number;queued:number};

export type GoalObjective<T> = {key:string;title:string;goals:T[]};
export type GoalPresentation<T> = {originalCount:number;groupCount:number;groups:(GoalObjective<T> & {kind:'objective'} | {kind:'related';key:string;title:string;groups:GoalObjective<T>[]})[]};
export function goalTopic(title:string):'app-portfolio'|null;
export function goalPresentation<T extends {path:string;title:string;status:string}>(goals:T[]):GoalPresentation<T>;

export function displayTitle(value:unknown,max?:number):string;
