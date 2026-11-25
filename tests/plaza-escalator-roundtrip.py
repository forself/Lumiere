"""Walk from the mall to the street plaza and back in a single browser visit."""
from argparse import ArgumentParser
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('outside', Path(__file__).with_name('exit14-plaza-walk.py'))
outside = importlib.util.module_from_spec(spec)
spec.loader.exec_module(outside)
walk = outside.walk
escalator = outside.module('escalator-journey')


def run(page, url, out, report):
    response = page.goto(url + '#plaza-walk')
    report['sha256'] = hashlib.sha256(response.body()).hexdigest()
    view = walk.editor(page)
    canvas = view.locator('canvas[tabindex]')
    expect(canvas).to_have_attribute('data-walk-surface', 'plaza-interior')
    initial_clock = canvas.evaluate('c=>c.ownerDocument.defaultView.performance.timeOrigin')
    steps = report['waypoints'] = []

    def segment(label, height, points):
        item = {'section': label, 'reached': []}
        steps.append(item)
        for x, z in points:
            pos = outside.go(page, canvas, x, z, expected_height=height)
            item['reached'].append(pos)

    def point_towards(x, z):
        walk.face(page, canvas, x / .2, z / .2)

    start = report['start'] = outside.at(canvas)
    outside.entrance.begin_trace(canvas)
    point_towards(24, -8)
    canvas.screenshot(path=out/'plaza-roundtrip-underground.jpg', quality=88)
    segment('第二廣場經柱列前通行帶到出口14左梯腳', 0, [
        (7, -2.17), (7, 3.20), (.65, 3.20), (.65, 1.20), (-2.16, 1.20), (-2.16, -1.72)])
    point_towards(-2.16, -12.3)
    report['outboundEscalator'] = escalator.ride(page, canvas, 'exit14-escalator-left', 'up', 4.95)
    segment('雨棚下上平台', 4.95, [(-2.16, -13.42), (.65, -13.42)])
    point_towards(.65, -17.15)
    canvas.screenshot(path=out/'plaza-roundtrip-upper-landing.jpg', quality=88)
    segment('短梯下到人行道並從出口側邊走入頂好廣場', 4.35, [
        (.65, -17.15), (4.05, -17.15), (4.05, 1.05), (9, 1.05), (19, 1.05)])
    expect(canvas).to_have_attribute('data-walk-surface', 'plaza-lease')
    point_towards(0, -12)
    canvas.screenshot(path=out/'plaza-roundtrip-dinghao.jpg', quality=88)
    segment('沿頂好廣場及人行道返回地面梯口', 4.35, [
        (4.05, 1.05), (4.05, -17.15), (.65, -17.15)])
    segment('上短梯後橫過雨棚平台到右側下行梯', 4.95, [
        (.65, -13.42), (2.16, -13.42), (2.16, -12.66)])
    point_towards(2.16, 0)
    bounds = canvas.bounding_box()
    mx, my = bounds['x']+bounds['width']*.5, bounds['y']+bounds['height']*.5
    page.mouse.move(mx,my)
    page.mouse.down()
    page.mouse.move(mx,my+78,steps=6)
    page.mouse.up()
    canvas.screenshot(path=out/'plaza-roundtrip-return-escalator.jpg', quality=88)
    report['returnEscalator'] = escalator.ride(page, canvas, 'exit14-escalator-right', 'down', 0)
    segment('從右梯腳經通行帶返回第二廣場原位', 0, [
        (2.16, 1.20), (2.16, 3.20), (7, 3.20), (7, -2.17), (start[0], start[1])])
    end = report['end'] = outside.at(canvas)
    assert end[3] == 'plaza-interior' and math.dist(start[:3], end[:3]) < .25, (start, end)
    report['sameDocument'] = initial_clock == canvas.evaluate('c=>c.ownerDocument.defaultView.performance.timeOrigin')
    assert report['sameDocument'] and page.url == url+'#plaza-walk'
    samples = canvas.evaluate('c=>c.ownerDocument.defaultView.endStreetTrace()')
    metres = [(row[0]*.2, row[1]*.2, row[2]) for row in samples]
    displacements = [math.dist(a,b) for a,b in zip(metres,metres[1:])]
    report['pathMetres'] = round(sum(displacements), 2)
    report['poseSamples'] = len(samples)
    report['surfaceOrder'] = [row[3] for i,row in enumerate(samples) if i == 0 or samples[i-1][3] != row[3]]
    assert all(s in report['surfaceOrder'] for s in ['plaza-interior','plaza-apron','escalator','stairs','landing','sidewalk','plaza-lease']), report['surfaceOrder']
    assert report['surfaceOrder'].count('escalator') == 2,report['surfaceOrder']
    report['largestSinglePoseChangeMetres'] = round(max(displacements),3)
    assert report['largestSinglePoseChangeMetres'] < .55,report['largestSinglePoseChangeMetres']


def main():
    args = ArgumentParser()
    args.add_argument('--url')
    args.add_argument('--evidence', type=Path)
    opt = args.parse_args()
    out = opt.evidence or Path(tempfile.mkdtemp(prefix='lumiere-plaza-roundtrip-'))
    out.mkdir(exist_ok=True, parents=True)
    report = {'utc': datetime.now(timezone.utc).isoformat(), 'pageErrors': []}
    try:
        with walk.hosted_release() as local, sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            try:
                page = browser.new_page(viewport={'width':1350,'height':828})
                page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
                run(page, opt.url or local, out, report)
                assert not report['pageErrors'], report['pageErrors']
            finally:
                browser.close()
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed',error=str(error))
        raise
    finally:
        (out/'plaza-escalator-roundtrip-test.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
        print(out,report.get('status'),flush=True)


if __name__ == '__main__':
    main()
