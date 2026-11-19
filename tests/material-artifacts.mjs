import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MATERIALS} from '../src/frontend/designer/catalog.js';
import {parseBuilding} from '../src/frontend/designer/building-model.js';
import {validateMaterialPack} from '../src/frontend/designer/material-pack.js';

const root=new URL('../output/material-library-20261110/',import.meta.url),json=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
const library=await json('materials-library.json'),manifest=await json('texture-manifest.json'),index=await json('sample-index.json'),scene=parseBuilding(await readFile(new URL('material-samples.json',root),'utf8'));
assert.deepEqual(library.materials,Object.values(MATERIALS));assert.equal(manifest.maps.length,112);assert.equal(manifest.importableMaterialPacks.length,9);
const images=new Map();
for(const entry of manifest.maps){
 assert.match(entry.file,/^textures\/[a-z0-9-]+\/(color|normal|roughness|metalness)\.png$/);
 const bytes=await readFile(new URL(entry.file,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.toString('ascii',12,16),'IHDR');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(width,256);assert.equal(height,256);assert.equal(bytes[24],8);assert.equal(bytes[25],6);
 const compressed=[];for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(kind==='IDAT')compressed.push(bytes.subarray(offset+8,offset+8+length));offset+=length+12;}
 const scanlines=inflateSync(Buffer.concat(compressed));assert.equal(scanlines.length,height*(width*4+1));for(let y=0;y<height;y++){assert.equal(scanlines[y*(width*4+1)],0);for(let x=0;x<width;x++)assert.equal(scanlines[y*(width*4+1)+1+x*4+3],255);}
 images.set(entry.materialId+':'+entry.channel,bytes);
}
let packed=0;for(const file of manifest.importableMaterialPacks){const pack=validateMaterialPack(await json(file));assert(pack.materials.length<=16);for(const m of pack.materials){assert.deepEqual(Buffer.from(m.data.split(',')[1],'base64'),images.get(m.id+':'+m.channel));packed++;}}
assert.equal(packed,112);
for(const sample of index.samples){const object=scene.levels[0].design.objects.find(o=>o.id===sample.id);assert.equal(object?.materialId,sample.materialId);assert(Object.hasOwn(MATERIALS,sample.materialId));}
assert.equal(index.samples.length,Object.values(MATERIALS).filter(m=>!m.floorOnly).length);
for(const item of manifest.categoryScenes){const sample=parseBuilding(await readFile(new URL(item.file,root),'utf8'));for(const id of item.materials)assert(sample.levels[0].design.objects.some(o=>o.materialId===id));}
console.log('PASS material artifacts: catalog matches registered presets;112 PNGs decode, hashes/alpha/channels agree;9 importable packs validate;31 native samples reference the expected materials.');
