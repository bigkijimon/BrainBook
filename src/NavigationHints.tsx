import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
// One read-only label layer for icon navigation. Names remain in aria-label;
// this is the visible equivalent for pointer and keyboard users, never an action.
export function NavigationHints(){
  const [hint,setHint]=useState<{text:string;left:number;top:number}|null>(null);
  useEffect(()=>{
    let anchor:Element|null=null;
    let suppressRestoredFocus=false;
    const hide=()=>{anchor=null;setHint(null);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){suppressRestoredFocus=true;hide();}else if(e.key==='Tab')suppressRestoredFocus=false;};
    const position=(item:HTMLElement)=>{
      const b=item.getBoundingClientRect(),rail=Boolean(item.closest('.app-nav'));
      if(!b.width||!b.height){hide();return;}
      setHint({text:item.getAttribute('data-nav-label')!,left:Math.min(innerWidth-230,Math.max(8,rail?b.right+12:b.left-100)),top:Math.min(innerHeight-70,Math.max(8,rail?b.top:b.bottom+10))});
    };
    const relocate=()=>{if(anchor instanceof HTMLElement&&anchor.contains(document.activeElement)&&!suppressRestoredFocus)position(anchor);else hide();};
    const show=(e:Event)=>{
      if(e.type==='focusin'&&suppressRestoredFocus)return;
      if(e.type==='pointerover')suppressRestoredFocus=false;
      const item=e.target instanceof Element?e.target.closest<HTMLElement>('[data-nav-label]'):null;
      if(!item||!item.getAttribute('data-nav-label'))return;
      anchor=item;position(item);
    };
    const leave=(e:Event)=>{const next=(e as MouseEvent).relatedTarget;if(anchor&&next instanceof Node&&anchor.contains(next))return;if(anchor&&anchor.contains(document.activeElement))return;hide();};
    document.addEventListener('pointerover',show);document.addEventListener('focusin',show);
    document.addEventListener('pointerout',leave);document.addEventListener('focusout',hide);
    document.addEventListener('keydown',key);document.addEventListener('click',hide,true);window.addEventListener('scroll',relocate,true);window.addEventListener('resize',relocate);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerover',show);document.removeEventListener('focusin',show);document.removeEventListener('pointerout',leave);document.removeEventListener('focusout',hide);document.removeEventListener('click',hide,true);window.removeEventListener('scroll',relocate,true);window.removeEventListener('resize',relocate);};
  },[]);
  return hint?createPortal(<div className="navigation-hint" role="tooltip" style={{left:hint.left,top:hint.top}}>{hint.text}</div>,document.body):null;
}
