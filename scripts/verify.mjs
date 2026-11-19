import {readFile, readdir, stat, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 本專案的唯讀檢查器；不執行前端程式、不修補上游，也不代替瀏覽器驗收。
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const frontend=path.join(root,'src','frontend');
const failures=[];
const observations=[];
const rel=file=>path.relative(root,file).split(path.sep).join('/');
const sha256=data=>createHash('sha256').update(data).digest('hex');
const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function requireCondition(condition,message){if(!condition)throw new Error(message);}
async function exists(file){try{await stat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}

async function filesIn(directory,{optional=false,skipNodeModules=false}={}){
  if(optional&&!await exists(directory))return [];
  const entries=await readdir(directory,{withFileTypes:true});
  const files=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    if(skipNodeModules&&entry.name==='node_modules')continue;
    const file=path.join(directory,entry.name);
    requireCondition(!entry.isSymbolicLink(),`檢查範圍不接受符號連結：${file}`);
    if(entry.isDirectory())files.push(...await filesIn(file,{skipNodeModules}));
    else if(entry.isFile())files.push(file);
  }
  return files;
}

async function check(label,action){
  try{const detail=await action();console.log(`PASS ${label}${detail?`：${detail}`:''}`);}
  catch(error){failures.push({label,message:error.message});console.error(`FAIL ${label}：${error.message}`);}
}

function runNode(args,options={}){
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,...options});
  if(result.error)throw result.error;
  requireCondition(result.status===0,(result.stderr||result.stdout||`Node 結束碼 ${result.status}`).trim());
  return result.stdout;
}

