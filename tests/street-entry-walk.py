"""Run the Exit 14 walk in the served workshop and its exported offline HTML.

python tests/street-entry-walk.py --evidence demos/east-mall-editable
Pass --before old-street-workshop.html to include a previous release in the
regression report. Requires Playwright for Python and Microsoft Edge.
"""
import argparse
import contextlib
import hashlib
import importlib.util
import json
import math
import sys
import tempfile
import threading
from datetime import datetime, timezone
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
floor_module = importlib.util.spec_from_file_location('floor_walk', Path(__file__).with_name('station-floor-walk.py'))
walk = importlib.util.module_from_spec(floor_module)
floor_module.loader.exec_module(walk)

LOWER = 'mall-stairs'
UPPER = 'street-stairs'
SIGN = 'exit14-canopy-sign'
# Expected local model dimensions for the supplied release, not on-site surveys.
PORCH_HEIGHT = 4.95
SIDEWALK_HEIGHT = 4.35


@contextlib.contextmanager
def serve_file(path):
    handler = partial(walk.QuietHTTP, directory=str(path.parent))
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}/{path.name}'
        finally:
            server.shutdown()
            thread.join()


def target_url(url, end):
    return url.partition('#')[0].partition('?')[0] + '?headset=quest3#' + end


def arrival(page, url, end):
    if page.url != 'about:blank':
        page.goto('about:blank')
    response = page.goto(target_url(url, end))
    if url.startswith('http'):
        assert response and response.ok, 'The workshop document did not load over HTTP'
    expect(page.locator('#station-frame')).to_be_visible(timeout=10000)
    view = walk.editor(page)
    canvas = view.locator('canvas[tabindex]')
    expect(canvas).to_have_attribute('data-mode', 'walk', timeout=10000)
    expect(canvas).to_have_attribute('data-walk-level', 'dinghao-exit14')
    expect(canvas).to_have_attribute('data-walk-surface', 'floor' if end == LOWER else 'landing')
    expect(view.locator('#appearance-editor')).to_be_visible()
    expected = 0 if end == LOWER else SIDEWALK_HEIGHT
    actual = float(canvas.get_attribute('data-walk-elevation'))
    assert abs(actual - expected) < .015, (end, expected, actual)
    return view, canvas, response


def begin_trace(canvas):
    canvas.evaluate("""element => {
        const samples = [];
        function record() {
            const v = element.dataset;
            samples.push([Number(v.walkX), Number(v.walkY), Number(v.walkElevation), v.walkSurface]);
        }
        record();
        const observer = new MutationObserver(record);
        observer.observe(element, {attributes:true,attributeFilter:[
          'data-walk-x','data-walk-y','data-walk-elevation','data-walk-surface']});
        element.ownerDocument.defaultView.endStreetTrace = () => {observer.disconnect();record();return samples;};
    }""")


def continuous_crossing(page, canvas, upward, key='w'):
    """Move by keyboard while the frame observer records the actual renderer pose."""
    expected = SIDEWALK_HEIGHT if upward else 0
    canvas.focus()
    begin_trace(canvas)
    page.keyboard.down(key)
    try:
        canvas.evaluate("""(c, {target,surface}) => new Promise((resolve,reject) => {
            const end = performance.now() + 25000;
            function check() {
                const v = c.dataset;
                if (Math.abs(Number(v.walkElevation)-target)<.015 && v.walkSurface===surface) return resolve();
                if (performance.now()>end) return reject(Error('Did not reach the destination floor: '+JSON.stringify(v)));
                requestAnimationFrame(check);
            }
            check();
        })""", {'target':expected, 'surface':'landing' if upward else 'floor'})
    finally:
        page.keyboard.up(key)
    trace = canvas.evaluate('e => e.ownerDocument.defaultView.endStreetTrace()')
    heights = [row[2] for row in trace]
    peak = max(heights)
    assert abs(peak - PORCH_HEIGHT) < .015, f'Raised porch was missed: peak {peak}'
    assert abs(heights[-1] - expected) < .015
    peak_at = heights.index(peak)
    assert all(a <= b+.002 for a,b in zip(heights[:peak_at], heights[1:peak_at+1])), 'Height reversed before porch'
    assert all(a >= b-.002 for a,b in zip(heights[peak_at:], heights[peak_at+1:])), 'Height reversed after porch'
    assert len(set(heights)) >= 15, 'Camera did not record a gradual stair traversal'
    assert math.dist(trace[0][:2], trace[-1][:2]) > 8, 'Camera elevated without traversing the model'
    surfaces = [row[3] for row in trace]
    assert all(s in surfaces for s in ['floor','stairs','landing']), set(surfaces)
    max_change = max(abs(a-b) for a,b in zip(heights, heights[1:]))
    assert max_change < .52, f'Discontinuous elevation change: {max_change}'
    return {
        'sampleCount': len(trace), 'startHeightMetres': heights[0], 'porchHeightMetres': peak,
        'endHeightMetres': heights[-1], 'maximumSampleDeltaMetres': round(max_change,3),
        'surfaceOrder': [s for i,s in enumerate(surfaces) if i==0 or s!=surfaces[i-1]],
    }


