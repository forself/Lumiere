"""Walk the existing Exit 14 public surfaces and the editable plaza polygon in Edge."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from datetime import datetime,timezone
from playwright.sync_api import expect,sync_playwright

sys.dont_write_bytecode=True

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    source=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    return source

walk=module('station-floor-walk')
entrance=module('street-entry-walk')

def at(canvas):
    x,z,heading=walk.pose(canvas)
    return [round(x*.2,3),round(z*.2,3),float(canvas.get_attribute('data-walk-elevation')),
            canvas.get_attribute('data-walk-surface')]

def go(page,canvas,x,z,expected_height=4.35):
    start=at(canvas)
    walk.face(page,canvas,x/.2,z/.2)
    canvas.focus()
    page.keyboard.down('w')
    try:
        canvas.evaluate("""(c,[x,z])=>new Promise((ok,fail)=>{
            const limit=performance.now()+18000;
            function frame(){
                const d=c.dataset,dx=d.walkX*.2-x,dz=d.walkY*.2-z;
                if(Math.hypot(dx,dz)<.2)return ok();
                if(performance.now()>limit)return fail(Error('Target ['+[x,z]+'] blocked at ['+[d.walkX*.2,d.walkY*.2,d.walkElevation,d.walkSurface]+']'));
                requestAnimationFrame(frame);
            }
            frame();
        })""",[x,z])
    finally:
        page.keyboard.up('w')
    end=at(canvas)
    assert abs(end[2]-expected_height)<.03,(start,end,expected_height)
    return end

def run(page,url,out,result):
    response=page.goto(url+'#mall-stairs')
    f=walk.editor(page);c=f.locator('canvas[tabindex]');expect(c).to_have_attribute('data-walk-surface','floor')
    result['sha256']=hashlib.sha256(response.body()).hexdigest()
    result['fromUndergroundToStreet']=entrance.continuous_crossing(page,c,True)
    # Walk across the built upper apron, turn alongside the shelter and
    # enter the area on the same drawing without invoking any scene command.
    positions=[]
    for x,z in [(.65,-17.15),(4.05,-17.15),(4.05,1.05),(9,1.05),(19,1.05)]:
        positions.append(go(page,c,x,z))
    assert positions[-1][3]=='plaza-lease',positions
    result['sidewalkToLease']=positions
    walk.face(page,c,0,-12/.2)
    c.screenshot(path=out/'exit14-plaza-walk.jpg',quality=89)
    extensions=[go(page,c,19,-7.5)]
    expect(f.locator('#walk-readout')).to_contain_text('騎樓前廣場鋪面')
    extensions.append(go(page,c,19,9.3))
    expect(f.locator('#walk-readout')).to_contain_text('忠孝東路側廣場鋪面')
    extensions.append(go(page,c,19,1.05));result['plazaToPublicPavingAndBack']=extensions
    # Retrace the leased edge and continue behind the headhouse on its
    # supported surface, then return on the other side past the glazing.
    loop=[]
    for x,z in [(4.05,1.05),(0,1.05),(-4.12,1.05),(-4.12,-17.05),(.65,-17.05)]:
        loop.append(go(page,c,x,z))
    assert loop[-1][3]=='landing',loop
    result['rearAndOppositeSideReturn']=loop
    result['upperBoundsMetres']=[min(p[2] for p in positions+loop),max(p[2] for p in positions+loop)]
    walk.face(page,c,13/.2,1/.2)
    c.screenshot(path=out/'exit14-plaza-return.jpg',quality=89)
    walk.face(page,c,.65/.2,3/.2)
    result['backDownToMall']=entrance.continuous_crossing(page,c,False)
    # Put a 2 cm slit across the user's route, narrower than one ordinary
    # collision sample. Install it via the public JSON file controls.
    with tempfile.TemporaryDirectory() as folder:
        project=Path(folder)/'plaza-hole.json'
        with page.expect_download() as download:f.locator('#save').click()
        download.value.save_as(project)
        data=json.loads(project.read_bytes())
        lease=next(p for p in data['publicPlazas']['plazas'] if p['id']=='dinghao')['parts'][0]
        lease['holes']=[[[6,-8.5],[6.02,-8.5],[6.02,-4.5],[6,-4.5]]]
        project.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
        page.locator('#load').set_input_files(project)
        expect(page.locator('#status')).to_contain_text(project.name)
        f.locator('#entry-top').click()
        for x,z in [(.65,-17.15),(4.05,-17.15),(4.05,1.05),(9,1.05)]:go(page,c,x,z)
        walk.face(page,c,19/.2,1.05/.2)
        walk.motion(page,c,'w',3.0)
        edge=at(c)
        assert 12.27<edge[0]<12.51 and edge[3]=='plaza-lease',edge
        walk.motion(page,c,'w',.6);stopped=at(c)
        assert abs(stopped[0]-edge[0])<.01 and abs(stopped[1]-edge[1])<.01,(edge,stopped)
        result['projectHoleBlocksWalking']={'holeWidthMetres':.02,'stoppedAt':stopped}
    return result

def main():
    args=argparse.ArgumentParser()
    args.add_argument('--url');args.add_argument('--evidence',type=Path)
    opt=args.parse_args();out=opt.evidence or Path(tempfile.mkdtemp(prefix='lumiere-plaza-walk-'))
    out.mkdir(exist_ok=True,parents=True)
    result={'utc':datetime.now(timezone.utc).isoformat(),'pageErrors':[]}
    try:
        with walk.hosted_release() as local,sync_playwright() as pw:
            browser=pw.chromium.launch(channel='msedge',args=['--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            try:
                page=browser.new_page(viewport={'width':1350,'height':828})
                page.on('pageerror',lambda error:result['pageErrors'].append(str(error)))
                run(page,opt.url or local,out,result)
                assert not result['pageErrors'],result['pageErrors']
            finally:
                browser.close()
        result['status']='passed'
    except Exception as error:
        result.update(status='failed',error=str(error))
        raise
    finally:
        (out/'exit14-plaza-walk-test.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
        print(out,result.get('status'),flush=True)

if __name__=='__main__':main()
