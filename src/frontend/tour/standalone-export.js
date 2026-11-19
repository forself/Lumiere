import {validateBundle,BUNDLE_BYTES} from '../designer/project-bundle.js';
import {validateToolPageDefinition} from '../../../lib/page-generator/ToolPageDefinition.js';

// Only trusted, locally built runtime modules enter this serializer. Scene data
// remains inert JSON; no scene property can select code or a module URL.
export const STANDALONE_RUNTIME_BYTES=32*1024*1024;
export const STANDALONE_HTML_BYTES=160*1024*1024;
export const STANDALONE_ENTRY='lumiere-offline/src/frontend/tour/standalone-entry.js';
const encoder=new TextEncoder();
const components=['BasicButton','Heading','Text','Dropdown','UploadButton','TextInput','TourViewport'];
const fail=message=>{throw new Error(message);};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===keys.split(',').sort().join(',');
const bytes=text=>encoder.encode(text).byteLength;
const pathAllowed=path=>typeof path==='string'&&/^(?:src\/frontend\/|lib\/(?:ui_components|page-generator|custom_components)\/|node_modules\/three\/)[A-Za-z0-9_./-]+$/.test(path)&&!path.split('/').some(part=>part==='.'||part==='..'||!part);
const abort=signal=>{if(signal?.aborted)throw Object.assign(new Error('已取消獨立網頁匯出。'),{name:'AbortError'});};
export const safeStandaloneJson=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'}[c]));
const htmlText=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function base64(text){const data=encoder.encode(text);let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(binary);}
async function digest(text){if(!globalThis.crypto?.subtle)fail('此環境不支援安全雜湊，無法匯出獨立網頁。');const result=await crypto.subtle.digest('SHA-256',encoder.encode(text));return btoa(String.fromCharCode(...new Uint8Array(result)));}

export function validateStandaloneRuntime(runtime){
 if(!exact(runtime,'format,version,entry,definition,modules,css,licenses,sourceHashes')||runtime.format!=='lumiere-standalone-runtime'||runtime.version!==1||runtime.entry!==STANDALONE_ENTRY)fail('獨立網頁執行套件格式或版本錯誤。');
 if(!Array.isArray(runtime.modules)||runtime.modules.length<1||runtime.modules.length>1000||typeof runtime.css!=='string'||runtime.css.length>4*1024*1024||!plain(runtime.sourceHashes))fail('獨立網頁執行套件超出大小或數量限制。');
 const ids=new Set();let size=bytes(runtime.css);
 for(const module of runtime.modules){
  if(!exact(module,'id,path,source,sha256')||!pathAllowed(module.path)||!module.path.endsWith('.js')||module.id!=='lumiere-offline/'+module.path||ids.has(module.id)||typeof module.source!=='string'||module.source.length>8*1024*1024||!/^([a-f0-9]{64})$/.test(module.sha256)||runtime.sourceHashes[module.path]!==module.sha256)fail('獨立網頁模組的來源、名稱或雜湊資料無效。');
  ids.add(module.id);size+=bytes(module.source);if(size>STANDALONE_RUNTIME_BYTES)fail('獨立網頁執行套件最多 32 MB。');
 }
 if(!ids.has(STANDALONE_ENTRY))fail('獨立網頁缺少啟動模組。');
 for(const [path,hash]of Object.entries(runtime.sourceHashes))if(!(pathAllowed(path)||path==='definitions/tour.page.json')||!/^([a-f0-9]{64})$/.test(hash))fail('獨立網頁來源索引無效。');
 if(/<\s*\/\s*style/i.test(runtime.css)||/@import\b/i.test(runtime.css))fail('獨立網頁樣式仍含外部資源或無效標記。');
 for(const match of runtime.css.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gi))if(!/^(?:data:|blob:)/i.test((match[2]??match[3]).trim()))fail('獨立網頁樣式仍含外部資源或無效標記。');
 if(!Array.isArray(runtime.licenses)||!runtime.licenses.length||runtime.licenses.length>20||runtime.licenses.some(l=>!exact(l,'name,text')||typeof l.name!=='string'||l.name.length>200||typeof l.text!=='string'||l.text.length>1024*1024))fail('獨立網頁缺少有效的授權說明。');
 const definitionCheck=validateToolPageDefinition(runtime.definition);if(!definitionCheck.valid)fail('獨立網頁的 B4A 頁面定義無效。');
 const pending=[runtime.definition.root];while(pending.length){const node=pending.pop();if(node.type==='component'&&!components.includes(node.component))fail('獨立網頁含未登錄的 B4A 元件。');pending.push(...(node.children||[]),...(node.tabs||[]).map(t=>t.content));}
 return runtime;
}

export function validateStandaloneView(view,building){
 if(view===null)return null;
 if(!exact(view,'mode,levelId,position,target,yaw,pitch,roof,showPlan,showLabels,detail')||!['walk','orbit'].includes(view.mode)||!building.levels.some(l=>l.id===view.levelId)||!['full','auto'].includes(view.detail))fail('獨立網頁的初始視點格式無效。');
 for(const field of ['position','target'])if(!Array.isArray(view[field])||view[field].length!==3||!view[field].every(n=>Number.isFinite(n)&&Math.abs(n)<=20000))fail('獨立網頁的視點座標超出範圍。');
 if(!Number.isFinite(view.yaw)||Math.abs(view.yaw)>1e6||!Number.isFinite(view.pitch)||Math.abs(view.pitch)>Math.PI/2||!['roof','showPlan','showLabels'].every(k=>typeof view[k]==='boolean'))fail('獨立網頁的視點方向或顯示設定無效。');
 return view;
}

