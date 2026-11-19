// 左右從內側面向門窗判定；side=1 的內側為牆 A→B 的左法向。
export const OPENING_STYLES=Object.freeze({
  'door-left-in':{kind:'door',name:'左內開門',motion:'swing',hinge:'left',inward:true},
  'door-right-in':{kind:'door',name:'右內開門',motion:'swing',hinge:'right',inward:true},
  'door-left-out':{kind:'door',name:'左外開門',motion:'swing',hinge:'left',inward:false},
  'door-right-out':{kind:'door',name:'右外開門',motion:'swing',hinge:'right',inward:false},
  'door-slide-left':{kind:'door',name:'向左拉門',motion:'slide',travel:-1},
  'door-slide-right':{kind:'door',name:'向右拉門',motion:'slide',travel:1},
  'door-glass-slide-left':{kind:'door',name:'單邊落地玻璃拉門（向左）',motion:'slide',travel:-1,glass:true},
  'door-glass-slide-right':{kind:'door',name:'單邊落地玻璃拉門（向右）',motion:'slide',travel:1,glass:true},
  'door-glass-double-slide':{kind:'door',name:'雙邊落地玻璃拉門（左右對拉）',motion:'double-slide',glass:true},
  'door-glass-sash':{kind:'door',name:'雙扇玻璃疊合拉門',motion:'sash',glass:true},
  'door-sash':{kind:'door',name:'雙扇疊合拉門',motion:'sash'},
  'door-rollup':{kind:'door',name:'上捲鐵捲門',motion:'rollup'},
  'door-double-in':{kind:'door',name:'雙扇內對開門',motion:'double',inward:true},
  'door-double-out':{kind:'door',name:'雙扇外對開門',motion:'double',inward:false},
  'door-glass-double-in':{kind:'door',name:'雙扇玻璃內對開門',motion:'double',inward:true,glass:true},
  'door-glass-double-out':{kind:'door',name:'雙扇玻璃外對開門',motion:'double',inward:false,glass:true},
  'window-transom-fixed':{kind:'window',name:'固定主窗＋上方固定氣窗',motion:'fixed',transom:true},
  'window-transom-awning':{kind:'window',name:'固定主窗＋上懸外推氣窗',motion:'transom',transom:true},
  'window-fixed':{kind:'window',name:'固定窗',motion:'fixed'},
  'window-grid':{kind:'window',name:'附牆多格固定窗',motion:'fixed',grid:true},
  'window-left-in':{kind:'window',name:'左內開窗',motion:'swing',hinge:'left',inward:true},
  'window-right-in':{kind:'window',name:'右內開窗',motion:'swing',hinge:'right',inward:true},
  'window-left-out':{kind:'window',name:'左外開窗',motion:'swing',hinge:'left',inward:false},
  'window-right-out':{kind:'window',name:'右外開窗',motion:'swing',hinge:'right',inward:false},
  'window-sliding':{kind:'window',name:'雙扇橫拉窗',motion:'sash'},
});
export const defaultStyle=kind=>kind==='door'?'door-left-in':'window-fixed';
export const openingStyle=o=>OPENING_STYLES[o.styleId];
export const defaultWindowGrid=()=>({columns:2,rows:2,frame:.04,depth:.1,color:'#59645f',glassColor:'#a9cada'});
export function validateWindowGrid(grid,width,height){
  const fields=['columns','rows','frame','depth','color','glassColor'];
  if(!grid||Object.getPrototypeOf(grid)!==Object.prototype||Object.keys(grid).length!==fields.length||Object.keys(grid).some(k=>!fields.includes(k)))throw new Error('窗格資料含未知或缺少欄位。');
  for(const k of ['columns','rows'])if(!Number.isInteger(grid[k])||grid[k]<1||grid[k]>12)throw new Error('窗格列／行須為 1–12。');
  if(!Number.isFinite(grid.frame)||grid.frame<.015||grid.frame>.2||!Number.isFinite(grid.depth)||grid.depth<.02||grid.depth>8||![grid.color,grid.glassColor].every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))throw new Error('窗格框寬、厚度或顏色無效。');
  if((width-grid.frame)/grid.columns-grid.frame<.0001||(height-grid.frame)/grid.rows-grid.frame<.0001)throw new Error('窗格分隔過密，沒有可用玻璃淨寬／淨高。');
  return grid;
}
// 描述實際扇片，2D/3D 同用；progress 供行程驗證，正式介面採開／關兩個端點。
export function openingParts(o,wall,progress=o.open?1:0){
  const spec=openingStyle(o),side=o.side,w=o.width-.1,h=o.height-.06,mid=o.sill+o.height/2;
  const parts=[],swings=[];
  const panel=(x,y,z,width,height,rotation=0,role='leaf')=>parts.push({x,y,z,width,height,rotation,role});
  if(spec.grid){
    const g=o.grid,cw=(o.width-g.frame)/g.columns,ch=(o.height-g.frame)/g.rows;
    const part=(x,y,width,height,role,depth,color)=>parts.push({x,y,z:0,width,height,rotation:0,role,depth,color});
    for(let row=0;row<g.rows;row++)for(let col=0;col<g.columns;col++)part(-o.width/2+g.frame/2+cw*(col+.5),o.sill+g.frame+ch*row+(ch-g.frame)/2,cw-g.frame,ch-g.frame,'grid-pane',g.depth*.45,g.glassColor);
    for(let i=0;i<=g.columns;i++)part(-o.width/2+g.frame/2+cw*i,mid,g.frame,o.height,'grid-frame',g.depth,g.color);
    for(let i=0;i<=g.rows;i++)part(0,o.sill+ch*i+g.frame/2,o.width,g.frame,'grid-frame',g.depth,g.color);
    return {parts,swings};
  }
  const swing=(hinge,width)=>{
    const run=(hinge==='left'?1:-1)*side,pivot=-run*w/2,direction=side*(spec.inward?1:-1),rotation=-direction*run*Math.PI/2*progress;
    panel(pivot+Math.cos(rotation)*run*width/2,mid,-Math.sin(rotation)*run*width/2,width,h,rotation);
    swings.push({pivot,run,width,direction});
  };
  if(spec.transom){
    const top=h*.25,gap=.04,bottom=h-top-gap,base=o.sill+.03;
    panel(0,base+bottom/2,0,w,bottom,0,'main');
    const angle=spec.motion==='transom'?side*Math.PI/6*progress:0,hinge=base+h;
    panel(0,hinge-top/2*Math.cos(angle),-top/2*Math.sin(angle),w,top,0,'transom');parts.at(-1).rotationX=angle;
    return {parts,swings};
  }
  if(spec.motion==='swing')swing(spec.hinge,w);
  if(spec.motion==='double'){
    swing('left',w/2-.005);
    // Retain the moving seam, but cover it with a stile mounted on the first
    // leaf's face. Local coordinates make it follow that leaf's hinge exactly.
    const leaf=parts.at(-1),depth=.012;
    leaf.meetingStile={x:side*(leaf.width/2+.005),y:-.01,z:side*(spec.inward?1:-1)*(.045/2+depth/2),width:.035,height:h-.02,depth};
    swing('right',w/2-.005);
  }
  if(spec.motion==='fixed')panel(0,mid,0,w,h);
  if(spec.motion==='slide')panel(spec.travel*side*w*progress,mid,side*(wall.thickness/2+.055),w,h);
  if(spec.motion==='double-slide')for(const direction of [-1,1])panel(direction*(w/4+w/2*progress),mid,side*(wall.thickness/2+.055),w/2,h);
  if(spec.motion==='sash'){
    panel(side*(-w/4+w/2*progress),mid,side*.035,w/2+.01,h);
    panel(side*w/4,mid,-side*.035,w/2+.01,h);
  }
  if(spec.motion==='rollup'){
    const count=Math.ceil(h/.08),slat=h/count,rolled=progress*h;
    for(let i=0;i<count;i++){
      const along=(i+.5)*slat,remaining=h-rolled;
      if(along<=remaining)panel(0,o.sill+.03+rolled+along,side*(wall.thickness/2+.045),w,slat+.002,0,'slat');
      else{
        const angle=(along-remaining)/.08,radius=.05+angle*.001;
        panel(0,o.sill+o.height+.15+Math.sin(angle)*radius,side*(wall.thickness/2+.16+Math.cos(angle)*radius),w,slat,0,'rolled');
        parts[parts.length-1].rotationX=-side*angle;
      }
    }
  }
  return {parts,swings};
}
