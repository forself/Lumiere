import importlib.util
import base64
import hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('photo_pair',Path(__file__).resolve().parents[1]/'scripts/vision/photo_pair.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def image(b):return dict(sha256=hashlib.sha256(b).hexdigest(),width=64,height=64,data=base64.b64encode(b).decode())
p=dict(captureId='capture-test',baseRevision=1,sourceIds=['source-1','source-2'],images=[image(b'a'),image(b'b')],calibration=None,baseline=None)
assert m.payload_check(p)==[b'a',b'b']
p['images'][0]['sha256']='0'*64
try:m.payload_check(p)
except ValueError:pass
else:raise AssertionError('hash mismatch accepted')
print('PASS standard-library payload checks only; no image engine imports or execution')
