import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// One shared, grooved tread. Z has unit depth so that a tread which is emerging
// from either comb can be clipped to exactly the exposed fraction.
function treadGeometry(width, riser) {
    const parts = [];
    function add(geometry, hex, x, y, z) {
        geometry.translate(x, y, z);
        const color = new T.Color(hex), count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
        geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
        parts.push(geometry);
    }
    add(new T.BoxGeometry(width, riser, 1),0x484d50,0,-riser / 2 - .004,0);
    const grooves = Math.max(6, Math.round(width / .032)), spacing = width / grooves;
    for (let i = 0; i < grooves; i++) {
        const x = -width / 2 + spacing * (i + .5);
        add(new T.PlaneGeometry(spacing * .50,.925).rotateX(-Math.PI/2),0x82898a,x,0,-.018);
    }
    add(new T.PlaneGeometry(width * .98,.055).rotateX(-Math.PI/2),0xd5b95b,0,0,.46);
    const result = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return result;
}

// The parent group's origin is the lower comb, uphill points toward -Z.
// Physical speed and instance transforms share the same horizontal distance.
export function attachEscalator(parent, {objectId, width, outerWidth, run, rise, direction, backingMaterial}) {
    const count = Math.max(5, Math.round(run / .37)), pitch = run / count;
    const flat = Math.min(.48, run * .13);
    const slope = rise / (run - 2 * flat);
    const speed = .5 / Math.hypot(1, slope);
    const riser = slope * pitch + .035;
    const top = center => T.MathUtils.clamp((center - flat) * slope, 0, rise);
    // The fixed truss follows the two flat ends and the incline. At any phase
    // its top remains below the lowest moving step in that cross-section.
    const profile = new T.Shape();
    const stations = [0, flat, run - flat, run], clearance = slope * pitch / 2 + .015;
    profile.moveTo(0, -clearance);
    for (const d of stations.slice(1)) profile.lineTo(d, top(d) - clearance);
    for (const d of stations.reverse()) profile.lineTo(d, top(d) - clearance - .25);
    profile.closePath();
    const backing = new T.ExtrudeGeometry(profile, {depth:outerWidth - .10, bevelEnabled:false});
    backing.rotateY(Math.PI / 2).translate(-(outerWidth - .10) / 2, 0, 0);
    parent.add(new T.Mesh(backing,backingMaterial));
    const mesh = new T.InstancedMesh(treadGeometry(width, riser),
        new T.MeshLambertMaterial({vertexColors:true}), count + 1);
    mesh.name = 'moving-treads';
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.boundingBox = new T.Box3(new T.Vector3(-width / 2, -riser - .01, -run), new T.Vector3(width / 2, rise, 0));
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new T.Sphere());
    parent.add(mesh);

    const matrix = new T.Matrix4();
    let phase = 0;
    function update(seconds) {
        phase = T.MathUtils.euclideanModulo(phase + direction * speed * seconds, pitch);
        for (let i = 0; i <= count; i++) {
            const start = (i - 1) * pitch + phase, end = start + pitch;
            const a = Math.max(start, 0), b = Math.min(end, run);
            matrix.makeScale(1, 1, Math.max(.00001, b - a));
            matrix.setPosition(0, top(start + pitch / 2), -(a + b) / 2);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }
    function heightAt(distance) {
        const index = Math.floor((T.MathUtils.clamp(distance, 0, run) - phase) / pitch);
        return top((index + .5) * pitch + phase);
    }
    update(0);
    return {objectId, width, outerWidth, run, rise, direction, speed, pitch, heightAt, update, get phase() { return phase; }};
}
