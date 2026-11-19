// 標籤以畫面像素聚合，與模型距離及內部渲染解析度無關。
export const manualLabel=o=>o.assetId==='text-panel'?'':o.annotation||o.trace?.label||o.prop?.label||'';
export function clusterLabels(points,width,height){
 let groups=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height).map(p=>({items:[p]}));
 const layout=g=>{g.x=g.items.reduce((n,p)=>n+p.x,0)/g.items.length;g.y=Math.max(2,g.items.reduce((n,p)=>n+p.y,0)/g.items.length-48);g.width=g.items.length>1?112:Math.min(190,Math.max(80,Array.from(g.items[0].label).length*13+24));g.x=Math.max(g.width/2+2,Math.min(width-g.width/2-2,g.x));g.rect={x:g.x-g.width/2,y:g.y,width:g.width,height:28};return g;};
 groups.forEach(layout);let merged=true;
 while(merged){merged=false;outer:for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const a=groups[i].rect,b=groups[j].rect;if(a.x<=b.x+b.width+8&&a.x+a.width+8>=b.x&&a.y<=b.y+b.height+8&&a.y+a.height+8>=b.y){groups[i].items.push(...groups[j].items);groups.splice(j,1);layout(groups[i]);merged=true;break outer;}}}
 return groups;
}
export const hitLabel=(groups,x,y)=>groups.find(g=>x>=g.rect.x&&x<=g.rect.x+g.rect.width&&y>=g.rect.y&&y<=g.rect.y+g.rect.height);
export function drawLabels(c,groups){c.save();c.font='bold 13px Microsoft JhengHei, sans-serif';c.textAlign='center';c.textBaseline='middle';for(const g of groups){c.strokeStyle='#854c0b';c.lineWidth=2;for(const p of g.items){c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x,g.y+28);c.lineTo(g.x,g.y+28);c.stroke();c.fillStyle='#ffdb73';c.beginPath();c.arc(p.x,p.y,3,0,Math.PI*2);c.fill();}c.fillStyle='#ffe69a';c.fillRect(g.rect.x,g.y,g.width,28);c.strokeRect(g.rect.x,g.y,g.width,28);c.fillStyle='#362609';let label=g.items.length>1?`${g.items.length} 個標記 ▾`:g.items[0].label;while(c.measureText(label).width>g.width-16&&label.length>2)label=Array.from(label.replace(/…$/,'')).slice(0,-1).join('')+'…';c.fillText(label,g.x,g.y+14);}c.restore();}
