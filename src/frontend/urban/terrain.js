// All geometry and navigation use the same diagonal in each terrain grid cell.
export function validateTerrain(t){
    if(t==null)return;
    if(t.type!=='regular-grid'||![t.x,t.z,t.step].every(Number.isFinite)||t.step<=0||
        ![t.columns,t.rows].every(n=>Number.isInteger(n)&&n>=2)||t.columns*t.rows>500000||
        !Array.isArray(t.heights)||t.heights.length!==t.columns*t.rows||!t.heights.every(Number.isFinite)){
        throw Error('地形格網格式錯誤。');
    }
}

export function groundAt(t,x,z){
    if(!t)return 0;
    const u=Math.min(t.columns-1,Math.max(0,(x-t.x)/t.step));
    const v=Math.min(t.rows-1,Math.max(0,(z-t.z)/t.step));
    const i=Math.min(t.columns-2,Math.floor(u)),j=Math.min(t.rows-2,Math.floor(v));
    const fx=u-i,fz=v-j,k=j*t.columns+i,h=t.heights;
    if(fx+fz<=1)return h[k]+fx*(h[k+1]-h[k])+fz*(h[k+t.columns]-h[k]);
    const c=h[k+t.columns+1];
    return c+(1-fz)*(h[k+1]-c)+(1-fx)*(h[k+t.columns]-c);
}

function clip(polygon, distance){
    if(!polygon.length)return polygon;
    const result=[];
    let previous=polygon.at(-1),a=distance(previous);
    for(const current of polygon){
        const b=distance(current);
        if((a<0&&b>0)||(a>0&&b<0)){
            const f=a/(a-b);
            result.push([previous[0]+f*(current[0]-previous[0]),previous[1]+f*(current[1]-previous[1])]);
        }
        if(b>=0)result.push(current);
        a=b;previous=current;
    }
    return result;
}

// Intersect each source triangle with the terrain facets. Sampling only the
// street corners would leave long pavement triangles cutting across the hillside.
export function onTerrain(t,triangle,visit){
    if(!t){visit(triangle);return;}
    const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]);
    const i0=Math.floor((Math.min(...xs)-t.x)/t.step),i1=Math.floor((Math.max(...xs)-t.x)/t.step);
    const j0=Math.floor((Math.min(...zs)-t.z)/t.step),j1=Math.floor((Math.max(...zs)-t.z)/t.step);
    if(i1-i0>1024||j1-j0>1024||(i1-i0+1)*(j1-j0+1)>100000)throw Error('構件超出地形編輯範圍。');
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
        const x=t.x+i*t.step,z=t.z+j*t.step;
        let p=clip(triangle,v=>v[0]-x);
        p=clip(p,v=>x+t.step-v[0]);p=clip(p,v=>v[1]-z);p=clip(p,v=>z+t.step-v[1]);
        if(p.length<3)continue;
        const split=v=>t.step-(v[0]-x)-(v[1]-z);
        for(const part of [clip(p,split),clip(p,v=>-split(v))]){
            for(let n=2;n<part.length;n++){
                const a=part[0],b=part[n-1],c=part[n];
                if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))>1e-12)visit([a,b,c]);
            }
        }
    }
}

export function buildingOffset(t,b){
    let low=Infinity;
    for(const face of b.faces){
        if(!face.every(i=>i%2===1))continue;
        const roofTriangle=face.map(i=>b.footprint[Math.floor(i/2)]);
        onTerrain(t,roofTriangle,points=>{
            for(const [x,z] of points)low=Math.min(low,groundAt(t,x,z));
        });
    }
    if(!Number.isFinite(low))low=Math.min(...b.footprint.map(([x,z])=>groundAt(t,x,z)));
    return low-(b.sourceBase??b.base);
}

export function terrainSurface(t,b,faces){
    const xyz=[];
    for(const face of faces){
        const triangle=face.map(i=>b.footprint[i]);
        const emit=points=>{for(const [x,z] of points)xyz.push(x,b.elevation??groundAt(t,x,z),z);};
        if(b.elevation==null)onTerrain(t,triangle,emit);else emit(triangle);
    }
    return xyz;
}