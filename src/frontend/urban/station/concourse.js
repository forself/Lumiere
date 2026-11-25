import * as T from 'three';

// Public concourse finishes from Taiwan Wanderer's 00:10, 00:20, 00:30 and 01:10 frames.
// Dimensions are adjustable visual estimates. Each kit has its own shared materials.
function paintedMaterial(width, height, paint, repeat = true) {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    paint(surface.getContext('2d'), width, height);
    const map = new T.CanvasTexture(surface);
    map.colorSpace = T.SRGBColorSpace;
    if (repeat) map.wrapS = map.wrapT = T.RepeatWrapping;
    map.anisotropy = 4;
    return new T.MeshBasicMaterial({ map, side: T.DoubleSide });
}

function tiledMaterial(colours, ground) {
    return paintedMaterial(256, 256, (ctx, w, h) => {
        ctx.fillStyle = colours[0];
        ctx.fillRect(0, 0, w, h);
        let seed = 81937;
        const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let j = 0; j < 4; j++) {
            for (let i = 0; i < 4; i++) {
                const x = i * 64, y = j * 64;
                ctx.fillStyle = colours[1 + Math.floor(random() * (colours.length - 1))];
                ctx.fillRect(x + 1, y + 1, 62, 62);
                ctx.fillStyle = 'rgba(255,255,255,.24)';
                ctx.fillRect(x + 1, y + 1, 62, 1);
                ctx.fillRect(x + 1, y + 1, 1, 62);
            }
        }
        for (let i = 0; i < (ground ? 12500 : 4800); i++) {
            ctx.fillStyle = random() > .5 ? 'rgba(255,255,255,.12)' : 'rgba(56,46,42,.075)';
            ctx.fillRect(random() * w, random() * h, 1, 1);
        }
    });
}

function steelMaterial() {
    return paintedMaterial(128, 128, (ctx, w, h) => {
        const sheen = ctx.createLinearGradient(0, 0, w, h * .15);
        for (const [at, colour] of [[0,'#a2a8aa'],[.22,'#d1d5d4'],[.44,'#eff0ec'],[.66,'#b4bbbb'],[.86,'#cbd0ce'],[1,'#9ba1a1']]) {
            sheen.addColorStop(at, colour);
        }
        ctx.fillStyle = sheen;
        ctx.fillRect(0,0,w,h);
        for (let y = 0; y < h; y += 2) {
            ctx.fillStyle = y % 6 ? 'rgba(255,255,255,.12)' : 'rgba(36,48,51,.12)';
            ctx.fillRect(0,y,w,1);
        }
    }, false);
}

function grilleMaterial() {
    return paintedMaterial(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#41413e'; ctx.fillRect(0,0,w,h);
        for (let y = 0; y < h; y += 16) {
            for (let x = 0; x < w; x += 16) {
                ctx.fillStyle = '#202626'; ctx.fillRect(x+2,y+2,13,13);
                ctx.fillStyle = '#605e58'; ctx.fillRect(x,y,16,2);
                ctx.fillStyle = '#77756d'; ctx.fillRect(x,y,2,16);
                ctx.fillStyle = '#3e4140'; ctx.fillRect(x+2,y+2,12,2);
            }
        }
    });
}

function guidanceMaterial() {
    return paintedMaterial(96, 192, (ctx, w, h) => {
        ctx.fillStyle = '#c2a23a'; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = '#a78b37'; ctx.fillRect(0,0,w,3);
        for (let x = 8; x < w; x += 23) {
            ctx.fillStyle = '#a38a36'; ctx.fillRect(x, 8, 12, h-16);
            ctx.fillStyle = '#ddbd52'; ctx.fillRect(x+1, 8, 10, h-19);
            ctx.fillStyle = '#efd16d'; ctx.fillRect(x+1, 8, 2, h-18);
        }
    });
}

