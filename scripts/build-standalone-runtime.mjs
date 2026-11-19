import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as vm from 'node:vm';

export const RUNTIME_FORMAT='lumiere-standalone-runtime';
export const RUNTIME_BYTES=32*1024*1024;
export const RUNTIME_ENTRY='src/frontend/tour/standalone-entry.js';
export const MODULE_PREFIX='lumiere-offline/';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const ROOTS=['src/frontend/','lib/ui_components/','lib/page-generator/','lib/custom_components/','node_modules/three/'];
const CSS=['lib/ui_components/theme.css','src/frontend/styles/theme.custom.css','src/frontend/styles/layout.css','src/frontend/styles/designer.css','src/frontend/styles/tour.css'];
const DEFINITION='definitions/tour.page.json';
const OUTPUT='src/frontend/tour/standalone-runtime.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error(message);};
const identifierStart=c=>!!c&&/[A-Za-z_$\u0080-\uffff]/.test(c);
const identifierPart=c=>!!c&&/[A-Za-z0-9_$\u0080-\uffff]/.test(c);

// Token offsets refer to the original trusted source. Comments, string contents,
// template text and regular expressions can never masquerade as import syntax.
export function tokenizeModule(source){
 const tokens=[];let at=0;
 const push=(type,start,end,value=source.slice(start,end))=>{const t={type,start,end,value};tokens.push(t);return t;};
 function quoted(){const start=at,quote=source[at++];let value='';
  while(at<source.length){let c=source[at++];if(c===quote){push('string',start,at,value);return;}
   if(c==='\n'||c==='\r')fail('JavaScript 字串未閉合。');
   if(c!=='\\'){value+=c;continue;}if(at>=source.length)fail('JavaScript 字串逸出未閉合。');c=source[at++];
   if(c==='\n')continue;if(c==='\r'){if(source[at]==='\n')at++;continue;}
   if(c==='x'){const digits=source.slice(at,at+2);if(!/^[a-f\d]{2}$/i.test(digits))fail('無效的十六進位字串逸出。');value+=String.fromCharCode(parseInt(digits,16));at+=2;continue;}
   if(c==='u'){const braced=source[at]==='{',end=braced?source.indexOf('}',at+1):at+4,digits=source.slice(at+(braced?1:0),end);if(end<0||!digits||!new RegExp(braced?'^[a-f\\d]{1,6}$':'^[a-f\\d]{4}$','i').test(digits)||parseInt(digits,16)>0x10ffff)fail('無效的 Unicode 字串逸出。');value+=String.fromCodePoint(parseInt(digits,16));at=end+(braced?1:0);continue;}
   value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'})[c]??c;
  }fail('JavaScript 字串未閉合。');
 }
 function regex(){const start=at++;let group=false;
  while(at<source.length){const c=source[at++];if(c==='\\'){at++;continue;}if(c==='\n'||c==='\r')fail('正規表示式未閉合。');if(c==='[')group=true;else if(c===']')group=false;else if(c==='/'&&!group){while(identifierPart(source[at]))at++;push('regex',start,at);return;}}
  fail('正規表示式未閉合。');
 }
 function template(){const start=at++;push('template-start',start,at,'`');
  while(at<source.length){const c=source[at++];if(c==='\\'){at++;continue;}if(c==='`'){push('template-end',at-1,at,'`');return;}
   if(c==='$'&&source[at]==='{'){at++;push('punct',at-2,at,'${');code(true);}
  }fail('範本字串未閉合。');
 }
 function code(stopOnBrace=false){let canRegex=true;const parens=[],braces=[];let previous=null;
  while(at<source.length){const start=at,c=source[at];if(/\s/.test(c)){at++;continue;}
   if(c==='/'&&source[at+1]==='/'){at+=2;while(at<source.length&&!/[\n\r]/.test(source[at]))at++;continue;}
   if(c==='/'&&source[at+1]==='*'){const end=source.indexOf('*/',at+2);if(end<0)fail('區塊註解未閉合。');at=end+2;continue;}
   if(c==='"'||c==="'"){quoted();previous=tokens.at(-1);canRegex=false;continue;}
   if(c==='`'){template();previous=tokens.at(-1);canRegex=false;continue;}
   if(c==='/'&&canRegex){regex();previous=tokens.at(-1);canRegex=false;continue;}
   if(identifierStart(c)){at++;while(identifierPart(source[at]))at++;previous=push('identifier',start,at);canRegex=['return','throw','case','delete','void','typeof','new','in','instanceof','yield','await','else','do'].includes(previous.value);continue;}
   if(/[0-9]/.test(c)){at++;while(at<source.length&&/[A-Za-z0-9_.]/.test(source[at]))at++;previous=push('number',start,at);canRegex=false;continue;}
   const multi=['===','!==','>>>','**=','=>','?.','++','--','==','!=','<=','>=','&&','||','??','+=','-=','*=','/=','%=','**','<<','>>','&=','|=','^=','...'].find(v=>source.startsWith(v,at));
   const value=multi||c;at+=value.length;
   if(value==='('){parens.push(['if','while','for','with','switch','catch'].includes(previous?.value));canRegex=true;}
   else if(value===')'){canRegex=parens.pop()||false;}
   else if(value==='{'){braces.push(previous?.value!=='=>'&&['=',':',',','(','[','return'].includes(previous?.value)?'object':'block');canRegex=true;}
   else if(value==='}'){if(!braces.length&&stopOnBrace){push('punct',start,at,value);return;}canRegex=braces.pop()!=='object';}
   else if([']','++','--','.','?.'].includes(value))canRegex=false;
   else canRegex=true;
   previous=push('punct',start,at,value);
  }if(stopOnBrace)fail('範本運算式未閉合。');
 }
 code();return tokens;
}

