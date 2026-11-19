import {stairWallAt} from './stairs.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {mergeGeometries} from '../../../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
// Merge static pieces by material and collision role: detailed rails without one draw call per baluster.
export function buildStair(s,rise,building){
 const group=new THREE.Group(),batches=new Map(),materials=new Map();
 const colors={body:'#d9d6cf',tread:s.finish==='oak'?'#af8053':'#eee9dd',metal:'#3f4645',hand:s.finish==='oak'?'#865b38':'#555a56'};
 const box=(w,h,d,x,y,z,color,kind='stair',rx=0)=>{const key=color+kind,g=new THREE.BoxGeometry(w,h,d);g.rotateX(rx);g.translate(x,y,z);if(!batches.has(key))batches.set(key,{color,kind,geometries:[]});batches.get(key).geometries.push(g);};

 const edge=(x0,z0,x1,z1,y0,y1)=>{const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/.15));for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n,m=(a+b)/2,point=t=>({x:x0+(x1-x0)*t,z:z0+(z1-z0)*t,y:y0+(y1-y0)*t});const A=point(a),B=point(b),M=point(m),wall=building&&[A,M,B].every(p=>stairWallAt(building,s,p.x,p.z,p.y));
 if(!wall||s.wallHandrail!=='no'){const len=Math.hypot(B.z-A.z,B.y-A.y),alongX=Math.abs(x1-x0)>.001;box(alongX?Math.abs(B.x-A.x):.065,.065,alongX?.065:len,M.x,M.y+1,M.z,colors.hand,'stair-rail',alongX?0:-Math.atan2(B.y-A.y,B.z-A.z));}
 if(!wall)box(.025,.94,.025,A.x,A.y+.47,A.z,colors.metal,'stair-rail');else if(s.wallHandrail!=='no'&&i%4===0){const hit=stairWallAt(building,s,M.x,M.z,M.y);box(Math.max(.04,Math.abs(hit.dx)),.04,Math.max(.04,Math.abs(hit.dz)),M.x+hit.dx/2,M.y+.96,M.z+hit.dz/2,colors.metal,'stair-rail');}
 }const wall=building&&stairWallAt(building,s,x1,z1,y1);if(!wall)box(.025,.94,.025,x1,y1+.47,z1,colors.metal,'stair-rail');};
 const rail=(x,z0,z1,y0,y1)=>edge(x,z0,x,z1,y0,y1);
 const crossRail=(x0,x1,z,y)=>edge(x0,z,x1,z,y,y);
 const flight=(cx,width,zStart,zEnd,yStart,yEnd)=>{const n=Math.ceil((yEnd-yStart)/.18),run=Math.abs(zEnd-zStart),tread=run/n,sign=Math.sign(zEnd-zStart);for(let i=0;i<n;i++){const y=yStart+(i+1)*(yEnd-yStart)/n,z=zStart+sign*(i+.5)*tread;box(width,y-yStart-.035,tread,cx,yStart+(y-yStart-.035)/2,z,colors.body);box(width+.025,.035,tread+.018,cx,y-.0175,z,colors.tread);}for(const side of [-1,1])rail(cx+side*(width/2-.035),zStart,zEnd,yStart+.05,yEnd);};
 if(s.layout==='return'){
  const width=(s.width-.2)/2,cx=(width+.2)/2,turn=-s.length/2+width;
  flight(-cx,width,s.length/2,turn,0,rise/2);flight(cx,width,turn,s.length/2,rise/2,rise);
  box(s.width,.2,width,0,rise/2-.135,-s.length/2+width/2,colors.body);box(s.width,.035,width,0,rise/2-.0175,-s.length/2+width/2,colors.tread);
  rail(-s.width/2+.035,turn,-s.length/2+.035,rise/2,rise/2);rail(s.width/2-.035,turn,-s.length/2+.035,rise/2,rise/2);crossRail(-s.width/2+.035,s.width/2-.035,-s.length/2+.035,rise/2);
  for(const side of [-1,1])rail(side*(s.width/2+.055),-s.length/2,s.length/2,rise,rise);
  crossRail(-s.width/2-.055,s.width/2+.055,-s.length/2-.055,rise);crossRail(-s.width/2-.055,.1,s.length/2+.055,rise);
 }else{flight(0,s.width,s.length/2,-s.length/2,0,rise);for(const side of [-1,1])rail(side*(s.width/2+.055),-s.length/2,s.length/2,rise,rise);crossRail(-s.width/2-.055,s.width/2+.055,s.length/2+.055,rise);}
 for(const [key,b] of batches){const geometry=mergeGeometries(b.geometries);b.geometries.forEach(g=>g.dispose());if(!materials.has(b.color))materials.set(b.color,new THREE.MeshStandardMaterial({color:b.color,roughness:b.color===colors.metal?.45:.75}));const mesh=new THREE.Mesh(geometry,materials.get(b.color));mesh.userData={kind:b.kind,ignorePicking:true};group.add(mesh);}
 return {group,dispose(){group.children.forEach(m=>m.geometry.dispose());materials.forEach(m=>m.dispose());}};
}
