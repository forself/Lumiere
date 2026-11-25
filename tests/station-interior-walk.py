"""Regression for the photo-informed station interiors and the local atrium stair.

Run python tests/station-interior-walk.py --evidence <folder> with Python
Playwright and Edge. --url can point at the Lumiere native urban editor.
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

sys.dont_write_bytecode=True
module=importlib.util.spec_from_file_location('floor_walk',Path(__file__).with_name('station-floor-walk.py'))
walk=importlib.util.module_from_spec(module)
module.loader.exec_module(walk)


def load(page,url,slug):
    reply=page.goto(url.split('#')[0]+'?headset=quest3#'+slug)
    view=walk.editor(page)
    canvas=view.locator('canvas[tabindex]')
    expect(canvas).to_have_attribute('data-walk-style','appearance',timeout=15000)
    return reply,view,canvas


def sample_stair(page,canvas,target,ascending):
    canvas.focus()
    canvas.evaluate("""el=>{
        const trace=[];
        const collect=()=>trace.push([+el.dataset.walkX,+el.dataset.walkY,+el.dataset.walkElevation,el.dataset.walkSurface]);
        collect();const mo=new MutationObserver(collect);mo.observe(el,{attributes:true,attributeFilter:['data-walk-elevation','data-walk-surface','data-walk-x','data-walk-y']});
        el.ownerDocument.defaultView.stopTrace=()=>{mo.disconnect();collect();return trace};
    }""")
    page.keyboard.down('w')
    try:
        expect(canvas).to_have_attribute('data-walk-surface',target,timeout=22000)
        page.wait_for_timeout(180)
    finally:
        page.keyboard.up('w')
    trace=canvas.evaluate('el=>el.ownerDocument.defaultView.stopTrace()')
    delta=[b[2]-a[2] for a,b in zip(trace,trace[1:])]
    expected=float(canvas.get_attribute('data-walk-elevation'))
    assert len(set(v[2] for v in trace))>=6, 'No progressive height samples'
    assert max(abs(d) for d in delta)<.4,(max(delta),min(delta))
    assert all(d >= -.002 if ascending else d <= .002 for d in delta)
    assert 'stairs' in [v[3] for v in trace] and target==trace[-1][3]
    assert math.dist(trace[0][:2],trace[-1][:2])>12, 'Elevation changed in place'
    return {'sampledFrames':len(trace),'startHeightMetres':trace[0][2],'endHeightMetres':expected,
            'maxSingleFrameRiseOrDropMetres':round(max(abs(d) for d in delta),4),'surfaces':list(dict.fromkeys(v[3] for v in trace))}


def inspect_gate(page,view,canvas):
    view.locator('#appearance-group').select_option(label='驗票設備')
    view.locator('#appearance-object').select_option('b3-gate-0')
    field=view.locator('#appearance-x');old=float(field.input_value())
    changed=round(old+.17,5);field.fill(str(changed))
    view.locator('#appearance-apply').click()
    expect(view.locator('#appearance-undo')).to_be_enabled()
    view.locator('#appearance-undo').click()
    assert abs(float(field.input_value())-old)<1e-5
    field.fill(str(changed));view.locator('#appearance-apply').click()
    return changed


def immersive_climb(page,view,canvas,rise,out):
    view.get_by_role('button',name='進入 VR',exact=True).click()
    expect(canvas).to_have_attribute('data-eyes','2',timeout=18000)
    panel=view.get_by_role('navigation',name='模擬頭顯控制')
    page.screenshot(path=str(out/'station-atrium-quest3.jpg'),quality=90)
    forward=panel.get_by_role('button',name='向前移動',exact=True)
    backward=panel.get_by_role('button',name='向後移動',exact=True)
    traces=[]
    for button,target in [(forward,'landing'),(backward,'floor')]:
        elevations=[float(canvas.get_attribute('data-walk-elevation'))]
        for _ in range(75):
            button.click()
            page.wait_for_timeout(55)
            elevations.append(float(canvas.get_attribute('data-walk-elevation')))
            if canvas.get_attribute('data-walk-surface')==target:break
        assert canvas.get_attribute('data-walk-surface')==target,(target,elevations)
        assert abs(elevations[-1]-(rise if target=='landing' else 0))<.002
        assert len(set(elevations))>=8 and max(abs(b-a) for a,b in zip(elevations,elevations[1:]))<.50
        traces.append({'to':target,'positions':len(elevations),'start':elevations[0],'end':elevations[-1]})
    panel.get_by_role('button',name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes','0')
    expect(canvas).to_have_attribute('data-mode','walk')
    return {'device':'IWER Quest 3','views':2,'stageHeightsMetres':traces,'ended':True}


def exercise(browser,entry,temp,out,report):
    ctx=browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
    page=ctx.new_page()
    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    response,view,canvas=load(page,entry,'b3-walk')
    report['httpDocumentSHA256']=hashlib.sha256(response.body()).hexdigest()
    groups=view.locator('#appearance-group option').all_text_contents()
    assert {'牆面','天花','店面','驗票設備','照明'}<=set(groups)
    page.screenshot(path=str(out/'station-concourse-interior.jpg'),quality=90)
    changed=inspect_gate(page,view,canvas)
    report['checks']['concourseEditableGateAndUndo']={'groups':groups[1:],'editedGate':'b3-gate-0'}
    view.locator('#stairs-bottom').click()
    expect(canvas).to_have_attribute('data-walk-surface','floor')
    expect(canvas).to_have_attribute('data-walk-level','B4')
    bottom=walk.pose(canvas)[:2]
    expected=float(view.locator('#rise').input_value())
    page.screenshot(path=str(out/'station-atrium-stair-bottom.jpg'),quality=90)
    up=sample_stair(page,canvas,'landing',True)
    assert abs(up['endHeightMetres']-expected)<.002
    # Turn in place using the real pointer control, then walk down from the
    # exact point reached. Do not use the endpoint selector for the return.
    walk.face(page,canvas,*bottom)
    box=canvas.bounding_box()
    x,y=box['x']+box['width']/2,box['y']+box['height']*.45
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+75,steps=4);page.mouse.up()
    page.screenshot(path=str(out/'station-atrium-stair-top.jpg'),quality=90)
    down=sample_stair(page,canvas,'floor',False)
    assert abs(down['endHeightMetres'])<.002
    report['checks']['oneContinuousDesktopReturnWalk']={'ascent':up,'descent':down,'turnedAtLanding':True}
    view.locator('#stairs-top').click()
    expect(canvas).to_have_attribute('data-walk-surface','landing')
    report['checks']['upperLandingWebXR']=walk.check_xr(view)
    expect(canvas).to_have_attribute('data-walk-surface','landing')
    view.locator('#stair-settings summary').click()
    steps=view.locator('#stair-steps')
    previous=int(steps.input_value());steps.fill(str(previous+2));view.locator('#stair-apply').click()
    expect(view.locator('#stair-undo')).to_be_enabled()
    view.locator('#stair-undo').click()
    assert int(steps.input_value())==previous
    steps.fill(str(previous+2));view.locator('#stair-apply').click()
    with page.expect_download() as d: view.locator('#save').click()
    model=temp/'edited.json';d.value.save_as(model);data=json.loads(model.read_bytes())
    assert abs(data['stationStudy']['appearanceEdits']['b3-gate-0']['x']-changed)<1e-5
    report['checks']['stairShapeEditAndUndo']={'originalSteps':previous,'editedSteps':previous+2}
    with page.expect_download() as d: view.locator('#export-project').click()
    html=temp/'edited.html';d.value.save_as(html)
    # Fresh page proves the actual JSON importer applies the stored edit.
    page.reload();view=walk.editor(page)
    with page.expect_file_chooser() as chooser:view.locator('#open-project').click()
    chooser.value.set_files(model);expect(page.locator('#status')).to_contain_text(model.name)
    if not page.locator('#station-frame').is_visible():page.locator('#station-link').click()
    view=walk.editor(page)
    view.locator('#level').select_option('B3')
    if view.locator('canvas[tabindex]').get_attribute('data-mode')!='walk':view.locator('#walk-floor').click()
    view.locator('#walk-style').select_option('appearance')
    view.locator('#appearance-group').select_option(label='驗票設備');view.locator('#appearance-object').select_option('b3-gate-0')
    assert abs(float(view.locator('#appearance-x').input_value())-changed)<1e-5
    report['checks']['reloadedJSONRestoresEditedGate']=True
    ctx.close()
    offline=browser.new_context(offline=True,viewport={'width':1160,'height':780})
    p=offline.new_page();requests=[]
    p.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    p.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    _,v,cv=load(p,html.as_uri(),'b3-stairs')
    expect(cv).to_have_attribute('data-walk-surface','landing')
    assert int(v.locator('#stair-steps').input_value())==previous+2
    report['checks']['offlineEditedUpperEntryAndDescent']=sample_stair(p,cv,'floor',False)
    # Opening the bottom link in a fresh tab forces a cold startup.
    p2=offline.new_page()
    p2.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    p2.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    _,v,cv=load(p2,html.as_uri(),'b4-stairs')
    expect(cv).to_have_attribute('data-walk-surface','floor')
    report['checks']['offlineEditedStairImmersiveRoundTrip']=immersive_climb(p2,v,cv,expected,out)
    assert not requests,requests
    report['checks']['offlineHTTPRequests']=len(requests)
    offline.close()
    assert not report['pageErrors'],report['pageErrors']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url')
    parser.add_argument('--evidence',type=Path)
    opt=parser.parse_args()
    out=opt.evidence or Path(tempfile.mkdtemp(prefix='lumiere-interior-evidence-'))
    out.mkdir(exist_ok=True,parents=True)
    report={'utc':datetime.now(timezone.utc).isoformat(),'physicalHeadset':False,'checks':{},'pageErrors':[]}
    try:
        with walk.hosted_release() as default,tempfile.TemporaryDirectory() as tmp,sync_playwright() as driver:
            browser=driver.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            report['browser']='Microsoft Edge '+browser.version
            try: exercise(browser,opt.url or default,Path(tmp),out,report)
            finally: browser.close()
        report['status']='passed'
    except Exception as error:
        report.update(status='failed',error=str(error)[:1500]);raise
    finally:
        file=out/'station-interior-walk-test.json'
        file.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
        print(file,report['status'])

if __name__=='__main__':
    main()
