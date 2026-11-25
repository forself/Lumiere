import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createConcourseObjects} from './concourse.js';
import {attachEscalator} from './escalator.js';

// Local visual reconstruction. Placement and dimensions are estimates in the display frame.
const sourceNote={
    B3:'旅客實拍 00:10、00:30 顯示驗票區的金屬閘機、格柵天花、條燈與黃色引導帶。構件尺寸及局部排列為影像估讀。',
    B4:'2025-02-07 實拍可見樓梯、挑空兩側的上層走道及玻璃扶手。兩側走道的寬度、取景範圍、樓梯頂端接合與踏階尺寸為局部建模估值，樓差可調。'
};
function texture(width,height,paint){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    paint(canvas.getContext('2d'),width,height);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
    map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map;
}
function tiles(level){
    const map=texture(384,384,(ctx,w,h)=>{
        let seed=71;
        const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
        const pixels=ctx.createImageData(w,h),tones=Array.from({length:16},()=>random()*9-4.5);
        const base=level==='B4'?[184,176,162]:[186,181,173];
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const i=(y*w+x)*4,shade=(random()-.5)*13+tones[Math.floor(x/96)+4*Math.floor(y/96)];
            const seam=x%96<2||y%96<2?-37:(x%96===2||y%96===2?6:0);
            for(let k=0;k<3;k++)pixels.data[i+k]=base[k]+shade+seam;
            pixels.data[i+3]=255;
        }
        ctx.putImageData(pixels,0,0);
    });
    map.repeat.set(.2/2.4,.2/2.4);return map;
}
function surface(color){return new T.MeshBasicMaterial({color});}
function metal(){
    const map=texture(32,128,(ctx,w,h)=>{
        const fill=ctx.createLinearGradient(0,0,0,h);
        for(const [at,tone] of [[0,'#778384'],[.16,'#e1dfd4'],[.31,'#a6adac'],[.56,'#758081'],[.74,'#c9cecc'],[1,'#838f90']])fill.addColorStop(at,tone);
        ctx.fillStyle=fill;ctx.fillRect(0,0,w,h);
        for(let y=1;y<h;y+=3){ctx.fillStyle='rgba(45,53,54,.08)';ctx.fillRect(0,y,w,1);}
    });
    return new T.MeshBasicMaterial({map});
}
function box(parent,material,x,y,z,w,h,d){
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function rail(parent,material,x,y,z,xx,yy,zz,radius=.029){
    const start=new T.Vector3(x,y,z),end=new T.Vector3(xx,yy,zz);
    const direction=end.clone().sub(start);
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,direction.length(),10),material);
    mesh.position.copy(start).lerp(end,.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());parent.add(mesh);
}
// Merge only within a single editable object. Its transform and material boundaries survive export.
function batchParts(group){
    const byMaterial=new Map();
    for(const child of [...group.children]){
        if(!child.isMesh)continue;
        child.updateMatrix();
        const geo=child.geometry;
        geo.applyMatrix4(child.matrix);
        const list=byMaterial.get(child.material)??[];
        list.push(geo);byMaterial.set(child.material,list);group.remove(child);
    }
    for(const [mat,parts] of byMaterial){
        if(parts.length===1){group.add(new T.Mesh(parts[0],mat));continue;}
        const normalized=parts.map(g=>g.index?g.toNonIndexed():g);
        const merged=mergeGeometries(normalized);
        for(const g of new Set([...parts,...normalized]))g.dispose();
        group.add(new T.Mesh(merged,mat));
    }
}
function stationBandTexture(){
    return texture(768,100,(ctx,w,h)=>{
        ctx.fillStyle='#243d67';ctx.fillRect(0,0,w,h);
        ctx.fillStyle='#f5f4e8';ctx.font='bold 48px "Microsoft JhengHei",sans-serif';
        ctx.fillText('忠孝復興',32,61);ctx.font='22px Arial';ctx.fillText('Zhongxiao Fuxing',36,89);
        ctx.lineWidth=3;ctx.strokeStyle='#f5f4e8';ctx.strokeRect(w-109,20,82,59);
        ctx.font='bold 24px Arial';ctx.fillText('BL15',w-99,58);
    });
}
function platformObjects(bounds){
    const objects=[];
    const steel=metal(), black=surface('#252b2e'), blue=surface('#19679c'),red=surface('#702b35'),
        brown=surface('#9c8475'), stone=new T.MeshLambertMaterial({color:'#afa39a'}), skirt=surface('#827775'),
        chalk=surface('#eeece1'), lamps=surface('#fff8df'), soffit=surface('#a9a8a0'),
        slate=surface('#3d484c'), darkBlue=surface('#253957'), yellow=surface('#ddc866');
    const glass=new T.MeshBasicMaterial({color:'#b5cbca',transparent:true,opacity:.31,depthWrite:false,side:T.DoubleSide});
    const boardMat=new T.MeshBasicMaterial({map:stationBandTexture(),side:T.DoubleSide});
    const tactileMap=texture(192,192,(ctx,w,h)=>{
        ctx.fillStyle='#d2c8a3';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#afa17f';ctx.strokeRect(.5,.5,w-1,h-1);
        for(let z=24;z<h;z+=48)for(let x=24;x<w;x+=48){
            ctx.fillStyle='#b4a780';ctx.beginPath();ctx.arc(x+1,z+2,7,0,2*Math.PI);ctx.fill();
            ctx.fillStyle='#e3dabe';ctx.beginPath();ctx.arc(x,z,6,0,2*Math.PI);ctx.fill();
        }
    });
    const tactile=new T.MeshBasicMaterial({map:tactileMap});
    const add=(id,name,group,x,y,z,build,solid=false)=>{
        const mesh=new T.Group();mesh.position.set(x,y,z);build(mesh);batchParts(mesh);
        objects.push({id:'b4-'+id,name,group,mesh,solid});return mesh;
    };
    const left=Math.min(5.6,Math.max(.9,bounds.left)),right=Math.min(5.6,Math.max(.9,bounds.right));
    const yTop=bounds.rise??5.2, clear=bounds.clear??3.1, spec=bounds.stairSpec??{};
    const steps=spec.steps??Math.max(6,Math.min(128,2*Math.round(yTop/.34))),half=Math.floor(steps/2);
    const tread=spec.treadDepth??.285,middleStart=half*tread,middleEnd=middleStart+(spec.middleLength??1.40);
    const run=steps*tread+middleEnd-middleStart,landingDepth=2.2;
    const width=spec.width??Math.min(2.05,(left+right)*.45);
    const escalatorWidth=Math.min(1.24,Math.max(.6,right-width/2-.36));
    const escalatorX=width/2+escalatorWidth/2+.14;
    const galleryInner=side=>Math.max(width/2+.06,side-.41);
    const topLeft=galleryInner(left),topRight=Math.max(galleryInner(right),escalatorX+escalatorWidth/2);
    const footZ=-Math.min(5,Math.max(1.3,bounds.forward*.15));
    const stairCenter=0;
    const middleHeight=half*yTop/steps;
    const stairs={objectId:'b4-atrium-stair',width,run,rise:yTop,steps,landingDepth,topLeft,topRight,middleStart,middleEnd,
        heightAt(distance){
            if(distance<=middleStart)return middleHeight*T.MathUtils.clamp(distance/middleStart,0,1);
            if(distance<=middleEnd)return middleHeight;
            return middleHeight+(yTop-middleHeight)*T.MathUtils.clamp((distance-middleEnd)/(run-middleEnd),0,1);
        }};
    const stepY=yTop/steps;
    add('atrium-stair','挑空區直跑樓梯與休息平台','樓梯',stairCenter,0,footZ,g=>{
        for(let i=0;i<steps;i++){
            const near=i*tread+(i>=half?middleEnd-middleStart:0);
            const y=(i+1)*stepY;
            box(g,stone,0,y-stepY/2,-near-tread/2,width,stepY,tread+.002);
            box(g,red,0,y+.002,-near-.048,width-.06,.009,.067);
            box(g,steel,0,y+.003,-near-.009,width-.035,.012,.018);
            if(i%2===0)box(g,skirt,0,y+.006,-near-tread*.71,.012,.003,tread*.37);
        }
        for(const [from,to,y,leftEdge,rightEdge] of [[middleStart,middleEnd,middleHeight,-width/2,width/2],[run,run+landingDepth,yTop,-topLeft,topRight]]){
            const span=rightEdge-leftEdge,xCenter=(rightEdge+leftEdge)/2;
            box(g,stone,xCenter,y-.08,-(from+to)/2,span,.16,to-from);
            for(let x=leftEdge+.1;x<rightEdge;x+=.37)box(g,skirt,x,y+.001,-(from+to)/2,.008,.004,to-from);
            for(let z=from+.12;z<to;z+=.37)box(g,skirt,xCenter,y+.001,-z,span,.004,.008);
        }
        for(const sign of [-1,1]){
            const edge=sign*(width/2-.025);
            for(const [from,to] of [[0,middleStart],[middleStart,middleEnd],[middleEnd,run]]){
                const low=stairs.heightAt(from),high=stairs.heightAt(to);
                rail(g,steel,edge,low+.96,-from,edge,high+.96,-to,.037);
                rail(g,steel,edge,low+.56,-from,edge,high+.56,-to,.020);
                const count=Math.ceil((to-from)/1.25);
                for(let i=0;i<count;i++){
                    const dist=from+(to-from)*i/count,y=stairs.heightAt(dist);
                    rail(g,steel,edge,y,-dist,edge,y+.955,-dist,.022);
                }
                const a=new T.Vector3(edge,low-.10,-from),b=new T.Vector3(edge,high-.10,-to);
                const cheek=box(g,skirt,edge,(a.y+b.y)/2,(a.z+b.z)/2,.1,.27,a.distanceTo(b));
                cheek.rotation.x=Math.atan2(high-low,to-from);
            }
            const endEdge=sign<0?-topLeft:topRight;
            const guardSpans=sign<0?[[endEdge,edge]]:
                [[edge,escalatorX-escalatorWidth/2],[escalatorX+escalatorWidth/2,endEdge]];
            for(const [a,b] of guardSpans){
                if(b-a<.02)continue;
                rail(g,steel,a,yTop+.96,-run,b,yTop+.96,-run,.035);
                box(g,glass,(a+b)/2,yTop+.46,-run,b-a,.86,.038);
            }
            rail(g,steel,endEdge,yTop,-(run+landingDepth),endEdge,yTop+.96,-(run+landingDepth),.024);
        }
        rail(g,steel,-topLeft,yTop+.96,-(run+landingDepth),topRight,yTop+.96,-(run+landingDepth));
        box(g,glass,(topRight-topLeft)/2,yTop+.45,-(run+landingDepth),topRight+topLeft,.88,.036);
    });
    // In the reference photograph, the black hand belt is on the left looking down.
    const escalator=add('escalator','樓梯旁電扶梯（上行）','站內挑空',escalatorX,0,footZ,g=>{
        const edgeBlack=surface('#303239'),slopeLength=Math.hypot(run,yTop);
        for(const [d,y] of [[-.15,0],[run+.15,yTop]])
            box(g,steel,0,y+.003,-d,escalatorWidth-.13,.010,.30);
        for(const sign of [-1,1]){
            const edge=sign*(escalatorWidth/2-.02);
            const side=box(g,steel,edge,yTop/2+.15,-run/2,.10,.64,slopeLength);
            side.rotation.x=Math.atan2(yTop,run);
            const shield=box(g,glass,edge,yTop/2+.62,-run/2,.065,.72,slopeLength);
            shield.rotation.x=Math.atan2(yTop,run);
            rail(g,edgeBlack,edge,.94,0,edge,yTop+.94,-run,.065);
            rail(g,edgeBlack,edge,.94,.36,edge,.94,0,.065);
            rail(g,edgeBlack,edge,yTop+.94,-run,edge,yTop+.94,-run-.54,.065);
        }
    });
    const escalators=[attachEscalator(escalator,{objectId:'b4-escalator',width:escalatorWidth-.17,
        outerWidth:escalatorWidth,run,rise:yTop,direction:1,backingMaterial:steel})];
    const back=Math.min(Math.max(bounds.back,.8),19),front=Math.max(-footZ+run+landingDepth+2,19);
    const length=front+back, center=(back-front)/2;
    const capHeight=yTop+Math.min(clear,3.6);
    const count=Math.max(3,Math.round(length/2.9)),bay=length/count;
    const sideName=sign=>sign<0?'左側':'右側';
    const decks=[];
    for(const sign of [-1,1]){
        const edge=sign*(sign<0?left:right), inward=-sign;
        add('tile-band-'+sign,sideName(sign)+'紅褐色地磚帶','地坪',edge*.45,0,center,g=>{
            box(g,brown,0,.005,0,.41,.009,length);
        });
        add('warning-'+sign,sideName(sign)+'淡黃色警示鋪面','地坪',edge+inward*.38,0,center,g=>{
            for(let i=0;i<Math.ceil(length/.31);i++){const len=Math.min(.31,length-i*.31);
                box(g,tactile,0,.012,-length/2+i*.31+len/2,.27,.018,len);}
        });
        add('track-background-'+sign,sideName(sign)+'門後暗色背景','門列背景',edge+sign*.68,0,center,g=>{
            box(g,black,0,1.31,0,.05,2.62,length);
        });
        for(let i=0;i<count;i++){
            const z=back-(i+.5)*bay;
            add('door-'+sign+'-'+i,sideName(sign)+'半高月台門 '+(i+1),'月台門',edge,0,z,g=>{
                const span=bay-.014,h=1.33; // The cap reaches 1.45 m, the published original system height.
                for(const dz of [-span/2,0,span/2]){
                    box(g,steel,0,h/2,dz,.105,h,.060);
                }
                for(const dz of [-span/4,span/4]){
                    box(g,glass,0,.78,dz,.032,1.01,span/2-.053);
                    box(g,steel,0,.16,dz,.09,.27,span/2-.055);
                    box(g,steel,0,h-.035,dz,.10,.066,span/2-.045);
                }
                box(g,blue,0,h+.05,-span/2+.055,.16,.14,.24);
                box(g,yellow,inward*.059,1.30,-span*.28,.012,.085,.23);
                box(g,black,inward*.061,1.30,-span*.28,.013,.014,.16);
            },true);
            if(i%2===0)add('queue-'+sign+'-'+i,sideName(sign)+'白色候車折線 '+(i/2+1),'地坪標線',edge+inward*.85,0,z,g=>{
                for(const d of [-.48,.48]){
                    box(g,chalk,0,.013,d,.9,.008,.04);
                    const m=box(g,chalk,inward*.57,.013,d-Math.sign(d)*.10,.38,.008,.04);m.rotation.y=inward*Math.sign(d)*.54;
                }
            });
        }
        add('sign-'+sign,sideName(sign)+'深藍站名帶','站名與燈帶',edge+sign*.11,2.17,center,g=>{
            box(g,darkBlue,0,.15,0,.20,.33,length);
            for(let i=0;i<3;i++){
                const board=new T.Mesh(new T.PlaneGeometry(2.55,.31),boardMat);
                board.rotation.y=inward*Math.PI/2; board.position.set(inward*.106,.15,-length*.34+i*length*.34);g.add(board);
            }
        });
        add('light-box-'+sign,sideName(sign)+'燈箱與上層地坪邊','站內挑空',edge+sign*.26,0,center,g=>{
            box(g,soffit,0,yTop-.25,0,1.45,.49,length);
            box(g,black,inward*.73,yTop-.90,0,.11,1.18,length);
            for(let i=0;i<count;i++){
                const z=-length/2+(i+.5)*bay;
                box(g,lamps,inward*.79,yTop-.88,z,.02,.91,bay-.085);
            }
        });
        const inner=sign*galleryInner(Math.abs(edge)),outer=edge+sign*2.0;
        const slabWidth=Math.abs(outer-inner),slabId='upper-deck-'+sign;
        const tileMap=tiles('B3');tileMap.repeat.set(slabWidth/2.4,length/2.4);
        const paving=new T.MeshBasicMaterial({map:tileMap});
        add(slabId,sideName(sign)+'上層走道樓板與石材地坪','上層走道',(inner+outer)/2,yTop,center,g=>{
            box(g,soffit,0,-.12,0,slabWidth,.24,length);
            const top=new T.Mesh(new T.PlaneGeometry(slabWidth,length),paving);
            top.rotation.x=-Math.PI/2;top.position.y=.002;g.add(top);
        });
        decks.push({id:'b4-'+slabId,halfWidth:slabWidth/2,halfDepth:length/2,side:sideName(sign)});
        add('upper-rail-'+sign,sideName(sign)+'上層玻璃欄板與扶手','站內挑空',inner,yTop,center,g=>{
            // The stair-head landing joins each gallery through the opening in its glass.
            g.userData.barriers=[];
            for(const [start,end] of [[-length/2,footZ-run-landingDepth-center],[footZ-run-center,length/2]]){
                if(end<=start)continue;
                g.userData.barriers.push(new T.Box3(new T.Vector3(-.025,0,start),new T.Vector3(.025,1.06,end)));
                const n=Math.ceil((end-start)/(bay/2)),segment=(end-start)/n;
                rail(g,steel,0,1.01,start,0,1.01,end,.046);
                for(let i=0;i<n;i++){
                    box(g,glass,0,.52,start+(i+.5)*segment,.027,.91,Math.max(.01,segment-.035));
                    box(g,steel,0,.48,start+i*segment,.046,.96,.043);
                }
                box(g,steel,0,.48,end,.046,.96,.043);
            }
        },true);
        add('upper-wall-'+sign,sideName(sign)+'上層淺色壁板與藍灰腰帶','站內挑空',edge+sign*2.0,yTop,center,g=>{
            box(g,soffit,0,clear*.5,0,.11,clear,length);
            box(g,surface('#77879a'),inward*.062,1.0,0,.018,.18,length);
            for(let i=0;i<count*2;i++)box(g,skirt,inward*.057,clear*.5,-length/2+i*bay*.5,.008,clear,.011);
        },true);
    }
    add('cross-tiles','紅褐色橫向地磚帶','地坪',(right-left)/2,0,0,g=>{
        for(const z of [-3.1,-11.7])box(g,brown,0,.007,z,left+right,.008,.30);
    });
    add('ceiling','挑空上方深色折板天花','天花',(right-left)/2,capHeight,center,g=>{
        const w=left+right+4.0;
        box(g,slate,0,.07,0,w,.15,length);
        for(let z=-length/2+.16;z<length/2;z+=.48)box(g,slate,0,-.045,z,w*.62,.145,.13);
        for(const sign of [-1,1])box(g,soffit,sign*w*.407,-.02,0,w*.185,.15,length);
    });
    add('ceiling-lights','挑空天花白色燈列','照明',(right-left)/2,capHeight-.13,center,g=>{
        for(let i=0;i<count;i++)for(const side of [-1,1]){
            box(g,lamps,side*(left+right)*.29,0,-length/2+(i+.5)*bay,.36,.033,.66);
        }
    });
    return {objects,stairs,decks,escalators};
}
export function createStationAppearance(levelId,bounds={}){
    const extents={left:4,right:4,forward:24,back:3,...bounds};
    const kit=levelId==='B4'?platformObjects(extents):{objects:createConcourseObjects(extents)};
    return {...kit,floorMap:tiles(levelId),floorColor:0xffffff,sources:sourceNote[levelId]};
}
