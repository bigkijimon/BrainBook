// One collapsed conversation per actual author; no persona-based status or model inference.
import {useEffect,useMemo,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {memberTone} from './TeamRail';
import {personaOf} from './agentRoster';
import {conversationGroups,messageSummary,resultLinks,displayTitle} from './owner-console.mjs';
import { StateNote } from './ui';
type Item={id:string;taskId?:string;taskTitle:string;kind:string;author:string;text:string;at:number;boardName:string;board?:string;from?:string;to?:string|null;taskRecipient?:string|null};
const KIND:Record<string,string>={blocked:'Needs you',done:'Completion reported',failed:'Stop reported',progress:'Start reported',new:'Added',comment:'Report'};
const when=(at:number)=>new Date(at*1000).toLocaleString('en-GB',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function AgentChat({onActiveChange}:{onActiveChange?:(count:number)=>void}={}){
 const [items,setItems]=useState<Item[]>([]);const [open,setOpen]=useState<string|null>(null);const [all,setAll]=useState(false);const [query,setQuery]=useState('');const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;const load=async()=>{try{const response=await fetch(`/api/agents/feed?since=${Math.floor(Date.now()/1000)-3*86400}`,{cache:'no-store'});const data=await response.json();if(!response.ok||data.error||!Array.isArray(data.items))throw new Error();if(alive){setItems(data.items);setError('');}}catch{if(alive)setError('Chat update failed. Showing the last report.');}};
  void load();const timer=window.setInterval(load,10000);return()=>{alive=false;window.clearInterval(timer);};
 },[]);
 const groups=useMemo(()=>conversationGroups(items),[items]);
 useEffect(()=>{onActiveChange?.(groups.length);},[groups.length,onActiveChange]);
 const filtered=groups.filter(g=>`${g.key} ${personaOf(g.key)} ${g.items.map(i=>i.taskTitle).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
 return <>
  {error && <p role="status">{error}</p>}
  <label className="console-search"><span className="sr-only">Search chat</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search agents or work"/></label>
  {!groups.length && !error && <StateNote kind="empty">No chat recorded in the last 3 days.</StateNote>}
  <ol className="agent-chat-list">{filtered.slice(0,all||query?undefined:5).map(group=>{
   const expanded=open===group.key;const latest=group.last;
   const taskCount=new Set(group.items.map(item=>`${item.board || item.boardName}:${item.taskId||item.taskTitle}`)).size;
   return <li className="chat-thread" key={group.key}><button className="chat-thread-row" type="button" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:group.key)}>
    <i className="chat-avatar" style={{background:memberTone(group.key)}} aria-hidden="true">{personaOf(group.key).slice(0,1)}</i>
    <span className="chat-thread-main"><b>{personaOf(group.key)}{personaOf(group.key)!==group.key && <small> · {group.key}</small>}</b><small>{taskCount} work items · {group.items.length} reports · Latest: {KIND[latest.kind] || 'State unknown'} · {when(latest.at)}</small><span className="chat-preview">Summary: {messageSummary(latest.text)}</span></span><ChevronDown size={14}/>
   </button>
   {resultLinks(latest.text).map(url=><a key={url} className="chat-result-link" href={url} target="_blank" rel="noreferrer">Open result</a>)}
   {expanded && <ol className="chat-messages">{group.items.map(item=><li className="chat-message" key={item.id} style={{['--agent' as string]:memberTone(group.key)}}><div className="chat-bubble"><header><b>{personaOf(item.author)}</b><time dateTime={new Date(item.at*1000).toISOString()}>{when(item.at)}</time></header><p><b>{displayTitle(item.taskTitle,70)}</b> · {KIND[item.kind]||'State unknown'}</p><p className="chat-context">Request: {item.from || 'Sender unknown'} → {item.taskRecipient || 'Worker unknown'}<br/>Reported: {item.author} → {item.to || 'Recipient unknown'}</p><p>Summary: {messageSummary(item.text)}</p>{resultLinks(item.text).map(url=><a key={url} className="chat-result-link" href={url} target="_blank" rel="noreferrer">Open result</a>)}<details className="chat-source"><summary>Original and source</summary><p>{item.taskTitle}</p><p className="source-text">{item.text || 'Text not recorded'}</p><small>{item.boardName} · {item.taskId || 'Card ID unknown'} · {item.id}</small></details></div></li>)}</ol>}
   </li>;
  })}</ol>
  {!query && groups.length>5 && <button className="console-more" type="button" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show less':`All conversations (${groups.length})`}</button>}
 </>;
}
