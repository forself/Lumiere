import * as THREE from '../../../node_modules/three/build/three.module.js';

// 程序材質使用固定參數與週期圖樣；不存取外部圖片或網址。
export const MATERIAL_GENERATOR='lumiere-procedural-materials-v1';
export const MATERIAL_CATEGORIES=Object.freeze({wall:'牆面',fabric:'家具布面與皮革',metal:'金屬',glass:'玻璃',plastic:'塑膠',wood:'木材',floor:'地板與石材'});
const preset=(id,name,category,color,roughness,extra={})=>({id,name,category,color,roughness,metalness:0,opacity:1,transmission:0,tileMetres:1,texture:'plain',pattern:'plain',provenance:'procedural',generator:MATERIAL_GENERATOR,...extra});
const patterned=(pattern,extra={})=>({texture:'procedural',pattern,...extra});
const definitions=[
 preset('plaster','暖白灰泥','wall','#e8e4d8',.9,{legacy:true}),
 preset('oak','淺橡木','wood','#cfac79',.72,{legacy:true,texture:'wood',tileMetres:1.2}),
 preset('tatami','榻榻米','floor','#b6b778',.95,{legacy:true,texture:'tatami',floorOnly:true}),
 preset('stone','米灰石材','floor','#b7b8ae',.84,{legacy:true,texture:'stone',tileMetres:.6}),
 preset('paint-white-matte','霧面白色乳膠漆','wall','#eeeae2',.88,patterned('paint',{normalStrength:.08})),
 preset('paint-cream-matte','霧面米色乳膠漆','wall','#e2d6bc',.88,patterned('paint',{normalStrength:.08})),
 preset('paint-gray-satin','淺灰絲光漆','wall','#b7b9b7',.32,patterned('paint',{normalStrength:.035})),
 preset('stucco-rough','粗紋礦物灰泥','wall','#d5c9b6',.96,patterned('stucco',{normalStrength:.32,tileMetres:.8})),
 preset('concrete-raw','清水混凝土','wall','#a3a49e',.92,patterned('concrete',{normalStrength:.2,tileMetres:2})),
 preset('concrete-polished','磨光水泥','wall','#b6b5ad',.28,patterned('concrete',{normalStrength:.035,tileMetres:2})),
 preset('brick-red','紅磚與灰色填縫','wall','#a55b43',.9,patterned('brick',{normalStrength:.35,tileMetres:1.2})),
 preset('ceramic-white-gloss','亮面白色磁磚','wall','#eeeae2',.12,patterned('tile',{clearcoat:.65,clearcoatRoughness:.08,normalStrength:.1,tileMetres:1.2})),
 preset('fabric-linen-beige','米色亞麻布','fabric','#b7a98e',.98,patterned('linen',{sheen:.65,sheenRoughness:.9,normalStrength:.28,tileMetres:.4})),
 preset('fabric-cotton-blue','藍灰棉織布','fabric','#687d88',.97,patterned('cotton',{sheen:.35,sheenRoughness:.9,normalStrength:.22,tileMetres:.32})),
 preset('fabric-velvet-green','墨綠絨布','fabric','#314f43',.92,patterned('velvet',{sheen:1,sheenRoughness:.48,sheenColor:'#638a71',normalStrength:.08,tileMetres:.4})),
 preset('leather-brown','棕色皮革','fabric','#72513c',.45,patterned('leather',{clearcoat:.15,clearcoatRoughness:.45,normalStrength:.22,tileMetres:.5})),
 preset('leather-black','黑色霧面皮革','fabric','#343536',.7,patterned('leather',{clearcoat:.05,normalStrength:.22,tileMetres:.5})),
 preset('metal-stainless-polished','鏡面不鏽鋼','metal','#c5c9cb',.075,{metalness:1}),
 preset('metal-stainless-brushed','拉絲不鏽鋼','metal','#adb2b4',.3,patterned('brushed',{metalness:1,anisotropy:.65,normalStrength:.13,tileMetres:.5})),
 preset('metal-steel-matte','霧面鋼材','metal','#737a7d',.78,patterned('metal-grain',{metalness:1,normalStrength:.06,tileMetres:.5})),
 preset('metal-aluminum-brushed','霧面拉絲鋁','metal','#bfc1c0',.47,patterned('brushed',{metalness:1,anisotropy:.5,normalStrength:.1,tileMetres:.5})),
 preset('metal-brass-polished','亮面黃銅','metal','#b89648',.13,{metalness:1}),
 preset('metal-brass-matte','霧面黃銅','metal','#a28a52',.7,patterned('metal-grain',{metalness:1,normalStrength:.06,tileMetres:.5})),
 preset('glass-clear-gloss','透明亮面玻璃','glass','#f1f7f6',.035,{transmission:1,ior:1.5,thickness:.012,optical:'transparent'}),
 preset('glass-frosted-matte','霧面磨砂玻璃','glass','#edf2ef',.48,patterned('etched',{transmission:.97,ior:1.5,thickness:.012,optical:'translucent',normalStrength:.08,tileMetres:.4})),
 preset('glass-smoked-gray','灰色半透明玻璃','glass','#bac5c7',.08,{transmission:.8,ior:1.5,thickness:.025,attenuationColor:'#809196',attenuationDistance:.45,optical:'translucent'}),
 preset('glass-translucent-milky','乳白半透明玻璃','glass','#e5e8de',.66,patterned('etched',{transmission:.65,ior:1.5,thickness:.018,optical:'translucent',normalStrength:.07,tileMetres:.4})),
 preset('plastic-clear-gloss','透明亮面壓克力','plastic','#f3f6f3',.08,{transmission:.98,ior:1.49,thickness:.04,optical:'transparent',clearcoat:.2,clearcoatRoughness:.07}),
 preset('plastic-frosted','霧面磨砂壓克力','plastic','#e8eee9',.42,patterned('etched',{transmission:.9,ior:1.49,thickness:.04,optical:'translucent',normalStrength:.06,tileMetres:.4})),
 preset('plastic-translucent-white','乳白半透明塑膠','plastic','#e7e5d9',.58,{transmission:.55,ior:1.46,thickness:.06,optical:'translucent',attenuationColor:'#e5ddc3',attenuationDistance:.25}),
 preset('plastic-white-gloss','白色亮面塑膠','plastic','#e9e8df',.18,{clearcoat:.7,clearcoatRoughness:.1,optical:'opaque'}),
 preset('plastic-black-matte','黑色霧面塑膠','plastic','#343737',.9,patterned('plastic-grain',{normalStrength:.1,tileMetres:.4,optical:'opaque'})),
];
export const MATERIAL_PRESETS=Object.freeze(Object.fromEntries(definitions.map(value=>[value.id,Object.freeze(value)])));
export function materialOptions(category='all'){return Object.values(MATERIAL_PRESETS).filter(m=>category==='all'||m.category===category).map(m=>({value:m.id,label:m.name,category:m.category}));}

