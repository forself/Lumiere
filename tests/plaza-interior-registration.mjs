import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {createStreetEntryKit} from '../src/frontend/urban/station/street-entry.js';
import {attachPlazaInterior,plaza2Registration} from '../src/frontend/urban/station/plaza-interior.js';
import {containsPoint} from '../src/frontend/urban/public-plazas.js';

const project=JSON.parse(await readFile(new URL('../src/frontend/urban/fuxing.envelopes.json',import.meta.url),'utf8'));
const make=plaza=>attachPlazaInterior(createStreetEntryKit(),plaza);
const scene=make(project.plaza),plan=plaza2Registration;
const dx=plan.redWidth/(plan.redRight-plan.redLeft),dz=plan.redDepth/(plan.redBottom-plan.redTop);
const cx=((plan.redLeft+plan.redRight)/2-plan.fixedStairFoot[0])*dx;
const cz=((plan.redTop+plan.redBottom)/2-plan.fixedStairFoot[1])*dz-2.1;
const close=(actual,wanted)=>assert(Math.abs(actual-wanted)<.000005,`${actual} differs from ${wanted}`);
const [ax,az]=project.plaza.anchor;
let vertices=0;
for(const part of project.plaza.items){
    const object=scene.objects.find(o=>o.canonicalPlazaId===part.id);
    assert.equal(object.id,part.id);
    const {mesh}=object;
    const position=mesh.geometry.getAttribute('position');
    assert.equal(position.count,2*part.footprint.length);
    assert.deepEqual(Array.from(mesh.geometry.index.array),part.faces.flat());
    assert.equal(mesh.material.color.getHexString(),part.color.slice(1).toLowerCase());
    for(const [i,[x,z]] of part.footprint.entries()){
        for(const layer of [0,1]){
            const j=2*i+layer;
            close(position.getX(j)+mesh.position.x,cx+x-ax);
            close(position.getZ(j)+mesh.position.z,cz+z-az);
            close(position.getY(j)+mesh.position.y,layer?part.roof:part.base);
            vertices++;
        }
    }
}
const start=scene.plazaStart;
assert.equal(start.deckId,'plaza-room-1');
function footprintAt(x,z,region){
    return containsPoint({footprint:region.footprint},x-cx+ax,z-cz+az);
}
const floor=project.plaza.items.find(p=>p.id==='plaza-room-1');
assert(footprintAt(start.x,start.z,floor));
// A canonical wall enclosing the original spawn must select a clear alternative.
const edited=structuredClone(project.plaza);
function movingWall(ring){
    const wall=edited.items.find(p=>p.id==='plaza-wall-3');
    wall.footprint=ring;
    return wall;
}
const sx=start.x-cx+ax,sz=start.z-cz+az;
const wall=movingWall([[sx-1,sz-1],[sx+1,sz-1],[sx+1,sz+1],[sx-1,sz+1]]);
const alternative=make(edited).plazaStart;
assert(footprintAt(alternative.x,alternative.z,floor));
assert(!footprintAt(alternative.x,alternative.z,wall));
movingWall([[sx-60,sz-60],[sx+60,sz-60],[sx+60,sz+60],[sx-60,sz+60]]);
assert.equal(make(edited).plazaStart,undefined);

// Verify physical support and clear headroom at 2 cm intervals along the public
// frontage. This is independent of keyboard/XR movement tests through the UI.
const deckById=new Map(scene.objects.map(o=>[o.id,o.mesh]));
const floors=scene.decks.filter(d=>d.connectsToGround);
const blocks=scene.objects.filter(o=>o.solid).map(o=>({mesh:o.mesh,box:new T.Box3().setFromObject(o.mesh)}));
const stops=[[start.x,start.z],[7,start.z],[7,3.20],[.65,3.20],[.65,1.20]];
let samples=0;
for(let k=1;k<stops.length;k++){
    const [a,b]=stops[k-1],[c,d]=stops[k],steps=Math.ceil(Math.hypot(c-a,d-b)/.02);
    for(let j=0;j<=steps;j++){
        const x=a+(c-a)*j/steps,z=b+(d-b)*j/steps,bounds=scene.floorBounds;
        const lower=x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
        const supported=floors.some(f=>{
            const pos=deckById.get(f.id).position;
            return f.contains(x-pos.x,z-pos.z)&&Math.abs(pos.y+f.centerY)<.001;
        });
        assert(lower||supported,`Uncovered at ${x}, ${z}`);
        for(const {mesh,box} of blocks){
            if(x<box.min.x||x>box.max.x||z<box.min.z||z>box.max.z||box.max.y<.05||box.min.y>1.7)continue;
            const polygon=mesh.userData.obstacleFootprint;
            assert(polygon&&!containsPoint({footprint:polygon.rings[0]},x-mesh.position.x,z-mesh.position.z),
                `Blocked at ${x}, ${z}`);
        }
        samples++;
    }
}
console.log(`PASS ${project.plaza.items.length} canonical objects, ${vertices} vertices, original colours/faces, obstacle-aware spawn and ${samples} supported public frontage samples.`);
