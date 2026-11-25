import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {containsPoint, canTraverse, ringsOf} from '../public-plazas.js';
import {attachEscalator} from './escalator.js';

// A local reconstruction of the pre-renovation Dinghao Plaza entrance.
// No station datum, compass bearing or global coordinates are assigned to this model.
export const streetEntryEvidence = Object.freeze({
    lower: 'https://www.nakutemo-hawaii.com/taiwan/souvenir-supermarket/',
    stairPhoto: 'https://www.nakutemo-hawaii.com/taiwan/wp-content/uploads/2019/06/way-to-the-wellcome2-10.jpg',
    upper: 'https://commons.wikimedia.org/wiki/File:Exit_14,_East_Metro_Mall_20110102.jpg',
    side: 'https://commons.wikimedia.org/wiki/File:Exit_14,_East_Metro_Mall_20120830b.jpg',
    map: 'https://web.metro.taipei/c/img/EastMetroMall.pdf',
    renovation: 'https://www.tcooc.gov.taipei/News_Content.aspx?n=E5927B93F41F8DD4&s=09F9BEB89B559353&sms=72544237BBE4C5F6',
    observed: '地下實拍可見中央固定梯、軸線扶手、兩側電扶梯與分格吊頂。地面照片可見玻璃側牆、金屬 V 柱雨棚、藍底東區地下街標牌，抬高的平台經四級寬階下到人行道。',
    inferred: '兩端照片之間的銜接、地下梯總級數、休息平台位置、各構件尺寸、局部人行道與路面範圍、樹木位置及沿街立面間距均為建模估值。參考照片取自改造前。'
});

export const defaultStreetEntrySpec = Object.freeze({
    steps: 30, treadDepth: .30, width: 2.6, middleLength: 1.2, rise: 4.95,
    terraceDepth: 2.4, streetSteps: 4, streetRiser: .15, streetTread: .34, sidewalkDepth: 2.9
});
const dimensions = {
    steps: [8, 96], treadDepth: [.2, .45], width: [1.6, 4.8], middleLength: [.6, 2.5],
    rise: [2.4, 8], terraceDepth: [1.2, 5], streetSteps: [2, 8], streetRiser: [.1, .2],
    streetTread: [.23, .55], sidewalkDepth: [1.5, 5]
};

export function normalizeStreetEntrySpec(spec = {}) {
    const result = {};
    for (const [key, [min, max]] of Object.entries(dimensions)) {
        const value = spec?.[key];
        const integral = key === 'steps' || key === 'streetSteps';
        result[key] = Number.isFinite(value) && value >= min && value <= max && (!integral || Number.isInteger(value))
            ? value : defaultStreetEntrySpec[key];
    }
    return result;
}

function block(group, mat, x, y, z, w, h, depth) {
    const part = new T.Mesh(new T.BoxGeometry(w, h, depth), mat);
    part.position.set(x, y, z);
    group.add(part);
    return part;
}

function tube(group, mat, a, b, radius) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b);
    const vector = end.clone().sub(start);
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, vector.length(), 12), mat);
    mesh.position.copy(start).lerp(end, .5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vector.normalize());
    group.add(mesh);
}

// Draw-call batching stops at editable object and material boundaries.
function batch(group) {
    const materials = new Map();
    for (const child of [...group.children]) {
        child.updateMatrix();
        const geometry = child.geometry.applyMatrix4(child.matrix);
        if (!materials.has(child.material)) materials.set(child.material, []);
        materials.get(child.material).push(geometry);
        group.remove(child);
    }
    for (const [material, parts] of materials) {
        const geometry = parts.length > 1 ? mergeGeometries(parts) : parts[0];
        group.add(new T.Mesh(geometry, material));
        if (parts.length > 1) for (const part of parts) part.dispose();
    }
}

function signTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 110;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#253b67';
    ctx.fillRect(0, 0, 768, 110);
    ctx.strokeStyle = ctx.fillStyle = '#f2f0da';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(56, 56, 32, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = 'bold 31px Arial'; ctx.fillText('14', 39, 67);
    ctx.font = 'bold 48px "Microsoft JhengHei", sans-serif'; ctx.fillText('東區地下街', 106, 70);
    ctx.font = '34px Arial'; ctx.fillText('East Metro Mall', 384, 70);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
}