// 工廠只持有貼圖參照；呼叫端每個視埠建立一次貼圖，統一負責釋放。
export function createBuiltInMaterial(id,{textures={}}={}){
 const spec=MATERIAL_PRESETS[id];if(!spec)throw new Error('材質不存在：'+id);
 const map=textures[id]||null,data=map?.userData||{},physical=spec.transmission>0||spec.sheen>0||spec.clearcoat>0||spec.anisotropy>0;
 const parameters={name:spec.name,color:map&&(data.custom||data.absoluteColor)?0xffffff:spec.color,roughness:data.roughnessMap?1:spec.roughness,metalness:data.metalnessMap?1:spec.metalness,map,normalMap:data.normalMap||null,roughnessMap:data.roughnessMap||null,metalnessMap:data.metalnessMap||null,side:THREE.DoubleSide,opacity:spec.opacity,transparent:spec.opacity<1,depthWrite:spec.opacity>=1};
 if(parameters.normalMap)parameters.normalScale=new THREE.Vector2(spec.normalStrength??(spec.legacy?1:.18),spec.normalStrength??(spec.legacy?1:.18));
 if(physical){for(const field of ['transmission','ior','thickness','attenuationDistance','clearcoat','clearcoatRoughness','sheen','sheenRoughness','anisotropy','anisotropyRotation'])if(spec[field]!==undefined)parameters[field]=spec[field];for(const field of ['attenuationColor','sheenColor'])if(spec[field])parameters[field]=new THREE.Color(spec[field]);}
 const material=physical?new THREE.MeshPhysicalMaterial(parameters):new THREE.MeshStandardMaterial(parameters);
 material.userData={materialId:id,category:spec.category,preset:true,legacy:!!spec.legacy,provenance:spec.provenance,generator:MATERIAL_GENERATOR,optical:spec.optical||'opaque'};return material;
}

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const fract=n=>n-Math.floor(n);
function seedOf(id){let h=2166136261;for(const ch of id)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;}
function lattice(x,y,seed){let n=Math.imul(x+11,374761393)^Math.imul(y+17,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
const smooth=n=>n*n*(3-2*n);
function periodicNoise(u,v,cells,seed){const xx=fract(u)*cells,yy=fract(v)*cells,x=Math.floor(xx),y=Math.floor(yy),a=smooth(xx-x),b=smooth(yy-y),n=(dx,dy)=>lattice((x+dx)%cells,(y+dy)%cells,seed);return (n(0,0)*(1-a)+n(1,0)*a)*(1-b)+(n(0,1)*(1-a)+n(1,1)*a)*b;}
const rgb=hex=>[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16)/255);
const pulse=(v,width)=>{const d=Math.min(fract(v),1-fract(v));return 1-smooth(clamp(d/width));};
function patternSample(spec,u,v,seed){
 const fine=periodicNoise(u,v,64,seed),coarse=periodicNoise(u,v,8,seed+29),mid=periodicNoise(u,v,24,seed+7),wave=(n,t)=>Math.sin(t*Math.PI*2*n);
 let brightness=1,height=0,roughness=spec.roughness,mortar=0;
 switch(spec.pattern){
  case 'paint':brightness=.97+fine*.035;height=fine*.06;roughness+=(fine-.5)*.035;break;
  case 'stucco':brightness=.85+.16*mid+.08*fine;height=.65*mid+.35*fine;roughness+=(fine-.5)*.05;break;
  case 'concrete':brightness=.8+.24*coarse+.08*mid; height=.5*coarse+.1*mid;roughness+=(mid-.5)*.1;break;
  case 'brick':{const row=Math.floor(fract(v)*8),uu=fract(u*4+(row%2)*.5),vv=fract(v*8);mortar=Math.max(pulse(uu,.035),pulse(vv,.075));brightness=.82+.2*mid+.07*fine;height=(1-mortar)*(.6+.1*fine);roughness=mortar?.94:spec.roughness+(fine-.5)*.06;break;}
  case 'tile':mortar=Math.max(pulse(u*4,.025),pulse(v*4,.025));brightness=.98+.015*coarse;height=(1-mortar)*.35;roughness=mortar?.8:spec.roughness+(fine-.5)*.025;break;
  case 'linen':{const a=wave(32,u),b=wave(32,v);height=.45+.2*a+.2*b+.1*a*b;brightness=.77+.25*height+.05*fine;roughness+=(fine-.5)*.03;break;}
  case 'cotton':{const a=wave(48,u),b=wave(48,v);height=.5+.22*a+.16*b;brightness=.81+.17*height+.035*fine;roughness+=(fine-.5)*.02;break;}
  case 'velvet':height=.3*fine;brightness=.82+.16*coarse+.05*fine;roughness+=(fine-.5)*.06;break;
  case 'leather':height=.55*mid+.25*fine+.15*coarse;brightness=.78+.22*height;roughness+=(mid-.5)*.2;break;
  case 'brushed':height=.25*wave(64,v)+.1*periodicNoise(u,v,8,seed);brightness=.85+.12*height+.06*fine;roughness+=(height-.1)*.12;break;
  case 'metal-grain':height=fine*.25;brightness=.9+.09*fine;roughness+=(fine-.5)*.12;break;
  case 'etched':height=fine*.3;brightness=.98+fine*.02;roughness+=(fine-.5)*.06;break;
  case 'plastic-grain':height=.15*fine+.05*mid;brightness=.93+.06*fine;roughness+=(fine-.5)*.06;break;
 }
 return {brightness:clamp(brightness,0,1.1),height,roughness:clamp(roughness,.025,1),mortar};
}

// 尺寸固定為可重現的二次冪，最高 512；四邊共享相同像素與導數。
export function materialTexturePixels(id,{size=256}={}){
 const spec=MATERIAL_PRESETS[id];if(!spec)throw new Error('材質不存在：'+id);if(!Number.isInteger(size)||size<32||size>512||(size&(size-1)))throw new Error('程序貼圖尺寸須為 32–512 的二次冪。');
 const color=new Uint8ClampedArray(size*size*4),normal=new Uint8ClampedArray(size*size*4),roughness=new Uint8ClampedArray(size*size*4),height=new Float32Array(size*size),base=rgb(spec.color),seed=seedOf(id),period=size-1;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const offset=(y*size+x)*4,s=patternSample(spec,x/period,y/period,seed);height[y*size+x]=s.height;
  for(let c=0;c<3;c++){const value=base[c]*s.brightness; color[offset+c]=Math.round(clamp(s.mortar?value*(1-s.mortar)+[.64,.64,.61][c]*s.mortar:value)*255);roughness[offset+c]=Math.round(s.roughness*255);}
  color[offset+3]=normal[offset+3]=roughness[offset+3]=255;
 }
 const at=(x,y)=>height[((y%period+period)%period)*size+((x%period+period)%period)];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const offset=(y*size+x)*4,dx=(at(x+1,y)-at(x-1,y))*.5,dy=(at(x,y+1)-at(x,y-1))*.5,length=Math.hypot(dx,dy,1);
  normal[offset]=Math.round((-.5*dx/length+.5)*255);normal[offset+1]=Math.round((-.5*dy/length+.5)*255);normal[offset+2]=Math.round((.5/length+.5)*255);
 }
 return {width:size,height:size,color,normal,roughness,materialId:id,generator:MATERIAL_GENERATOR};
}

