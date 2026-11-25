import * as T from 'three';
import {containsPoint,canTraverse} from '../public-plazas.js';

// Pixel readings on the 1684 × 1191 rendering of the operator's public Plaza 2
// rental drawing. The image has different X and Y scales. Its red rectangle
// supplies the two labelled lengths. The common fixed stair is the local datum.
export const plaza2Registration=Object.freeze({
    source:'https://www-ws.gov.taipei/001/Upload/405/relfile/20174/3353924/e3e8ee63-cabb-43e1-a889-75546e6debce.pdf',
    panorama:'https://web.metro.taipei/img/panoramic/east02.jpg',
    raster:[1684,1191],redLeft:801,redRight:1263,redTop:282,redBottom:788,
    redWidth:13.6,redDepth:17.7,fixedStairFoot:[431,740],
    basis:'租借圖同框標出第二廣場、出口14及中央固定梯，北捷資訊圖顯示它們共用商場通行地坪。紅框13.6×17.7公尺是標註尺寸。圖點分兩軸定標；樓梯相對位置、柱墩尺度、公共帶裁切範圍均為圖讀估值。'
});

const groups={floor:'第二廣場樓板',column:'第二廣場柱體',wall:'第二廣場牆體',ceiling:'第二廣場天花',light:'第二廣場燈具'};

function floorSurface(id,ring,top,surface,label){
    const part={footprint:ring};
    return {id,centerY:top,surface,label,rings:[ring],connectsToGround:true,
        contains:(x,z)=>containsPoint(part,x,z),
        traversable:(x,z,nx,nz)=>canTraverse(part,x,z,nx,nz)};
}

// Equivalent to the parent editor's envelope vertex order and face indices.
// Object-local vertices retain the original polygon, including concave edits.
function localPrism(ring,base,roof,faces){
    const coords=ring.flatMap(([x,z])=>[x,base,z,x,roof,z]);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(coords,3));
    geometry.setIndex(faces.flat());
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    return geometry;
}

function selectStart(rental,expected,objects){
    const {mesh,deck}=rental,standingY=mesh.position.y+deck.centerY;
    const obstacles=objects.filter(o=>o.solid).map(({mesh})=>{
        const box=new T.Box3().setFromObject(mesh);
        return {mesh,box,shape:mesh.userData.obstacleFootprint};
    }).filter(o=>o.box.max.y>standingY+.07&&o.box.min.y<standingY+1.7);
    function safe(x,z){
        for(const [dx,dz] of [[0,0],[.18,0],[-.18,0],[0,.18],[0,-.18]]){
            const px=x+dx,pz=z+dz;
            if(!deck.contains(px-mesh.position.x,pz-mesh.position.z))return false;
            if(obstacles.some(o=>{
                if(px<o.box.min.x||px>o.box.max.x||pz<o.box.min.z||pz>o.box.max.z)return false;
                if(!o.shape)return true;
                return containsPoint({footprint:o.shape.rings[0]},px-o.mesh.position.x,pz-o.mesh.position.z);
            }))return false;
        }
        return true;
    }
    if(safe(expected.x,expected.y))return expected;
    const outline=deck.rings[0].map(([x,z])=>new T.Vector2(x,z));
    const triangles=T.ShapeUtils.triangulateShape(outline,[]);
    for(const divisions of [3,8,16]){
        for(const [ia,ib,ic] of triangles){
            const a=outline[ia],b=outline[ib],c=outline[ic];
            for(let i=1;i<divisions;i++)for(let j=1;i+j<divisions;j++){
                const u=i/divisions,v=j/divisions;
                const x=mesh.position.x+a.x+(b.x-a.x)*u+(c.x-a.x)*v;
                const z=mesh.position.z+a.y+(b.y-a.y)*u+(c.y-a.y)*v;
                if(safe(x,z))return new T.Vector2(x,z);
            }
        }
    }
    return null;
}

