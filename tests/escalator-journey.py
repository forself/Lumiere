"""Walk on, release the key and ride both escalators without switching scenes."""
from argparse import ArgumentParser
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import sys
from tempfile import TemporaryDirectory
from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
source = importlib.util.spec_from_file_location('walk', Path(__file__).with_name('station-floor-walk.py'))
walk = importlib.util.module_from_spec(source)
source.loader.exec_module(walk)


def open_ride(page, url, fragment):
    response = page.goto(url + '#' + fragment)
    view = walk.editor(page)
    canvas = view.locator('canvas[tabindex]')
    expect(canvas).to_have_attribute('data-mode', 'walk')
    expect(canvas).to_have_attribute('data-walk-style', 'appearance')
    return view, canvas, response


def ride(page, canvas, name, direction, expected_height):
    canvas.focus()
    page.keyboard.down('w')
    try:
        expect(canvas).to_have_attribute('data-walk-escalator', name, timeout=5000)
    finally:
        page.keyboard.up('w')
    expect(canvas).to_have_attribute('data-walk-direction', direction)
    # Observe real frames after the keyup. No more movement input is sent until
    # the renderer reports leaving the belt at the far end.
    samples = canvas.evaluate("""c => new Promise((resolve,reject)=>{
        const end=performance.now()+90000;
        const poses=[];
        function sample(){
            const d=c.dataset;
            poses.push([+d.walkX,+d.walkY,+d.walkElevation]);
            if(d.walkSurface!=='escalator')return resolve(poses);
            if(performance.now()>end)return reject(Error('The rider did not leave the escalator'));
            requestAnimationFrame(sample);
        }
        sample();
    })""")
    heights = [v[2] for v in samples]
    assert abs(heights[-1]-expected_height)<.025, (direction,heights[-1])
    assert len(set(heights))>15 and max(heights)-min(heights)>4
    assert all((b-a)*(1 if direction=='up' else -1)>=-.025 for a,b in zip(heights,heights[1:]))
    assert math.dist(samples[0][:2],samples[-1][:2])*.2>5
    arrival = walk.pose(canvas)
    page.wait_for_timeout(450)
    assert math.dist(walk.pose(canvas)[:2],arrival[:2])<.015, 'Belt pushed rider after disembarking'
    return {'direction':direction,'framesWithoutInput':len(samples),'startMetres':heights[0],
            'arrivalMetres':heights[-1],'stoppedOnLanding':True}


def downloaded(page, scope, selector, path):
    with page.expect_download() as d:
        scope.locator(selector).click()
    d.value.save_as(str(path))


def select_plaza_column(view):
    view.locator('#appearance-group').select_option('第二廣場柱體')
    view.locator('#appearance-object').select_option('plaza-object-7')
    return view.locator('#lease-outline')


def switch_end_on_foot(page, canvas, down_intake):
    upper = walk.pose(canvas)
    # Move clear of the balustrades, then cross the level terrace while
    # remaining on the same floor. The second intake is obtained from another
    # view of the same model without changing the tested traveller's pose.
    cross_y = min(upper[1],down_intake[1])-6
    walk.forward_to(page,canvas,[upper[0],cross_y])
    walk.forward_to(page,canvas,[down_intake[0],cross_y])
    walk.face(page,canvas,down_intake[0],down_intake[1]+7)
    assert abs(float(canvas.get_attribute('data-walk-elevation'))-4.95)<.025


