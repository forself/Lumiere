import {buildVehicle} from './vehicle-geometry.js';
import {buildSchoolAsset} from './school-geometry.js';
import {buildOutdoorAsset} from './outdoor.js';
import {buildSceneAsset} from './scene-assets.js';
import {MATERIAL_PRESETS} from './material-library.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../../node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';

// 文字只由固定字型與 Canvas fillText 產生，不把輸入當 HTML 或圖片網址。
export function textPanelTexture(text,width,height,{canvasFactory,inkColor='#25342e'}={}){
  const ratio=Math.max(.001,width/height),canvas=canvasFactory?.()||(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1):globalThis.document?.createElement('canvas'));
  if(!canvas)return null;
  canvas.width=Math.max(64,Math.min(512,Math.round(ratio>=1?512:512*ratio)));
  canvas.height=Math.max(64,Math.min(512,Math.round(ratio>=1?512/ratio:512)));
  const c=canvas.getContext('2d');if(!c)return null;
  const padding=Math.min(canvas.width,canvas.height)*.065,available=canvas.width-2*padding,source=String(text||'').slice(0,64).replace(/\r/g,'').split('\n');
  const wrap=size=>{c.font=`600 ${size}px "Microsoft JhengHei", sans-serif`;const lines=[];for(const line of source){let part='';for(const char of Array.from(line)){if(part&&c.measureText(part+char).width>available){lines.push(part);part=char;}else part+=char;}lines.push(part);}return lines;};
  let font=Math.min(96,(canvas.height-2*padding)/Math.max(source.length,1)/1.25),lines=wrap(font);
  for(let i=0;i<20&&lines.length*font*1.25>canvas.height-2*padding;i++){font*=.85;lines=wrap(font);}
  c.clearRect(0,0,canvas.width,canvas.height);c.fillStyle=inkColor;c.textAlign='center';c.textBaseline='middle';
  const lineHeight=font*1.25,top=canvas.height/2-(lines.length-1)*lineHeight/2;
  lines.forEach((line,index)=>c.fillText(line,canvas.width/2,top+index*lineHeight,available));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.userData={textPanel:true,text:String(text||'').slice(0,64),width:canvas.width,height:canvas.height,inkColor};return texture;
}
// 程序配置模型，非廠商施工／產品模型。
export function buildAsset(root,o,spec,{box,add,mat,metal,glass,service,materials,project}){
  if(buildVehicle(root,o,spec,{box,add,mat,materials}))return;
  if(buildSchoolAsset(root,o,spec,{box,add,materials}))return;
  if(buildOutdoorAsset(root,o,spec,{box,add,materials,project}))return;
  if(buildSceneAsset(root,o,spec,{box,add,mat,metal,glass,service}))return;
  const {width:w,depth:d,height:h}=o;
  const B=(a,b,c,x,y,z,m=mat)=>box(root,a,b,c,x,y,z,m,o.id,'object');
  const cylinder=(r,height,x,y,z,m=mat)=>add(root,new THREE.CylinderGeometry(r,r,height,16),m,[x,y,z],o.id,'object');
  const shape=spec.shape;
  if(spec.prop){
    if(shape==='chart-sector'){
      const radius=w/2,start=o.sector.startAngle*Math.PI/180,end=o.sector.endAngle*Math.PI/180,profile=new THREE.Shape(),full=o.sector.endAngle-o.sector.startAngle===360;
      // 0 度沿 +X；弧線正向經過 -Z。完全圓與極小扇區均保留真實角度。
      if(full)profile.moveTo(radius*Math.cos(start),radius*Math.sin(start));else{profile.moveTo(0,0);profile.lineTo(radius*Math.cos(start),radius*Math.sin(start));}
      profile.absarc(0,0,radius,start,end,false);if(!full)profile.lineTo(0,0);profile.closePath();
      const geometry=new THREE.ExtrudeGeometry(profile,{depth:h,bevelEnabled:false,steps:1,curveSegments:Math.max(1,Math.min(128,Math.ceil((o.sector.endAngle-o.sector.startAngle)/3)))});geometry.rotateX(-Math.PI/2);
      const mesh=add(root,geometry,mat,[0,0,0],o.id,'object');mesh.userData.chartSector=true;return;
    }
    if(shape==='text-panel'){
      const panel=B(w,h,d,0,h/2,0);panel.userData.nonBlocking=true;
      const color=new THREE.Color(o.prop?.color||'#c9b99a'),luminance=.2126*color.r+.7152*color.g+.0722*color.b;
      const inkColor=MATERIAL_PRESETS[o.materialId]?.legacy&&luminance<.35?'#f3ead2':'#25342e';
      const texture=textPanelTexture(o.prop?.label,w,h,{inkColor});
      if(texture){
        const ink=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        ink.userData={textPanel:true};ink.addEventListener('dispose',()=>texture.dispose());materials.set('text-panel-'+o.id,ink);
        for(const side of [1,-1]){const mesh=add(root,new THREE.PlaneGeometry(w,h),ink,[0,h/2,side*(d/2+.0002)],o.id,'object');if(side<0)mesh.rotation.y=Math.PI;mesh.userData.nonBlocking=true;}
      }
      return;
    }
    if(shape==='placeholder-rounded'){add(root,new RoundedBoxGeometry(w,h,d,3,Math.min(w,h,d)*.22),mat,[0,h/2,0],o.id,'object');return;}
    if(shape==='placeholder-glass'){
      if(mat.userData.preset&&!mat.userData.legacy){box(root,w,h,d,0,h/2,0,mat,o.id,'object');return;}
      const pane=glass.clone();pane.color.set(o.prop?.color||'#c4dde0');pane.opacity=.22;materials.set('pane-'+o.id,pane);box(root,w,h,d,0,h/2,0,pane,o.id,'object');return;
    }
    const ellipse=(sx,sy,sz,x,y,z,m=mat)=>{const mesh=add(root,new THREE.SphereGeometry(.5,16,8),m,[x*w,y*h,z*d],o.id,'object');mesh.scale.set(sx*w,sy*h,sz*d);return mesh;};
    const cube=(sx,sy,sz,x,y,z,m=mat)=>B(sx*w,sy*h,sz*d,x*w,y*h,z*d,m);
    if(shape==='placeholder-box'||shape==='paper'){cube(1,1,1,0,.5,0);return;}
    if(shape==='placeholder-ellipse'){const mesh=add(root,new THREE.CylinderGeometry(.5,.5,1,32),mat,[0,h/2,0],o.id,'object');mesh.scale.set(w,h,d);return;}
    if(['plate','bowl','cup'].includes(shape)){
      const points=shape==='plate'?[[0,0],[.35,0],[.5,.7],[.5,1],[.34,.25],[0,.25]]:shape==='bowl'?[[0,0],[.23,0],[.5,1],[.46,1],[.2,.12],[0,.12]]:[[0,0],[.5,0],[.5,1],[.44,1],[.44,.08],[0,.08]];
      const mesh=add(root,new THREE.LatheGeometry(points.map(([x,y])=>new THREE.Vector2(x,y)),32),mat,[0,0,0],o.id,'object');mesh.scale.set(w,h,d);return;
    }
    if(['book','open-book','notebook'].includes(shape)){
      cube(1,.1,1,0,.05,0);cube(1,.1,1,0,.95,0);cube(.035,1,1,-.4825,.5,0);
      cube(.94,.8,.96,.01,.5,0,service);
      if(shape==='notebook')for(let i=0;i<8;i++)cube(.09,.1,.015,-.44,.95,-.42+i*.12,metal);
      if(shape==='open-book'){cube(.47,.12,.96,-.24,.94,0,service);cube(.47,.12,.96,.24,.94,0,service);cube(.015,.15,.96,0,.925,0,mat);}return;
    }
    if(shape==='chopsticks'){for(const x of [-.35,.35])cube(.15,1,1,x,.5,0);return;}
    cube(.22,.6,.7,0,.35,.15);
    if(shape==='spoon')ellipse(1,.8,.35,0,.5,-.325);
    if(shape==='knife')cube(1,.3,.48,0,.4,-.25);
    if(shape==='fork'){cube(.95,.6,.1,0,.35,-.2);for(let i=0;i<4;i++)cube(.12,.6,.25,-.4+i*.267,.35,-.375);}return;
  }
  if(shape==='descender'){
    B(w*.8,h*.5,d*.35,0,h*.25,d*.3,mat);
    B(w*.68,h*.4,d*.025,0,h*.25,d*.105,metal);
    B(w*.15,h*.15,d*.04,0,h*.26,d*.08,service);
    B(w*.18,h*.9,d*.08,0,h*.55,d*.44,metal);
    B(w*.18,h*.09,d*.84,0,h*.94,0,metal);
    const reel=cylinder(w*.21,d*.2,0,h*.73,-d*.3,service);reel.rotation.x=Math.PI/2;
    const hub=cylinder(w*.07,d*.23,0,h*.73,-d*.3,metal);hub.rotation.x=Math.PI/2;
    B(w*.035,h*.28,d*.035,-w*.13,h*.49,-d*.31,service);
    B(w*.035,h*.28,d*.035,w*.13,h*.49,-d*.31,service);
    B(w*.3,h*.035,d*.06,0,h*.35,-d*.31,metal);
    return;
  }
  if(shape==='speakers'){for(const x of [-w*.4,w*.4]){B(w*.2,h,d,x,h/2,0);const driver=cylinder(Math.min(w*.07,h*.22),.02,x,h*.5,-d*.5,metal);driver.rotation.x=Math.PI/2;}return;}
  if(shape==='television'||shape==='projection-screen'){
    B(w,h,d,0,h/2,0,metal);
    B(w*.98,h*.98,d*.15,0,h/2,-d*.5,shape==='projection-screen'?mat:(o.deviceState?.power?service:metal));
    if(shape==='projection-screen')B(w,.025,d*1.3,0,h,0,metal);
    return;
  }
  if(shape==='projector'){
    B(w,h,d,0,h/2,0);const lens=cylinder(Math.min(w*.18,h*.35),d*.2,w*.22,h*.5,-d*.5,metal);lens.rotation.x=Math.PI/2;
    const face=cylinder(Math.min(w*.14,h*.28),.005,w*.22,h*.5,-d*.61,o.deviceState?.power?service:metal);face.rotation.x=Math.PI/2;
    for(let i=0;i<4;i++)B(w*.35,h*.04,.005,-w*.23,h*(.3+i*.13),-d*.503,metal);return;
  }
  if(shape==='switch'){
    B(w,h,d,0,h/2,0);
    for(let i=0;i<o.controls.length;i++){
      const x=-w/2+w*(i+.5)/o.controls.length;
      const rocker=B(w/o.controls.length*.65,h*.55,.018,x,h*.5,-d/2-.012,metal);rocker.rotation.x=o.controls[i]===1?.2:-.2;
      B(w/o.controls.length*.25,.008,.01,x,h*.85,-d/2-.012,o.controls[i]?service:metal);
    }return;
  }
  if(shape==='valve'||shape==='dial'){
    B(w*.5,h*.5,d*.7,0,h*.25,0,metal);
    const fraction=(o.controls[0]-spec.control.min)/(spec.control.max-spec.control.min);
    const handle=B(w,.025,.03,0,h*.7,0,service);handle.rotation.y=fraction*(shape==='valve'?Math.PI/2:Math.PI*1.5);return;
  }
  if(shape==='pipe'){
    const pipe=cylinder(h/2,w,0,h/2,0,service);pipe.rotation.z=Math.PI/2;pipe.scale.z=d/h;return;
  }
  if(shape==='curtain'){
    B(w+.08,.035,.04,0,h+.02,0,metal);
    for(let i=0;i<20;i++)B(w/20+.003,h,d/2,-w/2+w*(i+.5)/20,h/2,Math.sin(i*Math.PI/2)*d/3);return;
  }
  if(shape==='table'||shape==='chair'){
    const seat=shape==='chair'?h*.52:h;
    B(w,.06,d,0,seat-.03,0);for(const x of [-w*.4,w*.4])for(const z of [-d*.4,d*.4])B(.04,Math.max(.01,seat-.06),.04,x,(seat-.06)/2,z,metal);
    if(shape==='chair')B(w,h*.48,.06,0,h*.76,d/2-.03);return;
  }
  if(shape==='sofa'||shape==='bed'){
    B(w,h*.45,d,0,h*.225,0);B(w,h*.55,.12,0,h*.725,d/2-.06);
    if(shape==='sofa')for(const x of [-w/2+.08,w/2-.08])B(.16,h*.7,d,x,h*.35,0);
    else for(const x of [-w*.25,w*.25])B(w*.4,h*.12,d*.2,x,h*.51,d*.25);return;
  }
  if(shape==='tub'||shape==='sink'||shape==='toilet'){
    const base=shape==='toilet'?h*.48:h*.65,lip=shape==='tub'?.08:Math.min(.07,w*.12);
    B(w,base,d,0,base/2,0);
    for(const x of [-w/2+lip/2,w/2-lip/2])B(lip,h-base,d,x,(h+base)/2,0);
    for(const z of [-d/2+lip/2,d/2-lip/2])B(w,h-base,lip,0,(h+base)/2,z);
    if(shape==='toilet')B(w*.8,h*.5,d*.25,0,h*.75,d*.375);
    else if(shape==='sink'){B(.035,.22,.035,w*.25,h+.11,d*.35,metal);B(.035,.035,.15,w*.25,h+.2,d*.35-.06,metal);}return;
  }
  if(shape==='shelf'){
    for(const x of [-w/2+.02,w/2-.02])B(.04,h,d,x,h/2,0);
    for(let i=0;i<5;i++)B(w,.035,d,0,.02+i*(h-.04)/4,0);B(w,h,.025,0,h/2,d/2);return;
  }
  if(shape==='plant'){
    cylinder(Math.min(w,d)/2,h*.3,0,h*.15,0);
    add(root,new THREE.SphereGeometry(Math.min(w,d)*.48,12,8),service,[0,h*.65,0],o.id,'object');B(.035,h*.5,.035,0,h*.45,0,metal);return;
  }
  if(shape==='aquarium'){
    const pane=mat.userData.preset&&!mat.userData.legacy&&(mat.transmission>0||mat.transparent)?mat:glass;
    B(w,.03,d,0,.015,0);for(const x of [-w/2,w/2])B(.015,h,d,x,h/2,0,pane);for(const z of [-d/2,d/2])B(w,h,.015,0,h/2,z,pane);return;
  }
  B(w,h,d,0,h/2,0);
  if(shape==='screen')B(w*.85,h*.75,.015,0,h*.55,-d/2-.01,metal);
  if(shape==='appliance'||shape==='cabinet')B(.03,h*.25,.03,w*.3,h*.6,-d/2-.02,metal);
  if(shape==='switch')B(w*.5,h*.6,.012,0,h*.5,-d/2-.01,metal);
  if(shape==='stove')for(const x of [-w*.23,w*.23])cylinder(w*.16,.02,x,h+.01,0,metal);
}
