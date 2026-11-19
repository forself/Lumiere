import {readFile,writeFile,access,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseCapture} from '../src/frontend/capture/capture-model.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function analysePhotos(state,files,sourceIds,calibration=null){
 if(files.length!==2||sourceIds.length!==2||sourceIds[0]===sourceIds[1])throw new Error('需指定兩張照片及不同來源 ID。');
 const images=[];for(let i=0;i<2;i++){const s=state.sources.find(s=>s.id===sourceIds[i]);if(!s||s.kind!=='photo')throw new Error('來源不是登錄照片。');if((await stat(files[i])).size>10485760)throw new Error('照片檔案最多 10 MB。');const bytes=await readFile(files[i]);if(bytes.length>10485760||createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw new Error('檔案容量或 SHA-256 與來源不符。');images.push({sha256:s.sha256,width:s.width,height:s.height,data:bytes.toString('base64')});}
 const pair=state.pairs.find(p=>p.sourceIds.every((id,i)=>id===sourceIds[i]));
 const payload={captureId:state.id,baseRevision:state.revision,sourceIds,images,calibration,baseline:pair?{metres:pair.metres,uncertainty:pair.uncertainty}:null};
 const python=path.join(root,'.venv-vision',process.platform==='win32'?'Scripts/python.exe':'bin/python');try{await access(python);}catch{throw new Error('尚未安裝經許可的專案影像環境 .venv-vision；請先完成依賴許可與安裝。');}
 return new Promise((resolve,reject)=>{const child=spawn(python,['-I',path.join(root,'scripts/vision/photo_pair.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true}),parts=[];let size=0,settled=false;
 const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(result);};const timer=setTimeout(()=>{child.kill();finish(new Error('照片分析超過 60 秒，已停止；請縮小照片或減少細節。'));},60000);
 child.stdout.on('data',b=>{size+=b.length;if(size>10485760){child.kill();finish(new Error('分析結果超過 10 MB。'));}else parts.push(b);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>finish(new Error('無法啟動本機影像引擎。')));child.on('close',code=>{try{const r=JSON.parse(Buffer.concat(parts).toString('utf8'));if(code!==0||r.error)throw new Error(r.error||'照片分析失敗。');finish(null,r);}catch(e){finish(e);}});child.stdin.end(JSON.stringify(payload));});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [session,a,b,idA,idB,out,cal]=process.argv.slice(2);if(!out)throw new Error('用法：node scripts/capture-photos.mjs capture.json A.jpg B.jpg source-1 source-2 output.json [calibration.json]');const state=parseCapture(await readFile(session,'utf8'));const result=await analysePhotos(state,[a,b],[idA,idB],cal?JSON.parse(await readFile(cal,'utf8')):null);await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(result.status);}catch(e){console.error(e.message);process.exitCode=1;}
}
