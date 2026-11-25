"""Check the served models, actual projected tread motion and individual GPU draw calls.

Requires Python Playwright, Pillow and Microsoft Edge. By default the test serves
the release on a temporary local HTTP port and writes to a temporary directory.
"""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
floor_module = importlib.util.spec_from_file_location('floor_walk', Path(__file__).with_name('station-floor-walk.py'))
walk = importlib.util.module_from_spec(floor_module)
floor_module.loader.exec_module(walk)

GEOMETRY_CHECK = """async () => {
    const packed = Boolean(document.querySelector('#station-editor-data'));
    const prefix = packed ? 'lumiere-offline/station/' : './station/';
    const T = await import(packed ? 'lumiere-offline/node_modules/three/build/three.module.js' : 'three');
    const {createStationAppearance} = await import(prefix+'appearance.js');
    const {createStreetEntryKit} = await import(prefix+'street-entry.js');
    const expect = (test, why) => { if (!test) throw Error(why); };
    const renderer = new T.WebGLRenderer({antialias:false});
    renderer.setSize(240,160,false);
    const scene = new T.Scene(), matrix = new T.Matrix4();
    const camera = new T.PerspectiveCamera(70,1.5,.01,150);
    scene.add(new T.HemisphereLight(0xffffff,0xbbbbbb,1.7));
    const cases = [
        ['B4',createStationAppearance('B4'),[1]],
        ['exit-default',createStreetEntryKit(),[1,-1]],
        ['exit-short-steep',createStreetEntryKit({steps:8,rise:8,treadDepth:.2}),[1,-1]],
        ['exit-long-shallow',createStreetEntryKit({steps:96,rise:2.4,treadDepth:.45}),[1,-1]]
    ];
    const report = {poses:0, phaseSamples:0, triangleRays:0, carriers:[]};
    try {
        for (const [kind,kit,directions] of cases) {
            expect(kit.escalators.length===directions.length,kind+' machine count');
            for (const [index,e] of kit.escalators.entries()) {
                expect(e.direction===directions[index],kind+' direction');
                const entry = kit.objects.find(o=>o.id===e.objectId);
                expect(entry && !entry.solid,kind+' stationary body blocking boarding');
                const tread = entry.mesh.getObjectByName('moving-treads');
                expect(tread?.isInstancedMesh,kind+' instance batch');
                const buffer = tread.instanceMatrix.array, geometry = tread.geometry, material = tread.material;
                let trackedStep;
                for (let frame=0;frame<53;frame++) {
                    const old=e.phase,dt=.0137;
                    const middle=Math.floor(tread.count/2);
                    tread.getMatrixAt(middle,matrix);
                    const oldZ=matrix.elements[14],oldY=matrix.elements[13];
                    e.update(dt);
                    const progress=T.MathUtils.euclideanModulo((e.phase-old)*e.direction,e.pitch);
                    expect(Math.abs(progress-e.speed*dt)<1e-7,kind+' direction or speed');
                    if (Math.abs(e.phase-old)<e.pitch/2) {
                        tread.getMatrixAt(middle,matrix);
                        const dz=matrix.elements[14]-oldZ,dy=matrix.elements[13]-oldY;
                        expect(Math.abs(dz+e.direction*e.speed*dt)<.00001 && dy*e.direction>0,kind+' physical tread direction');
                        if(!trackedStep)trackedStep={intervalSeconds:dt,localZTravelMetres:dz,verticalTravelMetres:dy};
                    }
                    expect(buffer===tread.instanceMatrix.array && geometry===tread.geometry && material===tread.material,kind+' allocations');
                    expect(e.heightAt(0)===0 && e.heightAt(e.run)===e.rise,kind+' endpoints');
                    for (let i=0;i<tread.count;i++) {
                        tread.getMatrixAt(i,matrix);
                        const d=-matrix.elements[14], y=matrix.elements[13], depth=matrix.elements[10];
                        if (depth<.001) continue;
                        expect(Math.abs(y-e.heightAt(d))<1e-5,kind+' feet differ from tread');
                        expect(d-depth/2>=-1e-5 && d+depth/2<=e.run+1e-5,kind+' comb clipping');
                        report.poses++;
                    }
                    report.phaseSamples++;
                }
                entry.mesh.updateMatrixWorld(true);
                for (let d=.3111;d<e.run;d+=.80) {
                    const eye=entry.mesh.localToWorld(new T.Vector3(.014,e.rise+2,-d));
                    const hit=new T.Raycaster(eye,new T.Vector3(0,-1,0)).intersectObject(tread,false)[0];
                    expect(hit && Math.abs(hit.point.y-entry.mesh.position.y-e.heightAt(d))<.0051,kind+' no supported tread at '+d);
                    if (kind==='exit-long-shallow' && index===0 && Math.abs(d-5.9111)<1e-6)
                        report.closedTreadJoint={case:kind,id:e.objectId,
                            firstObserved:'An earlier development run missed the downward ray where the tread base covered 99% of the step pitch.',
                            fix:'Extend the metal base across the full pitch; retain the dark separation in the top finish.',
                            distanceFromLowerCombMetres:d,phaseMetres:e.phase,verticalRayHit:true,
                            actualMetalHeightMetres:hit.point.y-entry.mesh.position.y,
                            riderHeightMetres:e.heightAt(d)};
                    report.triangleRays++;
                }
                // Render precisely this production tread assembly to get its draw calls.
                scene.add(tread);
                camera.position.set(3,e.rise/2+2,-e.run/2+5);
                camera.lookAt(0,e.rise/2,-e.run/2);
                renderer.render(scene,camera);
                const draws=renderer.info.render.calls;
                expect(draws===1,kind+' drew '+draws+' tread batches');
                report.carriers.push({case:kind,id:e.objectId,direction:e.direction,run:e.run,rise:e.rise,
                    horizontalSpeed:e.speed,nominalRideSeconds:e.run/e.speed,treadInstances:tread.count,
                    movingTreadDrawCalls:draws,trianglesRendered:renderer.info.render.triangles,trackedStep});
                entry.mesh.add(tread);
            }
        }
        expect(report.closedTreadJoint,'Missing the first-failure joint regression');
        return report;
    } finally {
        const resources=new Set();
        for (const [,kit] of cases) {
            if(kit.floorMap) resources.add(kit.floorMap);
            for (const item of kit.objects) item.mesh.traverse(node=>{
                if(node.isInstancedMesh)node.dispose();
                if(node.geometry)resources.add(node.geometry);
                for(const mat of [].concat(node.material??[])) {
                    resources.add(mat);
                    for(const value of Object.values(mat))if(value?.isTexture)resources.add(value);
                }
            });
        }
        for(const resource of resources)resource.dispose();
        renderer.dispose();
    }
}"""