function defaultCanvas(size){const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(size,size):globalThis.document?.createElement('canvas');if(!canvas)throw new Error('程序貼圖需要 Canvas 環境。');canvas.width=canvas.height=size;return canvas;}
export function createProceduralMaterialTextures({size=256,canvasFactory=defaultCanvas}={}){
 const textures={},allocated=[];
 try{for(const spec of Object.values(MATERIAL_PRESETS)){
  if(spec.legacy||spec.pattern==='plain')continue;const pixels=materialTexturePixels(spec.id,{size});
  const channel=data=>{const canvas=canvasFactory(size),ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法建立程序材質畫布。');const image=ctx.createImageData(size,size);image.data.set(data);ctx.putImageData(image,0,0);const t=new THREE.CanvasTexture(canvas);allocated.push(t);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/spec.tileMetres,1/spec.tileMetres);t.colorSpace=THREE.NoColorSpace;return t;};
  const color=channel(pixels.color);textures[spec.id]=color;color.colorSpace=THREE.SRGBColorSpace;color.userData={procedural:true,absoluteColor:true,customCoordinates:true,generator:MATERIAL_GENERATOR,normalMap:channel(pixels.normal),roughnessMap:channel(pixels.roughness)};
 }}catch(error){allocated.forEach(texture=>texture.dispose());throw error;}
 return textures;
}
