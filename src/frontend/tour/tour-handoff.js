import {validateBuilding} from '../designer/building-model.js';
import {validateBundle,BUNDLE_BYTES} from '../designer/project-bundle.js';
import {LIMITS} from '../designer/model.js';

let pending=null,editorReturn=null;
export function stageTourHandoff(input,{editorState=null}={}){
 const text=JSON.stringify(input);if(typeof text!=='string')throw new Error('無法建立導覽資料。');
 const bundle=input?.format==='lumiere-project',limit=bundle?BUNDLE_BYTES:LIMITS.fileBytes;
 if(new TextEncoder().encode(text).length>limit)throw new Error('導覽資料超過大小限制。');
 if(bundle)validateBundle(input);else validateBuilding(input);
 const next=JSON.parse(text),nextReturn={input:JSON.parse(text),editorState:editorState===null?null:structuredClone(editorState)};
 pending=next;editorReturn=nextReturn;return true;
}
export function consumeTourHandoff(){const value=pending;pending=null;return value;}
export function consumeTourEditorReturn(){const value=editorReturn;editorReturn=null;return value;}
export function stageTourEditedReturn(input,{past=[],initial=null,preserveOriginal=false}={}){
 const text=JSON.stringify(input);if(typeof text!=='string')throw new Error('無法交回導覽變更。');const bundle=input?.format==='lumiere-project';
 if(new TextEncoder().encode(text).length>(bundle?BUNDLE_BYTES:LIMITS.fileBytes))throw new Error('導覽資料超過大小限制。');
 if(bundle)validateBundle(input);else validateBuilding(input);const model=bundle?input.building:input,previous=preserveOriginal?editorReturn:null,original=previous?.input?.format==='lumiere-project'?previous.input.building:previous?.input,baseline=validateBuilding(original||initial||model);
 const state=structuredClone(previous?.editorState||{}),history=[...(state.past||[]),baseline,...past].map(b=>validateBuilding(b));
 state.past=history.filter((b,i)=>!i||JSON.stringify(b)!==JSON.stringify(history[i-1])).slice(-80);state.future=[];state.saved=state.saved??JSON.stringify(baseline,null,2);state.extrasDirty=true;
 state.frameSaved=state.frameSaved??JSON.stringify(input.frame||{});state.updatedFromTour=true;
 editorReturn={input:JSON.parse(text),editorState:state};return {levels:model.levels.length};
}
