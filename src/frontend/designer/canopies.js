import {wallFrame,wallRooms} from './model.js';
export function canopyPose(level,e){
 const a=e.canopy;if(!a?.wallId)return {x:e.x,z:e.z,rotation:e.rotation};
 const wall=level.design.walls.find(w=>w.id===a.wallId);if(!wall||wall.type!=='wall'||wallRooms(level.design,wall.id).length!==1)throw Error('雨遮須依附單側室內的外牆；拆分牆面前請先解除依附。');
 const f=wallFrame(level.design,wall);if(e.width>f.length||a.at*f.length-e.width/2<-.00001||a.at*f.length+e.width/2>f.length+.00001)throw Error('雨遮寬度超出所依附牆段。');
 const distance=a.side*(wall.thickness/2+e.depth/2);return {x:f.a.x+f.dx*a.at*f.length+f.nx*distance,z:f.a.z+f.dz*a.at*f.length+f.nz*distance,rotation:((Math.atan2(f.dz,f.dx)*180/Math.PI+(a.side<0?180:0))%360+360)%360};
}
export function syncCanopies(level,removeMissing=false){
 if(removeMissing)level.elements=level.elements.filter(e=>!e.canopy?.wallId||level.design.walls.some(w=>w.id===e.canopy.wallId));
 for(const e of level.elements)if(e.canopy?.wallId)Object.assign(e,canopyPose(level,e));
}
