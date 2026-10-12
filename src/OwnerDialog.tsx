import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export function OwnerDialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}) {
 const ref=useRef<HTMLDialogElement>(null), close=useRef(onClose), timer=useRef<ReturnType<typeof setTimeout>|null>(null),[closing,setClosing]=useState(false);close.current=onClose;
 const requestClose=()=>{if(timer.current!==null)return;setClosing(true);const delay=matchMedia('(prefers-reduced-motion: reduce)').matches?0:120;timer.current=setTimeout(()=>close.current(),delay);};
 useEffect(()=>{const opener=document.activeElement,dialog=ref.current;if(!dialog)return;dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});return()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;dialog.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={ref} className={`owner-dialog ${className}`} aria-label={title} data-closing={closing} onCancel={e=>{e.preventDefault();requestClose();}} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)requestClose();}}}>
 <header><h3>{title}</h3><button type="button" className="ghost-button" onClick={requestClose} aria-label={`Close ${title}`}>Close</button></header><div className="owner-dialog-body">{children}</div></dialog>,document.body);
}
