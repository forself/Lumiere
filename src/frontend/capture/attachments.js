// 原始附件保存在本機 IndexedDB；JSON 僅包含雜湊及描述，不上傳。
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('lumiere-capture-files',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onerror=()=>reject(new Error('無法開啟本機附件儲存。'));req.onsuccess=()=>resolve(req.result);});}
export async function putAttachment(hash,file){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,hash);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('附件保存失敗，請檢查瀏覽器儲存空間。'));tx.onabort=tx.onerror;});}finally{db.close();}}
export async function getAttachment(hash){const db=await database();try{return await new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(hash);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('附件讀取失敗。'));});}finally{db.close();}}
export async function putAttachments(files){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');for(const {sha256,file} of files)tx.objectStore('files').put(file,sha256);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new Error('工作包附件未能完整保存；本次交易已取消。'));});}finally{db.close();}}
export async function inspectSource(file){
 if(file.size<1||file.size>10485760)throw new Error('單一來源檔案需小於或等於 10 MB。');
 const data=await file.arrayBuffer(),b=new Uint8Array(data);let mime='';
 if(b[0]===255&&b[1]===216&&b[2]===255)mime='image/jpeg';
 else if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)mime='image/png';
 else if(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')mime='image/webp';
 else if(String.fromCharCode(...b.slice(0,5))==='%PDF-')mime='application/pdf';
 if(!mime)throw new Error('僅接受 JPEG、PNG、WebP 或 PDF 原始附件。');
 let width=0,height=0;if(mime!=='application/pdf'){const image=await createImageBitmap(new Blob([data],{type:mime}));width=image.width;height=image.height;image.close();if(width*height>40000000)throw new Error('照片最多 4000 萬像素。');}
 const digest=await crypto.subtle.digest('SHA-256',data),sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {name:file.name,sha256,bytes:file.size,mime,width,height};
}