def run(browser, url, temp, report, with_plaza):
    context=browser.new_context(accept_downloads=True,viewport={'width':1120,'height':740})
    context.on('weberror',lambda error:report['pageErrors'].append(str(error.error)))
    page=context.new_page()
    view,canvas,response=open_ride(page,url,'exit14-down')
    report['httpDocumentSHA256']=hashlib.sha256(response.body()).hexdigest()
    down_intake=walk.pose(canvas)
    view.locator('#ride-exit-up').click()
    report['uphill']=ride(page,canvas,'exit14-escalator-left','up',4.95)
    switch_end_on_foot(page,canvas,down_intake)
    report['downhillInSameVisit']=ride(page,canvas,'exit14-escalator-right','down',0)
    if with_plaza:
        view.locator('#appearance-group').select_option('頂好廣場租借地坪')
        view.locator('#appearance-object').select_option('exit14-dinghao-lease')
        expect(view.locator('#lease-outline')).to_contain_text('380 m²')
        view.locator('#edit-lease').click()
        expect(page.locator('#public-plaza')).to_have_value('dinghao')
        page.locator('#corner').select_option(index=1)
        page.locator('#east').fill('38')
        page.locator('#apply').click()
        page.locator('a[href="#street-stairs"]').click()
        view=walk.editor(page)
        view.locator('#appearance-group').select_option('頂好廣場租借地坪')
        view.locator('#appearance-object').select_option('exit14-dinghao-lease')
        expect(view.locator('#lease-outline')).to_contain_text('361 m²')
        select_plaza_column(view)
        view.locator('#edit-lease').click()
        expect(page.locator('#building')).to_have_value('plaza-object-7')
        original_roof=float(page.locator('#roof').input_value())
        edited_roof=round(original_roof+.25,3)
        page.locator('#roof').fill(str(edited_roof))
        page.locator('#apply').click()
        page.locator('a[href="#plaza-walk"]').click()
        view=walk.editor(page)
        expect(select_plaza_column(view)).to_contain_text(f'頂高 {edited_roof:g} m')
        js=temp/'edited-project.json'
        downloaded(page,view,'#save',js)
        saved=json.loads(js.read_bytes())
        part=next(p for v in saved['publicPlazas']['plazas'] for p in v['parts'] if p['id']=='dinghao-lease')
        assert part['footprint'][1]==[38,0]
        report['canonicalLeaseAreaEdit']={'beforeSqM':380,'afterSqM':361,'savedVertex':part['footprint'][1]}
        assert next(p for p in saved['plaza']['items'] if p['id']=='plaza-object-7')['roof']==edited_roof
        report['canonicalIndoorColumnEdit']={'object':'plaza-object-7','beforeMetres':original_roof,'afterMetres':edited_roof}
    html=temp/'tour.html'
    downloaded(page,view,'#export-project',html)
    context.close()
    offline=browser.new_context(offline=True,viewport={'width':1050,'height':680})
    pg=offline.new_page();external=[]
    pg.on('request',lambda r:external.append(r.url) if r.url.startswith(('http:','https:')) else None)
    pg.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
    view,canvas,_=open_ride(pg,html.as_uri(),'b4-escalator')
    report['offlineSingleEscalator']=ride(pg,canvas,'b4-escalator','up',5.2)
    if with_plaza:
        view.locator('#entry-top').click()
        view.locator('#appearance-group').select_option('頂好廣場租借地坪')
        expect(view.locator('#lease-outline')).to_contain_text('361 m²')
        expect(select_plaza_column(view)).to_contain_text(f'頂高 {edited_roof:g} m')
    report['offlineNetworkRequests']=len(external)
    assert not external and not report['pageErrors']
    offline.close()


def main():
    cli=ArgumentParser(description=__doc__)
    cli.add_argument('--url')
    cli.add_argument('--report',type=Path,required=True)
    cli.add_argument('--rides-only',action='store_true')
    args=cli.parse_args()
    result={'utc':datetime.now(timezone.utc).isoformat(),'pageErrors':[],'physicalHeadset':False}
    try:
        with walk.hosted_release() as default,TemporaryDirectory() as temp,sync_playwright() as driver:
            browser=driver.chromium.launch(channel='msedge',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            try:run(browser,args.url or default,Path(temp),result,not args.rides_only)
            finally:browser.close()
        result['status']='passed'
    except Exception as error:
        result.update(status='failed',error=str(error)[:1200]);raise
    finally:
        args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
