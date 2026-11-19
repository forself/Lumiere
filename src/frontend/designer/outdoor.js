import {mergeGeometries} from '../../../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {signalLampCount,signalLampStates} from './outdoor-catalog.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
export function outdoorLocal(o,p){const a=o.rotation*Math.PI/180,x=p.x-o.x,z=p.z-o.z;return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};}
export function inUnderpassEntrance(objects,p,surfaceY,surface){return objects.some(o=>{if(o.assetId!=='underpass'||Math.abs(o.elevation+o.height-surfaceY)>.3)return false;const q=outdoorLocal(o,p);if(!(Math.abs(q.x)<o.width/2&&Math.abs(q.z)>o.depth*.2&&Math.abs(q.z)<o.depth/2))return false;if(!surface)return true;const side=Math.sign(q.z),a=o.rotation*Math.PI/180;return [[-.5,.2],[.5,.2],[.5,.5],[-.5,.5]].every(([x,z])=>{x*=o.width;z*=o.depth*side;const t=outdoorLocal(surface,{x:o.x+x*Math.cos(a)-z*Math.sin(a),z:o.z+x*Math.sin(a)+z*Math.cos(a)});return Math.abs(t.x)<surface.width/2&&Math.abs(t.z)<surface.depth/2;});});}
export function outdoorSurface(o,p,{smooth=false}={}){
 const q=outdoorLocal(o,p),shape=o.assetId;if(Math.abs(q.x)>o.width/2||Math.abs(q.z)>o.depth/2)return null;
 if(['footbridge','underpass'].includes(shape)){const ramp=o.depth*.3,t=Math.max(0,Math.min(1,(o.depth/2-Math.abs(q.z))/ramp)),n=Math.ceil(o.height/.18),rise=smooth?t:Math.ceil(t*n-1e-9)/n;return o.elevation+(shape==='footbridge'?rise:1-rise)*o.height;}
 if(['hedge-island','bus-island'].includes(shape))return o.elevation+.25;
 if(['drain-cover','manhole-cover'].includes(shape)){if(shape==='manhole-cover'&&(q.x/(o.width/2))**2+(q.z/(o.depth/2))**2>1)return null;return o.elevation+o.height;}
 if(['asphalt-road','concrete-paving','steel-paving','dirt-ground','gravel-ground','brick-sidewalk','concrete-sidewalk','green-sidewalk','traffic-island'].includes(shape))return o.elevation+o.height;
 return null;
}
// Shared normalized layout for 2D markings and 3D geometry.
export function roadMarks(type,width=6,depth=3,stripeLength=Math.min(3,depth)){const out=[],rect=(x,z,w,d)=>out.push({x,z,w,d});if(type==='lineDash'){const dash=1.3,gap=1.7,n=Math.max(1,Math.floor((depth+gap+1e-9)/(dash+gap))),len=Math.min(dash,depth),span=n*len+(n-1)*gap;for(let i=0;i<n;i++)rect(0,(-span/2+len/2+i*(len+gap))/depth,1,len/depth);}if(type==='lineDouble'){rect(-13/36,0,10/36,1);rect(13/36,0,10/36,1);}if(['white','yellow'].includes(type))rect(0,0,.018,.98);if(type==='doubleYellow')for(const x of [-.025,.025])rect(x,0,.015,.98);if(type==='whiteDash')for(let i=0;i<6;i++)rect(0,-.43+i*.17,.018,.09);if(type==='crosswalk'){const stripe=.4,gap=.6,n=Math.max(0,Math.floor((width+gap+1e-9)/(stripe+gap))),span=n*stripe+Math.max(0,n-1)*gap;for(let i=0;i<n;i++)rect((-span/2+stripe/2+i*(stripe+gap))/width,0,stripe/width,stripeLength/depth);}if(type==='arrow'){rect(0,.08,.035,.5);for(let i=0;i<8;i++)rect(0,-.4+i*.025,.02+i*.025,.026);}return out;}
export function objectMarks(o){const type=({'lane-dashed-white':'lineDash','lane-double-yellow':'lineDouble',crosswalk:'crosswalk'})[o.assetId]||o.outdoor?.marking;return roadMarks(type,o.width,o.depth,o.assetId==='crosswalk'?o.depth:Math.min(3,o.depth));}
export function buildOutdoorAsset(root,o,spec,{box,add,materials,project}){
 if(!spec.outdoor)return false;const {width:w,depth:d,height:h}=o,colors=new Map();
 const mat=color=>{if(!colors.has(color)){const m=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide});colors.set(color,m);materials.set('outdoor-'+o.id+'-'+color,m);}return colors.get(color);};
 const B=(sx,sy,sz,x,y,z,color=spec.color,kind='object')=>box(root,sx,sy,sz,x,y,z,mat(color),o.id,kind);
 const N=(sx,sy,sz,x,y,z,color=spec.color,kind='object')=>B(sx*w,sy*h,sz*d,x*w,y*h,z*d,color,kind);
 const disk=(r,y,color)=>{const mesh=add(root,new THREE.CylinderGeometry(r,r,.008,20),mat(color),[0,y,0],o.id,'object');return mesh;};
 const marks=(type,parts=roadMarks(type,w,d,o.assetId==='crosswalk'?d:Math.min(3,d)))=>{if(!parts.length)return;const pieces=parts.map(r=>new THREE.BoxGeometry(r.w*w,Math.max(.0001,h*.01),r.d*d).translate(r.x*w,h*1.015,r.z*d)),merged=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());add(root,merged,mat(type.toLowerCase().includes('yellow')||type==='lineDouble'?'#efce42':'#f7f4df'),[0,0,0],o.id,'outdoor-ground');};
 if(spec.shape==='marking-group'){marks(o.assetId==='lane-double-yellow'?'lineDouble':'lineDash',objectMarks(o));return true;}
 if(['paving','sidewalk','island'].includes(spec.shape)){
  const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2);shape.lineTo(-w/2,d/2);shape.closePath();
  for(const tunnel of project?.objects||[]){if(tunnel.assetId!=='underpass'||Math.abs(tunnel.elevation+tunnel.height-(o.elevation+h))>.3)continue;
   for(const side of [-1,1]){const a=tunnel.rotation*Math.PI/180,points=[[-.5,.2],[.5,.2],[.5,.5],[-.5,.5]].map(([x,z])=>{x*=tunnel.width;z*=tunnel.depth*side;return outdoorLocal(o,{x:tunnel.x+x*Math.cos(a)-z*Math.sin(a),z:tunnel.z+x*Math.sin(a)+z*Math.cos(a)});});if(points.every(p=>Math.abs(p.x)<w/2&&Math.abs(p.z)<d/2)){const hole=new THREE.Path();points.forEach((p,i)=>i?hole.lineTo(p.x,-p.z):hole.moveTo(p.x,-p.z));hole.closePath();shape.holes.push(hole);}}
  }
  const ground=add(root,new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}),mat(spec.color),[0,0,0],o.id,'outdoor-ground');ground.rotation.x=-Math.PI/2;
  if(o.assetId==='brick-sidewalk'||o.assetId==='concrete-sidewalk'){const rows=Math.min(40,Math.ceil(d/(o.assetId==='brick-sidewalk'?.4:1.2)));for(let i=0;i<rows;i++)N(1,.005,.003,0,1.004,-.5+(i+.5)/rows,'#d3c7b6','outdoor-ground');for(const x of [-.25,0,.25])N(.003,.005,1,x,1.004,0,'#d3c7b6','outdoor-ground');}
  if(o.assetId==='steel-paving')for(let i=0;i<12;i++)N(.85,.025,.004,0,1.01,-.46+i*.083,'#a6b0b3','outdoor-ground');
  if(o.assetId==='gravel-ground')for(let i=0;i<40;i++)N(.035,.06,.018,Math.sin(i*13.7)*.46,1.01,Math.cos(i*7.3)*.46,i%2?'#b3afa4':'#686960','outdoor-ground');
  if(spec.markable)marks(o.outdoor.marking);return true;
 }
 if(spec.shape==='line'){N(1,1,1,0,.5,0,spec.color,'outdoor-ground');return true;}
 if(spec.shape==='crosswalk'){marks('crosswalk');return true;}
 if(['hedge-island','bus-island'].includes(spec.shape)){
  B(w,.25,d,0,.125,0,'#b8b6a8','outdoor-ground');
  if(spec.shape==='hedge-island')B(w*.8,Math.max(.1,h-.25),d*.94,0,(h+.25)/2,0,'#4e7044');
  else{for(const z of [-d*.3,d*.3])B(.08,h-.25,.08,-w*.35,(h+.25)/2,z,'#5e7277');B(w,.12,d*.75,0,h-.06,0);B(.06,h*.6,d*.7,-w*.4,h*.5,0,'#b3cacb');B(w*.4,.08,d*.4,-w*.15,.7,0,'#877661');B(.08,h*.7,.08,w*.4,h*.35,d*.4,'#52656b');B(.45,.5,.06,w*.4,h*.7,d*.4,'#e9e5cd');}return true;
 }
 if(spec.shape==='drain'){N(1,1,1,0,.5,0,'#303839','outdoor-ground');for(let i=0;i<12;i++)N(.9,.12,.028,0,1,-.45+i*.082,'#939a99','outdoor-ground');return true;}
 if(spec.shape==='manhole'){const mesh=add(root,new THREE.CylinderGeometry(.5,.5,1,32),mat(spec.color),[0,h/2,0],o.id,'outdoor-ground');mesh.scale.set(w,h,d);for(let i=0;i<5;i++)B(w*.65,.003,d*.025,0,h+.002,-d*.28+i*d*.14,'#a0a5a2','outdoor-ground');return true;}
 if(spec.shape.includes('signal')){
  B(.09,h*.8,.09,0,h*.4,0,'#79827e');const count=signalLampCount(o),bh=h*.33;
  B(w,bh,d,0,h-bh/2,0,'#253132');const state=o.outdoor.signal;
  for(let i=0;i<count;i++){const stateName=signalLampStates(o)[i],color=state===stateName?({red:'#fa3c35',yellow:'#ffe045',green:'#37ed83'})[stateName]:'#283d38',y=h-bh*(i+.5)/count;
   const lamp=disk(Math.min(w*.32,bh/count*.36),0,color);lamp.userData.signalLamp=i+1;lamp.rotation.x=Math.PI/2;lamp.position.set(0,y,d/2+.008);
   if(spec.shape==='directional-signal'&&state===stateName){
    const dirs=o.outdoor.direction==='all'?['left','straight','right']:[o.outdoor.direction];for(let j=0;j<dirs.length;j++){const dir=dirs[j],size=w*.25,arrow=new THREE.Shape();arrow.moveTo(-.13,-.4);arrow.lineTo(.13,-.4);arrow.lineTo(.13,.05);arrow.lineTo(.4,.05);arrow.lineTo(0,.45);arrow.lineTo(-.4,.05);arrow.lineTo(-.13,.05);arrow.closePath();const m=add(root,new THREE.ShapeGeometry(arrow),mat('#f2ffe8'),[(j-(dirs.length-1)/2)*w*.28,y,d/2+.02],o.id,'object');m.scale.setScalar(size);m.rotation.z=dir==='left'?Math.PI/2:dir==='right'?-Math.PI/2:0;}
   }
   if(spec.shape==='pedestrian-signal'&&state===stateName){const bodyY=y-bh/count*.03;B(w*.08,bh/count*.35,.015,0,bodyY,d/2+.02,'#eaffeb');B(w*.28,.025,.015,0,bodyY+.02,d/2+.02,'#eaffeb');for(const side of [-1,1])B(.025,bh/count*.2,.015,side*w*.065,bodyY-bh/count*.24,d/2+.02,'#eaffeb');const head=disk(w*.07,0,'#eaffeb');head.rotation.x=Math.PI/2;head.position.set(0,y+bh/count*.25,d/2+.02);}

  }return true;
 }
 if(['footbridge','underpass'].includes(spec.shape)){
  const bridge=spec.shape==='footbridge',run=d*.3,n=Math.ceil(h/.18),step=run/n,centerY=bridge?h:0;
  B(w,.15,d*.4,0,centerY-.075,0,'#aeb8b8','outdoor-ground');
  for(const side of [-1,1])for(let i=0;i<n;i++){const rise=(i+1)*h/n,y=bridge?rise:h-rise,z=side*(d/2-(i+.5)*step);B(w,.15,step,0,y-.075,z,'#b9beb7','outdoor-ground');for(const x of [-w/2+.04,w/2-.04])B(.04,1,.04,x,y+.5,z,'#65787c');}
  for(const x of [-w/2,w/2]){B(.06,1,d*.4,x,centerY+.5,0,'#65787c');if(bridge)for(const z of [-d*.18,d*.18])B(.2,h,.2,x,h/2,z,'#8f9997');else B(.15,h,d*.4,x,h/2,0,'#929d9b');}
  if(!bridge)B(w+.3,.15,d*.4,0,h-.075,0,'#9da7a5');return true;
 }
 return false;
}
export function drawOutdoorPlan(c,o,zoom){const w=o.width*zoom,d=o.depth*zoom;const spec=o.assetId;
 if(o.outdoor&&o.assetId.includes('signal')){c.fillStyle='#f3e9cb';c.font='10px Microsoft JhengHei';c.textAlign='center';c.fillText(signalLampCount(o)+' 燈',0,4);}
 if(['lane-dashed-white','lane-double-yellow','crosswalk','asphalt-road','concrete-paving','steel-paving'].includes(spec)){const type=spec==='crosswalk'?'crosswalk':o.outdoor?.marking;c.fillStyle=spec==='lane-double-yellow'||type?.toLowerCase().includes('yellow')?'#e5c448':'#fff8dc';for(const r of objectMarks(o))c.fillRect((r.x-r.w/2)*w,(r.z-r.d/2)*d,r.w*w,r.d*d);}
 if(['footbridge','underpass'].includes(spec)){c.strokeStyle='#d8dccc';for(const side of [-1,1])for(let i=0;i<12;i++){const z=side*(.5-i*.3/12)*d;c.beginPath();c.moveTo(-w/2,z);c.lineTo(w/2,z);c.stroke();}}
}
