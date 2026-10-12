// Own the keyboard only for this modal; native/nested dialogs retain priority.
export function ownModalFocus(node,onClose,{dismiss=true,document:doc=document}={}){
 const opener=doc.activeElement;
 const controls=()=>Array.from(node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
 (controls()[0]||node).focus({preventScroll:true});
 const key=e=>{
  const current=doc.activeElement?.closest('dialog[open], [role="dialog"][aria-modal="true"]');
  if(current&&current!==node)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(dismiss)onClose();return;}
  if(e.key!=='Tab')return;
  const items=controls(),first=items[0]||node,last=items.at(-1)||node;
  if(doc.activeElement===node||!node.contains(doc.activeElement)||e.shiftKey&&doc.activeElement===first||!e.shiftKey&&doc.activeElement===last||!items.length){e.preventDefault();(e.shiftKey?last:first).focus({preventScroll:true});}
 };
 doc.addEventListener('keydown',key,true);
 return()=>{doc.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus({preventScroll:true});};
}