def rail_collision(page, canvas):
    canvas.focus()
    page.keyboard.down('w')
    try:
        canvas.evaluate("""c => new Promise((resolve,reject) => {
          const t=performance.now()+10000;
          function sample(){
            if(+c.dataset.walkElevation>=.8 && c.dataset.walkSurface==='stairs')return resolve();
            if(performance.now()>t)return reject(Error('Did not reach interior steps'));
            requestAnimationFrame(sample);
          }sample();
        })""")
    finally:
        page.keyboard.up('w')
    # The lower entrance faces the central rail on its left hand side.
    # Strafe to the rail, keep pushing, and then release and move away.
    start = walk.pose(canvas)
    elevation = float(canvas.get_attribute('data-walk-elevation'))
    walk.motion(page, canvas, 'a', 1.25)
    stopped = walk.pose(canvas)
    walk.motion(page, canvas, 'a', .8)
    held = walk.pose(canvas)
    walk.motion(page, canvas, 'd', .23)
    released = walk.pose(canvas)
    assert math.dist(stopped[:2],held[:2]) < .035, ('Could cross the center rail',stopped,held)
    assert math.dist(released[:2],held[:2]) > .03, 'Strafe away was unexpectedly blocked'
    assert float(canvas.get_attribute('data-walk-elevation')) == elevation, 'Strafe changed floor elevation'
    return {'blockedUnderContinuedInput':True, 'couldBackAway':True,
            'lateralTravelBeforeStopMetres':round(math.dist(start[:2],stopped[:2])*.2,3)}


