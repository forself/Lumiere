"""Exercise the compiled floor walker in Edge using its ordinary editor controls.

Run python tests/station-floor-walk.py with Python Playwright and Edge installed.
By default reports/screenshots go to a fresh temporary directory. Use --evidence
with an explicit directory to retain them. --url may point at the native urban
index.html during development; the offline phase always uses an exported HTML.
"""
import argparse
import contextlib
import copy
import hashlib
import json
import math
import tempfile
import threading
import time
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'demos/east-mall-editable'
STUDY = json.loads((ROOT / 'src/frontend/urban/station/levels.json').read_bytes())


class QuietHTTP(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


@contextlib.contextmanager
def hosted_release():
    handler = partial(QuietHTTP, directory=str(DEMO))
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        job = threading.Thread(target=server.serve_forever, daemon=True)
        job.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}/street-workshop.html'
        finally:
            server.shutdown()
            job.join()


def editor(page):
    frame = page.frame_locator('#station-frame')
    expect(frame.locator('body')).to_have_attribute('data-ready', 'true', timeout=20000)
    return frame


def pose(canvas):
    values = canvas.evaluate('(c) => [c.dataset.walkX,c.dataset.walkY,c.dataset.walkYaw].map(Number)')
    assert all(math.isfinite(v) for v in values), values
    return values


def motion(page, canvas, key, seconds=.24):
    canvas.focus()
    page.keyboard.down(key)
    try:
        page.wait_for_timeout(seconds * 1000)
    finally:
        page.keyboard.up(key)


def inside(canvas, path, points):
    # Independent Canvas 2D winding test on the saved PDF commands (including
    # cubic curves and holes). The renderer/collider uses Three.js polygons.
    return canvas.evaluate("""(c, {commands,points}) => {
        const ctx=document.createElement('canvas').getContext('2d');
        const path=new Path2D();
        for(const [op, ...args] of commands) {
            if(op==='M') path.moveTo(...args);
            if(op==='L') path.lineTo(...args);
            if(op==='C') path.bezierCurveTo(...args);
            if(op==='Z') path.closePath();
        }
        return points.every(([x,y])=>ctx.isPointInPath(path,x,y,'evenodd'));
    }""", {'commands': path, 'points': points})


def entry(page, view, level, part):
    view.locator('#level').select_option(level)
    view.locator('#piece').select_option(part)
    view.locator('#walk-floor').click()
    canvas = view.locator('canvas[tabindex]')
    expect(canvas).to_have_attribute('data-mode', 'walk')
    expect(canvas).to_have_attribute('data-walk-level', level)
    expect(canvas).to_have_attribute('data-walk-piece', part)
    expect(view.locator('#walk-readout')).to_be_visible()
    # Isolate the published floor contour from optional gates, stairs and
    # other solids in the image-based interior.
    style = view.locator('#walk-style')
    if style.is_visible() and style.is_enabled():
        style.select_option('drawing')
    return canvas


def draw_motion(page, canvas, path):
    start = pose(canvas)
    canvas.evaluate("""c => {
        const points=[];
        const listener=new MutationObserver(() => points.push([+c.dataset.walkX,+c.dataset.walkY]));
        listener.observe(c,{attributes:true,attributeFilter:['data-walk-x','data-walk-y']});
        c.ownerDocument.defaultView.finishSample=()=>{listener.disconnect();return points;};
    }""")
    for key in ['w', 'a', 's', 'd']:
        motion(page, canvas, key)
    trace = canvas.evaluate('c=>c.ownerDocument.defaultView.finishSample()')
    assert trace and inside(canvas, path, [start[:2], *trace]), 'Movement outside selected surface'
    distance = max(math.dist(start[:2], p) for p in trace)
    assert distance > .05, 'First-person input did not move the viewpoint'
    return {'maxTravelDrawingPoints': round(distance, 3), 'samplesInsideSelectedPolygon': len(trace)}


def drag(page, canvas, dx):
    box = canvas.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] * .6
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y, steps=3)
    page.mouse.up()


