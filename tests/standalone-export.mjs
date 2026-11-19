import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {emptyProject} from '../src/frontend/designer/model.js';
import {createStandaloneHtml,exportStandaloneHtml,loadStandaloneRuntime,validateStandaloneView,STANDALONE_ENTRY,STANDALONE_RUNTIME_BYTES} from '../src/frontend/tour/standalone-export.js';

let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const store=new BuildingStore(emptyProject());store.execute({type:'floorArea.add',name:'客廳',points:[{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:-3,z:3}]});store.execute({type:'addObject',assetId:'text-panel',x:0,z:0});
const attack='窗</script><script>alert(1)</script>&"\u2028\u2029尾';store.execute({type:'label.set',id:store.state.objects[0].id,text:attack});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cA9sAAAAASUVORK5CYII=';
const project={format:'lumiere-project',version:2,building:store.building,assets:[],underlays:[{levelId:'floor-1',name:'來源底圖',type:'image/png',data:png,x:-3,z:-3,width:6,rotation:0,opacity:.4}],materials:{format:'lumiere-materials',version:2,materials:[{id:'oak',channel:'color',tileMetres:1,data:'data:image/png;base64,'+png}]},ifc:null,sheets:null,frame:{format:'lumiere-frame-2d',version:1,name:'未分析',nodes:[],members:[],displacementLimitMm:10},reference:null,captureContext:null};
const definition=JSON.parse(await readFile('definitions/tour.page.json','utf8'));
const source='export const ready="</script><img src=x onerror=alert(1)>";';
const sourceHash=createHash('sha256').update(source).digest('hex');
const runtime={format:'lumiere-standalone-runtime',version:1,entry:STANDALONE_ENTRY,definition,modules:[{id:STANDALONE_ENTRY,path:'src/frontend/tour/standalone-entry.js',source,sha256:sourceHash}],css:'html,body,#app{height:100%;margin:0}',licenses:[{name:'Three.js MIT',text:'MIT license\n</script><script>bad()</script>'}],sourceHashes:{'src/frontend/tour/standalone-entry.js':sourceHash}};
const view={mode:'walk',levelId:'floor-1',position:[1,1.65,1],target:[0,0,0],yaw:Math.PI,pitch:0,roof:false,showPlan:true,showLabels:false,detail:'full'};
const original=JSON.stringify(project),title='公寓</title><script>bad()</script>&"';
const html=await createStandaloneHtml(project,{runtime,title,view});
check(JSON.stringify(project)===original,'匯出不得改變場景、原始底圖或材質');
check(html.startsWith('<!doctype html>'),'輸出完整 HTML 文件');
check(!html.includes('<title>'+title+'</title>'),'標題不能插入標記');
check(!/\b(?:src|href)\s*=\s*["'](?:https?:|\/\/|file:)/i.test(html),'輸出不引用原站、CDN 或檔案路徑');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
check(scripts.length===3,'惡意標題、標籤、授權文字不能新增可執行 script');
const dataBlock=scripts.find(s=>s[1].includes('application/json'))[2],payload=JSON.parse(dataBlock);
check(!/[<>&\u2028\u2029]/.test(dataBlock),'JSON 以 Unicode 跳脫阻止結束標記與特殊行分隔字元');
assert.deepEqual(payload.project,project);checks++;
assert.deepEqual(payload.view,view);checks++;
assert.deepEqual(payload.definition,definition);checks++;
assert.deepEqual(payload.licenses,runtime.licenses);checks++;
check(payload.project.building.levels[0].design.objects[0].prop.label===attack,'原始標籤字元不因安全編碼遺失');
check(payload.project.underlays[0].data===png&&payload.project.materials.materials[0].data.endsWith(png),'完整保留底圖與材質圖片位元組');
const importText=scripts.find(s=>s[1].includes('importmap'))[2],imports=JSON.parse(importText).imports;
check(Object.keys(imports).length===1&&imports[STANDALONE_ENTRY].startsWith('data:text/javascript;base64,'),'模組來自內嵌資料，沒有連回原站');
check(Buffer.from(imports[STANDALONE_ENTRY].split(',')[1],'base64').toString('utf8')===source,'程式中的結束標記以 base64 內嵌，不改變可信程式');
const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].replaceAll('&#39;',"'").replaceAll('&amp;','&');
check(!/unsafe-eval|unsafe-inline|https?:|\blocalhost\b|127\.0\.0\.1/.test(csp),'獨立網頁不放寬為動態執行或外部網路');
check(csp.includes("default-src 'none'")&&csp.includes('connect-src blob: data:')&&csp.includes("frame-src 'none'")&&csp.includes("object-src 'none'")&&csp.includes("base-uri 'none'")&&csp.includes("form-action 'none'"),'預設封鎖外部要求、框架、物件、表單與 base');
const executable=scripts.find(s=>s[1].includes('type="module"'))[2],style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
for(const value of [executable,importText,style])check(csp.includes("'sha256-"+createHash('sha256').update(value).digest('base64')+"'"),'CSP 雜湊必須吻合實際輸出的每一段程式與樣式');
check(!/\beval\s*\(|new\s+Function\s*\(|document\.write|innerHTML/.test(executable),'啟動只使用模組載入及安全錯誤文字');
const exported=await exportStandaloneHtml(project,{runtime,title:'../公寓:測試',view});
check(exported.blob.type==='text/html;charset=utf-8'&&exported.blob.size===exported.bytes,'匯出回傳可下載的 HTML Blob');
check(!/[\\/:]/.test(exported.filename)&&exported.filename.endsWith('.html'),'下載檔名不能帶入路徑或非法 Windows 字元');
check((await exported.blob.text()).includes('lumiere-standalone-payload'),'Blob 攜帶完整啟動資料');
const embeddedCss=structuredClone(runtime);embeddedCss.css+='body{background-image:url("data:image/png;base64,'+png+'")}';check((await createStandaloneHtml(project,{runtime:embeddedCss})).includes('background-image:url'),'允許完整內嵌 CSS 圖片而不誤認為外部資源');
const crlfRuntime=structuredClone(runtime);crlfRuntime.css='/* Windows CSS */\r\nhtml,body,#app {\r\n height:100%;\r margin:0;\r\n}\r\n';
const crlfHtml=await createStandaloneHtml(project,{runtime:crlfRuntime}),crlfStyle=crlfHtml.match(/<style>([\s\S]*?)<\/style>/)[1],crlfCsp=crlfHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].replaceAll('&#39;',"'");
check(!crlfStyle.includes('\r'),'Windows CRLF 與單獨 CR 必須先正規化再寫入 HTML 樣式');
check(crlfStyle.startsWith(crlfRuntime.css.replace(/\r\n?/g,'\n')),'樣式內容與 HTML 解析器的 LF 正規化相同');
check(crlfCsp.includes("'sha256-"+createHash('sha256').update(crlfStyle.replace(/\r\n?/g,'\n')).digest('base64')+"'"),'CSS 的 CSP 雜湊吻合瀏覽器完成換行正規化後的文字');

for(const mutate of [
 r=>r.modules.push({...r.modules[0]}),r=>r.modules[0].path='../outside.js',r=>r.modules[0].id='https://evil.example/code.js',r=>r.modules[0].sha256='a'.repeat(64),r=>r.entry='other-entry',r=>r.css='@import "https://evil.example/style.css";',r=>r.css='body{background:url(https://evil.example/a)}',r=>r.css='</style><script>bad()</script>',r=>r.licenses=[],r=>r.definition.root.children.push({type:'component',id:'unknown',component:'Unknown',options:{}})
]){
 const bad=structuredClone(runtime);mutate(bad);await assert.rejects(()=>createStandaloneHtml(project,{runtime:bad}),undefined,'不完整、不安全或錯誤來源的 runtime 必須拒絕：'+String(mutate));checks++;
}
for(const mutate of [v=>v.levelId='missing',v=>v.position[0]=Infinity,v=>v.position=[0,0],v=>v.yaw=1e7,v=>v.pitch=Math.PI,v=>v.showPlan='yes',v=>v.extra='bad',v=>v.mode='javascript:alert(1)']){
 const bad=structuredClone(view);mutate(bad);assert.throws(()=>validateStandaloneView(bad,project.building));checks++;
}
const badProject=structuredClone(project);badProject.extra='unexpected';await assert.rejects(()=>createStandaloneHtml(badProject,{runtime}));checks++;
const ifcProject=structuredClone(project);ifcProject.ifc={name:'參考.ifc',data:btoa('ISO-10303-21;')};await assert.rejects(()=>createStandaloneHtml(ifcProject,{runtime}),/IFC.*移除.*另存完整專案/);checks++;
await assert.rejects(()=>createStandaloneHtml(project,{runtime,title:'x'.repeat(201)}),/200/);checks++;
const controller=new AbortController();controller.abort();await assert.rejects(()=>exportStandaloneHtml(project,{runtime,signal:controller.signal}),e=>e.name==='AbortError');checks++;

const savedLocation=globalThis.location,savedFetch=globalThis.fetch;
try{
 globalThis.location={href:'http://127.0.0.1:8137/src/frontend/index.html#/tour',protocol:'http:'};let fetches=0;
 globalThis.fetch=async(url,options)=>{fetches++;check(String(url)==='http://127.0.0.1:8137/src/frontend/tour/standalone-runtime.json','套件只從固定同源路徑取得');check(options.redirect==='error'&&options.credentials==='same-origin','不允許重新導向到其他來源');return new Response(JSON.stringify(runtime),{status:200});};
 assert.deepEqual(await loadStandaloneRuntime(),runtime);checks++;
 await assert.rejects(()=>loadStandaloneRuntime({signal:controller.signal}),e=>e.name==='AbortError');checks++;check(fetches===1,'已取消操作不能發出請求');
 globalThis.fetch=async()=>new Response('{}',{headers:{'content-length':String(STANDALONE_RUNTIME_BYTES*2+1)}});await assert.rejects(()=>loadStandaloneRuntime(),/過大/);checks++;
 globalThis.location={href:'file:///D:/scene.html',protocol:'file:'};await assert.rejects(()=>loadStandaloneRuntime(),/不會連回原站/);checks++;
}finally{if(savedLocation===undefined)delete globalThis.location;else globalThis.location=savedLocation;globalThis.fetch=savedFetch;}
console.log(`PASS standalone HTML export: ${checks} checks; inert hostile labels, exact scene/assets/view retention, data modules, matching CSP hashes, fixed-origin runtime, bounded refusal and cancellation.`);
