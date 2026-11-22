import {DynamicPageRenderer} from '../../../lib/page-generator/DynamicPageRenderer.js';
import {BasicButton,Heading,Text,ModalPanel} from '../extensions/ui-index.js';
import {Dropdown} from '../../../lib/ui_components/form/Dropdown/index.js';
import {UploadButton} from '../../../lib/ui_components/common/UploadButton/index.js';
import {TextInput} from '../../../lib/ui_components/form/TextInput/index.js';
import {floorElevation} from '../designer/building-model.js';
import {openingStyle} from '../designer/openings.js';
import {ASSETS,MATERIALS,MATERIAL_CATEGORIES} from '../designer/catalog.js';
import {materialApplicationReason} from '../designer/material-application.js';
import {wallFrame,objectPose} from '../designer/model.js';
import {manualLabel} from '../designer/balloon-labels.js';
import {labelMetrics,metricText} from '../designer/label-metrics.js';
import {TourHeadset} from './TourHeadset.js';
import {TourViewport} from './TourViewport.js';
import {TourInputSession} from './tour-input.js';
import {consumeTourHandoff,stageTourEditedReturn} from './tour-handoff.js';
import {TourTouchControls,TOUR_TOUCH_ACTIONS} from './TourTouchControls.js';
import {TourEditor,TOUR_TRANSFORM_FIELDS,captureTourBundle} from './TourEditor.js';
import {downloadBlob} from '../designer/design-export.js';
import {exportStandaloneHtml} from './standalone-export.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';

