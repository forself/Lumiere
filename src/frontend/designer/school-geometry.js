import * as THREE from '../../../node_modules/three/build/three.module.js';
export function buildSchoolAsset(root,o,spec,{box,add,materials}){
 if(!spec.schoolShape)return false;
 const {width:w,depth:d,height:h}=o,key='school-'+spec.id;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color:spec.color,roughness:.75}));
 if(!materials.has('school-metal'))materials.set('school-metal',new THREE.MeshStandardMaterial({color:'#657a7b',roughness:.45}));
 const mat=materials.get(key),metal=materials.get('school-metal');
 const B=(a,b,c,x,y,z,m=mat)=>box(root,a*w,b*h,c*d,x*w,y*h,z*d,m,o.id,'object');
 const legs=(top=.9)=>{for(const x of [-.43,.43])for(const z of [-.4,.4])B(.05,top,.06,x,top/2,z,metal);};
 const shape=spec.schoolShape;
 if(shape==='monitor'){B(.5,.04,.9,0,.02,0);B(.08,.3,.15,0,.18,.1);B(1,.7,.15,0,.65,.1);if(!materials.has('school-screen-'+!!o.deviceState?.power))materials.set('school-screen-'+!!o.deviceState?.power,new THREE.MeshStandardMaterial({color:o.deviceState?.power?'#5d9ca9':'#172227',roughness:.35}));B(.93,.62,.02,0,.65,.015,materials.get('school-screen-'+!!o.deviceState?.power));}
 else if(shape==='tower'){B(1,1,1,0,.5,0);B(.8,.09,.02,0,.85,-.51,metal);B(.12,.06,.02,.28,.7,-.51,metal);for(let i=0;i<6;i++)B(.65,.015,.02,0,.18+i*.045,-.51,metal);}
 else if(shape==='keyboard'){B(1,.4,1,0,.2,0);for(let row=0;row<4;row++)for(let col=0;col<12;col++)B(.065,.55,.16,-.45+col*.082,.675,-.36+row*.23,metal);}
 else if(shape==='mouse'){const mesh=add(root,new THREE.SphereGeometry(.5,12,8),mat,[0,h*.5,0],o.id,'object');mesh.scale.set(w,h,d);B(.1,.08,.15,0,.95,-.1,metal);}
 else if(shape==='desk'){B(1,.07,1,0,.965,0);legs(.93);B(.85,.04,.8,0,.68,0,metal);}
 else if(shape==='chair'||shape==='bench'){B(1,.08,.85,0,.55,0);B(1,.4,.08,0,.8,.44);legs(.51);}
 else if(shape==='board'){B(1,1,1,0,.5,0,metal);B(.97,.93,.2,0,.5,-.6);B(1,.035,2,0,.02,-.5,metal);}
 else if(shape==='lockers'||shape==='cubby'){const rows=shape==='cubby'?3:2;for(const x of [-.49,.49,-.167,.167])B(.02,1,1,x,.5,0);for(let i=0;i<=rows;i++)B(1,.025,1,0,i/rows,0);B(1,1,.03,0,.5,.48);if(shape==='lockers')for(let row=0;row<2;row++)for(let col=0;col<3;col++){B(.3,.46,.03,-.333+col*.333,.25+row*.5,-.48);B(.025,.06,.05,-.23+col*.333,.25+row*.5,-.51,metal);}}
 else if(shape==='fountain'){B(1,.8,1,0,.4,0);B(1,.18,.15,0,.9,.42,metal);B(.85,.035,.8,0,.82,-.04,metal);for(const x of [-.25,.25])B(.08,.08,.2,x,.91,.3,metal);}
 else if(shape==='trough'){B(.95,.12,.9,0,.62,0);for(const x of [-.47,.47])B(.04,.22,.95,x,.79,0);for(const z of [-.45,.45])B(1,.22,.04,0,.79,z);for(const x of [-.35,0,.35]){B(.02,.22,.04,x,.89,.38,metal);B(.02,.025,.23,x,.98,.28,metal);}B(.12,.56,.65,-.35,.28,0);B(.12,.56,.65,.35,.28,0);}
 else if(shape==='notice'){B(1,.55,1,0,.72,0);for(const x of [-.42,.42])B(.035,.5,.5,x,.25,0,metal);B(.9,.45,.08,0,.72,-.55,metal);}
 else if(shape==='flag'){B(.5,.035,1,0,.0175,0);B(.04,1,.06,-.3,.5,0,metal);B(.65,.18,.018,.04,.87,0);}
 else if(shape==='hoop'){B(.6,.025,.5,0,.0125,.25);B(.06,.9,.06,0,.45,.34,metal);B(.06,.04,.65,0,.85,0,metal);B(1,.27,.025,0,.85,-.32);const ring=add(root,new THREE.TorusGeometry(w*.125,.018,6,20),metal,[0,h*.77,-d*.43],o.id,'object');ring.rotation.x=Math.PI/2;}
 else if(shape==='goal'){for(const x of [-.48,.48]){B(.035,1,.04,x,.5,-.45);B(.035,.025,1,x,.0125,0);}B(1,.035,.04,0,.98,-.45);for(let i=0;i<=12;i++)B(.005,.9,.012,-.48+i*.08,.45,.45);for(let i=1;i<8;i++)B(1,.005,.012,0,i*.12,.45);}
 else if(shape==='rack'){B(1,.06,.08,0,.04,.35,metal);for(let i=0;i<6;i++){const x=-.45+i*.18;B(.015,.9,.04,x,.48,0,metal);B(.015,.04,.8,x,.93,0,metal);B(.015,.9,.04,x,.48,.38,metal);}}
 else if(shape==='bins'){for(let i=0;i<3;i++){B(.29,.88,1,-.34+i*.34,.44,0);B(.3,.05,1.05,-.34+i*.34,.91,0,metal);B(.16,.08,.03,-.34+i*.34,.7,-.51,metal);}}
 else{for(const x of [-.485,.485])B(.03,1,1,x,.5,0,metal);B(1,.025,1,0,.985,0,metal);B(1,.025,1,0,.04,0,metal);if(shape==='horizontal'){for(const y of [.3,.55,.8])B(1,.025,.7,0,y,0,metal);}else{const n=Math.min(80,Math.ceil(w/(shape==='mesh'?.2:.12)));for(let i=1;i<n;i++)B(.008,.93,.3,-.5+i/n,.5,0,metal);if(shape==='mesh')for(let i=1;i<Math.ceil(h/.2);i++)B(1,.005,.3,0,i/Math.ceil(h/.2),0,metal);}}
 return true;
}
