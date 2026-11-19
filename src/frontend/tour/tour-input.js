import {parseBuilding} from '../designer/building-model.js';
import {LIMITS} from '../designer/model.js';
import {BUNDLE_BYTES,prepareBundle,disposePrepared} from '../designer/project-bundle.js';

export {BUNDLE_BYTES};
const abortError=()=>Object.assign(new Error('已取消載入場景。'),{name:'AbortError'});
export async function prepareTourInput(input,{signal,prepare=prepareBundle}={}){
 if(signal?.aborted)throw abortError();
 const text=typeof input==='string'?input:JSON.stringify(input);
 if(typeof text!=='string'||new TextEncoder().encode(text).length>BUNDLE_BYTES)throw new Error('場景檔案超過大小限制。');
 let value;try{value=JSON.parse(text);}catch{throw new Error('檔案不是有效的 JSON，請重新匯出場景。');}
 if(value?.format==='lumiere-project')return prepare(value,{signal});
 if(new TextEncoder().encode(text).length>LIMITS.fileBytes)throw new Error('場景 JSON 最多 10 MB；完整專案包最多 128 MB。');
 const building=parseBuilding(text);
 return {building,assets:new Map(),underlays:new Map(),materials:[],ifcRoot:null,ifcSource:null,reference:null,captureContext:null};
}

// New input is prepared off-screen; stale/cancelled loads can never replace the active tour.
export class TourInputSession{
 constructor({prepare=prepareTourInput,dispose=disposePrepared,commit=()=>{}}={}){this.prepare=prepare;this.dispose=dispose;this.commit=commit;this.current=null;this.sequence=0;this.destroyed=false;this.abort=null;}
 async run(read,name){
  if(this.destroyed)throw abortError();this.cancel();const sequence=this.sequence,abort=new AbortController();this.abort=abort;let prepared;
  try{const input=await read();if(abort.signal.aborted||this.destroyed||sequence!==this.sequence)throw abortError();prepared=await this.prepare(input,{signal:abort.signal});if(abort.signal.aborted||this.destroyed||sequence!==this.sequence)throw abortError();const previous=this.current;this.commit(prepared,name,previous);this.current=prepared;prepared=null;this.dispose(previous);return this.current;}
  catch(e){this.dispose(prepared);throw e;}finally{if(this.abort===abort)this.abort=null;}
 }
 loadFile(file){return this.run(async()=>{if(!file||typeof file.text!=='function')throw new Error('請選擇場景 JSON 或完整專案包。');if(!Number.isFinite(file.size)||file.size<1||file.size>BUNDLE_BYTES)throw new Error('完整專案包最多 128 MB，場景 JSON 最多 10 MB。');return file.text();},file?.name||'場景 JSON');}
 loadValue(value,name='目前設計'){return this.run(()=>value,name);}
 cancel(){this.sequence++;this.abort?.abort();this.abort=null;}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.cancel();this.dispose(this.current);this.current=null;}
}