def changed_pixels(first, second, region):
    a, b = first.crop(region), second.crop(region)
    # Ignore tiny antialiasing differences; one changed pixel must differ visibly.
    red, green, blue = ImageChops.difference(a, b).split()
    strongest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    return sum(strongest.histogram()[13:])


def visible_motion(canvas, out, moving=True):
    # Fixed camera, no keyboard input. In the mall-side view the stationary center
    # stair is flanked by moving machines. Compare only the central camera area.
    style = 'nav,footer,#walk-map{visibility:hidden!important}'
    def snapshot():
        return Image.open(io.BytesIO(canvas.screenshot(style=style))).convert('RGB')
    first = snapshot()
    w,h = first.size
    start = canvas.evaluate("c=>[c.dataset.walkX,c.dataset.walkY,c.dataset.walkYaw,c.dataset.walkElevation]")
    left = (int(.02*w),int(.35*h),int(.40*w),int(.92*h))
    right = (int(.60*w),int(.35*h),int(.98*w),int(.92*h))
    for _ in range(8 if moving else 3):
        canvas.evaluate("()=>new Promise(r=>setTimeout(r,137))")
        second = snapshot()
        a,b = changed_pixels(first,second,left),changed_pixels(first,second,right)
        if moving and min(a,b)>50:
            break
        if not moving:
            assert max(a,b)<20, f'Previous release already moves the camera or tread: {a}, {b}'
    end = canvas.evaluate("c=>[c.dataset.walkX,c.dataset.walkY,c.dataset.walkYaw,c.dataset.walkElevation]")
    assert end==start, 'The camera moved during the two observations'
    if moving:
        assert min(a,b)>50, f'No simultaneous visible tread motion on both sides: {a}, {b}'
    def crop_image(image):
        return image.crop((0,int(h*.33),w,int(h*.79))).resize((640,round(h*.46*640/w)))
    a_view,b_view = crop_image(first),crop_image(second)
    result = Image.new('RGB',(a_view.width*2+3,a_view.height),(245,245,245))
    result.paste(a_view,(0,0));result.paste(b_view,(a_view.width+3,0))
    filename='escalator-stationary-camera.jpg' if moving else 'escalator-static-before.jpg'
    result.save(out/filename,quality=93)
    return {'stationaryPose':start,'changedPixelsLeft':a,'changedPixelsRight':b,
            'thresholdPerChannel':12,'viewportPixels':[w,h],'cropLeft':left,'cropRight':right}

