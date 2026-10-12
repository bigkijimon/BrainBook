import type {Handoff} from './AgentFlow';
import type {Task} from './types';
import type {ControlWork} from './ControlCenter';
import type {NextWorkRow} from './next-work.mjs';
export type Department={label:string;basis:string};
export type Metric={label:string;basis:string;at:number|null;percent?:number|null;finishAt?:number|null};
export type LiveActivity={key:string;kind:'gpu'|'session'|'router'|'card'|'unlinked';from:string;agent:string;title:string;where:string;state:string;count:number;updatedAt:number|null;fromKnown:boolean;toKnown:boolean;fromDepartment:Department;toDepartment:Department;metrics:{stage:string;progress:Metric;eta:Metric};original:Handoff;flow:ActivityFlow|null};
export type FlowEnd={name:string;model:string|null};
export type ActivityFlow={from:FlowEnd;to:FlowEnd;basis:string};
export type Graph={nodes:{id:string;name:string;department:string;activities:string[]}[];edges:{id:string;source:string;target:string;activity:string}[]};
export function activityKind(handoff:Partial<Handoff>,tasks?:Task[]):LiveActivity['kind'];
export function activityMetrics(handoff:Partial<Handoff>):LiveActivity['metrics'];
export function projectLiveActivity(flow:{available:boolean;handoffs:Handoff[]},teams?:{id:string;name:string;members:{name:string;parent?:string|null;model?:string|null}[]}[],tasks?:Task[]):LiveActivity[];
export function relationshipGraph(rows:LiveActivity[]):Graph;
export function otherWorkInventory(work:ControlWork,liveRows?:LiveActivity[],now?:number):{rows:NextWorkRow[];groups:Record<'queued'|'attention'|'scheduled'|'completed'|'unverified',NextWorkRow[]>;counts:Record<string,number>;total:number;sources:{board:number;notes:number;requests:number}};

export function activityFlow(row:Pick<LiveActivity,'toKnown'|'fromKnown'|'from'|'agent'>,teams?:{members:{name:string;parent?:string|null;model?:string|null}[]}[]):ActivityFlow|null;
