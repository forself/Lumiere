import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {DesignViewport,materialEnvironmentNeeded} from '../src/frontend/designer/DesignViewport.js';
import {disposeMaterialTextures} from '../src/frontend/designer/material-pack.js';
import {stepWalk} from '../src/frontend/designer/walk.js';

const store=new BuildingStore(emptyProject());store.execute({type:'addRoom',x:-4,z:-4,width:8,depth:8});
const level=store.building.activeLevelId,wall=store.state.walls[0];
store.execute({type:'material',id:wall.id,materialId:'brick-red'});
store.execute({type:'material',id:store.state.rooms[0].id,materialId:'ceramic-white-gloss'});
store.execute({type:'addObject',assetId:'sofa',x:-2,z:1});const sofa=store.state.objects.at(-1).id;
store.execute({type:'material',id:sofa,materialId:'fabric-linen-beige'});
store.execute({type:'addObject',assetId:'placeholder-glass',x:0,z:0});const panel=store.state.objects.at(-1).id;
store.execute({type:'material',id:panel,materialId:'glass-clear-gloss'});
store.execute({type:'addObject',assetId:'placeholder-box',x:2,z:2});const box=store.state.objects.at(-1).id;
const propColor=store.state.objects.at(-1).prop.color;
const color=new THREE.DataTexture(new Uint8Array([200,100,80,255]),1,1),normal=new THREE.Texture(),roughness=new THREE.Texture();
color.userData={absoluteColor:true,customCoordinates:true,normalMap:normal,roughnessMap:roughness};
const scene=buildDesign(store.state,{textures:{'brick-red':color}});
let wallMesh,cloth=0,glass=0;
scene.group.traverse(node=>{
 if(!node.isMesh)return;
 if(node.userData.id===wall.id){wallMesh=node;assert.equal(node.material.map,color);assert.equal(node.material.normalMap,normal);assert.equal(node.material.roughnessMap,roughness);assert.equal(node.material.color.getHex(),0xffffff);}
 if(node.userData.id===sofa&&node.material.userData.materialId==='fabric-linen-beige'){cloth++;assert(node.material.sheen>0);}
 if(node.userData.id===panel){glass++;assert.equal(node.material.userData.materialId,'glass-clear-gloss');assert(node.material.isMeshPhysicalMaterial);assert.equal(node.material.transmission,1);}
 if(node.userData.id===box)assert.equal(node.material.color.getHexString(),propColor.slice(1),'legacy prop colour remains intact');
});
assert(wallMesh&&cloth>0&&glass>0);assert(Math.abs(Math.max(...wallMesh.geometry.attributes.uv.array)-wallMesh.geometry.parameters.width)<1e-5,'new texture uses world-size box UVs');
assert(scene.byId.get(store.state.rooms[0].id).material.clearcoat>0);

// 透明外觀不改變既有實體面板的碰撞設定。
assert.equal(stepWalk(store.building,{x:-1,y:1.65,z:0},.8,0,scene.group,level),null);
const oldGeometryCount=[];scene.group.traverse(o=>{if(o.isMesh)oldGeometryCount.push([o.userData.id,o.userData.kind]);});
store.execute({type:'material',id:panel,materialId:'glass-frosted-matte'});
const frosted=buildDesign(store.state),newGeometryCount=[];frosted.group.traverse(o=>{if(o.isMesh)newGeometryCount.push([o.userData.id,o.userData.kind]);});assert.deepEqual(newGeometryCount,oldGeometryCount);
assert.equal(stepWalk(store.building,{x:-1,y:1.65,z:0},.8,0,frosted.group,level),null);
assert(frosted.byId.get(panel).children[0].material.roughness>.4);

store.execute({type:'element.add',kind:'column',x:3,z:3,width:.3,depth:.3,height:2.7,elevation:0,rotation:0,materialId:'metal-stainless-polished'});
store.execute({type:'element.add',kind:'slab',x:2,z:-2,width:1,depth:1,height:.12,elevation:.2,rotation:0,materialId:'plastic-clear-gloss'});
const built=buildBuilding(store.building);let metals=0,plasticSlab=0;built.group.traverse(o=>{if(o.isMesh&&o.material.userData.materialId==='metal-stainless-polished'){metals++;assert.equal(o.material.metalness,1);}if(o.isMesh&&o.material.userData.materialId==='plastic-clear-gloss'){plasticSlab++;assert(o.material.transmission>.9);}});assert(metals>0&&plasticSlab>0);
assert(materialEnvironmentNeeded(store.building,store.state));
const legacy=new BuildingStore(emptyProject());legacy.execute({type:'addRoom',x:0,z:0,width:4,depth:4});assert.equal(materialEnvironmentNeeded(legacy.building,legacy.state),false);assert(materialEnvironmentNeeded(null,null,[{channel:'normal'}]));assert(materialEnvironmentNeeded(null,null,[],new Map([['asset',{}]])));

// 自訂顏色保留預設微表面通道；純法線通道也能附加到原本無色圖的材質。
const priorDocument=globalThis.document,noop=()=>{};
try{
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||noop})})};
 const viewport=Object.assign(new DesignViewport({mode:'scene'}),{textures:{},materialEntries:[],updateEnvironment(){},invalidate(){}});
 let imageClosed=0;viewport.setMaterials([{id:'brick-red',channel:'color',tileMetres:1,image:{close(){imageClosed++;}}}]);
 const custom=viewport.textures['brick-red'];assert(custom.userData.custom);assert(custom.userData.normalMap&&custom.userData.roughnessMap);
 let disposed=0;for(const texture of [custom,custom.userData.normalMap,custom.userData.roughnessMap])texture.addEventListener('dispose',()=>disposed++);
 viewport.setMaterials([{id:'plaster',channel:'normal',tileMetres:1,image:{close(){}}}]);assert.equal(imageClosed,1);assert.equal(disposed,3);assert(viewport.textures.plaster.isDataTexture);assert(viewport.textures.plaster.userData.normalMap);disposeMaterialTextures(viewport.textures);
}finally{if(priorDocument===undefined)delete globalThis.document;else globalThis.document=priorDocument;}
scene.dispose();frosted.dispose();built.dispose();disposeMaterialTextures({'brick-red':color});
console.log('PASS material rendering: physical presets on walls/floors/furniture/props/elements, world UVs, legacy colour, collision independence, environment selection and PBR texture lifecycle.');