function gateFace() {
    // A bevelled metal cabinet follows the familiar rounded ends of a ticket gate.
    const shape = new T.Shape();
    shape.moveTo(-.78, .09);
    shape.lineTo(.78, .09);
    shape.lineTo(.78, .76);
    shape.quadraticCurveTo(.78, .89, .62, .94);
    shape.lineTo(.40, 1.00);
    shape.lineTo(-.43, 1.00);
    shape.lineTo(-.65, .93);
    shape.quadraticCurveTo(-.78, .90, -.78, .77);
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth:.26, bevelEnabled:true, bevelThickness:.018, bevelSize:.018, bevelSegments:2, steps:1, curveSegments:4 });
    geo.translate(0,0,-.13);
    geo.rotateY(-Math.PI/2);
    return geo;
}

export function createConcourseObjects(bounds) {
    const left = Math.min(bounds.left, 7), right = Math.min(bounds.right, 4.45);
    const front = Math.min(bounds.forward, 11), back = Math.min(bounds.back, 4.5);
    const width = left + right, length = front + back;
    const centreX = (right-left)/2, centreZ = (back-front)/2;
    const height = bounds.clear ?? 3.1;
    const unitBox = new T.BoxGeometry(1,1,1);
    const paint = color => new T.MeshBasicMaterial({color});
    const materials = {
        steel:steelMaterial(), dark:paint('#252b2c'), graphite:paint('#3c4548'), shadow:paint('#5c615e'),
        aluminium:paint('#b4b9b4'), band:paint('#638399'), warmPanel:paint('#deddd2'),
        palePanel:paint('#e8e5da'), white:paint('#f6f7ee'), lamp:paint('#fffdf0'), yellow:paint('#e1bc47'),
        reader:paint('#344449'), screen:paint('#a5c8d2'), green:paint('#74d485'), blue:paint('#364c61'),
        red:paint('#aa3541'), counter:paint('#cda978'), sand:paint('#dbbf96'), glow:paint('#ffe1a2'),
        displayGlass:new T.MeshBasicMaterial({color:'#dcebea',transparent:true,opacity:.19,depthWrite:false}),
        ceiling:tiledMaterial(['#98968d','#d5d2c7','#dbd8cd','#d1cec4','#d9d6ca'],false),
        brownTile:tiledMaterial(['#948781','#b7a29b','#beaaa1','#bba7a0','#b5a299'],true),
        grille:grilleMaterial(), strip:guidanceMaterial()
    };
    const gateGeometry = gateFace();
    const triangle=new T.Shape();
    triangle.moveTo(-.125,0);triangle.lineTo(.125,0);triangle.lineTo(0,-.27);triangle.closePath();
    const faceInsert=new T.ShapeGeometry(triangle);
    const list = [];
    function record(id,name,group,mesh,solid) {
        mesh.name = name;
        list.push({id:'b3-'+id,name,group,mesh,...(solid ? {solid:true} : {})});
        return mesh;
    }
    function box(parent,x,y,z,w,h,d,mat) {
        const mesh = new T.Mesh(unitBox,mat);
        mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
        parent.add(mesh);
        return mesh;
    }
    function plane(w,d,mat,tilesWide,tilesDeep) {
        const geo = new T.PlaneGeometry(w,d);
        geo.rotateX(-Math.PI/2);
        const uv = geo.getAttribute('uv');
        for (let i=0; i<uv.count; i++) uv.setXY(i,uv.getX(i)*tilesWide,uv.getY(i)*tilesDeep);
        return new T.Mesh(geo,mat);
    }
    function element(id,name,group,x,y,z,solid=false) {
        const g=new T.Group();
        g.position.set(x,y,z);
        return record(id,name,group,g,solid);
    }

    // Individual ceiling bays share a tiled finish, with separately selectable
    // ventilation strips and lights. The lanes are centred on the public patch.
    const bays=Math.max(1,Math.ceil(width/3.25)), bayWidth=width/bays;
    const numberOfRows=Math.max(1,Math.ceil(length/3.1)), rowLength=length/numberOfRows;
    for (let bay=0; bay<bays; bay++) {
        const x=-left+(bay+.5)*bayWidth;
        const bayMesh=plane(bayWidth,length,materials.ceiling,bayWidth/2.45,length/2.45);
        bayMesh.position.set(x,height,centreZ);
        record('ceiling-'+bay,'平頂方板 '+(bay+1),'天花',bayMesh);
        const grilleWidth=Math.min(.53,bayWidth*.22);
        const grille=plane(grilleWidth,length,materials.grille,grilleWidth/.36,length/.36);
        grille.position.set(x-bayWidth*.32,height-.018,centreZ);
        record('vent-'+bay,'深色格柵通風帶 '+(bay+1),'天花',grille);
        for (let row=0;row<numberOfRows;row++) {
            const z=-front+(row+.5)*rowLength, lightLength=rowLength*.83;
            const light=element('light-'+bay+'-'+row,'嵌入式燈具 '+(bay+1)+'-'+(row+1),'照明',x+bayWidth*.25,height-.031,z);
            box(light,0,0,0,.235,.025,lightLength,materials.aluminium);
            box(light,0,-.018,0,.179,.012,lightLength-.07,materials.lamp);
        }
    }

    // The gate row is on one side of the through aisle, as seen at 00:30.
    const gateZ=-Math.min(front*.42,4.3);
    const bankWidth=Math.min(left-.22,5.1);
    if(bankWidth>.65 && front>1.65) {
        const bankLeft=-bankWidth;
        const count=Math.min(5,Math.max(1,Math.floor((bankWidth-.35)/1.0)+1));
        const pitch=Math.min(1.07,(bankWidth-.25)/Math.max(1,count-1));
        const floorDepth=Math.min(length*.45,5.0);
        const tile=plane(bankWidth,floorDepth,materials.brownTile,bankWidth/1.48,floorDepth/1.48);
        tile.position.set(bankLeft+bankWidth/2,.008,gateZ);
        record('gate-tiles','閘機側暖灰棕方磚','地坪',tile);
        for(let i=0;i<count;i++){
            const x=bankLeft+.14+i*pitch;
            const g=element('gate-'+i,'不鏽鋼自動閘機 '+(i+1),'驗票設備',x,0,gateZ,true);
            g.add(new T.Mesh(gateGeometry,materials.steel));
            box(g,0,.075,0,.25,.15,1.49,materials.graphite);
            box(g,0,.49,.795,.238,.75,.033,i%3===2?materials.graphite:materials.steel);
            const nose=new T.Mesh(faceInsert,materials.red);nose.position.set(0,.87,.815);g.add(nose);
            box(g,0,.36,.817,.149,.255,.010,materials.yellow);
            box(g,0,.77,.822,.10,.029,.012,materials.dark);
            const reader=box(g,0,.977,.505,.225,.038,.265,materials.reader);
            reader.rotation.x=.21;
            const glass=box(g,0,1.002,.50,.125,.012,.11,materials.screen);
            glass.rotation.x=.21;
            box(g,0,.841,.771,.097,.035,.036,materials.green);
        }
    }
    if(right>.8) {
        const stripWidth=Math.min(.34,right*.20);
        const band=plane(stripWidth,length,materials.strip,1,length/.57);
        band.position.set(right*.53,.012,centreZ);
        record('guidance','黃色導引帶','地坪',band);
    }

    // The 00:10 wall has broad cream panels, metal joints and a continuous
    // blue-grey belt. The far end deliberately remains open.
    const wallZ=-front, wallLength=back-wallZ;
    const count=Math.max(1,Math.round(wallLength/1.18)), panelWidth=wallLength/count;
    const shopNear=-.45, shopFar=Math.max(wallZ+.6,-9);
    const storeSections=[];
    for(let i=0;i<count;i++){
        const z=wallZ+(i+.5)*panelWidth;
        if(right>1.7 && z>shopFar && z<shopNear){
            storeSections.push(z);
            continue;
        }
        const g=element('wall-'+i,'米白牆板與藍灰腰帶 '+(i+1),'牆面',right,0,z,true);
        box(g,.038,height/2,0,.076,height,panelWidth,materials.shadow);
        box(g,-.012,height/2,0,.029,height-.012,Math.max(.02,panelWidth-.019),i%3===1?materials.warmPanel:materials.palePanel);
        const bandHeight=Math.min(.255,height*.11);
        box(g,-.032,height*.47,0,.017,bandHeight,panelWidth-.012,materials.band);
        box(g,-.032,.073,0,.019,.146,panelWidth-.005,materials.graphite);
    }
    // The 00:20 concourse frame shows this storefront before the film enters
    // the underground mall at 01:17. Only the sign wording is transcribed.
    if(storeSections.length){
        const shopWidth=storeSections.length*panelWidth, shopZ=(storeSections[0]+storeSections.at(-1))/2;
        const shop=element('shopfront','店面銀灰框與暖色櫃台','店面',right,0,shopZ,true);
        shop.rotation.y=-Math.PI/2;
        box(shop,0,height/2,-.03,shopWidth,height,.10,materials.warmPanel);
        box(shop,0,.08,.07,shopWidth,.16,.12,materials.graphite);
        for(const side of [-1,1]){
            box(shop,side*(shopWidth/2-.045),height/2,.10,.09,height,.14,materials.steel);
        }
        const fascia=element('shop-fascia','站內店面紅色招牌','店面',right-.145,height-.33,shopZ);
        fascia.rotation.y=-Math.PI/2;
        box(fascia,0,0,0,shopWidth,.46,.14,materials.red);
        const storeLettering=paintedMaterial(800,120,(ctx,w,h)=>{
            ctx.fillStyle='#b72d35';ctx.fillRect(0,0,w,h);
            ctx.fillStyle='#fff5e8';ctx.font='bold 75px Trebuchet MS, sans-serif';ctx.textAlign='center';
            ctx.fillText('mister Donut',w/2,h*.72);
        },false);
        const lettering=new T.Mesh(new T.PlaneGeometry(Math.min(2.2,shopWidth*.82),.34),storeLettering);
        lettering.position.z=.071;fascia.add(lettering);
        for(let i=0;i<storeSections.length;i++){
            const counter=element('counter-'+i,'暖光陳列櫃 '+(i+1),'店面',right-.25,0,storeSections[i],true);
            counter.rotation.y=-Math.PI/2;
            const backingHeight=Math.max(.35,height-1.53-.60);
            box(counter,0,1.53+backingHeight/2,-.12,panelWidth-.05,backingHeight,.05,materials.sand);
            for(const y of [1.59,1.88,2.16]){
                if(y>height-.68)continue;
                box(counter,0,y,-.045,panelWidth-.07,.037,.18,materials.aluminium);
                box(counter,0,y-.025,.032,panelWidth-.09,.013,.021,materials.glow);
            }
            box(counter,0,.52,.10,panelWidth-.02,.94,.48,materials.counter);
            box(counter,0,.11,.22,panelWidth-.02,.12,.37,materials.shadow);
            box(counter,0,1.02,.10,panelWidth,.065,.54,materials.steel);
            box(counter,0,1.20,.38,panelWidth-.025,.32,.015,materials.displayGlass);
            for(const side of [-1,1])box(counter,side*(panelWidth/2-.012),1.21,.37,.023,.40,.026,materials.aluminium);
            box(counter,0,1.41,.11,panelWidth,.035,.54,materials.glow);
        }
    }
    if(front>3 && width>3) {
        // The film shows an overhead black bilingual line identifier. There
        // are no direction arrows in this detail study.
        const signWidth=Math.min(2.40,width*.42);
        const sign=element('line-sign','文湖線與板南線吊牌','旅客資訊',centreX-.28,height-.39,-Math.min(front*.69,6.8));
        const signInk=paintedMaterial(1024,155,(ctx,w,h)=>{
            ctx.fillStyle='#20282a';ctx.fillRect(0,0,w,h);
            for(const [i,mark,ch,en,colour] of [[0,'BR','文湖線','Wenhu Line','#9b714d'],[1,'BL','板南線','Bannan Line','#247baf']]){
                const x=i*w/2+25;
                ctx.fillStyle=colour;ctx.fillRect(x,22,80,58);
                ctx.fillStyle='#fffef6';ctx.font='bold 45px sans-serif';ctx.fillText(mark,x+8,67);
                ctx.font='bold 48px Microsoft JhengHei, sans-serif';ctx.fillText(ch,x+105,68);
                ctx.font='30px sans-serif';ctx.fillText(en,x+107,115);
            }
        },false);
        box(sign,0,0,0,signWidth,.35,.107,materials.graphite);
        const face=new T.Mesh(new T.PlaneGeometry(signWidth-.016,.335),signInk);face.position.z=.055;sign.add(face);
        for(const side of [-1,1])box(sign,side*signWidth*.35,.28,0,.025,.27,.025,materials.dark);
    }
    // The 01:10 reverse view shows pale rear panels, a large blue information
    // display, and an open aisle on the right. These are local backdrop bays.
    if(front>3.5 && width>4) {
        const rearRight=Math.max(.45,Math.min(1.6,right*.32)), rearWidth=left+rearRight;
        const sections=Math.max(2,Math.round(rearWidth/1.18)), section=rearWidth/sections;
        const z=-front+.08;
        for(let i=0;i<sections;i++){
            const x=-left+section*(i+.5);
            const wall=element('rear-panel-'+i,'閘區後方牆板 '+(i+1),'牆面',x,0,z,true);
            box(wall,0,height/2,-.02,section,height,.08,materials.shadow);
            box(wall,0,height/2,.027,section-.022,height-.016,.02,i%3===1?materials.warmPanel:materials.palePanel);
            box(wall,0,height*.47,.05,section-.01,.21,.022,materials.band);
            box(wall,0,.09,.055,section-.01,.18,.035,materials.graphite);
        }
        const boardWidth=Math.min(2.26,rearWidth*.58), boardHeight=Math.min(1.37,height*.45);
        const board=element('blue-display','閘區後方藍色資訊面板','旅客資訊',rearRight-boardWidth*.66,height*.56,z+.09);
        box(board,0,0,0,boardWidth+.06,boardHeight+.06,.065,materials.aluminium);
        const boardInk=paintedMaterial(512,256,(ctx,w,h)=>{
            const c=ctx.createLinearGradient(0,0,w,h);
            c.addColorStop(0,'#365b94');c.addColorStop(.64,'#4678ae');c.addColorStop(1,'#284c87');
            ctx.fillStyle=c;ctx.fillRect(0,0,w,h);
            // Reproduce the observed blocks of pale content without
            // transcribing an unreadable poster or inventing its text.
            ctx.fillStyle='#d3dfef';ctx.fillRect(38,44,202,11);
            ctx.fillStyle='#9bb1d2';ctx.fillRect(38,67,142,5);
            ctx.fillStyle='#b7cce1';ctx.fillRect(43,157,104,6);ctx.fillRect(43,172,143,5);
            ctx.fillStyle='#c8d5e2';ctx.fillRect(337,117,90,63);
            ctx.fillStyle='#93accb';ctx.fillRect(316,181,133,12);
        },false);
        const display=new T.Mesh(new T.PlaneGeometry(boardWidth,boardHeight),boardInk);
        display.position.z=.035;board.add(display);
    }
    return list;
}
