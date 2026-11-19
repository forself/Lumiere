"""Local photo-pair worker. JSON stdin/stdout; no network, subprocess or file paths."""
import base64
import hashlib
import json
import math
import sys
import os
os.environ["OPENCV_IO_MAX_IMAGE_PIXELS"] = "40000000"

LIMIT = 10 * 1024 * 1024

def payload_check(data):
    if not isinstance(data, dict) or set(data) != {'captureId', 'baseRevision', 'sourceIds', 'images', 'calibration', 'baseline'}:
        raise ValueError('照片匹配請求欄位錯誤。')
    if not isinstance(data['captureId'], str) or not isinstance(data['baseRevision'], int) or data['baseRevision'] < 0:
        raise ValueError('採集專案識別錯誤。')
    if not isinstance(data['sourceIds'], list) or len(data['sourceIds']) != 2 or len(set(data['sourceIds'])) != 2:
        raise ValueError('需要兩個不同的來源 ID。')
    if not isinstance(data['images'], list) or len(data['images']) != 2:
        raise ValueError('需要兩張影像。')
    raw = []
    for image in data['images']:
        if not isinstance(image, dict) or set(image) != {'sha256', 'width', 'height', 'data'}:
            raise ValueError('影像欄位錯誤。')
        if not isinstance(image['data'], str) or len(image['data']) > LIMIT * 4 // 3 + 4:
            raise ValueError('單張照片最多 10 MB。')
        b = base64.b64decode(image['data'], validate=True)
        if not b or len(b) > LIMIT or hashlib.sha256(b).hexdigest() != image['sha256']:
            raise ValueError('照片內容與來源雜湊不一致。')
        if any(type(image[k]) is not int or image[k] < 32 for k in ('width', 'height')) or image['width'] * image['height'] > 40000000:
            raise ValueError('照片需至少 32 × 32 像素，最多 4000 萬像素。')
        raw.append(b)
    if data['images'][0]['sha256'] == data['images'][1]['sha256']:
        raise ValueError('相同照片不能作為不同視角。')
    baseline = data['baseline']
    if baseline is not None:
        if not isinstance(baseline, dict) or set(baseline) != {'metres', 'uncertainty'} or not all(type(v) in (int, float) and math.isfinite(v) for v in baseline.values()) or not 0 < baseline['metres'] <= 100 or not 0 <= baseline['uncertainty'] < baseline['metres']:
            raise ValueError('相機間距資料無效。')
    cal = data['calibration']
    if cal is not None:
        if not isinstance(cal, dict) or set(cal) != {'evidence', 'cameras'} or not isinstance(cal['evidence'], str) or not cal['evidence'].strip() or len(cal['evidence']) > 1000 or not isinstance(cal['cameras'], list) or len(cal['cameras']) != 2:
            raise ValueError('校正資料需兩組內參與來源說明。')
        for c, im in zip(cal['cameras'], data['images']):
            if not isinstance(c, dict) or set(c) != {'fx', 'fy', 'cx', 'cy', 'distortion'}:
                raise ValueError('相機內參欄位錯誤。')
            if not all(type(c[k]) in (int, float) and math.isfinite(c[k]) for k in ('fx','fy','cx','cy')) or not 1 <= c['fx'] <= 100000 or not 1 <= c['fy'] <= 100000 or not 0 <= c['cx'] < im['width'] or not 0 <= c['cy'] < im['height']:
                raise ValueError('相機內參需使用原始影像像素座標。')
            if not isinstance(c['distortion'], list) or len(c['distortion']) not in (4,5,8) or not all(type(v) in (int,float) and math.isfinite(v) and abs(v) <= 100 for v in c['distortion']):
                raise ValueError('畸變參數無效。')
    return raw