// The public pre-renovation oblique photograph shows reddish paving with a
// pale meandering band. Its individual stones were not surveyed.
function plazaPaving(){
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=768;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    const w=canvas.width,h=canvas.height;
    ctx.fillStyle='#ba8c80';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.scale(w/40,h/19);
    const ribbon=new Path2D();
    ribbon.moveTo(-1,10.5);
    for(let x=0;x<=41;x+=.08){
        const y=10.5-.254*x+1.15*Math.sin(x*.48)*Math.min(1,(41-x)/7);
        ribbon.lineTo(x,y);
    }
    for(const [width,color] of [[2.42,'#cdc0aa'],[1.86,'#b3aaa3'],[.68,'#d5c7bc']]){
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(ribbon);
    }
    // Square joints and slight tile-to-tile colour variation remain visible
    // at pedestrian eye level. One material and one texture cover the parcel.
    const tile=.4;ctx.lineWidth=.013;ctx.strokeStyle='rgba(71,65,62,.39)';
    ctx.beginPath();
    for(let z=0;z<=19;z+=tile){ctx.moveTo(0,z);ctx.lineTo(40,z);}
    for(let x=0;x<=40;x+=tile){ctx.moveTo(x,0);ctx.lineTo(x,19);}
    ctx.stroke();
    for(let iz=0;iz<48;iz++)for(let ix=0;ix<100;ix++){
        const tint=((ix*37+iz*53+ix*iz*11)%17)-8;
        ctx.fillStyle=tint<0?'rgba(42,36,30,'+(-tint*.007)+')':'rgba(255,248,232,'+(tint*.009)+')';
        ctx.fillRect(ix*tile+.009,iz*tile+.009,tile-.018,tile-.018);
    }
    ctx.restore();
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(1/40,1/19);map.offset.y=1;
    return map;
}

