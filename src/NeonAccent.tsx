import {useEffect,useRef,useState} from 'react';
// Decorative only: visibility owns CSS playback, never activity/progress data.
export function NeonAccent(){
 const ref=useRef<HTMLDivElement>(null),[playing,setPlaying]=useState(false);
 useEffect(()=>{const node=ref.current;if(!node)return;let visible=false;const motion=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setPlaying(visible&&document.visibilityState!=='hidden'&&!motion.matches);const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);update();});observer.observe(node);document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);};},[]);
 return <div ref={ref} className="neon-deco" aria-hidden="true" data-playing={playing}><span className="deco-sunset"/><span className="deco-lines"/><span className="deco-sweep"/></div>;
}
