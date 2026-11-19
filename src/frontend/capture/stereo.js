// 限已去畸變、等焦距／等主點、水平校正影像；不是通用雙照片姿態估計。
const fail=m=>{throw new Error(m);};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))fail('雙視角解算欄位不符契約。');};
const finite=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
export function solveStereo(s,j){
 exact(j,['format','version','id','captureId','baseRevision','sourceIds','calibration','limits','matches']);
 if(j.format!=='lumiere-rectified-stereo'||j.version!==1||!/^stereo-[a-zA-Z0-9-]+$/.test(j.id)||j.captureId!==s.id||!Number.isSafeInteger(j.baseRevision)||j.baseRevision<0)fail('雙視角工作識別錯誤。');
 if(!Array.isArray(j.sourceIds)||j.sourceIds.length!==2||j.sourceIds[0]===j.sourceIds[1])fail('需要有序的左、右照片來源。');
 const [a,b]=j.sourceIds.map(id=>s.sources.find(x=>x.id===id)),p=s.pairs.find(p=>p.sourceIds.every((id,i)=>id===j.sourceIds[i]));
 if(!a||!b||a.kind!=='photo'||b.kind!=='photo'||!a.mime.startsWith('image/')||!b.mime.startsWith('image/')||!a.width||!a.height||a.width!==b.width||a.height!==b.height)fail('需登錄相同像素尺寸的左右校正照片。');
 if(!p||p.direction!=='right'||!p.sameLens)fail('需有 A 向右至 B 的實際位移紀錄，並確認同一鏡頭倍率；其他配置須先作相機校正。');
 const c=j.calibration;exact(c,['model','fx','fy','cx','cy','focalErrorPx','evidence']);
 if(c.model!=='rectified-parallel-common-intrinsics'||!finite(c.fx,1,100000)||!finite(c.fy,1,100000)||!finite(c.cx,0,a.width-1)||!finite(c.cy,0,a.height-1)||!finite(c.focalErrorPx,0,c.fx*.5)||typeof c.evidence!=='string'||!c.evidence.trim()||c.evidence.length>1000)fail('需校正後內參（像素）及校正來源說明，不能以 EXIF 毫米焦距直接代入。');
 const l=j.limits;exact(l,['pixelErrorPx','verticalTolerancePx','maxRelativeError','maxDepthMetres']);
 if(!finite(l.pixelErrorPx,.01,20)||!finite(l.verticalTolerancePx,0,10)||!finite(l.maxRelativeError,.001,.5)||!finite(l.maxDepthMetres,.1,1000))fail('解算容許值無效。');
 if(!Array.isArray(j.matches)||!j.matches.length||j.matches.length>2000)fail('請提供 1–2000 組對應點。');
 const ids=new Set(),accepted=[],rejected=[],suggestions=new Set();
 for(const m of j.matches){exact(m,['id','label','left','right']);if(typeof m.id!=='string'||!/^point-[a-zA-Z0-9-]+$/.test(m.id)||ids.has(m.id)||typeof m.label!=='string'||m.label.length>100)fail('對應點 ID／標籤無效。');ids.add(m.id);
  for(const q of [m.left,m.right]){exact(q,['u','v']);if(!finite(q.u,0,a.width-1)||!finite(q.v,0,a.height-1))fail('對應點超出登錄影像範圍。');}
  const d=m.left.u-m.right.u,verticalResidual=Math.abs(m.left.v-m.right.v);let reason='';
  if(verticalResidual>l.verticalTolerancePx){reason='epipolar-residual';suggestions.add('上下像素差過大：核對同一實體點、鏡頭畸變與校正結果；必要時重新拍攝保持相同高度與朝向的重疊照片。');}
  else if(d<=0){reason='nonpositive-disparity';suggestions.add('視差非正：核對左右照片順序及匹配點；不要自動交換來源以掩蓋錯誤。');}
  if(reason){rejected.push({id:m.id,label:m.label,reason,verticalResidual});continue;}
  const z=c.fx*p.metres/d;
  // 一階保守誤差估計：兩個像素定位誤差相加；非統計信賴區間，未涵蓋錯配與校正系統誤差。
  const relativeError=p.uncertainty/p.metres+c.focalErrorPx/c.fx+2*l.pixelErrorPx/d;
  if(z>l.maxDepthMetres||relativeError>l.maxRelativeError){reason=z>l.maxDepthMetres?'depth-limit':'uncertainty-limit';suggestions.add('遠處視差或尺度精度不足：在安全且仍保有共同視野的位置增加側向間距、靠近目標，或補充實測尺寸與校正資料。');rejected.push({id:m.id,label:m.label,reason,verticalResidual,depthMetres:z,relativeError});continue;}
  accepted.push({id:m.id,label:m.label,x:(m.left.u-c.cx)*z/c.fx,y:(m.left.v-c.cy)*z/c.fy,z,depthErrorMetres:z*relativeError,relativeError,disparityPx:d,verticalResidual});
 }
 if(accepted.length)suggestions.add('目前僅有共同可見的稀疏點；請用獨立已知尺寸核對，再補拍遮蔽面。尚未建立世界座標、地面方向或牆體。');
 return {format:'lumiere-stereo-result',version:1,jobId:j.id,sourceIds:[...j.sourceIds],coordinateFrame:'left-camera:x-right,y-down,z-forward;metres',baselineMethod:p.method,accepted,rejected,suggestions:[...suggestions],limitations:'僅依輸入校正與匹配作幾何解算；不驗證影像是否真的校正、不自動匹配。誤差為一階估計，不是精度保證。'};
}
export function stereoTemplate(s){return {format:'lumiere-rectified-stereo',version:1,id:'stereo-'+(s.revision+1),captureId:s.id,baseRevision:s.revision,sourceIds:s.pairs[0]?.sourceIds||[],calibration:{model:'rectified-parallel-common-intrinsics',fx:null,fy:null,cx:null,cy:null,focalErrorPx:null,evidence:''},limits:{pixelErrorPx:1,verticalTolerancePx:2,maxRelativeError:.1,maxDepthMetres:30},matches:[]};}
