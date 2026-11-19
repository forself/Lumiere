import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {MATERIALS} from '../src/frontend/designer/catalog.js';
import {MATERIAL_PRESETS,MATERIAL_CATEGORIES,MATERIAL_GENERATOR,materialOptions,materialTexturePixels,createBuiltInMaterial,createProceduralMaterialTextures} from '../src/frontend/designer/material-library.js';
import {disposeMaterialTextures} from '../src/frontend/designer/material-pack.js';

assert.equal(MATERIALS,MATERIAL_PRESETS);assert.equal(Object.keys(MATERIALS).length,32);
for(const m of Object.values(MATERIALS)){
 assert.equal(m.id,Object.keys(MATERIALS).find(id=>MATERIALS[id]===m));assert(Object.isFrozen(m));assert(Object.hasOwn(MATERIAL_CATEGORIES,m.category));
 assert.match(m.color,/^#[a-f\d]{6}$/i);for(const field of ['roughness','metalness','opacity','transmission'])assert(Number.isFinite(m[field])&&m[field]>=0&&m[field]<=1);
 assert.equal(m.provenance,'procedural');assert.equal(m.generator,MATERIAL_GENERATOR);assert(!Object.values(m).some(v=>typeof v==='string'&&/^https?:/.test(v)));
}
assert.equal(MATERIALS.plaster.color,'#e8e4d8');assert.equal(MATERIALS.oak.roughness,.72);assert.equal(MATERIALS.tatami.floorOnly,true);assert.equal(MATERIALS.stone.texture,'stone');
assert.equal(materialOptions().length,32);assert(materialOptions('fabric').every(m=>MATERIALS[m.value].category==='fabric'));assert.deepEqual(materialOptions('invalid'),[]);

// 每種圖樣逐像素檢查接縫，固定種子可重建完全相同的三通道。
for(const spec of Object.values(MATERIALS).filter(m=>m.texture==='procedural')){
 const pixels=materialTexturePixels(spec.id,{size:64});
 assert.deepEqual(pixels,materialTexturePixels(spec.id,{size:64}));
 for(const channel of ['color','normal','roughness']){
  const data=pixels[channel];assert.equal(data.length,64*64*4);
  for(let i=0;i<64;i++)for(let c=0;c<4;c++){
   assert.equal(data[(i*64)*4+c],data[(i*64+63)*4+c],`${spec.id}/${channel} 水平接縫`);
   assert.equal(data[i*4+c],data[((63*64)+i)*4+c],`${spec.id}/${channel} 垂直接縫`);
  }
  for(let i=3;i<data.length;i+=4)assert.equal(data[i],255);
 }
}
for(const size of [0,31,65,1024,NaN])assert.throws(()=>materialTexturePixels('brick-red',{size}));assert.throws(()=>createBuiltInMaterial('unknown'));

const polished=createBuiltInMaterial('metal-stainless-polished'),matte=createBuiltInMaterial('metal-steel-matte');assert.equal(polished.metalness,1);assert(matte.roughness>polished.roughness);
for(const id of ['glass-clear-gloss','glass-frosted-matte','glass-translucent-milky','plastic-clear-gloss','plastic-translucent-white']){
 const m=createBuiltInMaterial(id);assert(m.isMeshPhysicalMaterial);assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert(m.transmission>0);assert(m.ior>1);assert(m.thickness>0);assert.equal(m.userData.materialId,id);m.dispose();
}
assert(createBuiltInMaterial('fabric-velvet-green').sheen>createBuiltInMaterial('fabric-cotton-blue').sheen);
const custom=new THREE.Texture(),normal=new THREE.Texture(),roughness=new THREE.Texture(),metalness=new THREE.Texture();custom.userData={custom:true,normalMap:normal,roughnessMap:roughness,metalnessMap:metalness};const material=createBuiltInMaterial('oak',{textures:{oak:custom}});
assert.equal(material.color.getHex(),0xffffff);assert.equal(material.map,custom);assert.equal(material.normalMap,normal);assert.equal(material.roughnessMap,roughness);assert.equal(material.metalnessMap,metalness);assert.equal(material.roughness,1);assert.equal(material.metalness,1);
assert.equal(material.normalScale.x,1);assert.equal(material.normalScale.y,1,'legacy custom normal maps preserve their original strength');

// Canvas 轉換不改變程序像素；圖層共用貼圖，釋放程序只觸發一次。
const canvasFactory=size=>({width:size,height:size,getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(size*size*4)}),putImageData(){}})});
const textures=createProceduralMaterialTextures({size:32,canvasFactory});assert(!textures.oak);const brick=createBuiltInMaterial('brick-red',{textures});assert.equal(brick.color.getHex(),0xffffff);assert.equal(brick.map,textures['brick-red']);assert.equal(brick.map.colorSpace,THREE.SRGBColorSpace);assert.equal(brick.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(brick.roughnessMap.colorSpace,THREE.NoColorSpace);
assert.equal(brick.map.repeat.x,1/MATERIALS['brick-red'].tileMetres);assert.equal(brick.map.wrapS,THREE.RepeatWrapping);
let disposed=0,total=0;for(const color of Object.values(textures))for(const t of [color,color.userData.normalMap,color.userData.roughnessMap]){total++;t.addEventListener('dispose',()=>disposed++);}brick.dispose();assert.equal(disposed,0);disposeMaterialTextures(textures);assert.equal(disposed,total);
const originalDispose=THREE.Texture.prototype.dispose;let failedDisposals=0,canvasCalls=0;
try{THREE.Texture.prototype.dispose=function(){failedDisposals++;originalDispose.call(this);};assert.throws(()=>createProceduralMaterialTextures({size:32,canvasFactory:size=>++canvasCalls===3?{getContext:()=>null}:canvasFactory(size)}),/畫布/);assert.equal(failedDisposals,2,'partial channel allocation is released if later Canvas creation fails');}finally{THREE.Texture.prototype.dispose=originalDispose;}
for(const m of [polished,matte,material])m.dispose();for(const t of [custom,normal,roughness,metalness])t.dispose();
console.log('PASS material library: 32 immutable presets, legacy compatibility, deterministic seamless PBR maps, physical optics, custom-channel parity and shared texture disposal.');