export function createStreetEntryKit(options = {}) {
    const spec = normalizeStreetEntrySpec(options?.spec ?? options);
    const { steps, treadDepth, width, middleLength, rise, terraceDepth, streetSteps, streetRiser, streetTread, sidewalkDepth } = spec;
    const half = Math.floor(steps / 2);
    const middleStart = half * treadDepth, middleEnd = middleStart + middleLength;
    const terraceStart = steps * treadDepth + middleLength, terraceEnd = terraceStart + terraceDepth;
    const run = terraceEnd + streetSteps * streetTread, sidewalkY = rise - streetSteps * streetRiser;
    const halfWidth = width / 2, outer = halfWidth + 1.85, footZ = -2.1;
    const floorBounds = { minX: -outer, maxX: outer, minZ: footZ, maxZ: 1.9 };
    const stairs = {
        objectId: 'exit14-stair', width, run, rise: sidewalkY, steps, spawnX: width / 4,
        landingDepth: sidewalkDepth, topLeft: outer, topRight: outer,
        middleStart, middleEnd, terraceStart, terraceEnd, terraceHeight: rise, terraceHalfWidth: outer, streetSteps,
        heightAt(distance) {
            const slope = rise / (steps * treadDepth);
            if (distance <= middleStart) return Math.max(0, distance) * slope;
            if (distance <= middleEnd) return middleStart * slope;
            if (distance <= terraceStart) return (distance - middleLength) * slope;
            if (distance <= terraceEnd) return rise;
            return rise - Math.min(distance - terraceEnd, run - terraceEnd) * streetRiser / streetTread;
        }
    };
    const objects = [], escalators = [];
    const add = (id, name, group, x, y, z, build, solid = false) => {
        const mesh = new T.Group();
        mesh.position.set(x, y, z);
        build(mesh);
        batch(mesh);
        objects.push({ id: 'exit14-' + id, name, group, mesh, solid });
        return mesh;
    };
    const paint = color => new T.MeshLambertMaterial({ color });
    const stone = paint(0xb0a49a), edge = paint(0xdbcaba), wine = paint(0x965164);
    const granite = paint(0x98928c), grout = paint(0x736e6b), wall = paint(0xe5e4df);
    const steel = new T.MeshPhongMaterial({ color: 0xbcc1c2, specular: 0xd8dfe0, shininess: 68 });
    const frame = paint(0x878b8b), dark = paint(0x34383a), rubber = paint(0x24252a);
    const paver = paint(0xb5a393), brick = paint(0xb58278), tile = paint(0xb9b7ae);
    const glass = new T.MeshPhongMaterial({ color: 0x94b6ae, transparent: true, opacity: .27, depthWrite: false });

    add('stair', '固定梯、門廊與街面行走面', '樓梯', 0, 0, footZ, g => {
        const riser = rise / steps;
        for (let i = 0; i < steps; i++) {
            const d = i * treadDepth + (i >= half ? middleLength : 0), y = (i + 1) * riser;
            block(g, stone, 0, y - riser / 2, -d - treadDepth / 2, width, riser, treadDepth + .001);
            block(g, edge, 0, y + .001, -d - .013, width - .02, .007, .026);
            block(g, wine, 0, y + .002, -d - .035, width - .025, .007, .019);
        }
        const slab = (left, right, from, to, y, mat, grid, base = y - .14) => {
            const cx = (right + left) / 2, cz = -(to + from) / 2;
            block(g, mat, cx, (y + base) / 2, cz, right - left, y - base, to - from);
            for (let x = left + grid; x < right - .01; x += grid)
                block(g, grout, x, y + .001, cz, .009, .003, to - from);
            for (let d = from + grid; d < to - .01; d += grid)
                block(g, grout, cx, y + .001, -d, right - left, .003, .009);
        };
        slab(-halfWidth, halfWidth, middleStart, middleEnd, half * riser, stone, .5);
        // The entrance plinth and all its exterior treads meet the underside of the
        // adjacent sidewalk. The tread tops determine the exposed risers on both sides.
        const streetBase = sidewalkY - .18;
        slab(-outer, outer, terraceStart, terraceEnd, rise, granite, .55, streetBase);
        for (let i = 0; i < streetSteps; i++) {
            const d = terraceEnd + i * streetTread, y = rise - (i + 1) * streetRiser;
            // The riser faces the street. Its upper nosing belongs to the preceding tread.
            block(g, granite, 0, (y + streetBase) / 2, -(d + streetTread / 2), 2 * outer, y - streetBase, streetTread);
            block(g, wine, 0, y + streetRiser + .002, -d + .024, 2 * outer - .04, .008, .048);
        }
        slab(-outer, outer, run, run + sidewalkDepth, sidewalkY, paver, .55, streetBase);
        block(g, brick, outer - .25, sidewalkY + .003, -run - sidewalkDepth / 2, .50, .01, sidewalkDepth);
    });
    add('rail', '中央不鏽鋼扶手', '樓梯扶手', 0, 0, footZ, g => {
        for (const [from, to] of [[0, middleStart], [middleStart, middleEnd], [middleEnd, terraceStart]]) {
            const y0 = stairs.heightAt(from), y1 = stairs.heightAt(to);
            tube(g, steel, [0, y0 + .93, -from], [0, y1 + .93, -to], .035);
            tube(g, steel, [0, y0 + .59, -from], [0, y1 + .59, -to], .025);
            const count = Math.ceil((to - from) / 1.35);
            for (let n = 0; n < count; n++) {
                const d = from + (to - from) * n / count, y = stairs.heightAt(d);
                tube(g, steel, [0, y, -d], [0, y + .93, -d], .025);
            }
        }
        tube(g, steel, [0, .93, .23], [0, .93, 0], .035);
        tube(g, steel, [0, rise + .93, -terraceStart], [0, rise + .93, -terraceStart - .20], .035);
        tube(g, steel, [0, rise, -terraceStart], [0, rise + .93, -terraceStart], .025);
    }, true);
    for (const side of [-1, 1]) {
        const suffix = side < 0 ? 'left' : 'right', label = side < 0 ? '左' : '右';
        const axis = side * (halfWidth + .86);
        const direction = side < 0 ? 1 : -1;
        const escalator = add('escalator-' + suffix, label + '側電扶梯（' + (direction > 0 ? '上行' : '下行') + '）', '電扶梯', axis, 0, footZ, g => {
            const travel = terraceStart;
            for (const edgeX of [-.61, .61]) {
                const length = Math.hypot(travel, rise);
                const skirt = block(g, steel, edgeX, rise / 2 + .36, -travel / 2, .16, .75, length);
                skirt.rotation.x = Math.atan2(rise, travel);
                tube(g, rubber, [edgeX, .80, .42], [edgeX, .80, 0], .057);
                tube(g, rubber, [edgeX, .80, 0], [edgeX, rise + .80, -travel], .057);
                tube(g, rubber, [edgeX, rise + .80, -travel], [edgeX, rise + .80, -travel - .45], .057);
                for (const [y, d] of [[0, -.42], [rise, travel + .45]]) {
                    block(g, steel, edgeX, y + .39, -d, .16, .76, .27);
                    tube(g, rubber, [edgeX, y + .43, -d], [edgeX, y + .79, -d], .057);
                }
            }
            block(g, steel, 0, .008, .59, 1.38, .018, .9);
            for (let n = 0; n < 9; n++) block(g, dark, 0, .02, .18 + n * .1, 1.34, .004, .012);
            block(g, steel, 0, .006, .07, 1.02, .012, .14);
            block(g, steel, 0, rise + .006, -travel - .14, 1.02, .012, .28);
        });
        escalators.push(attachEscalator(escalator,{objectId:'exit14-escalator-'+suffix,width:1,
            outerWidth:1.38,run:terraceStart,rise,direction,backingMaterial:steel}));
        add('outside-rail-' + suffix, label + '側廣場階梯扶手', '樓梯扶手', side * (outer - .16), 0, footZ, g => {
            for (const h of [.46, .91]) {
                tube(g, steel, [0, rise + h, -terraceEnd + .36], [0, rise + h, -terraceEnd], .031);
                tube(g, steel, [0, rise + h, -terraceEnd], [0, sidewalkY + h, -run], .031);
                tube(g, steel, [0, sidewalkY + h, -run], [0, sidewalkY + h, -run - .26], .031);
            }
            for (const [d, y] of [[terraceEnd - .28, rise], [run + .23, sidewalkY]])
                tube(g, steel, [0, y, -d], [0, y + .91, -d], .027);
        }, true);
    }
    const soffitEnd = Math.min(1.90, 1.05 * steps * treadDepth / rise);
    add('lower-ceiling', '地下梯前白色分格吊頂', '地下梯廳', 0, 0, footZ, g => {
        const back = floorBounds.maxZ - footZ;
        const depth = back + soffitEnd;
        block(g, wall, 0, 2.88, (back - soffitEnd) / 2, 2 * outer, .13, depth);
        for (let x = -outer; x < outer; x += .7)
            block(g, grout, x, 2.811, (back - soffitEnd) / 2, .014, .007, depth);
        for (let z = -soffitEnd; z < back; z += .9)
            block(g, grout, 0, 2.81, z, 2 * outer, .007, .014);
        const light = new T.MeshBasicMaterial({ color: 0xffffee });
        block(g, frame, 0, 2.788, -soffitEnd + .08, outer * 2 - .14, .045, .13);
        block(g, light, 0, 2.764, -soffitEnd + .08, outer * 2 - .22, .009, .067);
        if (sidewalkY > 2.95) {
            // Return from the suspended ceiling up to grade at a splayed reveal.
            // An exposed vertical fascia at this point would close off the sky.
            const end = Math.min(soffitEnd + 1.75, middleStart), h = sidewalkY - 2.95;
            if (end > soffitEnd) {
                const reveal = block(g, wall, 0, 2.95 + h / 2, -(end + soffitEnd) / 2,
                    2 * outer, .14, Math.hypot(end - soffitEnd, h));
                reveal.rotation.x = Math.atan2(h, end - soffitEnd);
            }
        }
    });
    const canopyStart = Math.max(0, terraceStart - 4.5), canopyEnd = terraceEnd - .30, canopyY = rise + 2.85;
    const coveredEnd = sidewalkY>=2.98?Math.min(canopyStart,(sidewalkY-2.05)*steps*treadDepth/rise):null;
    for (const side of [-1, 1]) {
        const label = side < 0 ? '左' : '右', id = side < 0 ? 'lower-wall-left' : 'lower-wall';
        const back = floorBounds.maxZ - footZ, length = terraceStart + back, cz = (back - terraceStart) / 2;
        add(id, label + '側梯井板牆與地坪收邊', '地下梯廳', side * (outer + .02), 0, footZ, g => {
            const h = sidewalkY + .10, face = -side * .09;
            block(g, wall, 0, h / 2 - .04, cz, .17, h + .08, length);
            for (let y = .78; y < h; y += .78)
                block(g, grout, face, y, cz, .008, .012, length);
            for (let z = -terraceStart + .12; z < back; z += .92)
                block(g, grout, face, h / 2, z, .008, h, .009);
            block(g, dark, face, .08, cz, .016, .16, length);
            block(g, granite, 0, sidewalkY + .08, cz, .23, .16, length);
            if(coveredEnd!==null){
                g.userData.barriers=[
                    new T.Box3(new T.Vector3(-.115,-.08,-terraceStart),new T.Vector3(.115,sidewalkY+.10,back)),
                    new T.Box3(new T.Vector3(-.115,sidewalkY+.10,-terraceStart),new T.Vector3(.115,sidewalkY+.16,-coveredEnd))
                ];
            }
        }, true);
    }
    add('canopy', '灰色金屬雨棚與條狀底板', '雨棚與標誌', 0, 0, footZ, g => {
        const cz = -(canopyEnd + canopyStart) / 2, length = canopyEnd - canopyStart;
        block(g, frame, 0, canopyY + .11, cz, outer * 2 + .66, .22, length);
        for (let x = -outer; x <= outer; x += .13) block(g, dark, x, canopyY - .002, cz, .012, .008, length);
        for (let d = canopyStart + .1; d <= canopyEnd; d += 1.45)
            block(g, frame, 0, canopyY - .065, -d, outer * 2 + .38, .13, .10);
    });
    add('rear-screen', '梯井街面後緣玻璃收邊', '雨棚與標誌', 0, 0, footZ - canopyStart, g => {
        const sill = Math.max(sidewalkY, stairs.heightAt(canopyStart) + 1.9);
        const h = canopyY - sill;
        if (h <= .20) return;
        for (let i = 0; i < 6; i++) {
            const interval = outer * 2 / 6, x = -outer + (i + .5) * interval;
            block(g, glass, x, sill + h / 2, 0, interval - .035, h, .025);
            block(g, frame, x - interval / 2, sill + h / 2, 0, .045, h, .065);
        }
        block(g, frame, 0, sill + .03, 0, outer * 2, .06, .085);
        block(g, frame, 0, sill + h * .44, 0, outer * 2, .048, .060);
        block(g, frame, 0, canopyY - .04, 0, outer * 2, .08, .085);
    });
    for (const side of [-1, 1]) {
        const suffix = side < 0 ? 'left' : 'right', label = side < 0 ? '左' : '右';
        const x = side * (outer - .15), start = canopyStart + .1, end = terraceStart - .20;
        add('glass-' + suffix, label + '側玻璃屏與立框', '雨棚與標誌', x, 0, footZ, g => {
            const n = Math.max(2, Math.ceil((end - start) / 1.2));
            block(g, granite, 0, sidewalkY + .22, -(end + start) / 2, .16, .44, end - start);
            for (let i = 0; i < n; i++) {
                const a = start + (end - start) * i / n, b = start + (end - start) * (i + 1) / n;
                const h = canopyY - sidewalkY - .46;
                block(g, glass, 0, sidewalkY + .43 + h / 2, -(a + b) / 2, .022, h, b - a - .035);
                block(g, frame, 0, sidewalkY + .43 + h / 2, -a, .065, h, .045);
            }
            block(g, frame, 0, sidewalkY + 1.18, -(end + start) / 2, .06, .055, end - start);
        }, true);
        add('v-column-' + suffix, label + '側 V 型圓鋼柱', '雨棚與標誌', x, 0, footZ, g => {
            const base = terraceStart + terraceDepth * .38;
            block(g, granite, 0, rise + .09, -base, .48, .18, .58);
            tube(g, frame, [0, rise + .15, -base], [0, canopyY, -base + .90], .13);
            tube(g, frame, [0, rise + .15, -base], [0, canopyY, -base - .90], .13);
        }, true);
    }
    add('canopy-sign', '東區地下街藍底雙語牌', '雨棚與標誌', 0, canopyY - .46, footZ - canopyEnd + .30, g => {
        const span = 2.65, sign = signTexture(), mat = sign ? new T.MeshBasicMaterial({ map: sign }) : paint(0x253b67);
        block(g, frame, 0, 0, 0, span + .06, .42, .11);
        for (const side of [-1, 1]) {
            const panel = new T.Mesh(new T.PlaneGeometry(span, .38), mat);
            panel.rotation.y = side < 0 ? Math.PI : 0;
            panel.position.z = side * .058; g.add(panel);
            tube(g, dark, [side * .89, .19, 0], [side * .89, .45, 0], .018);
        }
    });
    const streetNear = floorBounds.maxZ, streetFar = footZ - run - sidewalkDepth;
    const streetLength = streetNear - streetFar, streetCenter = (streetNear + streetFar) / 2;
    const curbX = -outer - 2.35;
    // The official pre-renovation rental sketch includes both the exit and the
    // parcel. Only the 40 m and 19 m sides are dimensioned. Use each printed
    // edge independently to estimate the offset to the drawn headhouse.
    const lease = options.leasePart;
    const leaseX = outer + (19 / 227) * 40;
    const leaseZ = footZ - run + (31 / 123) * 19 + 19;
    const sideEnd = lease ? leaseX : outer + .82;
    const decks = [];
    const rectangle = (id, objectId, x, y, z, width, depth, label) => {
        decks.push({id,objectId:'exit14-'+objectId,centerX:x,centerY:y,centerZ:z,
            halfWidth:width/2,halfDepth:depth/2,label,surface:'sidewalk'});
    };
    add('pavement', '雨棚兩側地坪與廣場鋪面', '街景', 0, sidewalkY, streetCenter, g => {
        // The cut-out stays open above the stairs. The arcade and roof sidewalls
        // meet these two sidewalk strips at the street datum.
        for (const [x0, x1, material] of [[curbX, -outer, paver], [outer, sideEnd, brick]]) {
            const cx = (x0 + x1) / 2;
            block(g, material, cx, -.09, 0, x1 - x0, .18, streetLength);
            const roadside=x0===curbX;
            rectangle(roadside?'exit14-curbside-walk':'exit14-plaza-walk','pavement',cx,0,0,x1-x0,streetLength,
                roadside?'頂好廣場 · 路緣側人行道':'頂好廣場 · 廣場側鋪面');
            for (let z = -streetLength / 2 + .48; z < streetLength / 2; z += .48)
                block(g, grout, cx, .001, z, x1 - x0, .004, .012);
            for (let x = x0 + .51; x < x1; x += .51)
                block(g, grout, x, .001, 0, .012, .004, streetLength);
        }
        // The surface continues behind the headhouse across the covered lower
        // vestibule. Respect headroom when someone edits the local floor rise.
        if (coveredEnd!==null) {
            const back = floorBounds.maxZ - footZ, cz = footZ + (back - coveredEnd) / 2 - streetCenter;
            block(g, paver, 0, -.07, cz, 2 * outer, .14, back + coveredEnd);
            rectangle('exit14-rear-paving','pavement',0,0,cz,2*outer,back+coveredEnd,'頂好廣場 · 梯井後方鋪面');
            for (const [id,name] of [['lower-wall-left','路緣'],['lower-wall','廣場']]) {
                // Across the covered part the granite coping is a 16 cm step.
                // Its centre and height follow the respective editable wall.
                decks.unshift({id:'exit14-curb-cap-'+id,objectId:'exit14-'+id,centerX:0,centerY:sidewalkY+.16,
                    centerZ:(back-coveredEnd)/2,halfWidth:.115,halfDepth:(back+coveredEnd)/2,
                    label:'頂好廣場 · '+name+'側石緣',surface:'sidewalk'});
            }
        }
    });
    add('curb-road', '廣場側路緣與相鄰柏油路面', '街景', curbX, sidewalkY, streetCenter, g => {
        block(g, granite, .045, -.065, 0, .10, .13, streetLength);
        block(g, paint(0x525458), -1.46, -.18, 0, 2.92, .10, streetLength);
        block(g, grout, -.13, -.119, 0, .24, .018, streetLength);
    });
    const treeZ = footZ - run - sidewalkDepth * .70;
    add('tree-well', '樹穴與石緣', '街景', curbX + .72, sidewalkY, treeZ, g => {
        block(g, granite, 0, .08, 0, .93, .16, .93);
        block(g, paint(0x686457), 0, .161, 0, .84, .014, .84);
    }, true);
    add('plaza-tree', '廣場側行道樹', '街景', curbX + .72, sidewalkY, treeZ, g => {
        const bark = paint(0x685c4c);
        tube(g, bark, [0, .16, 0], [.04, 2.3, -.04], .105);
        const foliage = [paint(0x57704c), paint(0x687c53), paint(0x486349)];
        for (let i = 0; i < 7; i++) {
            const angle = i * 2.40, r = i === 0 ? 0 : .70;
            const x = r * Math.cos(angle), z = r * Math.sin(angle), y = 2.95 + (i % 3) * .25;
            tube(g, bark, [.04, 1.82 + .13 * (i % 3), -.04], [x, y, z], .045);
            const leaves = new T.Mesh(new T.SphereGeometry(.79, 12, 8), foliage[i % 3]);
            leaves.scale.set(1.07, .72, .94);
            leaves.position.set(x, y + .40, z);
            g.add(leaves);
        }
    });
    // The dated photographs show an arcade of white square piers and a continuous
    // sign band. The cropped frontage stands on the sidewalk datum beside the exit.
    // No present-day tenant or unobserved street address is assigned.
    const facadeX = outer + 3.15, endZ = footZ - run - sidewalkDepth;
    const facadeLen = Math.min(10.5, run), frontZ = endZ + facadeLen / 2;
    add('arcade', '街旁騎樓立面與招牌帶', '街景', facadeX, sidewalkY, frontZ, g => {
        const support=sidewalkY+.18;
        block(g, brick, -1.10, -support/2, 0, 2.55, support, facadeLen);
        rectangle('exit14-covered-arcade','arcade',-1.1325,0,0,2.485,facadeLen,'頂好廣場 · 沿街騎樓');
        block(g, tile, -.65, 3.18, 0, 2.4, .34, facadeLen);
        const masonry = paint(0xb49f87);
        block(g, masonry, .36, 5.92, 0, .29, 5.5, facadeLen);
        block(g, frame, .21, 1.55, 0, .10, 3.1, facadeLen);
        const bay = facadeLen / 4, colors = [0x426d69, 0x8d6860, 0x557695, 0xb79968];
        for (let i = 0; i < 4; i++) {
            const z = -facadeLen / 2 + (i + .5) * bay;
            block(g, paint(colors[i]), -1.85, 2.94, z, .12, .44, bay - .06);
            block(g, glass, .14, 1.42, z, .024, 2.7, bay - .14);
            for (const floorY of [4.47, 6.58]) {
                block(g, frame, .191, floorY, z, .045, 1.15, bay * .68);
                block(g, paint(0x718387), .163, floorY, z, .024, .99, bay * .61);
                block(g, wall, .137, floorY, z, .027, .99, .05);
                block(g, tile, .155, floorY - .58, z, .12, .06, bay * .72);
            }
        }
        // Keep the open bays traversable while blocking the closed shopfront.
        // Several short bounds follow the diagonal frontage in the walking grid.
        g.userData.barriers=[];
        for(let z=-facadeLen/2;z<facadeLen/2;z+=.25){
            g.userData.barriers.push(new T.Box3(new T.Vector3(.13,0,z),
                new T.Vector3(.28,3.15,Math.min(facadeLen/2,z+.25))));
        }
    },true);
    const bayLength = facadeLen / 4;
    for (let i = 0; i < 4; i++) {
        const z = endZ + i * bayLength + .19;
        add('arcade-pier-' + (i + 1), '沿街騎樓落地白柱 ' + (i + 1), '街景', facadeX - 1.7, sidewalkY, z, g => {
            block(g, wall, 0, 1.51, 0, .40, 3.02, .40);
            for (const y of [.97, 1.94]) block(g, frame, 0, y, 0, .402, .008, .402);
        }, true);
    }
    if(lease){
        // The building line borders the diagonal side of the public space.
        // Pivot the approximate arcade at its first photographed street pier.
        const yaw=Math.atan2(40,19),c=Math.cos(yaw),s=Math.sin(yaw);
        const pivotX=facadeX-1.7,pivotZ=endZ+.19;
        for(const item of objects.filter(o=>o.id==='exit14-arcade'||o.id.startsWith('exit14-arcade-pier-'))){
            const node=item.mesh,dx=node.position.x-pivotX,dz=node.position.z-pivotZ;
            node.position.x=pivotX+c*dx+s*dz;node.position.z=pivotZ-s*dx+c*dz;node.rotation.y=yaw;
        }
        function pavedPolygon(id,part,material,canonical=false){
            const rings=ringsOf(part),paths=rings.map(ring=>ring.map(([x,z])=>new T.Vector2(x,z)));
            const shape=new T.Shape(paths[0]);shape.holes=paths.slice(1).map(ring=>new T.Path(ring));
            const geometry=new T.ExtrudeGeometry(shape,{depth:sidewalkY+.18,bevelEnabled:false});
            geometry.rotateX(Math.PI/2);
            const mesh=new T.Mesh(geometry,[material,paver]);mesh.position.set(leaseX,sidewalkY,leaseZ);
            objects.push({id,name:part.name,group:canonical?'頂好廣場租借地坪':'街景',mesh,canonicalLease:canonical});
            decks.push({id,rings,contains:(x,z)=>containsPoint(part,x,z),traversable:(x,z,nx,nz)=>canTraverse(part,x,z,nx,nz),
                surface:canonical?'plaza-lease':'sidewalk',label:'頂好廣場 · '+(canonical?'租借地坪':part.name)});
        }
        const map=plazaPaving(),surface=map?new T.MeshLambertMaterial({map}):paver;
        pavedPolygon('exit14-dinghao-lease',lease,surface,true);
        // The red rental boundary is internal to the publicly paved plaza.
        // Use the outer curb/arcade line on the *same* plan. A narrow strip
        // continues south towards Zhongxiao East Road as far as its drawn curb.
        const arcadeSetback=48/123*19,tipSetback=39/123*19,southDepth=37/123*19;
        const frontage={name:'騎樓前廣場鋪面',footprint:[[0,-19],[40,0],[40,-tipSetback],[0,-19-arcadeSetback]]};
        const streetSide={name:'忠孝東路側廣場鋪面',footprint:[[0,0],[0,southDepth],[40,southDepth],[40,0]]};
        pavedPolygon('exit14-frontage-apron',frontage,surface);
        pavedPolygon('exit14-street-apron',streetSide,surface);
    }
    return {
        decks,
        objects, stairs, escalators, floorBounds, floorColor: 0xb1afa9, floorMap: null, spec,
        sources: streetEntryEvidence.observed + streetEntryEvidence.inferred, evidence: streetEntryEvidence
    };
}
