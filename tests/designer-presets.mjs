import assert from 'node:assert/strict';
import {installTestDom} from '../lib/ui_components/common/TreeList/test-dom.mjs';
installTestDom();
const {DesignerPage}=await import('../src/frontend/designer/DesignerPage.js');
const page=new DesignerPage();page.message=m=>page.notice=m;page.sync=()=>{};page.views=[];
const before=page.store.serialize(),objects=structuredClone(page.store.state.objects),pack={format:'lumiere-furniture',version:1,objects};await page.importPrefab({size:100,text:async()=>JSON.stringify(pack)});assert.equal(page.clipboard.length,objects.length);assert.equal(page.store.serialize(),before);page.pasteSelection();assert.equal(page.store.state.objects.length,objects.length*2);page.store.undo();assert.equal(page.store.serialize(),before);const clipboard=JSON.stringify(page.clipboard);await page.importPrefab({size:100,text:async()=>JSON.stringify({...pack,objects:[{...objects[0],assetId:'unknown'}]})});assert.equal(JSON.stringify(page.clipboard),clipboard);assert.equal(page.store.serialize(),before);console.log('PASS furniture preset import, validated placement, undo and atomic invalid rejection.');
