import {BuildingStore,validateBuilding} from './building-model.js';
import {emptyProject} from './model.js';
import {ASSETS,MATERIALS} from './catalog.js';

const fail=message=>{throw new Error(message);};
const number=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`${label}必須介於 ${min} 與 ${max}。`);return value;};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label}須為 1–${max} 字。`);return value.trim();};
const format=value=>new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:21}).format(value);

export function barChartScale(maximum,{height=7.2,targetTicks=5}={}){
 number(maximum,0,Number.MAX_SAFE_INTEGER,'最大數值');number(height,.1,8,'圖表高度');number(targetTicks,2,10,'刻度數');
 const desired=(maximum||1)/targetTicks,power=10**Math.floor(Math.log10(desired)),normalized=desired/power;
 const step=[1,2,2.5,5,10].find(n=>n>=normalized)*power,maximumValue=Math.ceil((maximum||1)/step)*step;
 if(!Number.isFinite(step)||step<=0||!Number.isFinite(maximumValue)||!Number.isFinite(height/maximumValue))fail('數值超出目前線性尺度的可表示範圍。');
 return {minimum:0,maximum:maximumValue,step,height,metresPerUnit:height/maximumValue,ticks:Array.from({length:Math.round(maximumValue/step)+1},(_,i)=>i*step)};
}

// 圖表輸出沿用既有建物契約；統計來源與數值保存在獨立索引，不混入建築欄位。
export function buildBarChart(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('圖表輸入格式錯誤。');
 const title=text(input.title,64,'圖表標題'),period=text(input.period,32,'統計期別'),unit=text(input.unit,8,'數值單位');
 const sourceName=text(input.source?.name,64,'來源名稱'),sourceUrl=text(input.source?.url,2048,'來源網址');
 let url;try{url=new URL(sourceUrl);}catch{fail('來源網址格式錯誤。');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)fail('來源網址僅接受不含帳密的 HTTP／HTTPS。');
 if(!Array.isArray(input.data)||!input.data.length||input.data.length>40)fail('單列長條圖須有 1–40 筆資料。');
 const names=new Set(),ids=new Set(),rows=input.data.map((row,i)=>{
  const name=text(row?.name,24,'類別名稱'),value=number(row?.value,0,Number.MAX_SAFE_INTEGER,'統計數值'),id=row?.id===undefined?'item-'+(i+1):text(row.id,64,'資料 ID');
  if(names.has(name)||ids.has(id))fail('類別名稱或資料 ID 不可重複。');names.add(name);ids.add(id);return {id,name,value,inputOrder:i};
 }).sort((a,b)=>b.value-a.value||a.inputOrder-b.inputOrder);
 const options=input.options||{};if(typeof options!=='object'||Array.isArray(options))fail('圖表選項格式錯誤。');
 const materialId=options.materialId??'paint-gray-satin',material=MATERIALS[materialId];
 if(!material||material.floorOnly||material.opacity<1||material.transmission>0)fail('長條須使用已登錄的不透明非地坪專用材質。');
 if(!ASSETS['text-panel'])fail('文字牌元件尚未登錄。');
 const scale=barChartScale(Math.max(...rows.map(row=>row.value)),{height:options.height??7.2}),spacing=1.4,barWidth=.9,barDepth=.7,span=(rows.length-1)*spacing+barWidth,baselineElevation=1;
 const startX=-(rows.length-1)*spacing/2,axisX=startX-barWidth/2-.6,left=axisX-3.2,right=Math.max(4,startX+(rows.length-1)*spacing+barWidth/2+1.6),store=new BuildingStore(emptyProject());
 store.execute({type:'floorArea.add',points:[{x:left,z:-4},{x:right,z:-4},{x:right,z:10},{x:left,z:10}],name:'統計圖表展示地坪',materialId:'paint-white-matte'});
 store.execute({type:'floor.update',name:'3D統計長條圖',height:10});
 const box=(x,z,width,depth,height,elevation,materialId,label='')=>{
  store.execute({type:'addObject',assetId:'placeholder-box',x,z});const id=store.state.objects.at(-1).id;
  store.execute({type:'dimensions',id,width,depth,height,elevation});store.execute({type:'material',id,materialId});
  if(label)store.execute({type:'label.set',id,text:label});return id;
 };
 const plaque=(label,x,z,width,height,elevation)=>{
  if(label.length>64)fail('圖表文字牌最多 64 字。');
  store.execute({type:'addObject',assetId:'text-panel',x,z});const id=store.state.objects.at(-1).id;
  store.execute({type:'prop.configure',id,x,z,width,depth:.02,height,elevation,rotation:0,color:'#f8f5eb',pitch:0,roll:0,label});return id;
 };
 const lineIds=[],labelIds=[],baseIds=[];
 const horizontal=(y,z,materialId,thickness)=>{const width=span+.6,segments=Math.ceil(width/8),length=width/segments;for(let i=0;i<segments;i++)lineIds.push(box(axisX+(i+.5)*length,z,length,.018,thickness,Math.max(0,y-thickness/2),materialId));};
 for(let i=0,n=Math.ceil(span/8);i<n;i++){const width=span/n;baseIds.push(box(startX-barWidth/2+(i+.5)*width,0,width,1.05,.04,baselineElevation-.04,'paint-white-matte'));}
 horizontal(baselineElevation,-.6,'metal-steel-matte',.025);
 lineIds.push(box(axisX,-.6,.025,.025,scale.height,baselineElevation,'metal-steel-matte'));
 for(const value of scale.ticks){
  const y=baselineElevation+value/scale.maximum*scale.height;if(value>0)horizontal(y,-.6,'paint-gray-satin',.012);
  labelIds.push(plaque(`${format(value)} ${unit}`,axisX-1.35,-.48,2.25,.28,Math.max(.015,y-.14)));
 }
 const bars=rows.map((row,i)=>{
  const x=startX+i*spacing,height=row.value/scale.maximum*scale.height;
  if(row.value>0&&height<.0001)fail('數值差距超出目前模型最小尺寸；請調整統計範圍或尺度。');
  const objectId=row.value>0?box(x,0,barWidth,barDepth,height,baselineElevation,materialId,`${row.name}｜${format(row.value)} ${unit}`):null;
  const captionId=plaque(`${row.name}\n${format(row.value)} ${unit}`,x,1.25,1.3,.72,.015);
  return {id:row.id,rank:i+1,name:row.name,value:row.value,objectId,captionId,x,z:0,width:barWidth,depth:barDepth,height,baseline:0,elevation:baselineElevation,materialId};
 });
 labelIds.push(plaque(`${title}\n${period}`,0,-.5,8,.8,baselineElevation+scale.height+.35));
 labelIds.push(plaque(`資料來源：${sourceName}`,0,4,8,.5,.02));
 labelIds.push(plaque(`共同零基線；底座不計入人口\n等寬等深；單位：${unit}`,0,5.2,8,.6,.02));
 const building=validateBuilding(store.building),index={format:'lumiere-bar-chart-index',version:1,title,period,unit,source:{name:sourceName,url:sourceUrl},order:'value-descending',scale:{...scale,formula:'height = value / maximum * axisHeight',zeroBaseline:true},geometry:{barWidth,barDepth,spacing,rowZ:0,baselineElevation,frontDirection:'+Z',floorBounds:{left,right,front:10,back:-4}},bars,baseIds,lineIds,labelIds,notes:['原始數值與標籤由資料直接生成；沒有使用對數尺度或抬高最小柱。','零值保留類別文字牌且不生成有正高度的長條。','材質只表達外觀；所有長條使用相同不透明材質、寬度、深度與零基準。','世界座標 y=1 m 為共同統計零基線；薄底座不計入任何長條數值，文字置於下方避免遮住低數值長條。']};
 return {building,index};
}