def face(page, canvas, target_x, target_y):
    x, y, yaw = pose(canvas)
    wrap = lambda angle: math.atan2(math.sin(angle), math.cos(angle))
    drag(page, canvas, 30)
    radians_per_pixel = wrap(pose(canvas)[2] - yaw) / 30
    assert abs(radians_per_pixel) > .0001, 'Dragging did not turn the camera'
    target = math.atan2(x - target_x, y - target_y)
    for _ in range(8):
        remaining = wrap(target - pose(canvas)[2])
        if abs(remaining) <= abs(radians_per_pixel) * .65:
            break
        pixels = max(-200, min(200, round(remaining / radians_per_pixel)))
        drag(page, canvas, pixels)
    assert abs(wrap(target - pose(canvas)[2])) < .012


def forward_to(page, canvas, point, tolerance=.8, stop_at_wall=False):
    face(page, canvas, *point)
    canvas.focus()
    start = pose(canvas)[:2]
    direction = [v / math.dist(start, point) for v in (point[0]-start[0], point[1]-start[1])]
    page.keyboard.down('w')
    try:
        prev = start
        stationary = 0
        deadline = time.monotonic() + 14
        while time.monotonic() < deadline:
            page.wait_for_timeout(100)
            now = pose(canvas)[:2]
            if not stop_at_wall and sum((a-b)*d for a,b,d in zip(point, now, direction)) <= tolerance:
                return now
            progress = sum((a-b)*d for a,b,d in zip(now, prev, direction))
            stationary = stationary + 1 if progress < .045 else 0
            if stationary >= 4:
                assert stop_at_wall, ('Unexpected obstruction', start, point, now)
                return now
            prev = now
        raise AssertionError(('Movement did not settle', start, point, now))
    finally:
        page.keyboard.up('w')


def source_aperture(page, canvas, path):
    # Look for an aperture visible from the actual spawn. Use the saved curves
    # with the browser's independent winding implementation as the oracle.
    hit = canvas.evaluate("""(c, commands) => {
        const ctx=document.createElement('canvas').getContext('2d'),rings=[];
        for(const [op,...v] of commands){
            if(op==='M'){rings.push(new Path2D());rings.at(-1).moveTo(...v);}
            if(op==='L')rings.at(-1).lineTo(...v);
            if(op==='C')rings.at(-1).bezierCurveTo(...v);
            if(op==='Z')rings.at(-1).closePath();
        }
        const x=+c.dataset.walkX,y=+c.dataset.walkY;
        const outer=rings.find(r=>ctx.isPointInPath(r,x,y));
        const holes=rings.filter(r=>r!==outer);
        let best=null;
        for(let deg=0;deg<360;deg+=2){
            const angle=deg*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
            for(let step=.5;step<400;step+=.5){
                const u=x+dx*step,v=y+dy*step;
                if(!ctx.isPointInPath(outer,u,v))break;
                if(holes.some(r=>ctx.isPointInPath(r,u,v))){
                    const target=[u+dx*1.5,v+dy*1.5];
                    if(holes.some(r=>ctx.isPointInPath(r,...target))&&(!best||step<best.step))
                        best={edge:[u,v],target,step};
                    break;
                }
            }
        }
        return best;
    }""", path)
    assert hit, 'No line of sight to the public aperture from this spawn'
    stopped = forward_to(page, canvas, hit['target'], stop_at_wall=True)
    assert math.dist(stopped, hit['edge']) < 2 and inside(canvas, path, [stopped])
    assert not inside(canvas, path, [hit['target']])
    return {'sustainedForwardInputStoppedAtCutout': True, 'savedCurveContainmentVerified': True}