export class TourPage{
 constructor(options={}){this.options=options;this.destroyed=false;this.building=null;this.loading=false;this.error=false;this.showPlan=true;this.roof=false;this.detail='full';this.walking=false;this.selection=null;this.labelCandidates=[];this.listeners=[];this.loadSequence=0;this.menuOpen=false;this.objectPanelOpen=false;this.assetId='chair';this.deviceChannel=0;this.placement=null;this.session=new TourInputSession({commit:(data,name,previous)=>this.acceptPrepared(data,name,previous)});}
 async mount(container){
  let definition=this.options.definition;if(!definition){const res=await fetch(new URL('../../../definitions/tour.page.json',import.meta.url));if(!res.ok)throw new Error('無法載入場景導覽頁。');definition=await res.json();}if(this.destroyed)return;
  const classes=new Map(Object.entries({BasicButton,Heading,Text,Dropdown,UploadButton,TextInput,TourViewport}));
  const factory={has:n=>classes.has(n),preload:async names=>{for(const n of names)if(!classes.has(n))throw new Error('導覽元件未登錄。');},create:(n,o)=>{
   const Component=classes.get(n);if(!Component)throw new Error('導覽元件未登錄。');
   return new Component(n==='TourViewport'?{...o,onPick:hit=>this.pick(hit,o.mode),onPlace:point=>this.placeObject(point),onWalkTarget:p=>this.teleport(p),onWalkPosition:p=>this.observe(p),onLabelGroup:items=>this.chooseLabelGroup(items),onMessage:m=>this.message(m)}:o);
  }};
  const commands=new Map([
   ['source.choose',()=>this.c('tour-load').fileInput?.click()],['source.load',(_,files)=>this.loadFile(files?.[0])],['source.cancel',()=>this.cancelLoad()],['go.design',()=>this.leave()],['go.apply',()=>this.applyAndLeave()],
   ['menu.toggle',()=>{this.menuOpen=!this.menuOpen;this.objectPanelOpen=false;this.syncControls();}],['object.panel',()=>{this.objectPanelOpen=!this.objectPanelOpen;this.menuOpen=false;this.syncControls();}],
   ['object.choose',(_,id)=>this.chooseObject(id)],['asset.choose',(_,id)=>{if(Object.hasOwn(ASSETS,id))this.assetId=id;}],['object.add',()=>this.beginPlacement()],['object.place.cancel',()=>this.cancelPlacement()],['object.apply',()=>this.applyObject()],['object.rotate',()=>this.editSelected('rotate')],['object.delete',()=>this.editSelected('remove')],['object.power',()=>this.editSelected('togglePower')],
   ['material.category',(_,value)=>this.chooseMaterialCategory(value)],['material.choose',(_,value)=>{if(Object.hasOwn(MATERIALS,value)){this.materialChoice=value;this.syncMaterialControls();}}],['material.apply',()=>this.applyMaterial()],
   ['edit.undo',()=>this.history(-1)],['edit.redo',()=>this.history(1)],['device.channel',(_,value)=>{this.deviceChannel=Number(value);this.syncObjectControls(true);}],['device.apply',()=>this.applyDevice()],['source.export.json',()=>this.exportJson()],['source.export.bundle',()=>this.exportBundle()],['source.export.html',()=>this.exportHtml()],
   ['vr.enter',()=>{if(this.building&&!this.loading&&!this.exporting)return this.scene.headset?.enter();}],['vr.exit',()=>this.scene.headset?.exit()],
   ['walk.start',()=>this.startWalk()],['walk.stop',()=>this.orbit()],['view.preset',(_,value)=>this.chooseView(value)],['plan.toggle',()=>{this.showPlan=!this.showPlan;this.syncControls();if(this.showPlan){this.plan?.resize();this.plan?.fit();}}],
   ['roof.toggle',()=>{this.roof=!this.roof;this.syncViews();}],['labels.toggle',()=>{this.showLabels=this.showLabels===false;this.syncViews();}],['detail.choose',(_,value)=>{if(!['full','auto'].includes(value))return;this.detail=value;this.syncViews();}],
   ['floor.choose',(_,id)=>this.chooseFloor(id)],['opening.choose',(_,id)=>this.chooseOpening(id)],['opening.toggle',()=>this.toggleOpening()],
   ['label.choose',(_,index)=>{const item=this.labelCandidates[Number(index)];if(item)this.select(item.levelId,item.id,'object');}],
   ['lift.up',()=>this.ride(1)],['lift.down',()=>this.ride(-1)]
  ]);
  this.pageRenderer=new DynamicPageRenderer({mode:'tool',definition,factory,commandRegistry:commands});await this.pageRenderer.init();if(this.destroyed){this.pageRenderer.destroy();return;}
  this.pageRenderer.mount(container);this.renderer=this.pageRenderer.getRenderer();this.scene=this.c('tour-scene');this.plan=this.c('tour-plan');this.scene.allFloors=true;this.c('tour-status').element.setAttribute('role','status');this.renderer.getHost('tour-controls').setAttribute('aria-label','導覽控制');this.renderer.getHost('tour-workspace').setAttribute('aria-label','場景與平面定位');
  this.scene.headset = new TourHeadset(this.scene, message => {
    if (this.destroyed) return;
    this.syncControls();
    if (message) this.message(message);
  });
  this.touch=new TourTouchControls(this.scene);for(const action of TOUR_TOUCH_ACTIONS)this.touch.bind(this.c('tour-touch-'+action).element,action);this.renderer.getHost('tour-touch-controls').setAttribute('aria-label','觸控移動與轉向');this.syncControls();
  for(const key of [...TOUR_TRANSFORM_FIELDS,'device-value']){const component=this.c(key==='device-value'?'tour-device-value':'tour-object-'+key);component?.input?.setAttribute('aria-label',component.options.label||key);}
  this.c('tour-objects')?.input?.setAttribute('aria-label','搜尋既有物件');this.c('tour-asset')?.input?.setAttribute('aria-label','搜尋新增素材');
  this.c('tour-material-choice')?.input?.setAttribute('aria-label','搜尋物件材質');
  const escape=e=>{if(e.key==='Escape'&&this.scene.headset?.state!=='idle'){this.scene.headset?.exit();return;}if(e.key==='Escape'&&this.placement){this.cancelPlacement();return;}if(e.key==='Escape'&&this.scene.walk.active){this.scene.walk.stop();this.observe(null);this.message('已離開自由走動，可拖曳環繞檢視。');}};window.addEventListener('keydown',escape);this.listeners.push(()=>window.removeEventListener('keydown',escape));
  const unload=e=>{if(this.editor?.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);this.listeners.push(()=>window.removeEventListener('beforeunload',unload));
  window.__lumiereTour={page:this,getState:()=>({loaded:!!this.building,fileName:this.fileName||null,walking:this.scene?.walk.active||false,levelId:this.building?.activeLevelId||null,loading:this.loading,dirty:!!this.editor?.dirty,objects:this.building?.levels.reduce((n,l)=>n+l.design.objects.length,0)||0,selection:this.selection,placement:this.placement})};
  const handoff=consumeTourHandoff();if(handoff)await this.loadValue(handoff,'目前設計',{fromEditor:true});
 }
 c(id){return this.renderer?.getComponent(id);}
 message(text){this.c('tour-status')?.setText(text);}
 async loadFile(file){if(!file)return;if(this.editor?.dirty&&!await this.confirmDiscard('開啟另一份場景？','目前調整尚未匯出或套用，開啟另一份檔案會取代這些調整。'))return;return this.load(()=>this.session.loadFile(file));}
 async loadValue(value,name,options={}){return this.load(()=>this.session.loadValue(value,name),options);}
 async load(action,{fromEditor=false}={}){
  const sequence=++this.loadSequence;this.pendingSourceFromEditor=fromEditor;this.loading=true;this.error=false;this.message('正在本機驗證並建立場景，可取消載入。');this.syncControls();
  try{await action();if(this.destroyed||sequence!==this.loadSequence)return;this.message(this.scene.walk.active?'場景已載入，可直接走動；右上可開啟物件功能。':'場景已載入，目前可環繞檢視；此模型沒有可用的行走起點。');}
  catch(e){if(this.destroyed||sequence!==this.loadSequence)return;this.error=e.name!=='AbortError';this.message(e.name==='AbortError'?'已取消載入，保留目前場景。':'場景未載入：'+e.message);}
  finally{if(!this.destroyed&&sequence===this.loadSequence){this.loading=false;this.syncControls();}}
 }
 cancelLoad(){this.loadSequence++;this.session.cancel();this.loading=false;this.error=false;this.syncControls();this.message('已取消載入，保留目前場景。');}
 acceptPrepared(data,name,previous){
  const view=this.scene;view.walk.stop();view.media?.clear();this.plan.setWalkPosition(null);previous?.ifcRoot?.removeFromParent();
  view.importedAssets=data.assets;view.setMaterials(data.materials);if(previous)previous.materials=[];
  view.ifcReference=data.ifcRoot;if(data.ifcRoot)view.scene.add(data.ifcRoot);
  this.prepared=data;this.editor=new TourEditor(data.building,{assets:data.assets,captureContext:data.captureContext});this.fromEditorSource=!!this.pendingSourceFromEditor;this.building=this.editor.building;this.fileName=name;this.selection=null;this.labelCandidates=[];this.walking=false;this.error=false;this.placement=null;this.objectPanelOpen=false;this.menuOpen=false;this.objectFieldStamp=null;
  // Reveal the workspace before measuring it; hidden viewports only report a 1 px fallback.
  this.c('tour-view')?.setValue('overview');this.syncControls();this.syncViews(true);if(view.walk.start)this.startWalk();
 }
 syncViews(fit=false){
  if(!this.building||!this.scene||!this.plan)return;const level=this.building.levels.find(l=>l.id===this.building.activeLevelId),selection=this.selection?.levelId===level.id?this.selection.id:null;
  for(const v of [this.scene,this.plan]){v.building=this.building;v.allFloors=v===this.scene;v.interiorMode=this.detail;v.streetMode=this.detail==='full'?'full':'auto';v.showLabels=this.showLabels!==false;v.roof=this.roof;v.underlay=v===this.plan?this.prepared?.underlays.get(level.id):null;v.setDesign(level.design,selection,'select');if(fit){v.resize();v.fit();}}
  this.syncControls();
 }
 syncControls(){
  if(!this.renderer||this.destroyed)return;const ready=!!this.building,busy=!!(this.loading||this.exporting),active=!!this.scene?.walk.active,level=ready?this.building.levels.find(l=>l.id===this.building.activeLevelId):null,opening=this.selectedOpening();
  this.renderer.getHost('tour').setAttribute('data-load-state',busy?'loading':this.error?'error':ready?'ready':'empty');
  this.renderer.getHost('tour-functions').hidden=ready&&!this.menuOpen;this.renderer.getHost('tour-object-editor').hidden=!ready||!this.objectPanelOpen;
  for(const [id,expanded]of [['tour-menu-toggle',this.menuOpen||!ready],['tour-object-panel-toggle',this.objectPanelOpen]]){this.c(id)?.element.setAttribute('aria-expanded',String(expanded));}
  this.c('tour-object-panel-toggle')?.setDisabled(!ready||busy);this.c('tour-editor')?.setDisabled(!!busy);
  const headset = this.scene?.headset;
  const inVR = headset?.state === 'active' || headset?.state === 'ending';
  const changingVR = headset?.state === 'starting' || headset?.state === 'ending';
  this.renderer.getHost('tour-vr-enter').hidden = !ready || inVR;
  this.renderer.getHost('tour-vr-exit').hidden = !inVR;
  this.c('tour-vr-enter').setDisabled(!ready || busy || changingVR || headset?.available === null);
  this.c('tour-vr-exit').setDisabled(changingVR);
  this.c('tour-vr-enter').element.title = headset?.available ? '使用頭顯進入空間；握壓控制器側鍵可退出。' : '查看頭顯及安全連線需求';
  for (const id of ['tour-functions','tour-object-editor','tour-workspace','tour-editor','tour-menu-toggle','tour-object-panel-toggle']) {
    this.renderer.getHost(id).inert = !!headset && headset.state !== 'idle';
  }
  this.renderer.getHost('tour-load').hidden=true;
  if(this.options?.standalone){for(const id of ['tour-editor','tour-file-control','tour-cancel','tour-apply-exit','tour-export-html']){const host=this.renderer.getHost(id);if(host)host.hidden=true;}this.c('tour-save-note')?.setText('獨立網頁可直接巡覽與調整；修改後請匯出 JSON 或完整專案保存。');}
  this.renderer.getHost('tour-controls').hidden=!ready;
  this.c('tour-view')?.setDisabled(!ready||busy);
  this.c('tour-labels-toggle')?.setDisabled(!ready||busy);this.c('tour-labels-toggle')?.element.setAttribute('aria-pressed',String(this.showLabels!==false));
  this.renderer.getHost('tour-touch-controls').hidden=!ready||!active||busy;this.touch?.setEnabled(ready&&active&&!busy);for(const action of TOUR_TOUCH_ACTIONS)this.c('tour-touch-'+action).setDisabled(!ready||!active||busy);
  this.renderer.getHost('tour-empty').hidden=ready;this.renderer.getHost('tour-workspace').hidden=!ready;this.renderer.getHost('tour-object-controls').hidden=!ready;this.renderer.getHost('tour-plan-pane').hidden=!this.showPlan;this.renderer.getHost('tour-workspace').classList.toggle('has-plan',this.showPlan);
  this.c('tour-empty-title').setText(busy?'正在建立場景':this.error?'這份場景尚未載入':'先載入一個場景');
  this.c('tour-empty-copy').setText(busy?'正在驗證本機檔案與內嵌素材。':this.error?'請確認檔案是設計器匯出的場景 JSON 或完整專案，再重新選取。':'選擇設計器匯出的場景 JSON，或含素材與底圖的 .lumiere 完整專案。');
  for(const id of ['tour-walk','tour-orbit','tour-plan-toggle','tour-roof-toggle'])this.c(id).setDisabled(!ready||busy);
  this.c('tour-cancel').setDisabled(!this.loading);this.c('tour-load-button')?.setDisabled(!!this.exporting);for(const id of ['tour-lift-up','tour-lift-down'])this.c(id).setDisabled(!ready||busy||!active||!this.building.elevators.length);
  this.c('tour-floor').setDisabled(!ready||busy);this.c('tour-detail').setDisabled(!ready||busy);this.c('tour-opening-toggle').setDisabled(!opening||busy);this.c('tour-opening').setDisabled(!ready||busy||!level?.design.openings.length);
  this.c('tour-walk').element.setAttribute('aria-pressed',String(active));this.c('tour-orbit').element.setAttribute('aria-pressed',String(ready&&!active));this.c('tour-walk').element.classList.toggle('is-selected',active);this.c('tour-orbit').element.classList.toggle('is-selected',ready&&!active);this.c('tour-plan-toggle').element.setAttribute('aria-pressed',String(this.showPlan));this.c('tour-roof-toggle').element.setAttribute('aria-pressed',String(this.roof));
  this.c('tour-mode').setText(active?'自由走動':'環繞檢視');this.c('tour-detail').setValue(this.detail);
  this.c('tour-floor').setItems(ready?this.building.levels.map(l=>({value:l.id,label:l.name})):[]);this.c('tour-floor').setValue(level?.id||null);
  this.c('tour-opening').setItems((level?.design.openings||[]).map(o=>({value:o.id,label:openingStyle(o).name+' '+o.id+'（'+(o.open?'已開啟':'已關閉')+'）'})));this.c('tour-opening').setValue(opening&&this.selection.levelId===level?.id?opening.id:null);
  this.renderer.getHost('tour-label-control').hidden=this.labelCandidates.length<2;this.c('tour-label-choice').setItems(this.labelCandidates.map((o,i)=>({value:String(i),label:o.label+'（'+o.type+'）'})));
  if(ready){const count=this.building.levels.reduce((n,l)=>n+l.design.objects.length,0);this.c('tour-summary').setText(this.fileName+'；'+this.building.levels.length+' 層，'+count+' 個家具設備。'+(this.editor?.dirty?' 有未匯出／未套用的調整。':''));}else this.c('tour-summary').setText('尚未載入場景。');this.describeSelection();this.syncObjectControls();
 }
 levelAt(y){let level=this.building?.levels[0];for(const candidate of this.building?.levels||[])if(floorElevation(this.building,candidate.id)<=y+.05)level=candidate;return level;}
 observe(position){
  if(!this.building||this.destroyed)return;const active=!!position,observer=position||this.scene.camera?.position,level=observer?this.levelAt(observer.y-1.65):null,direction=this.scene.camera?.getWorldDirection?.(new THREE.Vector3()),heading=direction&&Math.hypot(direction.x,direction.z)>.0001?Math.atan2(direction.x,-direction.z):null;
  if(active&&level.id!==this.building.activeLevelId&&this.editor){
   this.building=this.editor.selectFloor(level.id);this.prepared.building=this.building;this.scene.building=this.building;this.plan.building=this.building;
   if(this.selection?.levelId!==level.id)this.selection=null;this.labelCandidates=[];const selected=this.selection?.id||null;
   this.scene.setDesign(level.design,selected,'select');this.plan.underlay=this.prepared.underlays?.get(level.id)||null;this.plan.setDesign(level.design,selected,'select');this.plan.resize();this.plan.fit();this.syncControls();
  }
  this.plan.setWalkPosition(observer?{x:observer.x,z:observer.z,levelId:level.id,levelName:level.name,...(heading===null?{}:{heading})}:null);
  if(observer){this.c('tour-position')?.setText('X '+observer.x.toFixed(2)+' m，Z '+observer.z.toFixed(2)+' m');this.c('tour-facing')?.setText(heading===null?'面向：朝上／下觀察':'面向 '+(((heading*180/Math.PI)%360+360)%360).toFixed(0)+'°（圖上方為 0°）');}
  if(active!==this.walking){this.walking=active;this.syncControls();}else if(this.selection?.kind==='object')this.describeSelection();
 }
 startWalk(){if(!this.building)return;try{this.scene.walk.start();this.observe(this.scene.walk.body);this.message('自由走動：WASD／方向鍵或觸控按鈕移動、拖曳轉頭；雙擊平面圖定位，Esc 離開。');}catch(e){this.message(e.message+' 可繼續使用環繞檢視。');}}
 orbit(){if(!this.building)return;this.scene.walk.stop();this.observe(null);this.scene.fit();this.message('環繞檢視：拖曳旋轉，滾輪縮放。');}
 chooseView(value){if(!this.building||this.loading||this.exporting||!['overview','front','side','top'].includes(value))return;this.scene.walk.stop();if(value==='overview')this.scene.fit();else this.scene.preset(value);this.observe(null);this.message(({overview:'環繞總覽',front:'正面視角',side:'側面視角',top:'俯視視角'})[value]+'；可繼續拖曳旋轉或滾輪縮放。');}
 teleport(point){if(!this.building)return;try{const position=this.scene.walk.teleportTo(point.x,point.z,this.building.activeLevelId);this.observe(position);this.message('已移至所指地坪；紅點同步目前位置。');}catch(e){this.message(e.message);}}
 chooseFloor(id){if(!this.building?.levels.some(l=>l.id===id))return;this.scene.walk.stop();this.observe(null);this.building=this.editor.selectFloor(id);this.prepared.building=this.building;this.selection=null;this.labelCandidates=[];this.placement=null;this.syncViews();this.plan.resize();this.plan.fit();this.message('已切換平面樓層；雙擊地坪可前往該層。');}
 ride(direction){if(!this.building)return;try{this.scene.walk.ride(direction);this.observe(this.scene.walk.body);this.message('電梯已停靠目標樓層。');}catch(e){this.message(e.message);}}
 pick(hit,mode){
  if(!this.building)return;if(this.placement)return;if(!hit){this.selection=null;this.syncControls();return;}
  const provenance=this.building.levels.find(l=>l.id===hit.levelId),level=provenance||(mode==='scene'&&hit.point?this.levelAt(hit.point.y):this.building.levels.find(l=>l.id===this.building.activeLevelId));this.select(level.id,hit.id,hit.kind);
 }
 select(levelId,id,kind){
  const level=this.building?.levels.find(l=>l.id===levelId);if(!level)return;const opening=level.design.openings.find(o=>o.id===id),object=level.design.objects.find(o=>o.id===id);if(!opening&&!object)return;
  this.selection={levelId,id,kind:opening?'opening':'object'};this.objectPanelOpen=true;this.menuOpen=false;this.deviceChannel=0;
  const changedFloor=level.id!==this.building.activeLevelId;if(changedFloor){this.building=this.editor.selectFloor(level.id);this.prepared.building=this.building;}this.syncViews();if(changedFloor){this.plan.resize();this.plan.fit();}
 }
 chooseOpening(id){if(!this.building)return;if(!id){this.selection=null;this.syncControls();return;}this.select(this.building.activeLevelId,id,'opening');}
 selectedOpening(){return this.selection?.kind==='opening'?this.building?.levels.find(l=>l.id===this.selection.levelId)?.design.openings.find(o=>o.id===this.selection.id):null;}
 toggleOpening(){const o=this.selectedOpening();if(!o)return;try{this.editor.toggleOpening(this.selection.levelId,o.id);this.refreshEdited();this.message(o.open?'所選門窗已關閉。':'所選門窗已開啟。');}catch(e){this.message(e.message);}}
 selectedObject(){return this.selection?.kind==='object'?this.building?.levels.find(l=>l.id===this.selection.levelId)?.design.objects.find(o=>o.id===this.selection.id):null;}
 syncObjectControls(force=false){
  if(!this.renderer)return;const ready=!!this.editor,busy=!!(this.loading||this.exporting),object=this.selectedObject(),editable=!!object&&!object.hostId,stamp=(this.editor?.store.revision||0)+'|'+this.selection?.levelId+'|'+this.selection?.id;
  this.c('tour-objects')?.setItems((this.building?.levels||[]).flatMap(level=>level.design.objects.map(o=>({value:level.id+'|'+o.id,label:level.name+'：'+(manualLabel(o)||ASSETS[o.assetId].name)+' '+o.id}))));this.c('tour-objects')?.setValue(object?this.selection.levelId+'|'+object.id:null);this.c('tour-objects')?.setDisabled(!ready||busy);
  if(!this.assetItemsReady){this.c('tour-asset')?.setItems(Object.values(ASSETS).map(a=>({value:a.id,label:a.name+(a.hostKind?'（附加於'+(a.hostKind==='door'?'門':'窗')+'）':'')})));this.assetItemsReady=true;}this.c('tour-asset')?.setValue(this.assetId);this.c('tour-asset')?.setDisabled(!ready||busy);
  for(const id of ['tour-add','tour-export-json','tour-export-bundle','tour-export-html','tour-apply-exit'])this.c(id)?.setDisabled(!ready||busy);
  for(const id of ['tour-object-apply','tour-object-rotate'])this.c(id)?.setDisabled(!editable||busy);this.c('tour-object-delete')?.setDisabled(!object||busy);this.c('tour-device-toggle')?.setDisabled(!object?.deviceState||busy);
  this.c('tour-undo')?.setDisabled(!this.editor?.store.past.length||busy);this.c('tour-redo')?.setDisabled(!this.editor?.store.future.length||busy);
  const placement=this.renderer.getHost('tour-place-cancel');if(placement)placement.hidden=!this.placement;
  for(const v of [this.scene,this.plan])if(v)v.placement=!!this.placement;
  const control=object&&ASSETS[object.assetId].control;if(!control||this.deviceChannel>=control.channels)this.deviceChannel=0;
  this.renderer.getHost('tour-device-controls').hidden=!control&&!object?.deviceState;this.renderer.getHost('tour-device-toggle').hidden=!object?.deviceState;for(const id of ['tour-device-channel-label','tour-device-channel','tour-device-value','tour-device-apply'])this.renderer.getHost(id).hidden=!control;
  this.c('tour-device-channel')?.setItems(control?object.controls.map((value,index)=>({value:String(index),label:'第 '+(index+1)+' 路'+(object.targets[index]?' → '+object.targets[index]:'（未連接）')})):[]);this.c('tour-device-channel')?.setValue(String(this.deviceChannel));this.c('tour-device-channel')?.setDisabled(!control||busy);this.c('tour-device-value')?.setDisabled(!control||busy);this.c('tour-device-apply')?.setDisabled(!control||busy);
  if(force||stamp!==this.objectFieldStamp){this.objectFieldStamp=stamp;const pose=object?objectPose(this.building.levels.find(l=>l.id===this.selection.levelId).design,object):null;for(const key of TOUR_TRANSFORM_FIELDS)this.c('tour-object-'+key)?.setValue(pose?String(Math.round(pose[key]*10000)/10000):'');if(control)this.c('tour-device-value')?.setValue(String(object.controls[this.deviceChannel]));}
  for(const key of TOUR_TRANSFORM_FIELDS)this.c('tour-object-'+key)?.setDisabled(!editable||busy);
  this.syncMaterialControls();
 }
 chooseMaterialCategory(value){if(value!=='all'&&!Object.hasOwn(MATERIAL_CATEGORIES,value))return;this.materialCategory=value;this.materialChoice=null;this.syncMaterialControls();}
 syncMaterialControls(){
  if(!this.renderer)return;const object=this.selectedObject(),busy=!!(this.loading||this.exporting),stamp=this.selection?.levelId+'|'+this.selection?.id+'|'+object?.materialId;
  if(stamp!==this.materialSelectionStamp){this.materialSelectionStamp=stamp;this.materialChoice=object?.materialId||this.materialChoice||'plaster';this.materialCategory=MATERIALS[this.materialChoice]?.category||'all';}
  const category=this.materialCategory||'all',items=Object.values(MATERIALS).filter(m=>(category==='all'||m.category===category)&&!m.floorOnly).map(m=>({value:m.id,label:m.name}));if(!items.some(m=>m.value===this.materialChoice))this.materialChoice=items[0]?.value||null;
  this.c('tour-material-category')?.setItems([{value:'all',label:'全部材質'},...Object.entries(MATERIAL_CATEGORIES).map(([value,label])=>({value,label}))]);this.c('tour-material-category')?.setValue(category);this.c('tour-material-category')?.setDisabled(!this.editor||busy);
  this.c('tour-material-choice')?.setItems(items);this.c('tour-material-choice')?.setValue(this.materialChoice);this.c('tour-material-choice')?.setDisabled(!this.editor||busy);
  const reason=!object?'請先選取一般家具或設備。':object.hostId?'附加項目請至設計器調整材質。':materialApplicationReason(this.materialChoice,{kind:'objects',item:object,importedAssets:this.editor?.assets});this.c('tour-material-apply')?.setDisabled(!!reason||busy);
  this.c('tour-material-note')?.setText?.(reason||'材質只改變外觀，碰撞與通行設定獨立；可匯出或離開時帶回設計器。');
 }
 applyMaterial(){const object=this.selectedObject();if(!object||this.loading||this.exporting)return;try{this.editor.material(this.selection.levelId,object.id,this.materialChoice);this.refreshEdited();this.message('已套用 '+MATERIALS[this.materialChoice].name+'；可復原或匯出保存。');}catch(e){this.message('未套用材質：'+e.message);}}
 chooseObject(value){if(typeof value!=='string'||!value.includes('|'))return;const [levelId,id]=value.split('|');this.select(levelId,id,'object');}
 refreshEdited(){
  this.building=this.editor.building;this.prepared.building=this.building;
  if(this.selection){const level=this.building.levels.find(l=>l.id===this.selection.levelId),list=this.selection.kind==='object'?level?.design.objects:level?.design.openings;if(!list?.some(o=>o.id===this.selection.id))this.selection=null;}
  this.syncViews();if(this.scene.walk.active)this.observe(this.scene.walk.body);
 }
 applyObject(){const object=this.selectedObject();if(!object||this.loading)return;try{const values=Object.fromEntries(TOUR_TRANSFORM_FIELDS.map(key=>[key,this.c('tour-object-'+key).getValue()]));this.editor.apply(this.selection.levelId,object.id,values);this.refreshEdited();this.message('已調整物件位置、方向與尺寸；可復原或匯出。');}catch(e){this.message('未套用調整：'+e.message);}}
 editSelected(action){const object=this.selectedObject();if(!object||this.loading)return;try{this.editor[action](this.selection.levelId,object.id);this.refreshEdited();this.message(action==='remove'?'物件已刪除，可按復原還原。':action==='togglePower'?'已切換所選物件電源。':'物件已旋轉 90°，可按復原還原。');}catch(e){this.message(e.message);}}
 applyDevice(){const object=this.selectedObject();if(!object||this.loading)return;try{this.editor.control(this.selection.levelId,object.id,this.deviceChannel,this.c('tour-device-value').getValue());this.refreshEdited();this.message('已套用控制值，已連接的設備狀態同步更新。');}catch(e){this.message(e.message);}}
 history(direction){if(!this.editor||this.loading)return;this.placement=null;if(direction<0)this.editor.undo();else this.editor.redo();this.refreshEdited();this.message(direction<0?'已復原上一項調整。':'已重做調整。');}
 beginPlacement(){
  if(!this.editor||this.loading)return;const asset=ASSETS[this.assetId];if(!asset)return;
  if(asset.hostKind){try{const object=this.editor.place(this.building.activeLevelId,asset.id,null,{hostId:this.selection?.kind==='opening'?this.selection.id:null});this.refreshEdited();this.select(this.building.activeLevelId,object.id,'object');this.message('已新增附加項目，位置與尺寸跟隨所選門窗。');}catch(e){this.message(e.message);}return;}
  this.placement={assetId:asset.id,levelId:this.building.activeLevelId};this.objectPanelOpen=false;this.menuOpen=false;this.syncControls();this.message('放置 '+asset.name+'：點選 3D 或平面圖中的地坪；Esc 取消。');
 }
 cancelPlacement(){this.placement=null;this.objectPanelOpen=true;this.syncControls();this.message('已取消新增物件。');}
 placeObject(point){
  if(!this.placement||this.loading)return;try{const levelId=point.levelId||this.placement.levelId;if(!this.building.levels.some(l=>l.id===levelId))throw new Error('放置樓層不存在。');const object=this.editor.place(levelId,this.placement.assetId,point);this.placement=null;this.refreshEdited();this.select(levelId,object.id,'object');this.message('物件已新增；可在右上調整方向與尺寸，或按復原。');}catch(e){this.message('尚未放置：'+e.message);}
 }
 async currentBundle(){const editor=this.editor,prepared=this.prepared,stamp=editor.store.serialize(),pack=await captureTourBundle(prepared,editor.building);if(this.destroyed||editor!==this.editor||prepared!==this.prepared||stamp!==editor.store.serialize())throw new Error('準備期間場景已變更，請重新操作。');return pack;}
 exportJson(){if(!this.editor||this.loading)return;downloadBlob(new Blob([this.editor.store.serialize()],{type:'application/json'}),'lumiere-tour-building.json');this.message('已匯出調整後的建物 JSON；素材與底圖請另存完整專案。');}
 async exportBundle(){if(!this.editor||this.loading||this.exporting)return;this.exporting=true;this.syncControls();try{const pack=await this.currentBundle();downloadBlob(new Blob([JSON.stringify(pack)],{type:'application/json'}),'lumiere-tour-project.lumiere');this.message('已匯出含物件調整、素材與底圖的完整專案。');}catch(e){if(!this.destroyed)this.message(e.message);}finally{this.exporting=false;if(!this.destroyed)this.syncControls();}}
 standaloneView(){const scene=this.scene;return {mode:scene.walk.active?'walk':'orbit',levelId:this.building.activeLevelId,position:scene.camera.position.toArray(),target:scene.controls.target.toArray(),yaw:scene.walk.yaw,pitch:scene.walk.pitch,roof:this.roof,showPlan:this.showPlan,showLabels:this.showLabels!==false,detail:this.detail};}
 async exportHtml(){
  if(!this.editor||this.loading||this.exporting||this.options?.standalone)return;
  const editor=this.editor,abort=new AbortController();this.exportAbort=abort;this.exporting=true;this.syncControls();this.message('正在將場景、素材與導覽程式封裝為獨立 HTML。');
  try{const pack=await this.currentBundle(),stamp=editor.store.serialize(),view=this.standaloneView();const result=await exportStandaloneHtml(pack,{title:this.fileName||'3D實境導覽',view,signal:abort.signal});if(this.destroyed||abort.signal.aborted||this.editor!==editor||stamp!==editor.store.serialize())throw new Error('場景已變更，請重新匯出。');downloadBlob(result.blob,result.filename);this.message('已匯出獨立 HTML；可直接用瀏覽器開啟，場景與內嵌素材不需原網站。');}
  catch(e){if(!this.destroyed)this.message('未匯出獨立網頁：'+e.message);}
  finally{if(this.exportAbort===abort)this.exportAbort=null;this.exporting=false;if(!this.destroyed)this.syncControls();}
 }
 leave(){if(this.options?.standalone){this.message('獨立網頁沒有設計器入口；修改可匯出 JSON 或完整專案。');return;}if(this.editor?.dirty)return this.applyAndLeave();window.location.hash='#/design';}
 async applyAndLeave(){if(this.options?.standalone)return;if(!this.editor||this.loading||this.exporting)return;this.exporting=true;this.syncControls();try{const pack=await this.currentBundle();stageTourEditedReturn(pack,{past:this.editor.store.past,initial:this.editor.initial,preserveOriginal:!!this.fromEditorSource});window.location.hash='#/design';}catch(e){if(!this.destroyed)this.message('無法保留並離開：'+e.message);}finally{this.exporting=false;if(!this.destroyed)this.syncControls();}}
 confirmDiscard(title,message){if(this.confirming)return Promise.resolve(false);this.touch?.reset();this.scene.walk?.keys.clear();return new Promise(resolve=>{this.confirming=ModalPanel.confirm({title,message,confirmText:'捨棄調整並開啟',cancelText:'繼續調整',onConfirm:()=>{this.confirming=null;resolve(!this.destroyed);},onCancel:()=>{this.confirming=null;resolve(false);}});});}
 chooseLabelGroup(items){if(!items?.length)return;this.labelCandidates=items;this.select(items[0].levelId,items[0].id,'object');this.syncControls();if(items.length>1)this.message('此處標籤重疊，可在「重疊標籤」選擇元件。');}
 describeSelection(){
  if(!this.renderer)return;const s=this.selection,level=this.building?.levels.find(l=>l.id===s?.levelId);let description='點選場景中的門窗或物件可查看資訊。';
  if(level){const opening=level.design.openings.find(o=>o.id===s.id),object=level.design.objects.find(o=>o.id===s.id);if(opening){const f=wallFrame(level.design,level.design.walls.find(w=>w.id===opening.wallId)),x=f.a.x+f.dx*opening.at*f.length,z=f.a.z+f.dz*opening.at*f.length,p=this.scene.camera.position,y=floorElevation(this.building,level.id)+opening.sill+opening.height/2,distance=Math.hypot(x-p.x,y-p.y,z-p.z);description=openingStyle(opening).name+'；'+(opening.open?'已開啟':'已關閉')+'；寬 '+opening.width.toFixed(2)+' m，高 '+opening.height.toFixed(2)+' m；距離 '+distance.toFixed(2)+' m。';}else if(object){const pose=objectPose(level.design,object),name=manualLabel(object)||ASSETS[object.assetId].name;description=name+'；'+pose.width.toFixed(2)+' × '+pose.depth.toFixed(2)+' × '+pose.height.toFixed(2)+' m；'+metricText(labelMetrics(this.building,level.id,object,this.scene.camera.position,{liftLevelId:this.scene.liftLevelId,liftPassengers:this.scene.liftPassengers}));}}
  const power=level?.design.objects.find(o=>o.id===s?.id)?.deviceState;
  if(power)description+='；電源：'+(power.power?'開啟':'關閉');
  if(description!==this.selectionDescription){this.selectionDescription=description;this.c('tour-selected').setText(description);}
 }
 destroy(){
  if(this.destroyed)return;this.destroyed=true;this.loadSequence++;this.exportAbort?.abort();this.touch?.destroy();this.confirming?.destroy?.();this.listeners.forEach(fn=>fn());
  // Session owns imported source resources; detach them before viewport teardown.
  if(this.scene){this.scene.importedAssets=new Map();this.scene.materialEntries=[];this.scene.ifcReference=null;}
  this.session.destroy();this.pageRenderer?.destroy();if(window.__lumiereTour?.page===this)delete window.__lumiereTour;this.renderer=null;this.building=null;
 }
}
