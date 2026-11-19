// 發布清單、檔案完整性與字面引用檢查；不執行被檢查的程式。
import {readFileSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inventory,verifyReleaseManifest} from './publish-policy.mjs';
import {moduleReferences} from './module-references.mjs';
if(!vm.SourceTextModule) {
    const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit'});
    process.exit(result.status??1);
}
const root=path.resolve(process.argv[2]||'dist'),errors=[];let count=0,unresolved=0;
try {
    verifyReleaseManifest(root,JSON.parse(readFileSync(path.join(root,'RELEASE.json'),'utf8')));
    for(const item of inventory(root,{filtered:false})) {
        const full=path.join(root,item.path),ext=path.extname(item.path),source=readFileSync(full,'utf8');let refs=[];
        if(['.js','.mjs'].includes(ext)) {
            const result=moduleReferences(source,item.path);refs=result.refs;unresolved+=result.unresolved.length;
        } else if(ext==='.html') {
            const html=source.replace(/<!--[\s\S]*?-->/g,'');
            refs=[...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map(x=>({value:x[1],kind:'resource'}));
        } else if(ext==='.css') {
            const css=source.replace(/\/\*[\s\S]*?\*\//g,'');
            refs=[...css.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]|url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(x=>({value:x[1]||x[2],kind:'resource'}));
        }
        for(const {value:raw,kind} of refs) {
            if(!raw||raw.startsWith('#'))continue;
            // 應用入口既有空圖示及套件內嵌圖片／字體可用 data；不接受執行碼。
            if(/^data:/i.test(raw)&&kind==='resource'&&/^data:(?:,|image\/(?:png|gif|jpeg|webp|x-icon)|font\/|application\/(?:font|x-font))/i.test(raw))continue;
            if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)){errors.push(`[未批准外部引用] ${item.path} → ${raw}`);continue;}
            if(raw.startsWith('/')||raw.includes('\\')){errors.push(`[非法路徑] ${item.path} → ${raw}`);continue;}
            if(kind==='import'&&!raw.startsWith('./')&&!raw.startsWith('../')){errors.push(`[bare 匯入] ${item.path} → ${raw}`);continue;}
            let decoded;try{decoded=decodeURIComponent(raw.split(/[?#]/)[0]);}catch{errors.push(`[非法編碼] ${item.path} → ${raw}`);continue;}
            const target=path.resolve(path.dirname(full),decoded);count++;
            if(!target.startsWith(root+path.sep)){errors.push(`[逃出產物根] ${item.path} → ${raw}`);continue;}
            if(!existsSync(target)||!statSync(target).isFile())errors.push(`[缺少發布資源或遭排除] ${item.path} → ${raw}`);
        }
    }
} catch(error){errors.push(error.message);}
console.log(`發布清單與引用檢查：${count} 個字面引用；${unresolved} 個動態匯入需另行執行期驗證。`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log('靜態發布檢查通過；此結果不涵蓋動態計算路徑或後端部署。');
