import {IfcAPI} from '../../../node_modules/web-ifc/web-ifc-api.js';
import {readIfcGeometry} from './ifc-reader.js';
self.onmessage=async event=>{const api=new IfcAPI();try{api.SetWasmPath(new URL('../../../node_modules/web-ifc/',import.meta.url).href,true);await api.Init(undefined,true);const result=readIfcGeometry(api,new Uint8Array(event.data));self.postMessage(result,result.meshes.flatMap(m=>[m.vertices.buffer,m.indices.buffer]));}catch(e){self.postMessage({error:e.message||'IFC 讀取失敗。'});}finally{api.Dispose();}};
