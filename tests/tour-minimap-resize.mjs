import assert from 'node:assert/strict';
import {TourViewport} from '../src/frontend/tour/TourViewport.js';
import {sampleProject} from '../src/frontend/designer/model.js';

const plan=new TourViewport({mode:'plan'}),rect={width:280,height:198};
Object.assign(plan,{project:sampleProject(),canvas:{},context:{setTransform(){}},element:{getBoundingClientRect:()=>rect},invalidate(){}});
const previousRatio=globalThis.devicePixelRatio;
try{
 globalThis.devicePixelRatio=1;plan.resize();
 rect.width=180;rect.height=128;plan.resize();
 for(const p of plan.project.vertices){const screen=plan.screen(p);assert(screen.x>=0&&screen.x<=rect.width);assert(screen.y>=0&&screen.y<=rect.height);}
 plan.zoom*=1.5;const zoom=plan.zoom;plan.resize();assert.equal(plan.zoom,zoom,'unchanged size preserves manual minimap zoom');
 rect.width=1;rect.height=1;plan.resize();rect.width=280;rect.height=198;plan.resize();
 for(const p of plan.project.vertices){const screen=plan.screen(p);assert(screen.x>=0&&screen.x<=rect.width);assert(screen.y>=0&&screen.y<=rect.height);}
}finally{if(previousRatio===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previousRatio;}
console.log('PASS tour minimap: responsive size changes reframe the whole plan; unchanged dimensions preserve manual zoom; hidden/revealed resize recovers.');
