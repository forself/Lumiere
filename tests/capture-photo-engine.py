"""Deterministic textured multi-plane camera fixture; not a real-photo accuracy claim."""
import importlib.util, json, base64, hashlib, sys
from pathlib import Path
import cv2
import numpy as np
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('photo_pair',root/'scripts/vision/photo_pair.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=root/'output/vision-test';out.mkdir(exist_ok=True)
w,h=1000,700
K=np.array([[800.,0,500],[0,800,350],[0,0,1]])
a=np.zeros((h,w),np.uint8);b=np.zeros_like(a)
rng=np.random.default_rng(1234)
R,_=cv2.Rodrigues(np.array([0.,.025,0.]));t=np.array([-.5,0,0.])
for layer,depth in enumerate([6.,8.,10.]):
    img=np.zeros_like(a);mask=np.zeros_like(a)
    for row in range(5):
        for col in range(8):
            if (row+col)%3!=layer:continue
            x,y=110+col*105,100+row*110
            tex=rng.integers(30,240,(65,65),dtype=np.uint8)
            tex=cv2.GaussianBlur(tex,(3,3),.5)
            cv2.rectangle(tex,(3,3),(61,61),240,2)
            img[y:y+65,x:x+65]=tex;mask[y:y+65,x:x+65]=255
    a[mask>0]=img[mask>0]
    H=K@(R+np.outer(t,np.array([0.,0.,1.]))/depth)@np.linalg.inv(K)
    warped=cv2.warpPerspective(img,H,(w,h));wm=cv2.warpPerspective(mask,H,(w,h),flags=cv2.INTER_NEAREST)
    b[wm>0]=warped[wm>0]
cv2.imwrite(str(out/'A.png'),a);cv2.imwrite(str(out/'B.png'),b)
def image(im):
    raw=cv2.imencode('.png',im)[1].tobytes()
    return dict(sha256=hashlib.sha256(raw).hexdigest(),width=w,height=h,data=base64.b64encode(raw).decode())
cam=dict(fx=800,fy=800,cx=500,cy=350,distortion=[0,0,0,0,0])
p=dict(captureId='capture-vision-test',baseRevision=4,sourceIds=['source-1','source-2'],images=[image(a),image(b)],calibration=dict(evidence='合成針孔相機，已知內參；非實拍校正',cameras=[cam,cam]),baseline=dict(metres=.5,uncertainty=.005))
r=m.process(p)
print('multi-plane:',r['status'],r['diagnostics'],'points',len(r['points']))
assert r['status']=='sparse-metric',r
assert len(r['points'])>=30
assert np.linalg.norm(np.array(r['pose']['R'])-R)<.03
assert np.linalg.norm(np.array(r['pose']['t'])-t)<.06
z=np.array([v['xyz'][2] for v in r['points']]);relative=np.min(np.abs(z[:,None]-np.array([6,8,10]))/np.array([6,8,10]),axis=1)
assert np.median(relative)<.08,np.median(relative)
uncal={**p,'calibration':None};u=m.process(uncal);assert u['status']=='needs-calibration' and not u['points']
relative=m.process({**p,'baseline':None});assert relative['status']=='sparse-relative'
flat=cv2.warpPerspective(a,K@R@np.linalg.inv(K),(w,h));deg=m.process({**p,'images':[image(a),image(flat)]});assert deg['status']=='degenerate',deg['status'];assert not deg['points']
blank=m.process({**p,'images':[image(np.zeros_like(a)),image(np.full_like(a,255))]});assert blank['status']=='insufficient-matches'
assert not blank['points']
(out/'result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'calibration.json').write_text(json.dumps(p['calibration'],ensure_ascii=False,indent=2),encoding='utf-8')
(out/'fixture.json').write_text(json.dumps({k:v for k,v in p.items() if k!='images'}|{'images':[{k:v for k,v in im.items() if k!='data'} for im in p['images']]},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS textured image matching, known pose/scale, no-calibration refusal, relative scale, pure-rotation degeneracy and blank images')
