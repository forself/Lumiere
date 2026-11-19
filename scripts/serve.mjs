import http from 'node:http';
import {readFile, stat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.LUMIERE_PORT || 8137);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary','.hdr':'application/octet-stream','.wasm':'application/wasm'};
const allowed = ['/src/frontend/', '/definitions/', '/lib/ui_components/', '/lib/page-generator/', '/lib/custom_components/', '/node_modules/three/', '/node_modules/three-mesh-bvh/', '/node_modules/three-gpu-pathtracer/', '/node_modules/web-ifc/'];
const server = http.createServer(async (req,res) => {
  try {
    const html = await readFile(path.join(root,'src/frontend/index.html'),'utf8');
    const importmaps = [...html.matchAll(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${importmaps}; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src https://www.youtube-nocookie.com; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'none'`);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), xr-spatial-tracking=(self)');
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405, {'Allow':'GET, HEAD'});res.end('Method not allowed');return;}
    let pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/'){res.writeHead(302,{Location:'/src/frontend/index.html'});res.end();return;}
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(!allowed.some(prefix=>pathname.startsWith(prefix)) || pathname.includes('\\') || pathname.split('/').some(s=>s.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
    const target=path.resolve(root,'.'+pathname);
    if(!target.toLowerCase().startsWith((root+path.sep).toLowerCase())){res.writeHead(404);res.end('Not found');return;}
    const resolved=await realpath(target);
    if(!resolved.toLowerCase().startsWith((root+path.sep).toLowerCase()) || !(await stat(resolved)).isFile()){res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(resolved);
    res.writeHead(200, {'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Length':data.length});
    res.end(req.method==='HEAD'?undefined:data);
  } catch(error) {
    if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain; charset=utf-8'});
    res.end(error.code==='ENOENT'?'Not found':'Preview unavailable');
  }
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/src/frontend/index.html`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