def process(data):
    raw = payload_check(data)
    import cv2
    import numpy as np
    cv2.setNumThreads(2)
    cv2.setRNGSeed(42)
    ims, scaled, scales, stats, keys, descriptors = [], [], [], [], [], []
    sift = cv2.SIFT_create(nfeatures=2500)
    for b, meta in zip(raw, data['images']):
        im = cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_GRAYSCALE | cv2.IMREAD_IGNORE_ORIENTATION)
        if im is None or im.shape != (meta['height'], meta['width']):
            raise ValueError('影像無法解碼或尺寸不符；請先將 EXIF 旋轉套用成實際像素後重新登錄。')
        factor = min(1., 1600 / max(im.shape))
        small = cv2.resize(im, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA) if factor < 1 else im
        scale = np.array([im.shape[1]/small.shape[1], im.shape[0]/small.shape[0]])
        kp, desc = sift.detectAndCompute(small, None)
        ims.append(im); scaled.append(small); scales.append(scale); keys.append(kp); descriptors.append(desc)
        stats.append({'features':len(kp), 'laplacianVariance':float(cv2.Laplacian(small, cv2.CV_64F).var())})
    result = {'format':'lumiere-photo-pair-result','version':1,'captureId':data['captureId'],'baseRevision':data['baseRevision'],'sourceIds':data['sourceIds'],'sourceHashes':[i['sha256'] for i in data['images']], 'engine':{'opencv':cv2.__version__,'numpy':np.__version__,'method':'SIFT-mutual-ratio-RANSAC'},'status':'insufficient-matches','diagnostics':{'images':stats,'mutualMatches':0,'fundamentalInliers':0,'homographyRatio':0.0,'coverage':[0.0,0.0]},'matches':[],'pose':None,'points':[],'calibration':data['calibration'],'baseline':data['baseline'],'suggestions':[]}
    if any(d is None or len(d)<2 for d in descriptors):
        result['suggestions']=['共同可辨識細節不足。請拍入牆角、門框或既有物件邊緣，確認對焦及照明；勿改動現場物品。']
        return result
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    def ratio(a,b):
        return {m.queryIdx:m.trainIdx for pair in matcher.knnMatch(a,b,k=2) if len(pair)==2 for m,n in [pair] if m.distance < .72*n.distance}
    forward, reverse = ratio(descriptors[0],descriptors[1]), ratio(descriptors[1],descriptors[0])
    pairs = [(a,b) for a,b in forward.items() if reverse.get(b)==a][:2500]
    result['diagnostics']['mutualMatches']=len(pairs)
    if len(pairs)<12:
        result['suggestions']=['共同特徵匹配不足。請補拍與原照片有更多共同內容的中間視角，維持物品位置並避免模糊。']
        return result
    q = [np.float64([keys[k][pair[k]].pt for pair in pairs])*scales[k] for k in range(2)]
    # Geometry works at normalized display scale so image size does not change the threshold.
    norm = max(max(im.shape) for im in ims)/1600
    f, mask = cv2.findFundamentalMat(q[0],q[1],cv2.FM_RANSAC,2*max(1,norm),.999,3000)
    inliers = mask.ravel().astype(bool) if mask is not None and f is not None and f.shape==(3,3) else np.zeros(len(pairs),bool)
    result['diagnostics']['fundamentalInliers']=int(inliers.sum())
    for k in range(2):
        if inliers.sum()>=3:
            hull=cv2.convexHull(q[k][inliers].astype(np.float32))
            result['diagnostics']['coverage'][k]=float(cv2.contourArea(hull)/(ims[k].shape[0]*ims[k].shape[1]))
    _, hm = cv2.findHomography(q[0],q[1],cv2.RANSAC,3*max(1,norm))
    hratio=float(hm.sum()/len(pairs)) if hm is not None else 0.0
    result['diagnostics']['homographyRatio']=hratio
    result['matches']=[{'left':a.tolist(),'right':b.tolist(),'inlier':bool(ok)} for a,b,ok in zip(q[0],q[1],inliers)]
    if inliers.sum()<20 or inliers.mean()<.3:
        result['status']='inconsistent-geometry';result['suggestions']=['共同點未形成穩定雙視角幾何。請檢查是否同一場景／時刻，補拍重疊視角並避免移動物體或重複紋理。'];return result
    if hratio>.85:
        result['status']='degenerate';result['suggestions']=['匹配大多符合單一平面變換，可能為平面場景或原地轉動。請側向平移並同時拍入不同遠近的物體；此結果不輸出可信深度。'];return result
    if min(result['diagnostics']['coverage'])<.06:
        result['status']='limited-coverage';result['suggestions']=['可靠匹配集中於局部。請補拍包含更多牆角與不同深度物體的共同視野。'];return result
    if data['calibration'] is None:
        result['status']='needs-calibration';result['suggestions']=['已取得自動匹配；請提供這顆鏡頭／倍率的相機校正資料，才能估計姿態及尺度。可改提供含尺寸平面圖；不以猜測焦距輸出深度。'];return result
    cs=data['calibration']['cameras']; normalized=[]
    for k,c in enumerate(cs):
        K=np.array([[c['fx'],0,c['cx']],[0,c['fy'],c['cy']],[0,0,1]],dtype=float)
        normalized.append(cv2.undistortPoints(q[k][inliers].reshape(-1,1,2),K,np.array(c['distortion'],float)).reshape(-1,2))
    threshold=2*max(1,norm)/min(c['fx'] for c in cs)
    E, em=cv2.findEssentialMat(normalized[0],normalized[1],np.eye(3),method=cv2.RANSAC,prob=.999,threshold=threshold)
    if E is None or E.shape!=(3,3):
        result['status']='pose-failed';result['suggestions']=['無法取得唯一相機姿態。請核對校正資料並增加側向視差。'];return result
    _,R,t,pm=cv2.recoverPose(E,normalized[0],normalized[1],np.eye(3),mask=em)
    xyz4=cv2.triangulatePoints(np.c_[np.eye(3),np.zeros(3)],np.c_[R,t],normalized[0].T,normalized[1].T)
    with np.errstate(divide='ignore',invalid='ignore'):
        xyz=(xyz4[:3]/xyz4[3]).T
    second=(R@xyz.T+t).T
    rays1=np.c_[normalized[0],np.ones(len(xyz))];rays2=(R.T@np.c_[normalized[1],np.ones(len(xyz))].T).T
    cos=np.sum(rays1*rays2,axis=1)/(np.linalg.norm(rays1,axis=1)*np.linalg.norm(rays2,axis=1))
    angle=np.degrees(np.arccos(np.clip(cos,-1,1)))
    with np.errstate(divide='ignore',invalid='ignore'):
        err=np.maximum(np.linalg.norm(xyz[:,:2]/xyz[:,2:]-normalized[0],axis=1),np.linalg.norm(second[:,:2]/second[:,2:]-normalized[1],axis=1))
    good=(pm.ravel()>0)&np.isfinite(xyz).all(axis=1)&(xyz[:,2]>0)&(second[:,2]>0)&(angle>=1)&(err<=threshold)
    if good.sum()<20:
        result['status']='low-parallax';result['suggestions']=['通過正深度、視差角及重投影檢查的點不足。請在安全且保有共同視野的位置增加側向位移，並核對內參。'];return result
    baseline=data['baseline'];metric=baseline is not None and baseline['uncertainty']/baseline['metres']<=.1
    scale=baseline['metres'] if metric else 1.
    result['status']='sparse-metric' if metric else 'sparse-relative'
    result['pose']={'R':R.tolist(),'t':(t.ravel()*scale).tolist(),'units':'metres-from-reported-baseline' if metric else 'baseline-units','frame':'camera-A:x-right,y-down,z-forward; camera-B = R*X+t'}
    result['points']=[{'xyz':(p*scale).tolist(),'parallaxDegrees':float(a),'normalizedReprojectionError':float(e)} for p,a,e in zip(xyz[good],angle[good],err[good])][:2000]
    result['suggestions']=['已取得稀疏幾何候選；請用獨立實測尺寸核對並補拍遮蔽面。重投影誤差不是實際尺寸精度，尚未轉為建築世界座標。']
    if not metric:result['suggestions'].append('缺少足夠可靠的相機間距，目前只有相對尺度；請補充實際位移及誤差。')
    return result

if __name__ == '__main__':
    try:
        raw=sys.stdin.buffer.read(29*1024*1024+1)
        if len(raw)>29*1024*1024:raise ValueError('照片請求過大。')
        data=json.loads(raw)
        print(json.dumps(process(data),ensure_ascii=True,allow_nan=False))
    except ImportError:
        print(json.dumps({'error':'尚未安裝經許可的 OpenCV／NumPy 獨立環境。'},ensure_ascii=True));sys.exit(2)
    except Exception as e:
        print(json.dumps({'error':str(e)},ensure_ascii=True));sys.exit(1)
