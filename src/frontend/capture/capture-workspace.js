import {validateCapture,MAX_BYTES} from './capture-model.js';

const fail=m=>{throw new Error(m);};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join()!==[...keys].sort().join())fail('採集工作包欄位不符契約。');};
const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
function encode(data){const bytes=new Uint8Array(data);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function decode(s){if(typeof s!=='string'||s.length>MAX_BYTES||!s.length||s.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('附件 base64 無效或過大。');const str=atob(s);return Uint8Array.from(str,c=>c.charCodeAt(0));}
function checkSize(v){if(new TextEncoder().encode(JSON.stringify(v,null,2)).length>MAX_BYTES)fail('完整工作包超過 10 MB；請改用採集 JSON 配合原始附件，或建立較小的採集專案。');}
async function checkContent(data,source){const b=data,mime=b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71?'image/png':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'?'image/webp':String.fromCharCode(...b.slice(0,5))==='%PDF-'?'application/pdf':null;if(mime!==source.mime)fail('附件實際格式與來源不符：'+source.id);if(mime!=='application/pdf'&&typeof createImageBitmap==='function'){const image=await createImageBitmap(new Blob([b],{type:mime}));const correct=image.width===source.width&&image.height===source.height;image.close();if(!correct)fail('附件實際尺寸與來源不符：'+source.id);}}
export async function createCaptureWorkspace(capture,readAttachment){
 const c=validateCapture(capture),attachments=[];for(const source of c.sources){const file=await readAttachment(source.sha256);if(!file)fail('缺少來源附件：'+source.id+' '+source.name+'；請先重新連結原始檔。');const data=await file.arrayBuffer();if(data.byteLength!==source.bytes||await digest(data)!==source.sha256)fail('來源附件雜湊不符：'+source.id);await checkContent(new Uint8Array(data),source);attachments.push({sha256:source.sha256,mime:source.mime,bytes:source.bytes,base64:encode(data)});}
 const result={format:'lumiere-capture-workspace',version:1,capture:c,attachments};checkSize(result);return result;
}
// Verify every byte before callers write any persistent state. Files are local only.
export async function parseCaptureWorkspace(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('工作包最多 10 MB。');const p=JSON.parse(raw);exact(p,['format','version','capture','attachments']);if(p.format!=='lumiere-capture-workspace'||p.version!==1)fail('工作包格式錯誤。');const capture=validateCapture(p.capture);if(!Array.isArray(p.attachments)||p.attachments.length!==capture.sources.length)fail('工作包來源附件不完整。');const seen=new Set(),files=[];
 for(const a of p.attachments){exact(a,['sha256','mime','bytes','base64']);const source=capture.sources.find(s=>s.sha256===a.sha256);if(!source||seen.has(a.sha256)||source.mime!==a.mime||source.bytes!==a.bytes)fail('附件參照重複或與來源不符。');seen.add(a.sha256);const data=decode(a.base64);if(data.byteLength!==a.bytes||await digest(data)!==a.sha256)fail('附件內容損毀：'+source.id);await checkContent(data,source);files.push({sha256:a.sha256,file:new Blob([data],{type:a.mime})});}
 return {capture,files};
}
