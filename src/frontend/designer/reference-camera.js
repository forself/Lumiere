export function validateReferenceCamera(p){
 if(!p||p.format!=='lumiere-reference-camera'||p.version!==1)throw new Error('比對相機格式不符。');
 for(const k of ['width','height','focal','cx','cy'])if(!Number.isFinite(p[k]))throw new Error('相機參數必須為有限數值。');
 if(p.width<1||p.height<1||p.width>8192||p.height>8192||p.focal<50||p.focal>20000||Math.abs(p.cx)>p.width*2||Math.abs(p.cy)>p.height*2)throw new Error('相機參數超出範圍。');
 for(const k of ['position','target'])if(!Array.isArray(p[k])||p[k].length!==3||!p[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=200))throw new Error('相機位置無效。');
 if(Math.hypot(...p.position.map((v,i)=>v-p.target[i]))<.01)throw new Error('觀察方向不能為零。');
 return {format:p.format,version:1,width:p.width,height:p.height,focal:p.focal,cx:p.cx,cy:p.cy,position:[...p.position],target:[...p.target]};
}
export function applyReferenceProjection(camera,p,w,h){const scale=Math.min(w/p.width,h/p.height),cx=(w-p.width*scale)/2+p.cx*scale,cy=(h-p.height*scale)/2+p.cy*scale;camera.fov=2*Math.atan(h/(2*p.focal*scale))*180/Math.PI;camera.aspect=w/h;camera.setViewOffset(w,h,w/2-cx,h/2-cy,w,h);camera.updateProjectionMatrix();}
