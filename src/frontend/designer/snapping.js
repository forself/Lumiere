import {wallFrame} from './model.js';
export function snapDesignPoint(project,p,mode='grid',excludeId=null){
 const step=mode==='fine'?.01:.1,grid={x:Math.round(p.x/step)*step,z:Math.round(p.z/step)*step};if(mode!=='geometry')return grid;
 const tolerance=.16;let best=null,distance=tolerance;
 // Endpoints take priority over wall projection. Exclude the dragged vertex and its incident edges.
 for(const v of project.vertices){if(v.id===excludeId)continue;const d=Math.hypot(v.x-p.x,v.z-p.z);if(d<distance){best={x:v.x,z:v.z};distance=d;}}
 if(best)return best;
 for(const w of project.walls){if(w.startId===excludeId||w.endId===excludeId)continue;const f=wallFrame(project,w),t=Math.max(0,Math.min(f.length,(p.x-f.a.x)*f.dx+(p.z-f.a.z)*f.dz)),q={x:f.a.x+t*f.dx,z:f.a.z+t*f.dz},d=Math.hypot(q.x-p.x,q.z-p.z);if(d<distance){best=q;distance=d;}}
 return best||grid;
}
