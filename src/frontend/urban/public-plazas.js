export function ringsOf(part) {
    return [part.footprint, ...(part.holes || [])];
}

export function signedArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x, z] = ring[i], [nextX, nextZ] = ring[(i + 1) % ring.length];
        sum += x * nextZ - z * nextX;
    }
    return sum / 2;
}

export function netArea(part) {
    return Math.abs(signedArea(part.footprint)) -
        (part.holes || []).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
}

function turn(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onEdge(a, b, point) {
    return Math.abs(turn(a, b, point)) < 1e-9 &&
        point.every((value, i) => value >= Math.min(a[i], b[i]) - 1e-9 && value <= Math.max(a[i], b[i]) + 1e-9);
}

function intersects(a, b, c, d) {
    if (onEdge(a, b, c) || onEdge(a, b, d) || onEdge(c, d, a) || onEdge(c, d, b)) return true;
    return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

function inside(ring, [x, z]) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [a, b] = ring[i], [c, d] = ring[j];
        if ((b > z) !== (d > z) && x < a + (c - a) * (z - b) / (d - b)) hit = !hit;
    }
    return hit;
}

export function containsPoint(part, x, z) {
    const point = [x, z];
    return inside(part.footprint, point) && !(part.holes || []).some(ring => inside(ring, point));
}

export function canTraverse(part, x, z, nextX, nextZ) {
    if (!containsPoint(part, nextX, nextZ)) return false;
    if (x === nextX && z === nextZ) return true;
    return !ringsOf(part).some(ring => ring.some((a, i) =>
        intersects([x, z], [nextX, nextZ], a, ring[(i + 1) % ring.length])));
}

function pointEdgeDistanceSquared(p, a, b) {
    const dx=b[0]-a[0], dz=b[1]-a[1], length=dx*dx+dz*dz;
    const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)):0;
    return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dz)**2;
}

export function blockedByFootprint(part, start, end, clearance) {
    // An editor may have moved an object over the visitor. Allow them to walk out.
    if(containsPoint(part,...start))return false;
    if(containsPoint(part,...end))return true;
    let startDistance=Infinity,endDistance=Infinity,sweptDistance=Infinity;
    for(const ring of ringsOf(part)){
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
            const a=ring[j],b=ring[i];
            if(intersects(start,end,a,b))return true;
            startDistance=Math.min(startDistance,pointEdgeDistanceSquared(start,a,b));
            endDistance=Math.min(endDistance,pointEdgeDistanceSquared(end,a,b));
            sweptDistance=Math.min(sweptDistance,pointEdgeDistanceSquared(a,start,end),pointEdgeDistanceSquared(b,start,end));
        }
    }
    const radiusSquared=clearance*clearance;
    if(startDistance<=radiusSquared)return endDistance<startDistance-1e-10;
    return Math.min(endDistance,sweptDistance)<=radiusSquared;
}

export function validateOutline(part) {
    if (!part || (part.holes !== undefined && !Array.isArray(part.holes))) throw Error('廣場內圈格式錯誤。');
    const rings = ringsOf(part);
    if (rings.length > 24 || !rings.every(r => Array.isArray(r) && r.length >= 3 && r.length <= 200 &&
        r.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 10000)))) {
        throw Error('廣場輪廓須由有效的公尺座標構成。');
    }
    for (const [k, ring] of rings.entries()) {
        if (Math.abs(signedArea(ring)) < 0.001) throw Error('廣場輪廓面積過小。');
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.001) throw Error('兩個輪廓點重疊。');
            for (let j = i + 2; j < ring.length; j++) {
                if (i === 0 && j === ring.length - 1) continue;
                if (intersects(a, b, ring[j], ring[(j + 1) % ring.length])) throw Error('廣場輪廓交叉。');
            }
            for (const other of rings.slice(0, k)) {
                if (other.some((c, j) => intersects(a, b, c, other[(j + 1) % other.length]))) throw Error('內外輪廓相交。');
            }
        }
        if (k && (!inside(rings[0], ring[0]) || rings.slice(1, k).some(other => inside(other, ring[0]) || inside(ring, other[0])))) {
            throw Error('內圈須位於租借邊界內，且不能重疊。');
        }
    }
}

export function indexPublicPlazas(data, knownIds) {
    if (data?.format !== 'lumiere-public-plazas' || data.version !== 1 ||
        !Array.isArray(data.plazas) || data.plazas.length > 30) throw Error('戶外廣場資料格式錯誤。');
    const owners = new Map(), ids = new Set();
    for (const plaza of data.plazas) {
        if (!plaza || typeof plaza.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(plaza.id) || ids.has(plaza.id) || typeof plaza.name !== 'string' ||
            typeof plaza.description !== 'string' || typeof plaza.sourceUrl !== 'string' || typeof plaza.walkable !== 'boolean' ||
            plaza.units !== 'm' || typeof plaza.measurementNote !== 'string' || !Array.isArray(plaza.parts) ||
            !plaza.parts.length || plaza.parts.length > 50) throw Error('廣場名稱、單位或構件錯誤。');
        ids.add(plaza.id);
        for (const part of plaza.parts) {
            if (!part || typeof part.id !== 'string' || typeof part.name !== 'string' ||
                !part.id.length || knownIds.has(part.id)) throw Error('廣場構件識別碼重複或缺失。');
            validateOutline(part);
            knownIds.add(part.id);
            owners.set(part, plaza);
        }
    }
    return owners;
}

export function cornerAt(part, index) {
    for (const ring of ringsOf(part)) {
        if (index < ring.length) return {ring, index};
        index -= ring.length;
    }
    throw Error('找不到廣場輪廓點。');
}
