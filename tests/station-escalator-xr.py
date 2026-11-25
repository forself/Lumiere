"""Exercise the IWER Quest 3 controller, floor joins and an XR-to-desktop ride.

Requires Microsoft Edge and Python Playwright. The default URL serves the
repository's single-file workshop on a temporary local HTTP port.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('floor_walk', Path(__file__).with_name('station-floor-walk.py'))
walk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(walk)


def point(canvas):
    return walk.pose(canvas)[:2]


def metres(position):
    return [round(value * .2, 3) for value in position]


def open_scene(page, url, anchor, expected_hash, report):
    response = page.goto(f'{url}?headset=quest3#{anchor}')
    report['httpDocumentSHA256'] = hashlib.sha256(response.body()).hexdigest()
    if expected_hash:
        assert report['httpDocumentSHA256'] == expected_hash, report['httpDocumentSHA256']
    view = walk.editor(page)
    return view, view.locator('canvas[tabindex]')


def walk_to(page, canvas, x, z):
    target = [x / .2, z / .2]
    for _ in range(4):
        here = point(canvas)
        if math.dist(here, target) * .2 < .18:
            return here
        walk.face(page, canvas, *target)
        canvas.focus()
        # Software rendering can take several frames between two Playwright
        # calls. Release the actual walking key on the first reached frame, then
        # read its resting position. No pose or scene state is written.
        canvas.evaluate("""(canvas, target) => {
            const win = canvas.ownerDocument.defaultView;
            const start = [+canvas.dataset.walkX, +canvas.dataset.walkY];
            const delta = target.map((value,i) => value - start[i]);
            const length = Math.hypot(...delta);
            win.stationQAWaypoint = new Promise(resolve => {
                const timeout = win.setTimeout(() => stop('blocked'), 12000);
                function stop(result) {
                    observer.disconnect();
                    win.clearTimeout(timeout);
                    win.dispatchEvent(new win.KeyboardEvent('keyup', {key:'w',bubbles:true}));
                    resolve(result);
                }
                const observer = new win.MutationObserver(() => {
                    const current = [+canvas.dataset.walkX, +canvas.dataset.walkY];
                    const remaining = target.reduce((sum,t,i) => sum + (t-current[i])*delta[i]/length, 0);
                    if (remaining < .35) stop('arrived');
                });
                observer.observe(canvas, {attributes:true,attributeFilter:['data-walk-x','data-walk-y']});
            });
        }""", target)
        page.keyboard.down('w')
        try:
            result = canvas.evaluate('c => c.ownerDocument.defaultView.stationQAWaypoint')
        finally:
            page.keyboard.up('w')
        here = point(canvas)
        if math.dist(here, target) * .2 < .36:
            return here
        if result == 'blocked':
            break
    raise AssertionError((metres(here), [x, z], canvas.get_attribute('data-walk-surface')))


def enter_vr(view, canvas):
    button = view.locator('#vr')
    expect(button).to_be_enabled(timeout=17000)
    button.click()
    expect(canvas).to_have_attribute('data-eyes', '2', timeout=16000)
    return view.get_by_role('navigation', name='模擬頭顯控制')


def hold_thumbstick(page, canvas, panel, label, distance):
    start = point(canvas)
    button = panel.get_by_role('button', name=label, exact=True)
    button.scroll_into_view_if_needed()
    box = button.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down()
    try:
        canvas.evaluate("""(canvas, [x,y,distance]) => new Promise((ok,fail) => {
            const limit = performance.now() + 6000;
            function frame() {
                const d = canvas.dataset;
                if (Math.hypot(d.walkX-x, d.walkY-y)*.2 >= distance) return ok();
                if (performance.now() > limit) return fail(Error(JSON.stringify(d)));
                requestAnimationFrame(frame);
            }
            frame();
        })""", [*start, distance])
    finally:
        page.mouse.up()
    return point(canvas)


def plaza(page, url, expected_hash, report):
    view, canvas = open_scene(page, url, 'plaza-walk', expected_hash, report)
    expect(canvas).to_have_attribute('data-walk-surface', 'plaza-interior')
    expect(canvas).to_have_attribute('data-eyes', '0')
    initial = point(canvas)
    panel = enter_vr(view, canvas)
    forward = hold_thumbstick(page, canvas, panel, '右搖桿前進', .55)
    rest = point(canvas)
    page.wait_for_timeout(450)
    assert math.dist(rest, point(canvas)) < .02, 'Controller did not spring to neutral'
    back = hold_thumbstick(page, canvas, panel, '右搖桿後退', math.dist(initial, forward)*.2-.08)
    outbound = [end - start for start, end in zip(initial, forward)]
    inbound = [end - start for start, end in zip(forward, back)]
    assert sum(a * b for a, b in zip(outbound, inbound)) < 0, 'Reverse deflection continued forward'
    expect(canvas).to_have_attribute('data-walk-surface', 'plaza-interior')
    before_exit = point(canvas)
    panel.get_by_role('button', name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes', '0', timeout=10000)
    drift = math.dist(before_exit, point(canvas)) * .2
    assert drift < .03, 'Exiting VR changed the viewpoint'
    report['checks']['rightThumbstickOnPlaza'] = {
        'eyes': [0, 2, 0], 'beforeMetres': metres(initial), 'afterForward': metres(forward),
        'afterReverse': metres(back), 'driftOnExitMetres': round(drift, 6), 'springReturnedToNeutral': True,
    }

    anchors = [[7,-2.17], [7,3.20], [.65,3.20], [.65,1.20]]
    reached = []
    for x, z in anchors + list(reversed(anchors[:-1])) + [metres(initial)]:
        position = walk_to(page, canvas, x, z)
        reached.append([metres(position), canvas.get_attribute('data-walk-surface')])
    assert any(row[1] == 'floor' for row in reached) and reached[-1][1] == 'plaza-interior', reached
    report['checks']['stepFreePlazaToStairFootAndReturn'] = reached

    for field, delta in [('z', .09), ('y', .55)]:
        view.locator('#entry-bottom').click()
        expect(canvas).to_have_attribute('data-walk-surface', 'floor')
        view.locator('#appearance-group').select_option(label='地下梯廳')
        view.locator('#appearance-object').select_option('plaza2-exit14-apron')
        value = view.locator('#appearance-' + field)
        value.fill(str(float(value.input_value()) + delta))
        view.locator('#appearance-apply').click()
        walk.motion(page, canvas, 's', .68)
        blocked = point(canvas)
        walk.motion(page, canvas, 's', .3)
        assert math.dist(blocked, point(canvas)) < .03 and blocked[1]*.2 <= 1.901, (field, blocked)
        view.locator('#appearance-undo').click()
        restored = walk_to(page, canvas, .65, 2.62)
        assert restored[1]*.2 > 2.2 and canvas.get_attribute('data-walk-surface') == 'plaza-apron', restored
        report['checks']['editedGap-' + field] = {
            'deltaMetres': delta, 'blockedAt': metres(blocked), 'crossedAfterUndo': metres(restored),
        }


def transition(page, url, expected_hash, report):
    view, canvas = open_scene(page, url, 'exit14-down', expected_hash, report)
    expect(canvas).to_have_attribute('data-walk-elevation', '4.9500')
    expect(canvas).to_have_attribute('data-eyes', '0')
    panel = enter_vr(view, canvas)
    for steps in range(1, 5):
        panel.get_by_role('button', name='向前移動').click(force=True)
        page.wait_for_timeout(350)
        if canvas.get_attribute('data-walk-direction') == 'down':
            break
    expect(canvas).to_have_attribute('data-walk-direction', 'down')
    def height():
        return float(canvas.get_attribute('data-walk-elevation'))
    boarding = height()
    page.wait_for_timeout(2400)
    riding = height()
    assert riding < boarding - .05, (boarding, riding)
    panel.get_by_role('button', name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes', '0')
    expect(canvas).to_have_attribute('data-walk-direction', 'down')
    after_exit = height()
    page.wait_for_timeout(2200)
    desktop = height()
    assert 0 < desktop < after_exit - .05, (after_exit, desktop)
    expect(canvas).to_have_attribute('data-walk-surface', 'floor', timeout=42000)
    assert height() == 0
    report['checks']['XRToDesktopWithoutReboarding'] = {
        'viewCount': [0, 2, 0], 'forwardInputsToBoard': steps, 'xrBoardingHeightMetres': boarding,
        'xrRidingNoFurtherInputMetres': riding, 'immediateDesktopHeightMetres': after_exit,
        'desktopRidingWithoutInputMetres': desktop, 'automaticDisembarkHeightMetres': height(),
    }


CASES = {
    'plaza': (plaza, 'plaza-xr-ground-connection-test.json', {'width':1260, 'height':730}),
    'transition': (transition, 'escalator-xr-desktop-transition-test.json', {'width':900, 'height':650}),
}


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--url', help='Workshop URL without a query string or fragment')
    args.add_argument('--sha256', help='Require this HTTP response body SHA-256')
    args.add_argument('--case', choices=['all', *CASES], default='all')
    args.add_argument('--evidence', type=Path)
    opt = args.parse_args()
    out = opt.evidence or Path(tempfile.mkdtemp(prefix='lumiere-station-xr-'))
    out.mkdir(exist_ok=True, parents=True)
    failures = []
    with walk.hosted_release() as local, sync_playwright() as pw:
        browser = pw.chromium.launch(channel='msedge',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            for name in CASES if opt.case == 'all' else [opt.case]:
                run, filename, viewport = CASES[name]
                report = {
                    'utc': datetime.now(timezone.utc).isoformat(), 'browser': 'Microsoft Edge ' + browser.version,
                    'mode': 'HTTP workshop; IWER Quest 3', 'checks': {}, 'physicalHeadset': False, 'pageErrors': [],
                }
                page = browser.new_page(viewport=viewport)
                page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                try:
                    run(page, opt.url or local, opt.sha256, report)
                    assert not report['pageErrors'], report['pageErrors']
                    report['status'] = 'passed'
                except Exception as error:
                    failures.append(name)
                    report.update(status='failed', error=str(error))
                finally:
                    page.close()
                    (out / filename).write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n', encoding='utf8')
                    print(out / filename, report['status'], report.get('error', ''), flush=True)
        finally:
            browser.close()
    if failures:
        raise SystemExit('Failed: ' + ', '.join(failures))


if __name__ == '__main__':
    main()
