import {Vector3} from '../../../node_modules/three/build/three.module.js';
// Intersect actual world-space mesh triangles, preserving stairs, slab holes and openings.
export function sectionSegments(group,axis,offset){
 if(!['x','z'].includes(axis)||!Number.isFinite(offset)||Math.abs(offset)>40)throw new Error('剖切軸或座標錯誤。');
 group.updateMatrixWorld(true);const segments=[],seen=new Set(),horizontal=axis==='x'?'z':'x',eps=1e-7;
 group.traverse(mesh=>{if(!mesh.isMesh||['handle','opening-marker'].includes(mesh.userData.kind))return;let parent=mesh;while(parent){if(!parent.visible)return;parent=parent.parent;}const pos=mesh.geometry.attributes.position,index=mesh.geometry.index;if(!pos)return;const count=index?index.count:pos.count;
 for(let i=0;i<count;i+=3){const vs=[0,1,2].map(j=>new Vector3().fromBufferAttribute(pos,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld)),ds=vs.map(v=>v[axis]-offset);if(ds.every(d=>d>eps)||ds.every(d=>d< -eps)||ds.every(d=>Math.abs(d)<eps))continue;
 const hits=[];for(let j=0;j<3;j++){const k=(j+1)%3;if(Math.abs(ds[j])<eps)hits.push(vs[j]);if(ds[j]*ds[k]<-eps*eps)hits.push(vs[j].clone().lerp(vs[k],ds[j]/(ds[j]-ds[k])));}const unique=hits.filter((v,j)=>!hits.slice(0,j).some(p=>p.distanceToSquared(v)<eps*eps));if(unique.length!==2||unique[0].distanceToSquared(unique[1])<eps*eps)continue;const line=unique.map(v=>({x:v[horizontal],y:v.y})),key=line.map(p=>`${p.x.toFixed(5)},${p.y.toFixed(5)}`).sort().join('|');if(!seen.has(key)){seen.add(key);segments.push(line);}
 }});return segments;
}