export function moduleReferences(source,filename='module.js'){
 if(typeof vm.SourceTextModule!=='function')fail('請以 node --experimental-vm-modules 執行獨立網頁建置。');
 const grammar=new vm.SourceTextModule(source,{identifier:filename}),tokens=tokenizeModule(source),refs=[],staticValues=[];
 const add=(token,dynamic=false)=>{if(token?.type!=='string')fail(filename+' 的匯入路徑須為字串常值。');refs.push({...token,dynamic,specifier:token.value});if(!dynamic)staticValues.push(token.value);};
 const closing=(index,open,close)=>{let depth=0;for(let n=index;n<tokens.length;n++){if(tokens[n].value===open)depth++;if(tokens[n].value===close&&!--depth)return n;}return -1;};
 for(let i=0;i<tokens.length;i++){const t=tokens[i];if(t.type!=='identifier'||!['import','export'].includes(t.value)||['.','?.'].includes(tokens[i-1]?.value))continue;
  const next=tokens[i+1];if(t.value==='import'){
   if(next?.value==='.')continue;
   if(next?.value==='('){const end=closing(i+1,'(',')');if(tokens[end+1]?.value==='{')continue;add(tokens[i+2],true);continue;}
   if(next?.type==='string'){add(next);continue;}
   for(let n=i+1;n<tokens.length&&tokens[n].value!==';';n++)if(tokens[n].value==='from'&&tokens[n+1]?.type==='string'){add(tokens[n+1]);break;}
  }else if(next?.value==='*'){
   for(let n=i+2;n<tokens.length&&tokens[n].value!==';';n++)if(tokens[n].value==='from'&&tokens[n+1]?.type==='string'){add(tokens[n+1]);break;}
  }else if(next?.value==='{'){const end=closing(i+1,'{','}');if(tokens[end+1]?.value==='from')add(tokens[end+2]);}
 }
 const expected=[...new Set(grammar.dependencySpecifiers)].sort(),actual=[...new Set(staticValues)].sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual))fail(filename+' 的詞法匯入位置與 JavaScript 語法解析不一致。');
 return refs.sort((a,b)=>a.start-b.start);
}

