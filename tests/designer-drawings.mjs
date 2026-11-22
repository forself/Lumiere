import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../node_modules/three/build/three.module.js';
import {drawingPages,drawingPdf} from '../src/frontend/designer/drawings.js';
import {sectionSegments} from '../src/frontend/designer/sections.js';
import {parseBuilding,BuildingStore} from '../src/frontend/designer/building-model.js';
import {sampleProject} from '../src/frontend/designer/model.js';
const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,6));mesh.position.set(2,3,4);let lines=sectionSegments(mesh,'x',2);assert.ok(lines.length);const p=lines.flat();assert.equal(Math.min(...p.map(p=>p.x)),1);assert.equal(Math.max(...p.map(p=>p.x)),7);assert.equal(Math.min(...p.map(p=>p.y)),1);assert.equal(Math.max(...p.map(p=>p.y)),5);assert.equal(sectionSegments(mesh,'x',10).length,0);assert.throws(()=>sectionSegments(mesh,'y',0));mesh.geometry.dispose();mesh.material.dispose();
const b=parseBuilding(fs.readFileSync('output/elements-test.json','utf8'));assert.equal(drawingPages(b).length,3);assert.equal(drawingPages(b,{sections:true}).length,5);assert.throws(()=>drawingPages(b,{scale:12}));const pdf=drawingPdf(b,{sections:true});const str=new TextDecoder().decode(pdf);assert.ok(str.startsWith('%PDF-1.7'));const xref=Number(str.match(/startxref\n(\d+)/)[1]);assert.equal(str.slice(xref,xref+4),'xref');assert.doesNotMatch(str,/\/JavaScript|\/Launch/);
fs.mkdirSync('output/pdf',{recursive:true});
fs.writeFileSync('output/pdf/design-drawing-set.pdf',pdf);
const s=new BuildingStore(sampleProject());assert.ok(drawingPdf(s.building).length>1000);s.execute({type:'floor.add',copy:true});assert.equal(drawingPages(s.building,{sections:true}).length,6);
console.log('PASS drawing pages: true triangle sections, scale preflight, multi-floor sheets, schedules, valid PDF xref and no active content.');

const a4=drawingPdf(b,{paper:'A4',project:'住宅設計驗證',author:'設計者',revision:'R2',sections:true});assert.match(new TextDecoder().decode(a4),/MediaBox \[0 0 841\.89 595\.276\]/);assert.throws(()=>drawingPdf(b,{paper:'A0'}));assert.throws(()=>drawingPdf(b,{project:'x'.repeat(49)}));fs.writeFileSync('output/pdf/a4-drawing-test.pdf',a4);
