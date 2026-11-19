// Isolated HTTP preview of exactly one exported artifact, never a file browser.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [file,portText='8141']=process.argv.slice(2),port=Number(portText);
if(!file||path.extname(file).toLowerCase()!=='.html'||!Number.isInteger(port)||port<1024||port>65535)throw new Error('使用：node scripts/preview-standalone.mjs 匯出檔.html [連接埠]');
const html=await readFile(file);if(html.length>160*1024*1024||!html.includes(Buffer.from('lumiere-standalone-payload')))throw new Error('不是有效大小的獨立導覽 HTML。');
const hash=createHash('sha256').update(html).digest('hex');
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname!=='/'&&url.pathname!=='/scene.html'){console.log('REFUSED '+url.pathname);res.writeHead(404);res.end();return;}
 console.log('HTML '+req.method+' '+url.pathname);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length});res.end(req.method==='HEAD'?undefined:html);
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:'http://127.0.0.1:'+port+'/scene.html',onlyArtifact:path.resolve(file),bytes:html.length,sha256:hash})));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