function resolveLocalUrl(specifier,baseFile){
  requireCondition(typeof specifier==='string'&&specifier.length>0,'資源 URL 必須是非空字串');
  requireCondition(!specifier.includes('\\')&&!specifier.startsWith('//')&&!/^[a-z][a-z\d+.-]*:/i.test(specifier),`禁止外部或特殊資源 URL：${specifier}`);
  const pathname=decodeURIComponent(specifier.split(/[?#]/,1)[0]);
  requireCondition(pathname.length>0&&!pathname.includes('\0'),'資源路徑無效');
  const resolved=pathname.startsWith('/')?path.resolve(root,`.${pathname}`):path.resolve(path.dirname(baseFile),pathname);
  const relative=path.relative(root,resolved);
  requireCondition(relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative),`資源逃出專案：${specifier}`);
  return resolved;
}

function attributes(source){
  const result={};
  const expression=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for(const match of source.matchAll(expression)){
    const name=match[1].toLowerCase();
    requireCondition(!Object.hasOwn(result,name),`重複 HTML 屬性：${name}`);
    result[name]=match[2]??match[3]??match[4]??'';
  }
  return result;
}

let ownFiles=[];
let javascriptFiles=[];
let importMap=null;
const htmlFile=path.join(frontend,'index.html');

await check('自有來源清單',async()=>{
  ownFiles=await filesIn(frontend);
  javascriptFiles=ownFiles.filter(file=>/\.(?:m?js)$/.test(file));
  requireCondition(javascriptFiles.length>0,'找不到自有前端 JavaScript');
  requireCondition(await exists(path.join(root,'scripts','serve.mjs')),'缺少 scripts/serve.mjs');
  return `${javascriptFiles.length} 個前端 JavaScript 檔案`;
});

await check('Node 語法',async()=>{
  const files=[...javascriptFiles,path.join(root,'scripts','serve.mjs')];
  const errors=[];
  for(const file of files){
    try{runNode(['--check',file]);}catch(error){errors.push(`${rel(file)}\n${error.message}`);}
  }
  requireCondition(errors.length===0,errors.join('\n'));
  return `${files.length} 個檔案通過 node --check`;
});

await check('定義 JSON',async()=>{
  const definitionFiles=[
    ...await filesIn(path.join(root,'definitions'),{optional:true}),
    ...ownFiles.filter(file=>/(?:^|[\\/])definitions[\\/]/.test(file))
  ].filter(file=>file.endsWith('.json'));
  const files=[...new Set(definitionFiles)];
  requireCondition(files.length>0,'找不到 definitions 來源 JSON');
  for(const file of files){
    try{JSON.parse(await readFile(file,'utf8'));}
    catch(error){throw new Error(`${rel(file)}：${error.message}`);}
  }
  return `${files.length} 個 JSON 可解析；這不代替 B4A schema 驗證`;
});

await check('Three.js 固定版本與依賴',async()=>{
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
  const installed=JSON.parse(await readFile(path.join(root,'node_modules','three','package.json'),'utf8'));
  const approved={three:['0.187.0','MIT'],'web-ifc':['0.0.78','MPL-2.0'],'three-gpu-pathtracer':['0.0.28','MIT'],'three-mesh-bvh':['0.9.17','MIT'],'xatlas-web':['0.1.0','MIT']};requireCondition(plainObject(pkg.dependencies)&&Object.keys(pkg.dependencies).length===Object.keys(approved).length,'執行依賴須符合已核准清單');for(const [name,[v,license]] of Object.entries(approved)){const actual=JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8'));requireCondition(pkg.dependencies[name]===v&&actual.version===v&&actual.license===license&&lock.packages?.['node_modules/'+name]?.version===v&&lock.packages?.['']?.dependencies?.[name]===v,'已核准依賴版本／授權不一致：'+name);}
  const version=pkg.dependencies.three;
  requireCondition(/^\d+\.\d+\.\d+$/.test(version),`three 必須是精確版本：${version}`);
  requireCondition(installed.version===version,'安裝的 three 版本與 package.json 不一致');
  requireCondition(lock.packages?.['node_modules/three']?.version===version&&lock.packages?.['']?.dependencies?.three===version,'package-lock.json 的 three 版本不一致');
  requireCondition(Object.keys(pkg.optionalDependencies||{}).length===0,'不接受未盤點的 optionalDependencies');
  requireCondition(Object.keys(installed.dependencies||{}).length===0&&Object.keys(installed.optionalDependencies||{}).length===0,'three 出現未盤點的執行期傳遞依賴');
  const additional=Object.keys(lock.packages||{}).filter(key=>key!==''&&!Object.keys(approved).some(name=>key==='node_modules/'+name)&&!lock.packages[key].dev);
  requireCondition(additional.length===0,`lockfile 出現額外執行依賴：${additional.join(', ')}`);
  requireCondition(installed.license==='MIT','three 授權欄位與既有盤點不同');
  requireCondition((await readFile(path.join(root,'node_modules','three','LICENSE'),'utf8')).includes('The MIT License'),'缺少 Three.js MIT 授權文字');
  return `three ${version}，MIT，及使用者核准的 IFC／光線追蹤依賴`;
});

await check('入口 script 與 import map',async()=>{
  const html=await readFile(htmlFile,'utf8');
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const maps=[];
  let modules=0;
  for(const [,attrText,body] of scripts){
    const attr=attributes(attrText);
    requireCondition(Object.keys(attr).every(name=>['type','src','defer','async','crossorigin','integrity'].includes(name)),`script 含未允許屬性：${Object.keys(attr).join(', ')}`);
    if(attr.type==='importmap'){
      requireCondition(!Object.hasOwn(attr,'src'),'import map 必須使用已計算 CSP hash 的固定內嵌資料');
      maps.push({body,data:JSON.parse(body)});
    }else{
      requireCondition(attr.type==='module'&&typeof attr.src==='string','只接受同源外部 module script 或固定 import map');
      requireCondition(body.trim()==='','外部 module script 不得夾帶內嵌程式');
      requireCondition((await stat(resolveLocalUrl(attr.src,htmlFile))).isFile(),`script 不存在：${attr.src}`);
      modules++;
    }
  }
  requireCondition(maps.length===1,'入口必須且只能有一份 import map');
  requireCondition(modules>=1,'入口缺少外部 module script');
  const expected={'three':'/node_modules/three/build/three.module.js','three/addons/':'/node_modules/three/examples/jsm/','three/examples/':'/node_modules/three/examples/','three-mesh-bvh':'/node_modules/three-mesh-bvh/src/index.js'};
  const data=maps[0].data;
  requireCondition(plainObject(data)&&Object.keys(data).length===1&&plainObject(data.imports),'import map 只接受 imports 物件');
  requireCondition(Object.keys(data.imports).length===Object.keys(expected).length,'import map 必須符合已核准的四個映射');
  for(const [key,value] of Object.entries(expected)){
    requireCondition(data.imports[key]===value,`import map ${key} 必須為 ${value}`);
    const info=await stat(resolveLocalUrl(value,htmlFile));
    requireCondition(key.endsWith('/')?info.isDirectory():info.isFile(),`import map 目標不存在或型別不符：${key}`);
  }
  importMap=data.imports;
  const hash=createHash('sha256').update(maps[0].body).digest('base64');
  observations.push(`入口 import map CSP hash：sha256-${hash}`);
  const serve=await readFile(path.join(root,'scripts','serve.mjs'),'utf8');
  requireCondition(serve.includes('Content-Security-Policy')&&/createHash\s*\(\s*['"]sha256['"]\s*\)/.test(serve),'本機服務未找到 CSP／動態 SHA-256 計算');
  requireCondition(!/'unsafe-inline'|'unsafe-eval'/.test(serve),'本機服務不可放寬為 unsafe-inline 或 unsafe-eval');
  return `${modules} 個同源 module script，4 個固定映射；HTTP CSP 仍需實際驗證`;
});

await check('靜態 import 目標',async()=>{
  requireCondition(importMap!==null,'先修正入口 import map');
  const files=[...javascriptFiles,path.join(root,'scripts','serve.mjs')];
  const inputs=await Promise.all(files.map(async file=>({file,source:await readFile(file,'utf8')})));
  // SourceTextModule 僅解析，不 link／evaluate；動態 import 不在此靜態檢查範圍。
  const extractor="const fs=require('node:fs');const vm=require('node:vm');const list=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(list.map(item=>({file:item.file,imports:new vm.SourceTextModule(item.source,{identifier:item.file}).dependencySpecifiers}))));";
  const entries=JSON.parse(runNode(['--experimental-vm-modules','--no-warnings','-e',extractor],{input:JSON.stringify(inputs)}));
  let count=0;
  const errors=[];
  for(const {file,imports} of entries){
    for(const specifier of imports){
      try{
        if(specifier.startsWith('node:')){
          requireCondition(file===path.join(root,'scripts','serve.mjs'),`前端不可引用 Node 模組：${specifier}`);
          continue;
        }
        let mapped=specifier;
        if(!specifier.startsWith('.')&&!specifier.startsWith('/')){
          if(Object.hasOwn(importMap,specifier))mapped=importMap[specifier];
          else if(specifier.startsWith('three/addons/'))mapped=importMap['three/addons/']+specifier.slice('three/addons/'.length);
          else throw new Error(`未允許的 bare import：${specifier}`);
        }
        const target=resolveLocalUrl(mapped,file);
        requireCondition((await stat(target)).isFile(),`import 目標不是檔案：${specifier}`);
        count++;
      }catch(error){errors.push(`${rel(file)} → ${specifier}：${error.message}`);}
    }
  }
  requireCondition(errors.length===0,errors.join('\n'));
  return `${count} 個靜態本機 import 目標存在；動態 import 未檢查`;
});

await check('自有前端危險模式',async()=>{
  const candidates=ownFiles.filter(file=>/\.(?:m?js|css|html)$/.test(file));
  const files=[];
  // Router 是上游範本的受控複本；只接受一處安全工具匯入路徑調整，不以排除名稱掩蓋修改。
  const routerFile=path.join(frontend,'core','Router.js');
  for(const file of candidates){
    if(file===routerFile){
      const pointer=(await readFile(path.join(root,'.b4a-root'),'utf8')).trim();
      const upstreamRouter=path.join(path.resolve(root,pointer),'templates','spa','frontend','core','Router.js');
      const original=await readFile(upstreamRouter,'utf8');
      const expected=original.replace("import { escapeHtml } from './Security.js';","import { escapeHtml } from '../../../lib/ui_components/utils/security.js';");
      const actual=await readFile(file,'utf8');
      requireCondition(actual.replaceAll('\r\n','\n')===expected.replaceAll('\r\n','\n'),'Router.js 與上游範本及允許的匯入路徑調整不符');
      observations.push('Router.js 已核對上游完整內容，僅調整 escapeHtml 匯入位置；未當作自有程式掃描。');
    }else files.push(file);
  }
  const patterns=[
    ['動態程式執行',/\beval\s*\(|\b(?:new\s+)?Function\s*\(/],
    ['HTML 字串注入',/\.\s*(?:innerHTML|outerHTML)\b|\binsertAdjacentHTML\s*\(|\bdocument\s*\.\s*(?:write|writeln)\s*\(/],
    ['SVG',/<\s*svg\b|image\/svg\+xml|www\.w3\.org\/2000\/svg/i],
    ['JavaScript URL',/javascript\s*:/i],
    ['HTML 內嵌事件',/<[a-z][^>]*\s+on[a-z]+\s*=/i],
    ['HTML 內嵌樣式',/<[a-z][^>]*\s+style\s*=/i],
    ['CSS 程式執行',/expression\s*\(|-moz-binding\s*:/i]
  ];
  // Reviewed SVG download only: fixed tags/attributes, escaped text, no DOM insertion or remote URLs.
  // Keep all other checks; changing either reviewed source invalidates this narrow exception.
  // Git checkout may use LF or CRLF; canonicalize only that encoding difference.
  // Any other source change still invalidates these two reviewed download paths.
  const svgDownloadHashes={"src/frontend/designer/design-export.js":"f044e1a62d2b042560a8d0510efb2bc59e2e563d0d6f7eeebd61181970598c1d","src/frontend/designer/DesignerPage.js":"5342065f02efa77d0b31ef0b55abc23d98f41d22f26a0f023fe8aa28e4618022"};
  const errors=[];
  for(const file of files){
    const text=await readFile(file,'utf8');
    for(const [label,expression] of patterns){
      if(label==='SVG'&&svgDownloadHashes[rel(file)]===sha256(Buffer.from(text.replaceAll('\r\n','\n'),'utf8')))continue;
      const match=expression.exec(text);
      if(match){const line=text.slice(0,match.index).split('\n').length;errors.push(`${rel(file)}:${line} ${label}`);}
    }
  }
  requireCondition(errors.length===0,errors.join('\n'));
  return `${files.length} 個自有 JS／CSS／HTML，Canvas 與 CSSOM 允許；不稽核上游庫`;
});

await check('B4A 三庫 SHA-256 完整性',async()=>{
  const pointer=(await readFile(path.join(root,'.b4a-root'),'utf8')).trim();
  requireCondition(pointer.length>0,'.b4a-root 為空');
  const upstream=path.resolve(root,pointer);
  const summaries=[];
  for(const name of ['ui_components','page-generator','custom_components']){
    const source=path.join(upstream,'packages','javascript','browser',name);
    const copy=path.join(root,'lib',name);
    requireCondition(!(await lstat(copy)).isSymbolicLink(),`lib/${name} 必須是複本`);
    const sourceFiles=await filesIn(source,{skipNodeModules:true});
    const copyFiles=await filesIn(copy,{skipNodeModules:true});
    const sourceMap=new Map(sourceFiles.map(file=>[path.relative(source,file).split(path.sep).join('/'),file]));
    const copyMap=new Map(copyFiles.map(file=>[path.relative(copy,file).split(path.sep).join('/'),file]));
    const missing=[...sourceMap.keys()].filter(key=>!copyMap.has(key));
    const extra=[...copyMap.keys()].filter(key=>!sourceMap.has(key));
    requireCondition(missing.length===0&&extra.length===0,`${name} 檔案集合不同；缺少 ${missing.join(', ')||'無'}；多出 ${extra.join(', ')||'無'}`);
    const mismatches=[];
    const digest=createHash('sha256');
    for(const key of [...sourceMap.keys()].sort()){
      const [sourceData,copyData]=await Promise.all([readFile(sourceMap.get(key)),readFile(copyMap.get(key))]);
      const hash=sha256(sourceData);
      if(hash!==sha256(copyData))mismatches.push(key);
      digest.update(key+'\0'+hash+'\n');
    }
    requireCondition(mismatches.length===0,`${name} SHA-256 不同：${mismatches.join(', ')}`);
    summaries.push(`${name} ${sourceMap.size} 檔 ${digest.digest('hex').slice(0,16)}`);
  }
  return summaries.join('；');
});

await check('公開預設入口',()=>runNode(['tests/public-default.mjs']).trim());

for(const observation of observations)console.log(`INFO ${observation}`);
if(failures.length){console.error(`\n檢查未通過：${failures.length} 項。`);process.exitCode=1;}
else console.log('\n靜態檢查全部通過。瀏覽器操作、畫質、效能與 HTTP 安全仍須另外驗收。');