export function attachPlazaInterior(kit,plaza){
    if(!plaza?.items?.length)return kit;
    const plan=plaza2Registration;
    const scaleX=plan.redWidth/(plan.redRight-plan.redLeft),scaleZ=plan.redDepth/(plan.redBottom-plan.redTop);
    const stair=kit.objects.find(item=>item.id===kit.stairs.objectId).mesh;
    const originX=stair.position.x+((plan.redLeft+plan.redRight)/2-plan.fixedStairFoot[0])*scaleX;
    const originZ=stair.position.z+((plan.redTop+plan.redBottom)/2-plan.fixedStairFoot[1])*scaleZ;
    const [sourceX,sourceZ]=plaza.anchor;
    const materials=new Map();
    let rentalFloor;
    for(const part of plaza.items){
        const count=part.footprint.length;
        const cx=part.footprint.reduce((sum,p)=>sum+p[0],0)/count;
        const cz=part.footprint.reduce((sum,p)=>sum+p[1],0)/count;
        const ring=part.footprint.map(([x,z])=>[x-cx,z-cz]);
        const height=part.roof-part.base,key=part.role+' '+part.color;
        if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:part.color,
            emissive:part.role==='light'?part.color:0,emissiveIntensity:.5,side:T.DoubleSide}));
        const mesh=new T.Mesh(localPrism(ring,0,height,part.faces),materials.get(key));
        mesh.position.set(originX+cx-sourceX,part.base,originZ+cz-sourceZ);
        const solid=part.role==='column'||part.role==='wall';
        if(solid)mesh.userData.obstacleFootprint={rings:[ring],bottom:0,top:height};
        kit.objects.push({id:part.id,canonicalPlazaId:part.id,name:part.name,group:groups[part.role]??'第二廣場構件',mesh,solid});
        if(part.role==='floor'){
            const deck=floorSurface(part.id,ring,height,'plaza-interior','第二廣場 · '+part.name);
            kit.decks.push(deck);
            if(part.id==='plaza-room-1')rentalFloor={mesh,deck};
        }
    }

    // Only the public frontage between the marked stairs and the adjacent
    // plaza is included. Leave enough of the visible paving in front of the
    // colonnade and the sidewall to go around both ends at floor level.
    // Overlaps at the two existing floors are at exactly the same elevation.
    const front=originZ+plan.redDepth/2;
    const left=stair.position.x, right=originX-14.8+.04;
    const near=kit.floorBounds.maxZ-.06,far=front+4.15;
    const cx=(left+right)/2,cz=(near+far)/2,halfX=(right-left)/2,halfZ=(far-near)/2;
    const ring=[[-halfX,-halfZ],[halfX,-halfZ],[halfX,halfZ],[-halfX,halfZ]];
    const geometry=new T.BoxGeometry(2*halfX,.12,2*halfZ).translate(0,-.06,0);
    const material=new T.MeshStandardMaterial({color:0xb7b4aa,roughness:1,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const mesh=new T.Mesh(geometry,material);mesh.position.set(cx,0,cz);
    const id='plaza2-exit14-apron',name='出口14梯前與第二廣場共用通行帶';
    kit.objects.push({id,name,group:'地下梯廳',mesh});
    kit.decks.push(floorSurface(id,ring,0,'plaza-apron',name));
    // In the public images the passage is covered all the way to the plaza.
    // Include a ceiling backing above the existing open slats and the apron.
    // Its clearance at the junction is interpolated from the two model ends.
    const backingMat=new T.MeshLambertMaterial({color:0x696864});
    const cover=(id,name,x0,x1,z0,z1,h)=>{
        const panel=new T.Mesh(new T.BoxGeometry(x1-x0,.12,z1-z0),backingMat);
        panel.position.set((x0+x1)/2,h+.06,(z0+z1)/2);
        kit.objects.push({id,name,group:'公共帶頂板',mesh:panel});
    };
    cover('plaza2-exit14-approach-ceiling','14號梯前公共帶頂板（估高）',
        -kit.floorBounds.maxX,originX-14.8,kit.floorBounds.maxZ,far,2.815);
    cover('plaza2-front-soffit','格柵上方與柱前通行帶頂板（估高）',
        originX-14.8,originX+9.8,originZ-13.15,far,3.56);
    if(rentalFloor){
        const intended=selectStart(rentalFloor,new T.Vector2(originX-5.55,originZ+7.1),kit.objects);
        const targetX=originX-10.9,targetZ=front+.22;
        if(intended)kit.plazaStart={x:intended.x,z:intended.y,
            yaw:Math.atan2(intended.x-targetX,intended.y-targetZ),deckId:rentalFloor.deck.id};
    }
    kit.sources+=' '+plan.basis;
    return kit;
}
