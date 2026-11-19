import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {sampleProject,applyCommand,parseProject} from '../src/frontend/designer/model.js';
import {openingParts} from '../src/frontend/designer/openings.js';
import {buildDesign} from '../src/frontend/designer/geometry.js';
let p=sampleProject();p=applyCommand(p,{type:'moveOpening',id:'door-1',at:.5});p=applyCommand(p,{type:'dimensions',id:'door-1',width:2.4,height:2.4,sill:0});p=applyCommand(p,{type:'openingStyle',id:'door-1',styleId:'door-glass-double-slide'});
const o=p.openings.find(o=>o.id==='door-1'),wall=p.walls.find(w=>w.id===o.wallId);for(const side of [-1,1])for(const progress of [0,.25,.5,.75,1]){const parts=openingParts({...o,side},wall,progress).parts;assert.equal(parts.length,2);assert.ok(Math.abs(parts[0].x+parts[1].x)<1e-9);assert.equal(parts[0].width,1.15);if(progress===1)assert.ok(parts.every(p=>Math.abs(p.x)-p.width/2>=1.15-1e-8));}
const built=buildDesign(p);let glass=0;built.group.traverse(m=>{if(m.isMesh&&m.userData.id==='door-1'&&m.material.transparent)glass++;});assert.equal(glass,2);built.dispose();assert.equal(parseProject(JSON.stringify(p)).openings.find(o=>o.id==='door-1').styleId,o.styleId);assert.throws(()=>applyCommand(p,{type:'moveOpening',id:'door-1',at:.2}));writeFileSync('output/glass-doors-test.json',JSON.stringify(p));console.log('PASS floor-height glass doors: paired full travel, both reference sides, transparent meshes, parking bounds and persistence.');
