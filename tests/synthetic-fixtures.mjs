import {deflateSync} from 'node:zlib';
import * as THREE from '../node_modules/three/build/three.module.js';

// Independently authored raster and cube data; no downloaded or project assets.
export function syntheticPng(width=16,height=16){
  const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const name=Buffer.from(type),body=Buffer.concat([name,data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(width*4+1)+1+x*4;pixels.set([60+x*4,100+y*4,150,255],at);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

export function syntheticBoxGlb(){
  const geometry=new THREE.BoxGeometry(2,1,1).toNonIndexed(),positions=new Float32Array(geometry.attributes.position.array),bin=new Uint8Array(positions.buffer);geometry.dispose();
  const json={asset:{version:'2.0'},buffers:[{byteLength:bin.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:bin.byteLength}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3',min:[-1,-.5,-.5],max:[1,.5,.5]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.3,.5,.7,1],metallicFactor:0,roughnessFactor:.7}}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  const encode=(value=json)=>{const text=new TextEncoder().encode(JSON.stringify(value)),n=Math.ceil(text.length/4)*4,buffer=new ArrayBuffer(28+n+bin.length),view=new DataView(buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);view.setUint32(12,n,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(buffer,20,n).fill(32);new Uint8Array(buffer,20,text.length).set(text);view.setUint32(20+n,bin.length,true);view.setUint32(24+n,0x004e4942,true);new Uint8Array(buffer,28+n).set(bin);return buffer;};
  return {json,encode,buffer:encode()};
}
