import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {BuildingStore,parseBuilding} from '../src/frontend/designer/building-model.js';
import {emptyProject,polygonArea} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
const points=[{x:0,z:0},{x:6,z:0},{x:6,z:3},{x:3,z:3},{x:3,z:6},{x:0,z:6}];
for(const ring of [points,[...points].reverse(),[...points,points[0]]]){const s=new BuildingStore(emptyProject());s.execute({type:'addPolygon',points:ring});assert.equal(s.state.rooms[0].vertexIds.length,6);assert.equal(polygonArea(s.state.vertices),27);const b=buildBuilding(s.building);assert.ok(b.group.children.length);b.dispose();const saved=s.serialize();assert.equal(parseBuilding(saved).levels[0].design.rooms.length,1);assert.throws(()=>s.execute({type:'addPolygon',points:[{x:1,z:1},{x:4,z:4},{x:4,z:1},{x:1,z:4}]}));assert.equal(s.serialize(),saved);s.undo();assert.equal(s.state.rooms.length,0);s.redo();assert.equal(s.serialize(),saved);writeFileSync('output/polygon-test.json',saved);}
console.log('PASS polygon rooms: concave L shape, both winding directions, repeated closing point, crossing rejection, geometry, persistence and undo.');
