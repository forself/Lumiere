import {BuildingStore,validateBuilding} from './building-model.js';
import {emptyProject} from './model.js';
import {ASSETS} from './catalog.js';

const fail=message=>{throw new Error(message);};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label}須為 1–${max} 字。`);return value.trim();};
const number=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)fail('統計數值須為有效非負數，且不得超過安全整數範圍。');return value;};
const exact=value=>new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:21}).format(value);
const percent=value=>new Intl.NumberFormat('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+'%';
// 固定本機色票，不依統計值改變透明度、厚度或半徑。
const PALETTE=['#336c9c','#b56542','#49836a','#b49a3d','#80659d','#b35c79','#4a9399','#8c7848','#668c49','#b87396','#7a819c','#bc715a','#397b70','#a89258','#6f6390','#ad6370','#5b8aab','#958653','#8a9b5b','#a7749f','#6d8e8a','#ac8662','#4e7792','#9a7251','#609674','#bc9e59','#8c79ad','#b2768c','#68a2a1','#9d8e67','#7a9e60','#bd88a6','#8c95ad','#c68a73','#629287','#b4a376','#8e83a5','#bc8391','#83a2ba','#ac9d76'];

// 輸出原生場景與獨立統計索引；原始資料不提供可執行程式或模型欄位。
export function buildPieChart(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('圓餅圖輸入格式錯誤。');
 const title=text(input.title,64,'圖表標題'),period=text(input.period,32,'統計期別'),unit=text(input.unit,8,'數值單位');
 const sourceName=text(input.source?.name,64,'來源名稱'),sourceUrl=text(input.source?.url,2048,'來源網址');
 let url;try{url=new URL(sourceUrl);}catch{fail('來源網址格式錯誤。');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('來源網址僅接受不含帳密的 HTTP／HTTPS。');
 if(!Array.isArray(input.data)||input.data.length<1||input.data.length>40)fail('圓餅圖須有 1–40 筆資料。');
 const names=new Set(),ids=new Set(),rows=input.data.map((row,i)=>{
  const name=text(row?.name,24,'類別名稱'),value=number(row?.value),id=row?.id===undefined?'item-'+(i+1):text(row.id,64,'資料 ID');
  if(names.has(name)||ids.has(id))fail('類別名稱與資料 ID 不可重複。');names.add(name);ids.add(id);return {id,name,value,inputOrder:i};
 }).sort((a,b)=>b.value-a.value||a.inputOrder-b.inputOrder);
 const total=rows.reduce((sum,row)=>sum+row.value,0);
 if(!Number.isFinite(total)||total<=0||total>Number.MAX_SAFE_INTEGER)fail('圓餅圖總計須大於零，且不得超過安全整數範圍。');
 if(!ASSETS['chart-sector']||!ASSETS['text-panel'])fail('圓餅扇區或文字標牌元件尚未登錄。');
 const radius=3.6,thickness=.32,elevation=.8,centerX=-5.2,centerZ=0,legendColumns=rows.length>1?2:1,perColumn=Math.ceil(rows.length/legendColumns),rowSpacing=.64,legendWidth=4.9,legendHeight=.55;
 const contentHalfDepth=Math.max(radius,(perColumn-1)*rowSpacing/2+.45),headerZ=-contentHalfDepth-1.05,footerZ=contentHalfDepth+1.1;
 const store=new BuildingStore(emptyProject());
 store.execute({type:'floorArea.add',points:[{x:-10,z:headerZ-1.3},{x:11.6,z:headerZ-1.3},{x:11.6,z:footerZ+1.8},{x:-10,z:footerZ+1.8}],name:'圓餅統計展示地坪',materialId:'paint-white-matte'});
 store.execute({type:'floor.update',name:'3D統計圓餅圖',height:3.2});
 const prop=(assetId,x,z,width,depth,height,y,color,label='',pitch=0)=>{
  if(label.length>64)fail('圓餅圖文字標牌最多 64 字。');
  store.execute({type:'addObject',assetId,x,z});const id=store.state.objects.at(-1).id;
  store.execute({type:'prop.configure',id,x,z,width,depth,height,elevation:y,rotation:0,color,pitch,roll:0,label});return id;
 };
 const plaque=(label,x,z,width,height,y=elevation+thickness+.03)=>prop('text-panel',x,z+height/2,width,.02,height,y,'#f8f5eb',label,-90);
 const titleIds=[plaque(title,.4,headerZ,8,.5),plaque(period,.4,headerZ+.56,8,.38)];
 const footerIds=[plaque(`總計 ${exact(total)} ${unit}`,centerX,contentHalfDepth+.5,7.3,.48),plaque(sourceName,.4,footerZ,8,.45),plaque('角度表示人口占比；所有扇區等厚\n百分比取兩位小數，顯示合計可略異100%',.4,footerZ+.68,8,.58)];
 let angle=0;const lastPositive=rows.findLastIndex(row=>row.value>0),sectors=[];
 for(const [i,row]of rows.entries()){
  const share=row.value/total,percentage=share*100,startAngle=angle,endAngle=row.value>0?(i===lastPositive?360:angle+share*360):angle;
  if(row.value>0&&(!(endAngle>startAngle)||endAngle>360))fail('正值比例超出目前幾何解析度，未產生或放大扇區。');
  const color=PALETTE[i],displayPercentage=percent(percentage),displayValue=exact(row.value),label=`${row.name}｜${displayValue} ${unit}｜${displayPercentage}`;
  let objectId=null;
  if(row.value>0){objectId=prop('chart-sector',centerX,centerZ,radius*2,radius*2,thickness,elevation,color,label);store.execute({type:'sector.configure',id:objectId,startAngle,endAngle});}
  const column=Math.floor(i/perColumn),rowIndex=i%perColumn,x=2+column*5.9,z=(rowIndex-(perColumn-1)/2)*rowSpacing;
  const captionId=plaque(`${i+1}. ${row.name}　${displayPercentage}\n${displayValue} ${unit}`,x,z,legendWidth,legendHeight);
  const chipId=prop('placeholder-box',x-legendWidth/2-.24,z,.26,.30,.04,elevation+thickness+.02,color);
  const middle=(startAngle+endAngle)/2*Math.PI/180;
  sectors.push({id:row.id,rank:i+1,name:row.name,value:row.value,share,percentage,displayPercentage,objectId,captionId,chipId,color,materialId:'plaster',center:{x:centerX,z:centerZ},radius,thickness,elevation,startAngle,endAngle,angleDegrees:endAngle-startAngle,labelAnchor:{x:centerX+Math.cos(middle)*radius*2/3,z:centerZ-Math.sin(middle)*radius*2/3}});
  angle=endAngle;
 }
 const building=validateBuilding(store.building),index={format:'lumiere-pie-chart-index',version:1,title,period,unit,source:{name:sourceName,url:sourceUrl},total,order:'value-descending',geometry:{center:{x:centerX,z:centerZ},radius,thickness,elevation,angleUnit:'degrees',angleOrigin:'+X',positiveAngleDirection:'toward -Z when viewed from +Y',closedAngle:360,formula:'angle = value / total * 360',legend:{columns:legendColumns,rowsPerColumn:perColumn,rowSpacing,width:legendWidth,height:legendHeight},worldTextNormal:'+Y'},slices:sectors,titleIds,footerIds,notes:['角度與面積依原始數值占比產生；沒有放大最小扇區或改變任一區的厚度、半徑。','最後一個正值區的終點精確封合至360度；顯示百分比四捨五入，不用顯示值反算幾何。','零值保留圖例與色票，但不生成假造的非零扇區。','圖例與標題為朝上的原生世界文字，可用俯視準確比較，環繞檢視厚度。','同一不透明材質的受控色票只用於辨識類別，不表示額外資料維度。']};
 return {building,index};
}
