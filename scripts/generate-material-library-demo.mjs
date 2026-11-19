import {mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MATERIALS} from '../src/frontend/designer/catalog.js';
import {materialTexturePixels} from '../src/frontend/designer/material-library.js';
import {BuildingStore,validateBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';

const directory=new URL('../output/material-library-20261110/',import.meta.url);
await mkdir(directory,{recursive:true});
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const kind=Buffer.from(type),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);let crc=0xffffffff;for(const byte of Buffer.concat([kind,data]))crc=crcTable[(crc^byte)&255]^(crc>>>8);check.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,kind,data,check]);}
function png(width,height,rgba){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const presets=Object.values(MATERIALS),samples=presets.filter(m=>!m.floorOnly),columns=6,spacing=2.6,rows=Math.ceil(samples.length/columns);
const packs=new Map(),maps=[];
for(const material of presets.filter(m=>!m.legacy)){
 const pixels=materialTexturePixels(material.id,{size:256}),metalness=new Uint8ClampedArray(256*256*4);
 for(let i=0;i<metalness.length;i+=4){metalness[i]=metalness[i+1]=metalness[i+2]=Math.round(material.metalness*255);metalness[i+3]=255;}
 const entries=[];await mkdir(new URL('textures/'+material.id+'/',directory),{recursive:true});
 for(const [channel,data]of Object.entries({color:pixels.color,normal:pixels.normal,roughness:pixels.roughness,metalness})){
  const bytes=png(256,256,data),file='textures/'+material.id+'/'+channel+'.png';await writeFile(new URL(file,directory),bytes);
  maps.push({materialId:material.id,channel,file,width:256,height:256,sha256:createHash('sha256').update(bytes).digest('hex')});
  entries.push({id:material.id,channel,data:'data:image/png;base64,'+bytes.toString('base64'),tileMetres:material.tileMetres});
 }
 if(!packs.has(material.category))packs.set(material.category,[]);packs.get(material.category).push(entries);
}
const packFiles=[];await mkdir(new URL('packs/',directory),{recursive:true});
for(const [category,groups]of packs)for(let start=0;start<groups.length;start+=4){const file='packs/'+category+'-'+(start/4+1)+'.json';await writeFile(new URL(file,directory),JSON.stringify({format:'lumiere-materials',version:2,materials:groups.slice(start,start+4).flat()})+'\n');packFiles.push(file);}
const store=new BuildingStore(emptyProject());
store.execute({type:'addRoom',x:-columns*spacing/2-1,z:-2,width:columns*spacing+2,depth:rows*spacing+4});
store.execute({type:'floor.update',name:'常用材質樣本室',height:3.2});
const sampleObjects=[];
for(const [index,material]of samples.entries()){
 const x=(index%columns-(columns-1)/2)*spacing,z=Math.floor(index/columns)*spacing;
 const category=material.category||'legacy',glass=category==='glass',fabric=category==='fabric';
 const assetId=glass?'placeholder-glass':fabric?'sofa':category==='metal'||category==='plastic'?'placeholder-rounded':'block';
 store.execute({type:'addObject',assetId,x,z});const object=store.state.objects.at(-1);
 store.execute({type:'dimensions',id:object.id,width:fabric?1.5:1.1,depth:glass?.04:fabric?.65:.55,height:glass?1.25:fabric?.75:.95,elevation:0});
 store.execute({type:'material',id:object.id,materialId:material.id});
 store.execute({type:'label.set',id:object.id,text:material.name});
 sampleObjects.push({id:object.id,materialId:material.id,name:material.name,category,x,z});
 if(glass||category==='plastic'){
  for(const [offset,color]of [[-.25,'#b8463b'],[.25,'#326a9b']]){
   store.execute({type:'addObject',assetId:'placeholder-box',x:x+offset,z:z+.55});const backdrop=store.state.objects.at(-1);
   store.execute({type:'prop.configure',id:backdrop.id,x:x+offset,z:z+.55,elevation:.1,rotation:0,width:.4,depth:.08,height:1,color,pitch:0,roll:0,label:''});
  }
 }
}
const building=validateBuilding(store.building);
const categoryScenes=[];await mkdir(new URL('scenes/',directory),{recursive:true});
for(const category of ['wall','fabric','metal','glass','plastic']){
 const entries=samples.filter(m=>m.category===category),count=Math.min(entries.length,4),preview=new BuildingStore(emptyProject());
 preview.execute({type:'addRoom',x:-count*spacing/2-1,z:-3,width:count*spacing+2,depth:Math.ceil(entries.length/count)*spacing+4});
 preview.execute({type:'floor.update',name:'材質分類樣本：'+category,height:3.2});
 for(const [i,m]of entries.entries()){
  const x=(i%count-(count-1)/2)*spacing,z=Math.floor(i/count)*spacing,glass=category==='glass',fabric=category==='fabric';
  preview.execute({type:'addObject',assetId:glass?'placeholder-glass':fabric?'sofa':category==='wall'?'block':'placeholder-rounded',x,z});const id=preview.state.objects.at(-1).id;
  preview.execute({type:'dimensions',id,width:glass?1.4:fabric?1.5:1.1,depth:glass?.04:fabric?.7:.7,height:glass?1.3:fabric?.8:1.1,elevation:0});
  preview.execute({type:'material',id,materialId:m.id});preview.execute({type:'label.set',id,text:m.name});
  if(glass||category==='plastic')for(const [dx,color]of [[-.3,'#b8463b'],[.3,'#326a9b']]){preview.execute({type:'addObject',assetId:'placeholder-box',x:x+dx,z:z+.55});const block=preview.state.objects.at(-1).id;preview.execute({type:'prop.configure',id:block,x:x+dx,z:z+.55,elevation:.08,rotation:0,width:.45,depth:.08,height:1.1,color,pitch:0,roll:0,label:''});}
 }
 const file='scenes/'+category+'.json';await writeFile(new URL(file,directory),JSON.stringify(preview.building,null,2)+'\n');categoryScenes.push({category,file,materials:entries.map(m=>m.id)});
}
await writeFile(new URL('materials-library.json',directory),JSON.stringify({format:'lumiere-builtin-material-library',version:1,units:'metres',source:'專案內建程序材質；無外部圖片或模型來源',materials:presets},null,2)+'\n');
await writeFile(new URL('material-samples.json',directory),JSON.stringify(building,null,2)+'\n');
await writeFile(new URL('sample-index.json',directory),JSON.stringify({format:'lumiere-material-sample-index',version:1,samples:sampleObjects,note:'玻璃與塑膠後方的紅藍色塊用於觀察透射；樣本不改變來源專案。'},null,2)+'\n');
await writeFile(new URL('texture-manifest.json',directory),JSON.stringify({format:'lumiere-procedural-texture-manifest',version:1,generator:'lumiere-procedural-materials-v1',colorSpace:{color:'sRGB',normal:'linear/OpenGL',roughness:'linear',metalness:'linear'},maps,importableMaterialPacks:packFiles,categoryScenes,note:'原有四種材質保留既有畫布圖樣；本包輸出新增材質的四通道 PNG。'},null,2)+'\n');
console.log(JSON.stringify({materials:presets.length,samples:sampleObjects.length,pngMaps:maps.length,importablePacks:packFiles.length,objects:building.levels[0].design.objects.length,directory:directory.pathname}));