def sidewalk_visit(page,canvas,out):
    start = walk.pose(canvas)
    # Start at street level facing the public entrance, then walk along the
    # pavement toward the tree well. The camera's common floor unit is 0.20 m.
    walk.motion(page,canvas,'d',2.4)
    stop = walk.pose(canvas)
    distance = math.dist(start[:2],stop[:2])*.2
    assert 4.55 < distance < 5.35, ('Tree well or sidewalk width differs',distance)
    walk.motion(page,canvas,'d',.5)
    assert math.dist(stop[:2],walk.pose(canvas)[:2])<.035, 'Street obstacle is permeable'
    assert abs(float(canvas.get_attribute('data-walk-elevation'))-SIDEWALK_HEIGHT)<.015
    # Cross the available width to the opposite shop arcade. Keep pushing
    # against its front column and then look back toward the entrance and curb.
    walk.motion(page,canvas,'s',.7)
    walk.motion(page,canvas,'a',4)
    arcade = walk.pose(canvas)
    across = math.dist(arcade[:2],stop[:2])*.2
    assert 8.15 < across < 9.25, ('Could not cross between tree well and arcade',across)
    walk.motion(page,canvas,'a',.4)
    assert math.dist(arcade[:2],walk.pose(canvas)[:2])<.035,'Could cross the arcade column'
    # Move clear of the column before taking the oblique facade photograph.
    walk.motion(page,canvas,'d',.16)
    target = [start[0]-math.sin(start[2])*18,start[1]-math.cos(start[2])*18]
    walk.face(page,canvas,*target)
    page.screenshot(path=str(out/'exit14-sidewalk-angle.jpg'),quality=89)
    walk.editor(page).locator('#entry-top').click()
    walk.motion(page,canvas,'d',2.3)
    tree = walk.pose(canvas)
    span = math.dist(tree[:2], start[:2])
    road_target = [tree[0]-math.sin(start[2])*30+(tree[0]-start[0])*12/span,
                   tree[1]-math.cos(start[2])*30+(tree[1]-start[1])*12/span]
    walk.face(page,canvas,*road_target)
    box=canvas.bounding_box()
    x,y=box['x']+box['width']/2,box['y']+box['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+88,steps=4);page.mouse.up()
    page.screenshot(path=str(out/'exit14-curb-road.jpg'),quality=89)
    return {'toTreeWellMetres':round(distance,3), 'treeWellToArcadeMetres': round(across,3),
            'continuedStrafeStoppedAtTreeWellAndColumn':True,'stayedOnSidewalk':True}


def choose_sign(view):
    view.locator('#appearance-group').select_option(label='雨棚與標誌')
    view.locator('#appearance-object').select_option(SIGN)
    return view.locator('#appearance-x')


def saved_files(page, view, temp):
    field = choose_sign(view)
    original = float(field.input_value())
    edited = round(original + .23, 4)
    field.fill(str(edited))
    view.locator('#appearance-apply').click()
    view.locator('#appearance-undo').click()
    assert abs(float(field.input_value()) - original) < .0001, 'Undo failed to restore the sign'
    field.fill(str(edited))
    view.locator('#appearance-apply').click()
    outputs = []
    for selector, name in [('#save','exit14-edited.json'),('#export-project','exit14-edited.html')]:
        with page.expect_download() as download:
            view.locator(selector).click()
        path = temp / name
        download.value.save_as(path)
        outputs.append(path)
    return outputs[0], outputs[1], original, edited


def immersive(view, canvas, page, image_path):
    def views():
        return int(canvas.get_attribute('data-eyes'))
    assert views() == 0, 'Expected a fresh monoscopic session'
    view.locator('#vr').click()
    expect(canvas).to_have_attribute('data-eyes','2',timeout=18000)
    panel = view.get_by_role('navigation',name='模擬頭顯控制')
    expect(panel).to_be_visible()
    if image_path:
        # From the lower entrance, each eye sees the central stair and its paired escalators.
        page.screenshot(path=str(image_path),quality=89)
    # A rendered stereo session must also respond to controller locomotion.
    start = walk.pose(canvas)
    forward = panel.get_by_role('button',name='向前移動',exact=True)
    heights = [float(canvas.get_attribute('data-walk-elevation'))]
    for _ in range(75):
        before = canvas.get_attribute('data-walk-y')
        # The control has a fixed position. Send a real pointer click and wait
        # for the XR renderer to report motion before pressing it again.
        forward.click(force=True)
        expect(canvas).not_to_have_attribute('data-walk-y',before,timeout=3500)
        heights.append(float(canvas.get_attribute('data-walk-elevation')))
        if canvas.get_attribute('data-walk-surface') == 'landing':
            break
    end = walk.pose(canvas)
    assert math.dist(start[:2],end[:2]) > 8, 'Controller did not traverse the model'
    assert abs(max(heights)-PORCH_HEIGHT)<.015 and abs(heights[-1]-SIDEWALK_HEIGHT)<.015, heights
    assert len(set(heights)) >= 12, 'Controller motion skipped stair heights'
    panel.get_by_role('button',name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes','0',timeout=12000)
    expect(canvas).to_have_attribute('data-mode','walk')
    return {'simulator':'IWER Meta Quest 3','eyeViewCounts':[0,2,views()],
            'controllerInputs':len(heights)-1,'peakHeightMetres':max(heights),'finalHeightMetres':heights[-1]}


def old_release(browser, path):
    with serve_file(path) as url:
        page = browser.new_page()
        try:
            response = page.goto(target_url(url, LOWER))
            expect(page.locator('#station-link')).to_be_attached()
            page.wait_for_timeout(750)
            opened = page.locator('#station-frame').is_visible()
            canvas = page.frame_locator('#station-frame').locator('canvas[tabindex]')
            active = canvas.get_attribute('data-mode', timeout=2000) if opened and canvas.count() else None
            end = opened and active=='walk' and canvas.get_attribute('data-walk-surface')=='floor'
            assert not end, 'Supplied previous release already has a floor walk for this fragment'
            return {'sha256':hashlib.sha256(response.body()).hexdigest(), 'enteredStreetEntryWalk':False,
                    'stationFrameVisible':opened, 'canvasMode':active}
        finally:
            page.close()


def run(browser, url, out, temp, report):
    checks = report['checks']
    context = browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
    context.on('weberror', lambda err: report['pageErrors'].append(str(err.error)))
    page = context.new_page()
    view, canvas, response = arrival(page, url, LOWER)
    report['httpDocumentSHA256'] = hashlib.sha256(response.body()).hexdigest()
    page.screenshot(path=str(out/'exit14-mall-stair.jpg'),quality=89)
    checks['mallToStreet'] = continuous_crossing(page, canvas, True)
    # Hold back from exactly the point reached, without using an entrance selector.
    checks['sameVisitStreetBackToMall'] = continuous_crossing(page, canvas, False, 's')
    checks['centreRailCollision'] = rail_collision(page, canvas)
    view, canvas, _ = arrival(page, url, UPPER)
    page.screenshot(path=str(out/'exit14-sidewalk-stair.jpg'),quality=89)
    checks['streetEntryToMall'] = continuous_crossing(page, canvas, False)
    view, canvas, _ = arrival(page,url,UPPER)
    checks['streetSidewalkAndTreeWell'] = sidewalk_visit(page,canvas,out)
    view, canvas, _ = arrival(page, url, LOWER)
    checks['servedImmersive'] = immersive(view, canvas, page, out/'exit14-headset.jpg')
    json_path, html_path, original, edited = saved_files(page, view, temp)
    saved_edits = json.loads(json_path.read_bytes())['stationStudy']['appearanceEdits']
    assert abs(saved_edits[SIGN]['x']-edited)<.0001, 'Exported JSON lost the edited position'
    # Start a fresh visit, use the actual JSON importer and reopen the walk from its UI.
    view, canvas, _ = arrival(page, url, LOWER)
    with page.expect_file_chooser() as chooser:
        view.locator('#open-project').click()
    chooser.value.set_files(json_path)
    expect(page.locator('#status')).to_contain_text(json_path.name)
    if not page.locator('#station-frame').is_visible():
        page.locator('#station-link').click()
    view = walk.editor(page)
    view.locator('#entry-bottom').click()
    assert abs(float(choose_sign(view).input_value())-edited) < .0001
    checks['editUndoJSONImport'] = {'id':SIGN,'initialX':original,'restoredX':edited}
    context.close()

    context = browser.new_context(offline=True,viewport={'width':1280,'height':800})
    context.on('weberror',lambda err: report['pageErrors'].append(str(err.error)))
    requests = []
    context.on('request',lambda req: requests.append(req.url) if req.url.startswith(('http:','https:')) else None)
    page = context.new_page()
    view, canvas, _ = arrival(page, html_path.as_uri(), UPPER)
    assert abs(float(choose_sign(view).input_value())-edited) < .0001, 'Exported HTML lost the edit'
    checks['editedOfflineStreetToMall'] = continuous_crossing(page, canvas, False)
    view, canvas, _ = arrival(page, html_path.as_uri(), LOWER)
    checks['offlineImmersive'] = immersive(view,canvas,page,None)
    assert not requests, requests
    assert not report['pageErrors'], report['pageErrors']
    checks['offlineHTTPRequestCount'] = len(requests)
    context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence',type=Path)
    parser.add_argument('--before',type=Path)
    parser.add_argument('--url')
    args = parser.parse_args()
    out = args.evidence or Path(tempfile.mkdtemp(prefix='lumiere-exit14-qa-'))
    out.mkdir(parents=True,exist_ok=True)
    report_path = out/'exit14-walk-test.json'
    history = {}
    if report_path.exists():
        previous = json.loads(report_path.read_bytes())
        history = previous.get('earlierFailedAttempts',{})
        if previous.get('status')=='failed':
            history[previous['utc']] = {'error':previous.get('error'),'completedChecks':list(previous['checks'])}
    report = {'utc':datetime.now(timezone.utc).isoformat(),'physicalHeadset':False,
              'checks':{},'pageErrors':[], 'earlierFailedAttempts':history}
    try:
        with walk.hosted_release() as default, tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            report['browser'] = 'Microsoft Edge '+browser.version
            try:
                if args.before:
                    report['previousRelease'] = old_release(browser,args.before)
                run(browser,args.url or default,out,Path(temp),report)
            finally:
                browser.close()
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed',error=f'{type(error).__name__}: {error}'[:1300])
        raise
    finally:
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(report_path,report['status'])


if __name__=='__main__':
    main()