def record_workshop_canvas(canvas, out):
    # captureStream reads the real renderer framebuffer without UI overlays.
    recording=canvas.evaluate("""async c=>{
        const stream=c.captureStream(20);
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1400000});
        const chunks=[], start=performance.now();
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        try {
            const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error);});
            recorder.start();
            await new Promise(resolve=>setTimeout(resolve,3400));
            recorder.stop();
            await stopped;
            const duration=performance.now()-start;
            const reader=new FileReader();
            const url=new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;});
            reader.readAsDataURL(new Blob(chunks,{type:recorder.mimeType}));
            return {data:await url,duration,codec:recorder.mimeType};
        } finally { for(const track of stream.getTracks()) track.stop(); }
    }""")
    file=out/'escalator-moving-treads.webm'
    file.write_bytes(base64.b64decode(recording['data'].split(',',1)[1]))
    assert file.stat().st_size>10000,'Missing frames in actual canvas capture'
    return {'file':file.name,'bytes':file.stat().st_size,'captureSeconds':recording['duration']/1000,
            'codec':recording['codec']}

@contextmanager
def serve_previous(path):
    with tempfile.TemporaryDirectory() as directory:
        shutil.copyfile(path,Path(directory)/'workshop.html')
        handler=partial(walk.QuietHTTP,directory=directory)
        with ThreadingHTTPServer(('127.0.0.1',0),handler) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                yield f'http://127.0.0.1:{server.server_port}/workshop.html'
            finally:
                server.shutdown()
                thread.join()


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--url')
    args.add_argument('--before',type=Path,help='Reproduce static treads using an earlier saved workshop HTML')
    args.add_argument('--evidence',type=Path)
    opt = args.parse_args()
    out = opt.evidence or Path(tempfile.mkdtemp(prefix='lumiere-escalator-geometry-'))
    out.mkdir(parents=True,exist_ok=True)
    report = {'utc':datetime.now(timezone.utc).isoformat(),'checks':{},'pageErrors':[]}
    try:
        with walk.hosted_release() as default, sync_playwright() as pw:
            browser=pw.chromium.launch(channel='msedge',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            try:
                page=browser.new_page(viewport={'width':1440,'height':820},device_scale_factor=1)
                page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
                if opt.before:
                    with serve_previous(opt.before.resolve()) as url:
                        baseline=page.goto(url+'#mall-stairs')
                        prev_canvas=walk.editor(page).locator('canvas').first
                        expect(prev_canvas).to_have_attribute('data-walk-level','dinghao-exit14')
                        report['priorStaticRelease']={'sha256':hashlib.sha256(baseline.body()).hexdigest(),
                            'stationaryCamera':visible_motion(prev_canvas,out,moving=False)}
                response=page.goto((opt.url or default).split('#')[0]+'#mall-stairs')
                report['httpDocumentSHA256']=hashlib.sha256(response.body()).hexdigest()
                report['browser']='Microsoft Edge '+browser.version
                canvas=walk.editor(page).locator('canvas').first
                expect(canvas).to_have_attribute('data-walk-level','dinghao-exit14')
                report['checks']['carrierGeometry']=page.evaluate(GEOMETRY_CHECK)
                report['checks']['stationaryCamera']=visible_motion(canvas,out)
                report['checks']['recordedMotion']=record_workshop_canvas(canvas,out)
                assert not report['pageErrors'], report['pageErrors']
            finally:
                browser.close()
        report['status']='passed'
    except Exception as error:
        report.update(status='failed',error=str(error)[:1000])
        raise
    finally:
        dest=out/'escalator-geometry-test.json'
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(dest,report.get('status'))


if __name__=='__main__':
    main()
