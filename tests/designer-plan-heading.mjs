import assert from 'node:assert/strict';
import {DesignViewport} from '../src/frontend/designer/DesignViewport.js';

const paths=[],arcs=[],timers=new Map();let path=[],clears=0,redraws=0,timer=0;
const saved={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,document:globalThis.document};
try{
 globalThis.setTimeout=callback=>{timers.set(++timer,callback);return timer;};globalThis.clearTimeout=id=>timers.delete(id);globalThis.document={hidden:false};
 const plan=new DesignViewport({mode:'plan'});
 Object.assign(plan,{width:500,height:360,center:{x:4,z:-2},zoom:30,building:{activeLevelId:'floor-1'},positionContext:{clearRect(){clears++;},save(){},restore(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},arc(...args){arcs.push(args);},fill(){if(path.length)paths.push({points:path,alpha:this.globalAlpha});},fillText(){}},invalidate(){redraws++;}});
 const point={x:6,z:-1,levelId:'floor-1',levelName:'一樓'};
 const close=(actual,expected)=>actual.forEach((n,i)=>assert(Math.abs(n-expected[i])<1e-8,`${actual} != ${expected}`));
 for(const [heading,expected] of [[0,[310,185]],[Math.PI/2,[335,210]],[Math.PI,[310,235]],[-Math.PI/2,[285,210]]]){
  paths.length=0;plan.setWalkPosition({...point,heading});assert.equal(paths.length,2);close(paths[0].points[0],expected);assert.equal(timers.size,1,'turning reuses the existing blink timer');
 }
 assert.equal(redraws,0,'turning the arrow redraws only the position overlay');
 const unchanged=clears;plan.setWalkPosition({...point,heading:-Math.PI/2});assert.equal(clears,unchanged,'an unchanged heading and position do not repaint');
 // 平移與縮放改變位置投影，不改變面向或箭頭的可讀尺寸。
 plan.center={x:5,z:-3};plan.zoom=60;paths.length=0;plan.drawWalkPosition();close(paths[0].points[0],[285,300]);
 plan.positionBright=false;paths.length=0;plan.drawWalkPosition();assert(paths.every(p=>p.alpha===1),'the facing arrow stays visible during the dot blink');
 // 非數值方位忽略，但有效位置仍顯示；舊版呼叫保留原本紅點。
 for(const heading of [NaN,Infinity,-Infinity,'1']){paths.length=0;plan.setWalkPosition({...point,heading});assert.equal(paths.length,0);assert(!Object.hasOwn(plan.walkPosition,'heading'));}
 paths.length=0;plan.setWalkPosition({...point,heading:0});assert.equal(paths.length,2);plan.setWalkPosition(point);assert(!Object.hasOwn(plan.walkPosition,'heading'));
 assert(arcs.length>0);plan.setWalkPosition({x:NaN,z:0,heading:0});assert.equal(plan.walkPosition,null);assert.equal(timers.size,0);
 plan.reducePositionMotion=true;plan.setWalkPosition({...point,heading:Math.PI/2});assert.equal(timers.size,0,'reduced motion retains the marker without a blink timer');plan.setWalkPosition(null);
}finally{for(const[key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
console.log('PASS plan heading: transformed cardinal bearings, heading-only overlay updates, stable arrow during blinking, invalid-angle handling, legacy markers and reduced-motion lifecycle.');
