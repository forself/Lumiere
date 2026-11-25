import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {netArea,indexPublicPlazas,validateOutline,canTraverse} from '../src/frontend/urban/public-plazas.js';

const source = JSON.parse(await readFile(new URL('../src/frontend/urban/plazas.json', import.meta.url)));
const [dinghao, longmen] = source.plazas;
assert.equal(indexPublicPlazas(source, new Set()).size, 2);
assert.equal(netArea(dinghao.parts[0]), dinghao.publishedUsableAreaM2);
assert.equal(dinghao.publishedUsableAreaM2, 380);
assert.equal(longmen.walkable, false);
assert.equal(longmen.publishedUsableAreaM2, 283);
const outline = longmen.parts[0].footprint;
for (const [index, reported] of longmen.sourceEdgeLengthsM.entries()) {
    if (reported === null) continue;
    const [x, z] = outline[index], next = outline[(index + 1) % outline.length];
    assert.ok(Math.abs(Math.hypot(next[0] - x, next[1] - z) - reported) < .002);
}
assert.ok(netArea(longmen.parts[0]) > longmen.publishedUsableAreaM2);
assert.throws(() => validateOutline({footprint:[[0,0],[5,5],[5,0],[0,5]]}));
const courtyard = {footprint:[[0,0],[10,0],[10,10],[0,10]], holes:[[[4,4],[6,4],[6,6],[4,6]]]};
validateOutline(courtyard);
assert.equal(netArea(courtyard), 96);
assert.equal(canTraverse(courtyard, 2,5, 8,5), false);
assert.equal(canTraverse(courtyard, 2,5, 4,5), false);
assert.equal(canTraverse(courtyard, 2,2, 8,2), true);
console.log('PASS official dimensions, net usable area distinction, invalid outlines, and movement around holes.');
