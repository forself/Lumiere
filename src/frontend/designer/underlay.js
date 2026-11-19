export function calibrateUnderlay(underlay,a,b,length){
 if(!Number.isFinite(length)||length<=0||length>100)throw new Error('參考長度須大於 0 且不超過 100 m。');
 const distance=Math.hypot(b.x-a.x,b.z-a.z);if(distance<.02)throw new Error('兩個校準點太接近，請重新選擇。');
 const factor=length/distance,width=underlay.width*factor,x=a.x+(underlay.x-a.x)*factor,z=a.z+(underlay.z-a.z)*factor;
 if(![width,x,z].every(Number.isFinite)||width<.1||width>200||Math.abs(x)>200||Math.abs(z)>200)throw new Error('校準後底圖超出可用範圍。');
 return {...underlay,width,x,z};
}
