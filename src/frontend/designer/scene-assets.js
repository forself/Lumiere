import * as THREE from '../../../node_modules/three/build/three.module.js';
// 現場重建的低面數示意模型；尺寸由物件資料提供，不推定身分、痕跡成因或防護性能。
export function buildSceneAsset(root,o,spec,{box,add,mat,metal,glass,service}){
 if(spec.category!=='scene')return false;
 const {width:w,height:h,depth:d}=o,shape=spec.shape;
 const B=(sx,sy,sz,x,y,z,m=mat)=>box(root,sx*w,sy*h,sz*d,x*w,y*h,z*d,m,o.id,'object');
 const primitive=(g,sx,sy,sz,x,y,z,m=service)=>{const mesh=add(root,g,m,[x*w,y*h,z*d],o.id,'object');mesh.scale.set(sx*w,sy*h,sz*d);return mesh;};
 const E=(sx,sy,sz,x,y,z,m=service)=>primitive(new THREE.SphereGeometry(.5,12,8),sx,sy,sz,x,y,z,m);
 const C=(sx,sy,sz,x,y,z,m=service)=>primitive(new THREE.ConeGeometry(.5,1,8),sx,sy,sz,x,y,z,m);
 if(shape==='trace'){
  // 示意圖形不含真實指紋紋理或鞋底特徵。
  if(['shoeprint','footprint'].includes(o.assetId)){E(.8,.3,.62,0,.25,-.15,metal);E(.6,.3,.25,0,.25,.32,metal);if(o.assetId==='footprint')for(let i=0;i<5;i++)E(.12,.3,.1,-.3+i*.15,.25,-.45,metal);}
  else if(o.assetId==='fingerprint'){E(.9,.3,.9,0,.25,0,metal);B(.04,.2,.7,0,.5,0,service);}
  else if(['hair-trace','fiber-trace'].includes(o.assetId)){for(let i=0;i<8;i++)E(.09,.3,.16,Math.sin(i*.7)*.23,.25,-.4+i*.11,metal);}
  else {B(.9,.3,.12,0,.25,0,metal);B(.12,.3,.9,0,.25,0,metal);}
  return true;
 }
 if(shape==='perimeter-wall'){B(1,1,1,0,.5,0);return true;}
 if(['perimeter-rail','wire-mesh','electric-fence'].includes(shape)){
  for(const x of [-.48,.48])B(.035,1,.75,x,.5,0,metal);
  const rows=shape==='perimeter-rail'?2:8,cols=shape==='perimeter-rail'?10:16;
  for(let i=0;i<rows;i++)B(.98,.012,.25,0,.05+.9*i/(rows-1),0,metal);
  for(let i=0;i<cols;i++)B(.006,.9,.25,-.44+.88*i/(cols-1),.5,0,metal);
  if(shape==='electric-fence'){B(.12,.12,1,0,.7,0,service);B(.015,.075,.1,0,.7,-.5,metal);}return true;
 }
 if(shape==='glass-topping'||shape==='spike-topping'){
  B(1,.08,1,0,.04,0,metal);
  for(let i=0;i<9;i++){const height=shape==='glass-topping'?.55+(i%3)*.15:.85;C(.07,height,.6,-.44+i*.11,.08+height/2,(i%2?1:-1)*.08,shape==='glass-topping'?glass:metal);}return true;
 }
 if(shape==='human'){
  E(.38,.15,.65,0,.925,0);B(.52,.34,.7,0,.65,0,service);B(.53,.12,.75,0,.42,0,service);
  for(const x of [-.17,.17]){B(.23,.36,.62,x,.19,0,service);E(.25,.065,.9,x,.033,-.04,metal);}
  for(const x of [-.39,.39]){E(.22,.36,.65,x,.62,0);E(.18,.08,.5,x,.405,0);}return true;
 }
 if(shape==='human-rider'){
  // 本地 -Z 為前方；鞋底 y=0、座面接觸 y=.35h/z=.25d、頭頂 y=h。
  // 獨立示意人型，不綁定特定車款；用 elevation 與座椅對齊，尺寸／色彩沿用 prop。
  const part=(name,mesh)=>{mesh.name='human-rider:'+name;return mesh;};
  const limb=(name,a,b)=>{
   const start=new THREE.Vector3(a[0]*w,a[1]*h,a[2]*d),end=new THREE.Vector3(b[0]*w,b[1]*h,b[2]*d),delta=end.clone().sub(start);
   const radius=Math.min(w*.07,h*.025,d*.045);
   const mesh=part(name,add(root,new THREE.CylinderGeometry(radius,radius,delta.length(),8),mat,start.clone().add(end).multiplyScalar(.5).toArray(),o.id,'object'));
   mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return radius;
  };
  // 肩寬腰窄；避免橢圓球軀幹呈現鼓肚輪廓。
  part('torso',primitive(new THREE.CylinderGeometry(.5,.34,1,12),.74,.37,.30,0,.65,.20,mat));
  part('pelvis',E(.66,.14,.34,0,.42,.25,mat));
  part('neck',E(.22,.08,.22,0,.83,.13,mat));
  // 頭部在常用 1.10–1.35 m 騎姿高度仍為縱向長橢圓；頭頂維持 y=h。
  part('head',E(.32,.20,.25,0,.90,.08,service));
  for(const [side,sign] of [['left',-1],['right',1]]){
   const hip=[sign*.22,.42,.25],knee=[sign*.31,.39,-.12],ankle=[sign*.31,.09,-.13];
   const shoulder=[sign*.36,.77,.18],elbow=[sign*.41,.62,-.12],wrist=[sign*.35,.62,-.36];
   limb(side+'-thigh',hip,knee);const radius=limb(side+'-shin',knee,ankle);
   limb(side+'-upper-arm',shoulder,elbow);limb(side+'-forearm',elbow,wrist);
   for(const [joint,point] of [['knee',knee],['elbow',elbow]])part(side+'-'+joint,add(root,new THREE.SphereGeometry(radius,8,6),mat,[point[0]*w,point[1]*h,point[2]*d],o.id,'object'));
   part(side+'-foot',E(.28,.075,.36,sign*.31,.0375,-.22,metal));
   part(side+'-hand',E(.16,.065,.14,sign*.35,.62,-.40,mat));
  }
  return true;
 }
 if(['cat','dog','cow','pig'].includes(shape)){
  E(.75,.46,.6,0,.52,.04);E(.6,.36,.28,0,.76,-.3);
  E(shape==='pig'?.4:.3,.14,.18,0,.69,-.41);
  for(const x of [-.26,.26])for(const z of [-.16,.25]){B(.13,.35,.09,x,.19,z,service);B(.16,.07,.12,x,.035,z,metal);}
  for(const x of [-.19,.19])C(.18,.17,.14,x,.91,-.3);
  if(shape==='cat')E(.1,.5,.1,0,.65,.44);
  else if(shape==='pig')E(.12,.12,.1,0,.6,.4);
  else E(.09,.35,.09,0,.4,.43);
  if(shape==='cow'){for(const x of [-.39,.39])E(.02,.2,.2,x,.55,.02,metal);B(.28,.08,.16,0,.27,.14,service);}
  return true;
 }
 if(shape==='broadleaf-tree'||shape==='conifer-tree'){
  primitive(new THREE.CylinderGeometry(.5,.65,1,8),.12,.55,.12,0,.275,0,mat);
  if(shape==='broadleaf-tree'){E(.94,.6,.94,0,.7,0);E(.6,.42,.6,-.2,.65,.15);E(.6,.42,.6,.2,.65,-.15);}
  else{C(1,.65,1,0,.675,0);C(.75,.5,.75,0,.75,0);}return true;
 }
 if(shape==='puddle'||shape==='bloodstain'){
  const outline=new THREE.Shape();for(let i=0;i<32;i++){const angle=i/32*Math.PI*2,r=.43+.045*Math.sin(i*2.1)+.025*Math.cos(i*.7),x=Math.cos(angle)*r*w,z=Math.sin(angle)*r*d;i?outline.lineTo(x,-z):outline.moveTo(x,-z);}outline.closePath();const mesh=add(root,new THREE.ExtrudeGeometry(outline,{depth:h,bevelEnabled:false,curveSegments:1}),service,[0,0,0],o.id,'object');mesh.rotation.x=-Math.PI/2;return true;
 }
 return false;
}
