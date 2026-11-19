import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syntheticBoxGlb} from './synthetic-fixtures.mjs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {inspectGlb,loadGlb,instantiateAsset,disposeImportedAsset,checkAssetBudget} from '../src/frontend/designer/imported-assets.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';import {sampleProject} from '../src/frontend/designer/model.js';
const {json,encode}=syntheticBoxGlb();
fs.mkdirSync('output',{recursive:true});
const buffer=encode(json);assert.equal(inspectGlb(buffer).triangles,12);assert.throws(()=>inspectGlb(encode({...json,buffers:[{byteLength:1,uri:'https://example.com/secret'}]})),/外部/);assert.throws(()=>inspectGlb(encode({...json,extensionsUsed:['KHR_draco_mesh_compression']})),/擴充/);const entry=await loadGlb(buffer),instance=instantiateAsset(entry,{id:'object-1',width:4,height:2,depth:3});instance.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(instance),size=box.getSize(new THREE.Vector3());assert.deepEqual(size.toArray(),[4,2,3]);assert.equal(box.min.y,0);instance.traverse(o=>{if(o.isMesh)assert.equal(o.userData.id,'object-1');});const s=new BuildingStore(sampleProject());assert.throws(()=>checkAssetBudget(s.building,new Map([['table',{triangles:300000}]])),/三角面/);fs.writeFileSync('output/asset-test.glb',new Uint8Array(buffer));disposeImportedAsset(entry);console.log('PASS local GLB parsing, external-resource rejection, extension allowlist, normalization, instance IDs and scene budget.');
