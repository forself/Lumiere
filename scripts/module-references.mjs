// 靜態匯入交給 Node 的語法解析器，不執行模組；字面動態引用以詞彙邊界識別。
import vm from 'node:vm';
function decodeString(raw) {
    return raw.replace(/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|(\r?\n)|(.))/gi,(_,a,b,c,n,x)=> n?'':a||b||c?String.fromCodePoint(parseInt(a||b||c,16)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'}[x]??x));
}
export function lexicalTokens(source) {
    const out=[];let i=0;
    function scan(stopBrace=false) {
        let depth=0,previous='';
        while(i<source.length) {
            const c=source[i],next=source[i+1];
            if(/\s/.test(c)){i++;continue;}
            if(c==='/'&&next==='/'){i=source.indexOf('\n',i+2);if(i<0)i=source.length;continue;}
            if(c==='/'&&next==='*'){const end=source.indexOf('*/',i+2);if(end<0)throw Error('未結束註解');i=end+2;continue;}
            if(c==='"'||c==="'") {
                const quote=c;let raw='';i++;
                while(i<source.length&&source[i]!==quote){if(source[i]==='\\'){raw+=source[i++];if(i<source.length)raw+=source[i++];}else raw+=source[i++];}
                i++;out.push({kind:'string',value:decodeString(raw)});previous='literal';continue;
            }
            if(c==='`') {
                i++;
                while(i<source.length) {
                    if(source[i]==='\\'){i+=2;continue;}
                    if(source[i]==='`'){i++;break;}
                    if(source[i]==='$'&&source[i+1]==='{'){i+=2;scan(true);continue;}
                    i++;
                }
                previous='literal';continue;
            }
            // 在表示式起點略過正規表示式文字，避免將其內容視為程式。
            if(c==='/' && (!previous||/^(?:[=(:,!&|?;{\[]|return|throw|case|yield|=>)$/.test(previous))) {
                i++;let cls=false;
                while(i<source.length){const x=source[i++];if(x==='\\'){i++;continue;}if(x==='[')cls=true;if(x===']')cls=false;if(x==='/'&&!cls)break;}
                while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;
                previous='literal';continue;
            }
            if(/[A-Za-z_$]/.test(c)) {const start=i++;while(i<source.length&&/[A-Za-z0-9_$]/.test(source[i]))i++;const value=source.slice(start,i);out.push({kind:'word',value});previous=value;continue;}
            if(c==='}'&&stopBrace&&depth===0){i++;return;}
            if(c==='{')depth++;if(c==='}')depth--;
            out.push({kind:'punct',value:c});previous=c;i++;
        }
    }
    scan();return out;
}
export function moduleReferences(source,identifier='module.js') {
    if(!vm.SourceTextModule)throw Error('引用檢查需要 Node --experimental-vm-modules');
    const module=new vm.SourceTextModule(source,{identifier});
    const refs=module.dependencySpecifiers.map(value=>({value,kind:'import'}));
    const unresolved=[];const tokens=lexicalTokens(source);
    for(let i=0;i<tokens.length;i++) {
        const t=tokens[i],at=n=>tokens[i+n];
        if(t.kind==='word'&&t.value==='import'&&at(1)?.value==='('&&tokens[i-1]?.value!=='.') {
            if(at(2)?.kind==='string'&&[',',')'].includes(at(3)?.value))refs.push({value:at(2).value,kind:'import'});
            else unresolved.push({kind:'dynamic-import',token:i});
        }
        if(t.kind==='word'&&t.value==='new'&&at(1)?.value==='URL'&&at(2)?.value==='('&&at(3)?.kind==='string'&&at(4)?.value===','&&tokens.slice(i+5,i+10).map(x=>x.value).join('')==='import.meta.url')refs.push({value:at(3).value,kind:'resource'});
    }
    return {refs,unresolved};
}
