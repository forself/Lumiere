"""Follow both editable upper galleries from the platform via normal Edge/WebXR controls."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
module = importlib.util.spec_from_file_location('interior', Path(__file__).with_name('station-interior-walk.py'))
interior = importlib.util.module_from_spec(module)
module.loader.exec_module(interior)
walk = interior.walk
DISPLAY_METRES_PER_POINT = .2


def move_to(page, canvas, target):
    # Long polling intervals can overshoot a turning point with a held key.
    # Brake and correct using short key presses before turning into a branch.
    for _ in range(8):
        remaining=math.dist(walk.pose(canvas)[:2], target)
        if remaining < 1.4:return
        if remaining > 7:
            walk.forward_to(page, canvas, target, tolerance=2.5)
        else:
            walk.face(page, canvas, *target)
            walk.motion(page, canvas, 'w', seconds=min(.16,remaining/28))
    raise AssertionError(('Missed waypoint', target, walk.pose(canvas)))


def trace_start(canvas):
    canvas.evaluate("""c=>{
        const trace=[];
        const mo=new MutationObserver(()=>trace.push([+c.dataset.walkElevation,c.dataset.walkSurface]));
        mo.observe(c,{attributes:true,attributeFilter:['data-walk-x','data-walk-y','data-walk-surface']});
        c.stopGalleryTrace=()=>{mo.disconnect();return trace};
    }""")


def gallery_options(view, sign):
    view.locator('#appearance-group').select_option(label='上層走道')
    view.locator('#appearance-object').select_option(f'b4-upper-deck-{sign}')
    return float(view.locator('#appearance-x').input_value())


def quest_gallery(page, view, canvas, out):
    before = walk.pose(canvas)[:2]
    view.get_by_role('button',name='進入 VR',exact=True).click()
    expect(canvas).to_have_attribute('data-eyes','2',timeout=18000)
    panel = view.get_by_role('navigation',name='模擬頭顯控制')
    for _ in range(4):
        panel.get_by_role('button',name='向前移動').click()
        page.wait_for_timeout(110)
    travelled = math.dist(before, walk.pose(canvas)[:2])*DISPLAY_METRES_PER_POINT
    assert .8 < travelled < 1.7, travelled
    expect(canvas).to_have_attribute('data-walk-surface','gallery')
    if out:canvas.screenshot(path=str(out/'station-upper-gallery-quest3.jpg'),quality=90)
    for _ in range(4):
        panel.get_by_role('button',name='向後移動').click()
        page.wait_for_timeout(110)
    panel.get_by_role('button',name='退出模擬').click()
    expect(canvas).to_have_attribute('data-eyes','0',timeout=15000)
    expect(canvas).to_have_attribute('data-walk-surface','gallery')
    assert math.dist(before, walk.pose(canvas)[:2]) < .5
    return {'device':'IWER Quest 3','stereoViews':2,'forwardMetres':round(travelled,3),'returnedToDesktop':True}


def model_edits(page, view, canvas, sign):
    gallery_options(view,sign)
    base = float(view.locator('#appearance-y').input_value())
    field = view.locator('#appearance-y')
    field.fill(str(base+.55));view.locator('#appearance-apply').click()
    assert abs(float(canvas.get_attribute('data-walk-elevation'))-base-.55)<.002
    expect(canvas).to_have_attribute('data-walk-surface','gallery')
    view.locator('#appearance-undo').click()
    assert abs(float(canvas.get_attribute('data-walk-elevation'))-base)<.002
    view.locator('#stair-settings summary').click()
    steps = view.locator('#stair-steps')
    old = int(steps.input_value())
    steps.fill(str(old+2));view.locator('#stair-apply').click()
    expect(canvas).to_have_attribute('data-walk-surface','gallery')
    view.locator('#stair-undo').click()
    expect(canvas).to_have_attribute('data-walk-surface','gallery')
    assert int(steps.input_value())==old and abs(float(canvas.get_attribute('data-walk-elevation'))-base)<.002
    view.locator('#stair-settings summary').click()
    return {'raisedDeckMetres':.55,'undoRestoredFooting':True,'stairRebuildAndUndoRetainedGallery':True}


def exercise(browser, url, out, report):
    context=browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
    page=context.new_page()
    page.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
    response,view,cv=interior.load(page,url,'b3-stairs')
    report['httpDocumentSHA256']=hashlib.sha256(response.body()).hexdigest()
    expect(cv).to_have_attribute('data-walk-surface','landing')
    origin=walk.pose(cv)[:2]
    view.locator('#stairs-bottom').click()
    expect(cv).to_have_attribute('data-walk-surface','floor')
    bottom=walk.pose(cv)[:2]
    delta=[a-b for a,b in zip(origin,bottom)]
    length=math.hypot(*delta)
    forward=[v/length for v in delta]
    right=[-forward[1],forward[0]]
    def at(x,z):
        return [origin[i]+(right[i]*x+forward[i]*z)/DISPLAY_METRES_PER_POINT for i in range(2)]
    rise=float(view.locator('#rise').input_value())
    result=report['checks']
    result['platformToLanding']=interior.sample_stair(page,cv,'landing',True)
    move_to(page,cv,origin)
    for sign in [-1,1]:
        side='left' if sign<0 else 'right'
        deck_x=gallery_options(view,sign)
        assert math.copysign(1,deck_x)==sign
        trace_start(cv)
        move_to(page,cv,at(deck_x,0))
        expect(cv).to_have_attribute('data-walk-surface','gallery')
        move_to(page,cv,at(deck_x,-5))
        expect(cv).to_have_attribute('data-walk-surface','gallery')
        # Approach the glass from the gallery. The requested destination lies in the void.
        hit=walk.forward_to(page,cv,at(0,-5),stop_at_wall=True)
        assert math.dist(hit,at(0,-5))*DISPLAY_METRES_PER_POINT>.45
        expect(cv).to_have_attribute('data-walk-surface','gallery')
        move_to(page,cv,at(deck_x,-5))
        if sign<0:
            walk.face(page,cv,*at(1,-1))
            bounds=cv.bounding_box()
            x=bounds['x']+bounds['width']*.54;y=bounds['y']+bounds['height']*.42
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+102,steps=5);page.mouse.up()
            cv.screenshot(path=str(out/'station-upper-gallery.jpg'),quality=93)
            walk.face(page,cv,*at(deck_x,-11))
            result['immersiveGalleryRoundTrip']=quest_gallery(page,view,cv,out)
        trace=cv.evaluate('c=>c.stopGalleryTrace()')
        assert len(trace)>6 and all(abs(y-rise)<.002 for y,_ in trace),trace[-10:]
        assert {s for _,s in trace}=={'landing','gallery'}
        if sign>0:
            result['upperSurfaceEdits']=model_edits(page,view,cv,sign)
        move_to(page,cv,at(deck_x,0))
        move_to(page,cv,origin)
        expect(cv).to_have_attribute('data-walk-surface','landing')
        result[side+'Gallery']={'framesAtUpperHeight':len(trace),'upperHeightMetres':rise,'edgeStopped':True,'returnedToLanding':True}
    walk.face(page,cv,*bottom)
    result['returnToPlatform']=interior.sample_stair(page,cv,'floor',False)
    # Save a distinct floor edit, reload through the supported project importer and revisit the deck.
    gallery_options(view,1)
    field=view.locator('#appearance-scale')
    field.fill('1.02');view.locator('#appearance-apply').click()
    with tempfile.TemporaryDirectory() as temp:
        with page.expect_download() as saved:view.locator('#save').click()
        file=Path(temp)/'gallery-edit.json';saved.value.save_as(file)
        edits=json.loads(file.read_bytes())['stationStudy']['appearanceEdits']
        assert edits['b4-upper-deck-1']['scale']==1.02
        with page.expect_download() as saved:view.locator('#export-project').click()
        html=Path(temp)/'gallery-edit.html';saved.value.save_as(html)
        page.reload();view=walk.editor(page)
        page.locator('#load').set_input_files(file)
        expect(page.locator('#status')).to_contain_text(file.name)
        if not page.locator('#station-frame').is_visible():page.locator('#station-link').click()
        view=walk.editor(page);view.locator('#stairs-top').click()
        gallery_options(view,1)
        assert float(view.locator('#appearance-scale').input_value())==1.02
        offline=browser.new_context(offline=True,viewport={'width':1180,'height':790})
        cold=offline.new_page();network=[]
        cold.on('request',lambda req:network.append(req.url) if req.url.startswith(('http:','https:')) else None)
        cold.on('pageerror',lambda error:report['pageErrors'].append(str(error)))
        _,fr,surface=interior.load(cold,html.as_uri(),'b3-stairs')
        expect(surface).to_have_attribute('data-walk-surface','landing')
        x=gallery_options(fr,1)
        assert float(fr.locator('#appearance-scale').input_value())==1.02
        move_to(cold,surface,at(x,0));move_to(cold,surface,at(x,-4))
        expect(surface).to_have_attribute('data-walk-surface','gallery')
        walk.face(cold,surface,*at(x,-10))
        result['offlineExportedGalleryXR']=quest_gallery(cold,fr,surface,None)
        assert not network,network
        result['offlineHTTPRequests']=len(network)
        offline.close()
    result['savedAndReopenedEditedGallery']=True
    assert not report['pageErrors'], report['pageErrors']
    context.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',help='optional source-workshop URL instead of the bundled release')
    parser.add_argument('--evidence',type=Path)
    args=parser.parse_args()
    out=args.evidence or Path(tempfile.mkdtemp(prefix='lumiere-gallery-'))
    out.mkdir(exist_ok=True,parents=True)
    report={'utc':datetime.now(timezone.utc).isoformat(),'physicalHeadset':False,'checks':{},'pageErrors':[]}
    try:
        with walk.hosted_release() as default,sync_playwright() as driver:
            browser=driver.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            report['browser']='Microsoft Edge '+browser.version
            try:exercise(browser,args.url or default,out,report)
            finally:browser.close()
        report['status']='passed'
    except Exception as error:
        report.update(status='failed',error=str(error)[:2000]);raise
    finally:
        file=out/'station-upper-gallery-test.json'
        file.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(file,report['status'])


if __name__=='__main__':
    main()
