import * as THREE from '../../../node_modules/three/build/three.module.js';
// Generic configurable silhouettes. Front is local -Z; dimensions include mirrors/wheels.
export function buildVehicle(root,o,spec,{box,add,mat,materials}){
 if(!spec.vehicleType)return false;
 const w=o.width,d=o.depth,h=o.height,t=spec.vehicleType;
 const material=(key,color)=>{key='vehicle-'+key;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.65}));return materials.get(key);};
 const rubber=material('rubber','#20272b'),trim=material('trim','#46525a'),glass=material('glass','#537986'),lamp=material('headlamp','#f2ebc8'),red=material('tail','#a93632'),rim=material('rim','#9ca6ac');
 const B=(x,y,z,sx,sy,sz,m=mat)=>box(root,sx*w,sy*h,sz*d,x*w,y*h,z*d,m,o.id,'object');
 const cylinder=(radius,length,x,y,z,m)=>{const mesh=add(root,new THREE.CylinderGeometry(radius,radius,length,16),m,[x,y,z],o.id,'object');mesh.rotation.z=Math.PI/2;return mesh;};
 const rod=(a,b,r,m=trim)=>{const from=new THREE.Vector3(a[0]*w,a[1]*h,a[2]*d),to=new THREE.Vector3(b[0]*w,b[1]*h,b[2]*d),v=to.clone().sub(from);const mesh=add(root,new THREE.CylinderGeometry(r,r,v.length(),8),m,from.clone().add(to).multiplyScalar(.5).toArray(),o.id,'object');mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());};
 const hull=(width,profile,m)=>{const p=[];for(const x of [-width*w/2,width*w/2])for(const [y,z]of profile)p.push(x,y*h,z*d);const n=profile.length,idx=[];for(let i=1;i<n-1;i++){idx.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return add(root,g,m,[0,0,0],o.id,'object');};

 const heavy=['dump-truck','semi-trailer','heavy-truck','motorhome','city-bus','coach'].includes(t);
 if(heavy){
  const transit=['city-bus','coach'].includes(t),semi=t==='semi-trailer',camper=t==='motorhome',dump=t==='dump-truck';
  const axles=semi?[-.41,-.24,-.16,.27,.35,.43]:camper?[-.32,.31]:transit?[-.33,.29]:[-.35,.22,.34];
  const r=Math.min(h*.16,w*.22),thick=w*.12;
  for(const z of axles)for(const x of [-1,1]){cylinder(r,thick,x*(w-thick)/2,r,z*d,rubber);cylinder(r*.55,thick*1.02,x*(w-thick)/2,r,z*d,rim);}
  B(0,.2,semi?-.3:0,.8,.08,semi?.38:.91,trim);
  if(transit||camper){
   B(0,.53,0,.93,.76,.94);B(0,.93,0,.9,.06,.92);
   B(0,.72,-.476,.8,.29,.014,glass);
   const n=camper?3:7;
   for(const x of [-.47,.47])for(let i=0;i<n;i++)B(x,transit?.72:.7,-.32+i*(.66/(n-1)),.014,camper?.17:.22,camper?.12:.075,glass);
   // Passenger doors on right: city bus has front and middle doors, coach one front door.
   for(const z of (t==='city-bus'?[-.35,.03]:[-.34])){B(.476,.44,z,.015,.48,.075,trim);B(.486,.58,z,.012,.18,.058,glass);}
   if(t==='coach')for(const x of [-.474,.474])for(const z of [-.2,0,.2])B(x,.31,z,.012,.2,.17,trim);
   if(camper){B(0,.95,.06,.46,.08,.17,trim);B(0,.83,-.35,.94,.26,.29);B(-.483,.81,.07,.025,.04,.52,trim);}
   if(t==='city-bus')B(0,.91,-.481,.7,.06,.012,trim);
  }else{
   const cabBack=semi?-.23:-.19;
   B(0,.46,(-.47+cabBack)/2,.92,.58,cabBack+.47);
   B(0,.68,-.477,.8,.21,.014,glass);
   for(const x of [-.47,.47])B(x,.66,-.36,.014,.2,.13,glass);
   B(0,.78,(-.46+cabBack)/2,.94,.06,cabBack+.46);
   if(semi){B(0,.25,-.13,.48,.05,.12,trim);B(0,.23,.16,.78,.07,.65,trim);B(0,.64,.16,.96,.7,.66);B(0,.64,.494,.89,.62,.01,trim);}
   else if(dump){
    B(0,.41,.15,.87,.06,.65,trim);
    for(const x of [-.46,.46]){B(x,.64,.15,.055,.42,.65);for(const z of [-.1,.06,.22,.38])B(x*1.04,.64,z,.025,.41,.018,trim);}
    for(const z of [-.18,.475])B(0,.64,z,.92,.42,.035);
    const gravel=material('gravel','#857f70');B(0,.48,.15,.8,.1,.59,gravel);hull(.73,[[.53,-.13],[.7,.1],[.65,.27],[.53,.43]],gravel);
   }else{B(0,.62,.15,.96,.74,.66);B(0,.62,.484,.88,.65,.014,trim);B(0,.62,.494,.02,.64,.01,rim);}
  }
  for(const x of [-.34,.34]){B(x,.3,-.484,.18,.075,.014,lamp);B(x,.3,.484,.15,.075,.014,red);}
  for(const x of [-.48,.48])B(x,.65,-.4,.035,.12,.035,trim);
  return true;
 }
 const bike=['scooter','motorcycle'].includes(t);
 const r=Math.min(h*(bike?.23:.19),d*(bike?.16:.085)),tire=bike?w*.19:w*.12;
 for(const z of (bike?[-.34,.34]:[-.31,.31]))for(const x of (bike?[0]:[-(w-tire)/2,(w-tire)/2])){cylinder(r,tire,x,r,z*d,rubber);cylinder(r*.55,tire*1.02,x,r,z*d,rim);}
 if(bike){
  B(0,.61,.2,.62,.12,.37,rubber);
  if(t==='scooter'){
   B(0,.37,.22,.62,.31,.38);B(0,.24,-.02,.55,.06,.38,trim);
   // 低面數圓角擋板：上寬下窄，正面略向前鼓起，保留腳踏空間。
   const outline=new THREE.Shape();outline.moveTo(-.16*w,.24*h);outline.lineTo(.16*w,.24*h);
   outline.quadraticCurveTo(.20*w,.24*h,.215*w,.31*h);outline.lineTo(.31*w,.64*h);
   outline.quadraticCurveTo(.34*w,.76*h,.24*w,.76*h);outline.lineTo(-.24*w,.76*h);
   outline.quadraticCurveTo(-.34*w,.76*h,-.31*w,.64*h);outline.lineTo(-.215*w,.31*h);
   outline.quadraticCurveTo(-.20*w,.24*h,-.16*w,.24*h);outline.closePath();
   const shield=new THREE.ExtrudeGeometry(outline,{depth:.05*d,bevelEnabled:false,curveSegments:3}),positions=shield.attributes.position;
   for(let i=0;i<positions.count;i++){const y=(positions.getY(i)/h-.24)/.52,x=positions.getX(i)/(.34*w);positions.setZ(i,positions.getZ(i)+(-.25-.06*Math.sin(Math.PI*y)-.03*y+.025*x*x)*d);}
   shield.computeVertexNormals();add(root,shield,mat,[0,0,0],o.id,'object').name='vehicle-scooter:front-shield';
   // 雙面封邊的薄殼土除，覆蓋前輪上緣，深度仍落在車輛外框內。
   const points=[],indices=[],steps=8,columns=4,row=columns+1,surface=(steps+1)*row,zRadius=Math.min(r+.02*h,.155*d);
   for(let layer=0;layer<2;layer++)for(let i=0;i<=steps;i++)for(let j=0;j<=columns;j++){
    const angle=-1.15+2.3*i/steps,u=-1+2*j/columns;
    points.push(u*tire*.62,r+(r+.02*h+.01*h*(1-u*u)+layer*.01*h)*Math.cos(angle),-.34*d+zRadius*Math.sin(angle));
   }
   for(let i=0;i<steps;i++)for(let j=0;j<columns;j++){
    const a=i*row+j,b=a+row;indices.push(a,a+1,b,a+1,b+1,b,a+surface,b+surface,a+1+surface,a+1+surface,b+surface,b+1+surface);
   }
   const rim=(a,b)=>indices.push(a,b,a+surface,b,b+surface,a+surface);
   for(let i=0;i<steps;i++){rim(i*row,(i+1)*row);rim((i+1)*row+columns,i*row+columns);}
   for(let j=0;j<columns;j++){rim(j+1,j);rim(steps*row+j,steps*row+j+1);}
   const fender=new THREE.BufferGeometry();fender.setAttribute('position',new THREE.Float32BufferAttribute(points,3));fender.setIndex(indices);fender.computeVertexNormals();
   add(root,fender,mat,[0,0,0],o.id,'object').name='vehicle-scooter:front-fender';
  }
  else{B(0,.38,.04,.42,.23,.22,trim);hull(.62,[[.52,-.15],[.68,-.12],[.72,.01],[.55,.13]],mat);rod([0,.34,.3],[0,.64,-.12],w*.055);rod([.32,.25,.12],[.32,.3,.38],w*.06,rim);}
  for(const x of [-.16,.16])rod([x,r/h,-.34],[x,.76,-.25],w*.035,rim);
  rod([-.43,.78,-.24],[.43,.78,-.24],w*.04,trim);
  for(const x of [-.36,.36]){rod([x,.78,-.24],[x,.95,-.24],w*.018);B(x,.965,-.24,.19,.07,.04,glass);}
  B(0,.73,-.285,.36,.14,.04,lamp);B(0,.59,.405,.35,.07,.025,red);return true;
 }
 const truck=['pickup','light-truck','box-truck'].includes(t),van=['van','mpv'].includes(t);
 B(0,.28,0,.94,.23,.94);B(0,.16,0,.82,.08,.83,trim);
 B(0,.25,-.48,.84,.055,.025,trim);B(0,.25,.48,.84,.055,.025,trim);
 for(const x of [-.33,.33]){B(x,.38,-.476,.2,.09,.018,lamp);B(x,.38,.476,.17,.1,.018,red);}
 let front=-.21,back=.29,top=.94;
 if(t==='sedan'){front=-.18;back=.22;top=.94;}
 if(t==='hatchback'){front=-.21;back=.39;}
 if(t==='wagon'){front=-.2;back=.39;}
 if(t==='suv'){front=-.24;back=.35;}
 if(van){front=-.37;back=.41;top=.98;}
 if(truck){front=t==='pickup'?-.24:-.43;back=t==='pickup'?.03:-.12;top=t==='box-truck'?.7:.96;}
 const roofFront=front+.09,roofBack=back-.055;
 hull(.8,[[.43,front],[top-.035,roofFront],[top-.035,roofBack],[.43,back]],glass);
 B(0,top-.015,(roofFront+roofBack)/2,.85,.03,roofBack-roofFront,mat);
 // Pillars divide the side glazing and roof, all contained within the asset bounds.
 for(const x of [-.408,.408])for(const z of [roofFront,(roofFront+roofBack)/2,roofBack])B(x,(top+.43)/2,z,.03,top-.43,.018,mat);
 for(const x of [-.47,.47])B(x,.59,front+.02,.06,.06,.07,trim);
 if(truck){const start=back+.03,end=.46;
  if(t==='box-truck'){B(0,.62,(start+end)/2,.96,.76,end-start,mat);B(0,.62,end+.005,.88,.66,.015,trim);B(0,.62,end+.014,.015,.64,.01,rim);}
  else{B(0,.425,(start+end)/2,.82,.025,end-start,trim);for(const x of [-.45,.45])B(x,.53,(start+end)/2,.055,.2,end-start);B(0,.53,end,.94,.2,.04);}
 }
 return true;
}
export function vehiclePlanParts(o){
 const type=o.assetId.replace('vehicle-',''),bike=['scooter','motorcycle'].includes(type);
 if(bike)return [{x:-.1,z:-.47,w:.2,d:.2,color:'#252b30'},{x:-.1,z:.27,w:.2,d:.2,color:'#252b30'},{x:-.32,z:.04,w:.64,d:.3,color:'#303b41'},{x:-.45,z:-.26,w:.9,d:.045,color:'#394d57'}];
 if(['dump-truck','semi-trailer','heavy-truck','motorhome','city-bus','coach'].includes(type))return [{x:-.38,z:-.46,w:.76,d:.08,color:'#537986'},...(type==='dump-truck'?[{x:-.38,z:-.14,w:.76,d:.57,color:'#857f70'}]:type==='semi-trailer'?[{x:-.24,z:-.2,w:.48,d:.07,color:'#303a41'},{x:-.46,z:-.16,w:.92,d:.65,color:'#c1c6c8'}]:[{x:-.3,z:-.08,w:.6,d:.16,color:'#737e85'},{x:-.3,z:.2,w:.6,d:.16,color:'#737e85'}]),{x:-.35,z:.47,w:.7,d:.02,color:'#a93632'}];
 const truck=['pickup','light-truck','box-truck'].includes(type),van=['van','mpv'].includes(type);return [{x:-.37,z:van?-.36:-.25,w:.74,d:truck?.16:van?.13:.13,color:'#537986'},...(truck?[{x:-.39,z:-.03,w:.78,d:.44,color:type==='box-truck'?'#a8afb0':'#39454b'}]:[{x:-.37,z:van?.27:.19,w:.74,d:.11,color:'#537986'}]),{x:-.32,z:-.49,w:.64,d:.025,color:'#eee6bf'}];
}
export function drawVehiclePlan(c,o,zoom){if(!o.assetId.startsWith('vehicle-'))return;for(const p of vehiclePlanParts(o)){c.fillStyle=p.color;c.fillRect(p.x*o.width*zoom,p.z*o.depth*zoom,p.w*o.width*zoom,p.d*o.depth*zoom);}}
export function vehiclePlanSvg(o){if(!o.assetId.startsWith('vehicle-'))return '';return vehiclePlanParts(o).map(p=>`<rect x="${p.x*o.width}" y="${p.z*o.depth}" width="${p.w*o.width}" height="${p.d*o.depth}" fill="${p.color}"/>`).join('');}
