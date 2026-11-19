import {applyBuildingCommand,validateBuilding} from './building-model.js';
export const SCHOOL_MODULES={classroom:'標準教室（8 × 7 m）',computer:'電腦教室（9 席，8 × 7 m）',guard:'警衛室（4 × 3 m）',restroom:'廁所配置起稿（6 × 4 m）',corridor:'封閉走廊（12 × 2.5 m）'};
export function insertSchoolModule(building,{kind,x,z}){
 if(!Object.hasOwn(SCHOOL_MODULES,kind))throw Error('校園範本未登錄。');
 const [width,depth]=({classroom:[8,7],computer:[8,7],guard:[4,3],restroom:[6,4],corridor:[12,2.5]})[kind];
 let b=building;const run=c=>{b=applyBuildingCommand(b,c);},design=()=>b.levels.find(l=>l.id===b.activeLevelId).design;
 run({type:'addRoom',x,z,width,depth});const roomId=design().rooms.at(-1).id,wallIds=design().rooms.at(-1).wallIds;
 const opening=(wall,kind,at,w,h,sill=0)=>{run({type:'addOpening',wallId:wallIds[wall],kind,at});const id=design().openings.at(-1).id;run({type:'dimensions',id,width:w,height:h,sill});if(kind==='door')run({type:'toggleOpening',id});};
 opening(2,'door',.25,kind==='corridor'?1.5:1.1,2.1);
 if(kind==='corridor'){opening(0,'door',.75,1.5,2.1);opening(0,'window',.3,3,1.2,.9);}else{opening(['classroom','computer'].includes(kind)?3:0,'window',.5,Math.min(3,width*.55),kind==='restroom'?.6:1.2,kind==='restroom'?1.5:.9);opening(1,'window',.5,Math.min(2,depth*.5),1.2,.9);}
 const put=(assetId,dx,dz,rotation=0,elevation=null)=>{run({type:'addObject',assetId,x:x+dx,z:z+dz});const id=design().objects.at(-1).id;if(elevation!==null){const o=design().objects.at(-1);run({type:'dimensions',id,width:o.width,depth:o.depth,height:o.height,elevation});}for(let i=0;i<rotation/90;i++)run({type:'rotateObject',id});return id;};
 const computer=(dx,dz,height)=>{put('computer-monitor',dx,dz-.16,180,height);put('computer-keyboard',dx-.05,dz+.14,0,height);put('computer-mouse',dx+.28,dz+.14,0,height);put('computer-tower',dx+.37,dz);};
 if(kind==='computer'){for(let row=0;row<3;row++)for(let col=0;col<3;col++){const dx=1.4+col*2.4,dz=2.2+row*1.5;put('computer-desk',dx,dz);put('student-chair',dx,dz+.65);computer(dx,dz,.75);}put('blackboard',4,.17,180);put('teacher-desk',4,1);computer(4,1,.9);}
 if(kind==='classroom'){for(let row=0;row<3;row++)for(let col=0;col<4;col++){put('student-desk',1.2+col*1.7,2.4+row*1.35);put('student-chair',1.2+col*1.7,2.95+row*1.35);}put('blackboard',4,.17,180);put('teacher-desk',4,1);computer(4,1,.9);put('school-lockers',.4,5.7,90);}
 if(kind==='guard'){put('teacher-desk',1.2,1.1);put('student-chair',1.2,1.7);put('school-lockers',3.5,.6);}
 if(kind==='restroom'){put('wash-trough',1.5,.45);put('toilet',3.1,.6);put('toilet',4.6,.6);put('urinal',5.75,2.5,90);}
 if(kind==='corridor'){put('notice-board',4,depth-.25);put('school-bench',8,depth-.4);}
 b=structuredClone(b);b.levels.find(l=>l.id===b.activeLevelId).design.rooms.find(r=>r.id===roomId).name=SCHOOL_MODULES[kind].split('（')[0];return {building:validateBuilding(b),roomId};
}
