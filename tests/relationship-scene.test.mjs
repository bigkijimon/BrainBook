import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createRelationshipScene} from '../src/relationship-scene.mjs';
import {themePalette} from '../src/theme-palette.mjs';
class Events{constructor(){this.listeners=new Map();}addEventListener(k,v){this.listeners.set(k,v);}removeEventListener(k,v){if(this.listeners.get(k)===v)this.listeners.delete(k);}}
test('scene selects only observed identities; resizes, pauses hidden/offscreen, honors reduced motion and disposes once',()=>{
 const canvas=new Events();canvas.setAttribute=()=>{};canvas.remove=()=>{canvas.removed=true;};canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:160});
 const host={clientWidth:400,clientHeight:160,appendChild:()=>{}};let renderCount=0,renderer,controls;const picked=[];const observers=[];const resources=[];
 class Renderer{constructor(){renderer=this;this.domElement=canvas;}setPixelRatio(n){this.dpr=n;}setSize(w,h){this.size=[w,h];}render(scene,camera){renderCount++;this.camera=camera;camera.updateMatrixWorld();scene.updateMatrixWorld();this.scene=scene;scene.traverse(o=>{for(const r of [o.geometry,o.material].filter(Boolean)){if(!resources.includes(r)){resources.push(r);r.addEventListener('dispose',()=>{r.disposed=(r.disposed||0)+1;});}}});}dispose(){this.disposed=(this.disposed||0)+1;}}
 class Controls extends Events{constructor(){super();controls=this;}dispose(){this.disposed=(this.disposed||0)+1;}}
 class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const doc=new Events();doc.visibilityState='visible';const motion=new Events();motion.matches=true;const win={devicePixelRatio:4,matchMedia:()=>motion};
 const graph={nodes:[{id:'a',name:'A',department:'AppPro',activities:['edge']},{id:'b',name:'B',department:'MoviePro',activities:['edge']}],edges:[{id:'edge',source:'a',target:'b',activity:'edge'}]};
 const owner=createRelationshipScene(host,graph,key=>picked.push(key),{Renderer,Controls,Resize:Observer,Intersect:Observer,document:doc,window:win});assert.equal(owner.available,true);assert.equal(renderer.dpr,1.5);assert.deepEqual(renderer.size,[400,160]);assert.equal(renderCount,0);assert.equal(controls.autoRotate,false);assert.equal(controls.enableDamping,false);
 observers[1].cb([{isIntersecting:true}]);assert.ok(renderCount>0);const node=renderer.scene.children.find(o=>o.userData.node==='a');assert.ok(node);assert.ok(renderer.scene.children.some(o=>o.type==='ArrowHelper'));
 owner.select('edge');assert.equal(node.material.color.getHexString(),themePalette.pink.slice(1));owner.select('unknown');assert.equal(node.material.color.getHexString(),themePalette.lavender.slice(1));
 // Real Three.js raycast through the actual camera projection.
 const camera=renderer.camera;const screen=node.position.clone().project(camera);canvas.listeners.get('click')({clientX:(screen.x+1)*200,clientY:(1-screen.y)*80});assert.deepEqual(picked,['edge']);
 const before=renderCount;doc.visibilityState='hidden';doc.listeners.get('visibilitychange')();owner.select('edge');assert.equal(renderCount,before);doc.visibilityState='visible';observers[1].cb([{isIntersecting:false}]);owner.select('edge');assert.equal(renderCount,before);host.clientWidth=200;observers[0].cb();assert.deepEqual(renderer.size,[200,160]);
 owner.dispose();owner.dispose();assert.equal(renderer.disposed,1);assert.equal(controls.disposed,1);assert.ok(observers.every(o=>o.disconnected));assert.equal(canvas.listeners.size,0);assert.equal(doc.listeners.size,0);assert.equal(motion.listeners.size,0);assert.ok(canvas.removed);assert.ok(resources.every(r=>r.disposed===1));
});
test('WebGL failure leaves usable fallback, creates no controls or observers',()=>{
 let made=false;class Renderer{constructor(){throw new Error('WebGL unavailable');}}class Controls{constructor(){made=true;}}
 const owner=createRelationshipScene({}, {nodes:[],edges:[]},()=>{},{Renderer,Controls,Resize:class{},Intersect:class{},document:{},window:{}});assert.equal(owner.available,false);owner.dispose();assert.equal(made,false);
});
test('one time-based decorative loop pauses offscreen/hidden/reduced, resumes without jump, and cancels on dispose; touch scroll never turns into picking',()=>{
 const canvas=new Events();canvas.style={};canvas.setAttribute=()=>{};canvas.remove=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:160});
 const doc=new Events();doc.visibilityState='visible';const motion=new Events();motion.matches=false;const observers=[],frames=new Map();let frameId=0,renderer,controls,count=0;const picked=[];
 const win={devicePixelRatio:1,matchMedia:()=>motion,requestAnimationFrame:cb=>{const id=++frameId;frames.set(id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id)};
 class Renderer{constructor(){renderer=this;this.domElement=canvas;}setPixelRatio(){}setSize(){}render(scene,camera){count++;this.scene=scene;this.camera=camera;camera.updateMatrixWorld();scene.updateMatrixWorld();}dispose(){}}
 class Controls extends Events{constructor(){super();controls=this;}dispose(){}}
 class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){}}
 const owner=createRelationshipScene({clientWidth:400,clientHeight:160,appendChild:()=>{}},{nodes:[{id:'a',activities:['a']}],edges:[]},key=>picked.push(key),{Renderer,Controls,Resize:Observer,Intersect:Observer,document:doc,window:win});
 const step=t=>{assert.equal(frames.size,1);const [id,cb]=frames.entries().next().value;frames.delete(id);cb(t);};
 assert.equal(frames.size,0);observers[1].cb([{isIntersecting:true}]);assert.equal(frames.size,1);doc.listeners.get('visibilitychange')();assert.equal(frames.size,1,'no duplicate frame loop');step(0);step(100);
 const halo=renderer.scene.children.find(o=>o.geometry?.type==='TorusGeometry');assert.ok(halo.rotation.z>0);const angle=halo.rotation.z;
 doc.visibilityState='hidden';doc.listeners.get('visibilitychange')();assert.equal(frames.size,0);const before=count;owner.select('a');assert.equal(count,before);
 doc.visibilityState='visible';doc.listeners.get('visibilitychange')();step(100000);assert.equal(halo.rotation.z,angle,'hidden elapsed time is not animated');step(100100);assert.ok(halo.rotation.z<angle+.1);
 motion.matches=true;motion.listeners.get('change')();assert.equal(frames.size,0);assert.equal(halo.rotation.z,0);assert.equal(canvas.style.touchAction,'pan-y');
 canvas.listeners.get('pointerdown')({clientX:200,clientY:80,pointerType:'touch'});owner.select('a');assert.equal(controls.enabled,false);canvas.listeners.get('pointermove')({clientX:200,clientY:120});canvas.listeners.get('pointercancel')();canvas.listeners.get('click')({clientX:200,clientY:80});assert.deepEqual(picked,[],'canceled/swiped gesture is not a selection');
 motion.matches=false;motion.listeners.get('change')();assert.equal(frames.size,1);observers[1].cb([{isIntersecting:false}]);assert.equal(frames.size,0);observers[1].cb([{isIntersecting:true}]);owner.dispose();assert.equal(frames.size,0);assert.equal(canvas.listeners.size,0);
});
