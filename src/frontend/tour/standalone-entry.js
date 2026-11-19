import {TourPage} from './TourPage.js';
import {validateStandaloneView} from './standalone-export.js';

// Standalone files inject the same trusted B4A page definition and native bundle.
// No router, server, source-module request or user-data-to-code conversion is used.
export function restoreStandaloneView(page,view){
 validateStandaloneView(view,page.building);
 if(!view)return;
 if(!page.building.levels.some(l=>l.id===view.levelId))throw new Error('保存視角的樓層不存在。');
 page.roof=view.roof;page.showPlan=view.showPlan;page.showLabels=view.showLabels;page.detail=view.detail;page.syncViews();
 const scene=page.scene;
 if(view.mode==='walk'){
  try{scene.walk.teleportTo(view.position[0],view.position[2],view.levelId);scene.walk.yaw=view.yaw;scene.walk.pitch=view.pitch;scene.walk.look();page.observe(scene.walk.body);}
  catch{page.startWalk();page.message('原視點目前無法站立，已改用場景中的可用起點。');}
 }else{
  scene.walk.stop();scene.controls.target.fromArray(view.target);scene.camera.position.fromArray(view.position);scene.camera.lookAt(scene.controls.target);scene.controls.update();scene.invalidate();page.observe(null);
 }
 page.syncControls();
}

export async function mountStandaloneTour(payload,host){
 if(!payload||typeof payload.title!=='string'||!payload.definition||!payload.project)throw new Error('獨立網頁資料不完整。');
 document.title=payload.title;
 const page=new TourPage({definition:payload.definition,standalone:true});
 try{await page.mount(host);await page.loadValue(payload.project,payload.title);if(!page.building||page.error)throw new Error('無法建立內嵌場景。');restoreStandaloneView(page,payload.view);return page;}
 catch(e){page.destroy();throw e;}
}

if(typeof document!=='undefined'&&document.getElementById('lumiere-standalone-payload')){
 const payload=JSON.parse(document.getElementById('lumiere-standalone-payload').textContent);
 const page=await mountStandaloneTour(payload,document.getElementById('app'));
 document.getElementById('lumiere-standalone-status')?.remove();
 window.addEventListener('pagehide',()=>page.destroy(),{once:true});
}