export function resolveModule(specifier,from){
 if(typeof specifier!=='string'||!specifier)fail('模組路徑不得為空。');let canonical;
 if(specifier==='three')canonical='node_modules/three/build/three.module.js';
 else if(specifier.startsWith('three/addons/'))canonical='node_modules/three/examples/jsm/'+specifier.slice('three/addons/'.length);
 else if(specifier.startsWith('three/examples/'))canonical='node_modules/three/examples/'+specifier.slice('three/examples/'.length);
 else if(specifier.startsWith('.'))canonical=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier.split(/[?#]/,1)[0]));
 else fail('獨立執行模組不接受外部或未知匯入：'+specifier);
 canonical=canonical.split(/[?#]/,1)[0];
 if(!/^[A-Za-z0-9_./-]+\.js$/.test(canonical)||!ROOTS.some(p=>canonical.startsWith(p))||canonical.split('/').includes('..'))fail('模組路徑超出核准範圍：'+specifier);
 return canonical;
}
export function rewriteModule(source,refs,from){let output='',at=0;for(const r of refs){output+=source.slice(at,r.start)+JSON.stringify(MODULE_PREFIX+resolveModule(r.specifier,from));at=r.end;}return output+source.slice(at);}

export async function buildStandaloneRuntime({root=ROOT,entry=RUNTIME_ENTRY,write=false,output=OUTPUT}={}){
 const absolute=await realpath(root),sourceHashes={},read=async relative=>{
  if(typeof relative!=='string'||path.posix.normalize(relative)!==relative||relative.startsWith('/')||relative.includes('\\')||relative.split('/').includes('..'))fail('來源路徑錯誤。');
  const target=await realpath(path.join(absolute,...relative.split('/')));if(!target.toLowerCase().startsWith((absolute+path.sep).toLowerCase()))fail('來源連結超出專案範圍。');
  const bytes=await readFile(target);sourceHashes[relative]=hash(bytes);return bytes.toString('utf8');
 };
 if(!ROOTS.some(p=>entry.startsWith(p)))fail('入口超出核准範圍。');
 const modules=new Map();let sourceBytes=0;
 const visit=async relative=>{if(modules.has(relative))return;const source=await read(relative);sourceBytes+=Buffer.byteLength(source);if(sourceBytes>RUNTIME_BYTES)fail('獨立網頁執行模組超過 32 MB。');const refs=moduleReferences(source,relative);modules.set(relative,{id:MODULE_PREFIX+relative,path:relative,source:rewriteModule(source,refs,relative),sha256:sourceHashes[relative]});for(const ref of refs)await visit(resolveModule(ref.specifier,relative));};
 await visit(entry);
 const cssVisit=async(relative,stack=[])=>{if(stack.includes(relative))fail('CSS 匯入循環：'+relative);const source=await read(relative),masked=source.replace(/\/\*[\s\S]*?\*\//g,m=>' '.repeat(m.length));let output='',at=0;
  const imports=[...masked.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*;/gi)];
  for(const match of imports){const spec=match[2];if(!spec.startsWith('.')||/[?#\\]/.test(spec))fail('CSS 匯入須為本機相對路徑。');const file=path.posix.normalize(path.posix.join(path.posix.dirname(relative),spec));if(!ROOTS.some(p=>file.startsWith(p))||!file.endsWith('.css'))fail('CSS 匯入超出核准範圍。');output+=source.slice(at,match.index)+await cssVisit(file,[...stack,relative]);at=match.index+match[0].length;}
  output+=source.slice(at);const clean=output.replace(/\/\*[\s\S]*?\*\//g,'');if(/@import\b/i.test(clean))fail('CSS 含不支援的匯入語法。');
  for(const match of clean.matchAll(/\burl\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gi)){const url=(match[2]??match[3]).trim();if(!/^(?:data:(?:image|font)\/|#)/i.test(url))fail('CSS 含未內嵌的外部資源：'+url);}
  return '/* '+relative+' */\n'+output;
 };
 const css=(await Promise.all(CSS.map(f=>cssVisit(f)))).join('\n'),definition=JSON.parse(await read(DEFINITION));
 if(definition?.type!=='tool')fail('獨立導覽頁定義須為 B4A tool 定義。');
 const licenses=[{name:'Three.js — MIT',text:await read('node_modules/three/LICENSE')},{name:'Bricks4Agent — 本機來源註記',text:'此執行包保留使用者已指定的 Bricks4Agent 本機元件與頁面生成器。來源：lib/ui_components、lib/page-generator、lib/custom_components。本機來源樹未提供全域 LICENSE 檔或 package license 宣告；本註記不推定或新增其授權範圍。元件中的既有著作權與授權註記仍保留於原始碼。'}];
 const manifest={format:RUNTIME_FORMAT,version:1,entry:MODULE_PREFIX+entry,definition,modules:[...modules.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),css,licenses,sourceHashes:Object.fromEntries(Object.entries(sourceHashes).sort(([a],[b])=>a.localeCompare(b,'en')))};
 const json=JSON.stringify(manifest);if(Buffer.byteLength(json)>RUNTIME_BYTES)fail('獨立網頁執行包超過 32 MB。');if(write)await writeFile(path.join(absolute,output),json+'\n');return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const check=process.argv.slice(2).includes('--check'),manifest=await buildStandaloneRuntime({write:!check});
 if(check){const existing=await readFile(path.join(ROOT,OUTPUT),'utf8');if(existing!==JSON.stringify(manifest)+'\n')fail('獨立網頁執行包已過期，請重新建置。');}
 console.log(`${check?'PASS':'BUILT'} standalone runtime: ${manifest.modules.length} modules, ${Buffer.byteLength(JSON.stringify(manifest))} bytes; embedded CSS, B4A definition, local assets and license notices.`);
}
