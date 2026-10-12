export function liveDistribution(rows: {kind:string}[]):{total:number;segments:{key:string;label:string;count:number}[]};
export function liveAgentDistribution(rows: {toKnown:boolean;agent:string}[]):{total:number;segments:{key:string;label:string;count:number}[]};
export function progressGauge(progress:{percent?:number|null}|null):{known:boolean;percent:number|null};