def exercise_hole(page, view, temp, actual_model):
    # A local test-only rectangle with a central aperture makes collisions
    # reproducible without publishing or assuming a real passage alignment.
    data = copy.deepcopy(actual_model)
    piece = data['stationStudy']['levels'][0]['pieces'][0]
    piece['path'] = [['M',0,0], ['L',64,0], ['L',64,56], ['L',0,56], ['Z'],
                     ['M',18,20], ['L',18,36], ['L',46,36], ['L',46,20], ['Z']]
    data['stationStudy']['levels'][0]['pieces'] = [piece]
    fixture = temp / 'floor-with-hole.json'
    fixture.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    page.locator('#load').set_input_files(fixture)
    expect(page.locator('#status')).to_contain_text(fixture.name)
    if not page.locator('#station-frame').is_visible():
        page.locator('#station-link').click()
    canvas = entry(page, view, 'B3', piece['id'])
    x, y, _ = pose(canvas)
    # Approach one of the four straight sides on its normal, keeping enough
    # space to test continued forward input rather than stopping at a vertex.
    if y <= 20 or y >= 36:
        axis, edge = 1, 20 if y <= 20 else 36
        if not 21 < x < 43:
            forward_to(page, canvas, [32,y])
        x, y, _ = pose(canvas)
        target = [x,28]
    else:
        axis, edge = 0, 18 if x < 18 else 46
        if not 23 < y < 33:
            forward_to(page, canvas, [x,28])
        x, y, _ = pose(canvas)
        target = [32,y]
    stopped = forward_to(page, canvas, target, stop_at_wall=True)
    assert abs(stopped[axis]-edge) < 3, ('Did not reach hole boundary', stopped, edge)
    assert inside(canvas, piece['path'], [stopped]) and not inside(canvas, piece['path'], [target])
    # Face away from the hole and continue beyond the outer polygon until
    # blocked; both stop coordinates must remain inside the public floor.
    outside = stopped[:]
    sign = math.copysign(1, stopped[axis] - target[axis])
    outside[axis] += 100*sign
    outer_edge = 0 if sign < 0 else (64 if axis==0 else 56)
    outer_stop = forward_to(page, canvas, outside, stop_at_wall=True)
    assert abs(outer_stop[axis]-outer_edge) < 3 and inside(canvas, piece['path'], [outer_stop])
    return {'centralHoleBlocked': True, 'outerEdgeBlocked': True, 'syntheticFixtureOnly': True}