export async function loadStandaloneRuntime({signal}={}){
 abort(signal);const location=globalThis.location;
 if(!location||!/^https?:$/.test(location.protocol))fail('請由執行中的 Lumiere 網站匯出；獨立 HTML 不會連回原站取得程式。');
 const url=new URL('/src/frontend/tour/standalone-runtime.json',location.href);
 const response=await fetch(url,{signal,credentials:'same-origin',redirect:'error',cache:'no-cache'});
 if(!response.ok)fail('無法讀取獨立網頁執行套件，請先建立套件後再匯出。');
 if(Number(response.headers.get('content-length'))>STANDALONE_RUNTIME_BYTES*2)fail('獨立網頁執行套件檔案過大。');
 let raw;
 if(response.body?.getReader){
  const reader=response.body.getReader(),parts=[];let total=0;
  try{while(true){abort(signal);const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>STANDALONE_RUNTIME_BYTES*2)fail('獨立網頁執行套件檔案過大。');parts.push(value);}const buffer=new Uint8Array(total);let at=0;for(const value of parts){buffer.set(value,at);at+=value.byteLength;}raw=new TextDecoder().decode(buffer);}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }else{raw=await response.text();if(bytes(raw)>STANDALONE_RUNTIME_BYTES*2)fail('獨立網頁執行套件檔案過大。');}
 abort(signal);let runtime;try{runtime=JSON.parse(raw);}catch{fail('獨立網頁執行套件不是有效的 JSON。');}return validateStandaloneRuntime(runtime);
}

const bootstrap=`import('${STANDALONE_ENTRY}').catch(error=>{const status=document.getElementById('lumiere-standalone-status');status.hidden=false;status.setAttribute('role','alert');status.textContent='獨立網頁未能啟動：'+(error?.message||'請確認瀏覽器支援 WebGL 與 JavaScript 模組。');console.error(error);});`;
const statusCss='\n#lumiere-standalone-status{position:fixed;z-index:10000;inset:20px auto auto 20px;max-width:calc(100% - 40px);margin:0;padding:12px 16px;border:1px solid #c9c7bd;background:#faf8f2;color:#30342f;font:16px/1.5 system-ui,sans-serif;white-space:pre-wrap}#lumiere-standalone-status[hidden]{display:none}';

export async function createStandaloneHtml(project,{runtime,title='3D實境導覽',view=null}={}){
 validateStandaloneRuntime(runtime);
 if(typeof title!=='string'||title.length>200)fail('獨立網頁標題最多 200 字。');title=title.trim()||'3D實境導覽';
 let serialized;try{serialized=JSON.stringify(project);}catch{fail('專案資料無法轉成有效的 JSON。');}
 if(typeof serialized!=='string'||bytes(serialized)>BUNDLE_BYTES)fail('完整專案最多 128 MB。');
 const validated=validateBundle(project);if(project.ifc!==null)fail('獨立網頁目前無法攜帶 IFC 參考模型；請先在設計器移除 IFC 參考後再匯出，或另存完整專案保留原檔。');
 validateStandaloneView(view,validated.building);
 const imports=Object.fromEntries(runtime.modules.map(module=>[module.id,'data:text/javascript;base64,'+base64(module.source)]));
 // HTML normalizes every CRLF/CR line ending to LF before CSP hashes a style.
 // Hash and embed that exact normalized text rather than the source-file bytes.
 const importmap=safeStandaloneJson({imports}),css=runtime.css.replace(/\r\n?/g,'\n')+statusCss;
 const [scriptHash,importHash,styleHash]=await Promise.all([digest(bootstrap),digest(importmap),digest(css)]);
 const csp=`default-src 'none'; script-src data: 'sha256-${scriptHash}' 'sha256-${importHash}'; style-src 'sha256-${styleHash}'; img-src data: blob:; media-src blob: data:; font-src data:; connect-src blob: data:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
 const payload=safeStandaloneJson({project,title,view,licenses:runtime.licenses,definition:runtime.definition});
 const html=`<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${htmlText(csp)}"><meta name="referrer" content="no-referrer"><title>${htmlText(title)}</title><link rel="icon" href="data:,"><style>${css}</style><script type="importmap">${importmap}</script></head><body><div id="app"></div><p id="lumiere-standalone-status" role="status">正在本機載入 3D 場景…</p><noscript>請在支援 JavaScript 與 WebGL 的瀏覽器開啟此檔案。</noscript><script id="lumiere-standalone-payload" type="application/json">${payload}</script><script type="module">${bootstrap}</script></body></html>\n`;
 if(bytes(html)>STANDALONE_HTML_BYTES)fail('獨立 HTML 最多 160 MB；請先縮小內嵌素材或拆分場景。');
 return html;
}

export async function exportStandaloneHtml(project,{runtime,title='3D實境導覽',view=null,signal}={}){
 abort(signal);runtime=runtime||await loadStandaloneRuntime({signal});abort(signal);
 const html=await createStandaloneHtml(project,{runtime,title,view});abort(signal);
 const base=(title.trim()||'lumiere-tour').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,80)||'lumiere-tour';
 const blob=new Blob([html],{type:'text/html;charset=utf-8'});return {blob,filename:base+'.html',bytes:blob.size};
}
