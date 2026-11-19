// 同一發布規則供複製、盤點與產物驗證使用。
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const raw=readFileSync(new URL('./publish-policy.json',import.meta.url),'utf8');
export const POLICY=JSON.parse(raw);
export const POLICY_HASH=createHash('sha256').update(raw).digest('hex');
export function validatePolicy(policy) {
    const keys=['schemaVersion','profile','libraries','excludedDirectories','excludedExtensions','excludedNamePatterns','libraryExtensions','applicationExtensions','sourceClassifications'];
    if(!policy || Object.keys(policy).some(k=>!keys.includes(k)) || keys.some(k=>!Object.hasOwn(policy,k)))throw Error('發布規範欄位不符');
    if(policy.schemaVersion!==1 || policy.profile!=='frontend-runtime')throw Error('不支援的發布規範');
    for(const k of keys.slice(2,-1)) if(!Array.isArray(policy[k]) || policy[k].some(v=>typeof v!=='string'))throw Error('發布規範須為字串清單：'+k);
    for(const pattern of policy.excludedNamePatterns)new RegExp(pattern);
    if(!Array.isArray(policy.sourceClassifications))throw Error('來源分類須為清單');
    for(const rule of policy.sourceClassifications) {
        if(Object.keys(rule).sort().join(',')!=='extensions,kind,prefix,reason' || typeof rule.prefix!=='string' || rule.prefix.includes('..') || !policy.libraries.some(lib=>rule.prefix.startsWith(lib+'/')) || !rule.prefix.endsWith('/') || !Array.isArray(rule.extensions) || rule.extensions.some(x=>typeof x!=='string') || !['build-tool','unregistered-legacy'].includes(rule.kind) || typeof rule.reason!=='string'||!rule.reason)throw Error('無效來源分類');
    }
    return policy;
}
validatePolicy(POLICY);
export function shouldPublish(relative,library='') {
    const normalized=relative.replaceAll('\\','/');
    if(path.isAbsolute(normalized)||normalized.split('/').some(x=>x==='..'||x==='')) throw Error('非法發布路徑：'+relative);
    const parts=normalized.split('/'),name=parts.at(-1);
    if(parts.some(x=>POLICY.excludedDirectories.includes(x)||x.startsWith('.')))return false;
    if(POLICY.excludedNamePatterns.some(x=>new RegExp(x,'i').test(name)))return false;
    const ext=path.extname(name).toLowerCase();
    if(library && POLICY.sourceClassifications.some(rule=>(library+'/'+normalized).startsWith(rule.prefix)&&rule.extensions.includes(ext)))return false;
    if(POLICY.excludedExtensions.includes(ext))return false;
    return (library?POLICY.libraryExtensions:POLICY.applicationExtensions).includes(ext);
}
export function inventory(root,{library='',filtered=true}={}) {
    const base=realpathSync(root),rows=[],seen=new Set();
    function walk(dir) {
        for(const name of readdirSync(dir).sort()) {
            const full=path.join(dir,name),stat=lstatSync(full),rel=path.relative(root,full).replaceAll('\\','/');
            // 根目錄可為受控 junction；內部連結一律拒絕，避免逃逸及循環。
            if(stat.isSymbolicLink())throw Error('發布來源含內部連結：'+rel);
            if(stat.isDirectory()) {if(!filtered||!POLICY.excludedDirectories.includes(name)&&!name.startsWith('.'))walk(full);continue;}
            if(!stat.isFile())throw Error('不支援的檔案類型：'+rel);
            if(filtered&&!shouldPublish(rel,library))continue;
            if(!realpathSync(full).startsWith(base+path.sep))throw Error('發布來源逃逸：'+rel);
            const key=rel.toLowerCase();if(seen.has(key))throw Error('發布路徑大小寫衝突：'+rel);seen.add(key);
            const data=readFileSync(full);rows.push({path:rel,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
        }
    }
    walk(root);return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export function createReleaseManifest(root) {
    return {schemaVersion:1,profile:POLICY.profile,policyHash:POLICY_HASH,files:inventory(root,{filtered:false}).filter(x=>x.path!=='RELEASE.json')};
}
export function verifyReleaseManifest(root,manifest) {
    if(manifest.schemaVersion!==1||manifest.profile!==POLICY.profile||manifest.policyHash!==POLICY_HASH)throw Error('發布規範版本或雜湊不符');
    const actual=createReleaseManifest(root).files;
    if(JSON.stringify(actual)!==JSON.stringify(manifest.files))throw Error('發布檔案集合或內容雜湊不符');
    for(const item of actual) {
        if(['index.html','lib/SNAPSHOT.json'].includes(item.path))continue;
        const m=/^lib\/(ui_components|page-generator|custom_components)\/(.+)$/.exec(item.path);
        if(m? !shouldPublish(m[2],m[1]):!item.path.startsWith('src/frontend/')||!shouldPublish(item.path.slice(13)))throw Error('產物含非發布檔：'+item.path);
    }
    return true;
}
