import { themePalette } from './theme-palette.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
// One owned scene and optional 30fps decorative loop. Observed endpoints stay fixed; ornament is never a progress signal.
export function createRelationshipScene(host,graph,onSelect,{Renderer=THREE.WebGLRenderer,Controls=OrbitControls,Resize=ResizeObserver,Intersect=IntersectionObserver,document:doc=document,window:win=window}={}) {
 const scene=new THREE.Scene();scene.background=new THREE.Color(themePalette.night);
 const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,2,12);camera.lookAt(0,0,0);
 let renderer;try{renderer=new Renderer({antialias:true,powerPreference:'low-power'});}catch{return {available:false,select:()=>{},dispose:()=>{}};}
 renderer.setPixelRatio(Math.min(win.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
 const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');host.appendChild(canvas);
 const controls=new Controls(camera,canvas);controls.enableDamping=false;controls.autoRotate=false;controls.enabled=false;controls.enablePan=false;controls.enableZoom=false;if(canvas.style)canvas.style.touchAction='pan-y';
 const geometries=[],materials=[],clickables=[],byId=new Map();let visible=false,disposed=false,touchGesture=false,frame=null,last=null,elapsed=0;const ornaments=[];const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 const rowCount=Math.max(1,Math.ceil(graph.nodes.length/6));
 graph.nodes.forEach((node,i)=>{
  const geometry=new THREE.SphereGeometry(.26,12,8),material=new THREE.MeshBasicMaterial({color:themePalette.lavender}),mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(((i%6)-(Math.min(6,graph.nodes.length)-1)/2)*1.35,((rowCount-1)/2-Math.floor(i/6))*1.2,0);
  mesh.userData={node:node.id,activities:node.activities};scene.add(mesh);clickables.push(mesh);byId.set(node.id,mesh);geometries.push(geometry);materials.push(material);
  const haloGeometry=new THREE.TorusGeometry(.39,.015,3,24,Math.PI*1.4),haloMaterial=new THREE.MeshBasicMaterial({color:'#ffb38a',transparent:true,opacity:.65}),halo=new THREE.Mesh(haloGeometry,haloMaterial);halo.position.copy(mesh.position);scene.add(halo);ornaments.push(halo);geometries.push(haloGeometry);materials.push(haloMaterial);
 });
 graph.edges.forEach(edge=>{
  const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)return;
  const direction=new THREE.Vector3().subVectors(b.position,a.position),length=direction.length();
  if(length<.01)return;
  const arrow=new THREE.ArrowHelper(direction.normalize(),a.position,length,0xffffff,.22,.12);
  arrow.setColor(themePalette.pink);arrow.line.userData={activities:[edge.activity]};arrow.cone.userData={activities:[edge.activity]};scene.add(arrow);clickables.push(arrow.line,arrow.cone);
  // ArrowHelper geometry is shared by Three.js. Own clones prevent disposing another scene’s resources.
  for(const part of [arrow.line,arrow.cone]){part.geometry=part.geometry.clone();geometries.push(part.geometry);materials.push(part.material);}
 });
 const render=()=>{const drawable=!disposed&&visible&&doc.visibilityState!=='hidden';controls.enabled=drawable&&!touchGesture;if(drawable)renderer.render(scene,camera);};
 const canAnimate=()=>!disposed&&visible&&doc.visibilityState!=='hidden'&&!motion.matches&&ornaments.length>0&&typeof win.requestAnimationFrame==='function';
 const stop=()=>{if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;};
 const tick=time=>{frame=null;if(!canAnimate())return;if(last===null)last=time;const delta=time-last;if(delta>=1000/30){elapsed+=Math.min(delta/1000,.1);last=time;ornaments.forEach((halo,i)=>{halo.rotation.z=elapsed*.3+i*.6;});render();}frame=win.requestAnimationFrame(tick);};
 const sync=()=>{canvas.setAttribute('data-scene-state',disposed?'disposed':!visible?'offscreen':doc.visibilityState==='hidden'?'hidden':motion.matches?'reduced':canAnimate()?'animated':'static');render();if(canAnimate()){if(frame===null)frame=win.requestAnimationFrame(tick);}else{stop();if(motion.matches){ornaments.forEach(halo=>{halo.rotation.z=0;});render();}}};
 const resize=()=>{if(disposed)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.z=Math.max(10,rowCount*1.9);camera.updateProjectionMatrix();render();};
 const raycaster=new THREE.Raycaster(),point=new THREE.Vector2();raycaster.params.Line.threshold=.15;
 const pick=event=>{const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;point.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(point,camera);const hit=raycaster.intersectObjects(clickables,false)[0];if(hit?.object.userData.activities?.[0])onSelect(hit.object.userData.activities[0]);};
 let press=null,dragged=false;
 const down=e=>{press={x:e.clientX,y:e.clientY};dragged=false;touchGesture=e.pointerType!=='mouse';controls.enabled=!touchGesture&&visible&&doc.visibilityState!=='hidden';};
 const move=e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>6)dragged=true;};
 const cancel=()=>{press=null;dragged=true;controls.enabled=false;};
 const click=e=>{if(!dragged)pick(e);press=null;};
 canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointercancel',cancel);const lost=()=>{press=null;};canvas.addEventListener('lostpointercapture',lost);
 canvas.addEventListener('click',click);controls.addEventListener('change',render);doc.addEventListener('visibilitychange',sync);
 const resizeObserver=new Resize(resize);resizeObserver.observe(host);
 const intersectionObserver=new Intersect(entries=>{visible=entries.some(e=>e.isIntersecting);controls.enabled=visible&&doc.visibilityState!=='hidden';sync();});intersectionObserver.observe(host);
 const applyMotion=()=>{controls.enableDamping=false;controls.autoRotate=false;sync();};motion.addEventListener('change',applyMotion);
 resize();applyMotion();
 return {available:true,select:activity=>{for(const mesh of byId.values())mesh.material.color.set(mesh.userData.activities.includes(activity)?themePalette.pink:themePalette.lavender);render();},dispose:()=>{if(disposed)return;disposed=true;stop();resizeObserver.disconnect();intersectionObserver.disconnect();motion.removeEventListener('change',applyMotion);doc.removeEventListener('visibilitychange',sync);canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',lost);canvas.removeEventListener('click',click);controls.removeEventListener('change',render);controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();canvas.remove();scene.clear();}};
}
