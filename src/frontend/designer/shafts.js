import {insidePolygon,wallFrame} from './model.js';
import {liftOutline,liftContains,liftServes} from './elevators.js';
export {liftOutline as shaftOutline,liftContains as shaftContains,liftServes as shaftServes};
// Dimensions include the 0.10 m enclosure; reject intersecting wall segments, including concave boundaries.
export function shaftRoom(design,s){
 for(const w of design.walls){const {a,b}=wallFrame(design,w),pad=w.thickness/2+.02;let lo=0,hi=1,hit=true;
  for(const [key,half] of [['x',s.width/2+pad],['z',s.depth/2+pad]]){const start=a[key]-s[key],delta=b[key]-a[key];if(Math.abs(delta)<1e-9){if(Math.abs(start)>=half){hit=false;break;}}else{const t1=(-half-start)/delta,t2=(half-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>=hi){hit=false;break;}}}if(hit)return undefined;
 }
 return design.rooms.find(r=>r.type==='room'&&liftOutline(s,.02).every(p=>insidePolygon(p,r.vertexIds.map(id=>design.vertices.find(v=>v.id===id)))));
}
