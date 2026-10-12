import {useEffect,useRef,type RefObject} from 'react';
import {ownModalFocus} from './modal-focus.mjs';
export function useModalFocus(ref:RefObject<HTMLElement|null>,onClose:()=>void,dismiss=true){const close=useRef(onClose);close.current=onClose;useEffect(()=>ref.current?ownModalFocus(ref.current,()=>close.current(),{dismiss}):undefined,[ref,dismiss]);}