def check_xr(view):
    canvas = view.locator('canvas[tabindex]')
    view.get_by_role('button',name='進入 VR',exact=True).click()
    expect(canvas).to_have_attribute('data-eyes', '2', timeout=18000)
    panel = view.get_by_role('navigation',name='模擬頭顯控制')
    panel.get_by_role('button',name='左轉').click()
    panel.get_by_role('button',name='回正').click()
    panel.get_by_role('button',name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes', '0', timeout=18000)
    expect(canvas).to_have_attribute('data-mode', 'walk')
    return {'device': 'IWER Quest 3', 'stereoViews': 2, 'exitsToFloorWalk': True}


def exercise(browser, url, evidence, temp, report):
    context = browser.new_context(viewport={'width':1260,'height':810}, accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda err: report['pageErrors'].append(str(err)))
    response = page.goto(url.split('#')[0]+'?headset=quest3#station')
    assert response and response.ok
    report['httpDocumentSHA256'] = hashlib.sha256(response.body()).hexdigest()
    view = editor(page)
    for level in STUDY['levels']:
        for piece in level['pieces']:
            view.locator('#single').click()
            canvas = entry(page, view, level['id'], piece['id'])
            result = draw_motion(page,canvas,piece['path'])
            if piece==level['pieces'][0]:
                if level['id']=='B4':
                    report['checks']['httpWalkXR'] = check_xr(view)
                page.screenshot(path=str(evidence/f"floor-walk-{level['id'].lower()}.jpg"), quality=90)
                if level['id']=='B3':
                    report['checks']['publishedConcourseOpening']=source_aperture(page,canvas,piece['path'])
            canvas.focus()
            page.keyboard.press('Escape')
            expect(canvas).to_have_attribute('data-mode','plan')
            report['checks'][level['id']+'_'+piece['id']] = result
    view.locator('#both').click()
    expect(canvas).to_have_attribute('data-mode','overview')
    old = float(view.locator('#x').input_value())
    view.locator('#x').fill(str(old+.1))
    view.locator('#apply').click()
    view.locator('#undo').click()
    assert float(view.locator('#x').input_value())==old
    report['checks']['desktopEditAndUndoAfterWalking'] = True
    with page.expect_download() as saved:
        view.locator('#export-project').click()
    export = temp / 'floor-visit.html'
    saved.value.save_as(export)
    with page.expect_download() as saved:
        view.locator('#save').click()
    official_json = temp / 'baseline.json'
    saved.value.save_as(official_json)
    model = json.loads(official_json.read_bytes())
    assert model['stationStudy']==STUDY
    report['checks']['navigationPreservesAllSourceStationGeometry'] = True
    view.locator('#return-street').click()
    expect(page.locator('#station-link')).to_be_visible()
    page.locator('#station-link').click()
    report['checks']['floorCollisionFixture'] = exercise_hole(page,editor(page),temp,model)
    for level in ['B3','B4']:
        direct=context.new_page()
        direct.on('pageerror',lambda err: report['pageErrors'].append(str(err)))
        direct.goto(url.split('#')[0]+'#'+level.lower()+'-walk')
        fr=editor(direct)
        cv=fr.locator('canvas[tabindex]')
        expect(cv).to_have_attribute('data-mode','walk',timeout=15000)
        expect(cv).to_have_attribute('data-walk-level',level)
        if level=='B3':
            direct.close()
    fr.locator('#level').select_option('B3')
    expect(cv).to_have_attribute('data-walk-level','B3')
    fr.locator('#piece').select_option(STUDY['levels'][0]['pieces'][1]['id'])
    expect(cv).to_have_attribute('data-walk-piece',STUDY['levels'][0]['pieces'][1]['id'])
    expect(cv).to_have_attribute('data-mode','walk')
    report['checks']['directWalkLinksAndInWalkFloorSelection']=True
    context.close()
    offline = browser.new_context(offline=True, viewport={'width':1120,'height':800})
    page = offline.new_page()
    requests = []
    page.on('request', lambda r: requests.append(r.url) if r.url.startswith(('http://','https://')) else None)
    page.on('pageerror',lambda err: report['pageErrors'].append(str(err)))
    page.goto(export.as_uri()+'?headset=quest3#station')
    view = editor(page)
    p = STUDY['levels'][1]['pieces'][0]
    canvas = entry(page,view,'B4',p['id'])
    report['checks']['offlinePlatformWalk'] = draw_motion(page,canvas,p['path'])
    report['checks']['offlineWalkXR'] = check_xr(view)
    view.locator('#walk-floor').click()
    expect(canvas).to_have_attribute('data-mode','overview')
    assert not requests, requests
    report['checks']['offlineHTTPRequests'] = len(requests)
    offline.close()
    assert not report['pageErrors'], report['pageErrors']


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--url', help='hosted street workshop HTML URL without query/fragment')
    args.add_argument('--evidence',type=Path,help='persist report and screenshots in this directory')
    options = args.parse_args()
    out = options.evidence or Path(tempfile.mkdtemp(prefix='lumiere-floor-walk-evidence-'))
    out.mkdir(parents=True, exist_ok=True)
    report = {'utc': datetime.now(timezone.utc).isoformat(), 'checks': {}, 'pageErrors': [], 'physicalHeadset':False}
    try:
        with tempfile.TemporaryDirectory() as temp, hosted_release() as default, sync_playwright() as driver:
            browser = driver.chromium.launch(channel='msedge', args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            report['browser']='Microsoft Edge '+browser.version
            try:
                exercise(browser, options.url or default, out, Path(temp), report)
            finally:
                browser.close()
        report['status']='passed'
    except Exception as ex:
        report.update(status='failed',error=str(ex)[:1500])
        raise
    finally:
        dest = out/'station-floor-walk-test.json'
        dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(dest, report['status'])


if __name__=='__main__':
    main()
