export const OUTDOOR_ASSETS=[
 ['asphalt-road','車道柏油路','paving',6,12,.12,'#45494b',true],['concrete-paving','水泥鋪面','paving',6,12,.12,'#a5a59d',true],['steel-paving','鋼板鋪面','paving',3,6,.025,'#69757a',true],['dirt-ground','泥土地','paving',6,8,.08,'#94724d'],['gravel-ground','碎石地','paving',6,8,.1,'#8d8980'],
 ['traffic-island','分隔島','island',1.5,8,.25,'#b8b7a9'],['hedge-island','帶樹籬分隔島','hedge-island',1.5,8,1.2,'#4f7045'],['bus-island','帶公車站分隔島','bus-island',2.5,8,2.8,'#98acb3'],
 ['brick-sidewalk','路邊紅磚人行道','sidewalk',2,8,.15,'#a55d49'],['concrete-sidewalk','水泥人行道','sidewalk',2,8,.15,'#b4b3a9'],['green-sidewalk','平面綠漆人行道','paving',1.5,8,.005,'#4a9276'],
 ['curb-red','路邊紅線','line',.15,8,.006,'#d54d42'],['curb-white','路邊白線','line',.15,8,.006,'#f4f1df'],['curb-yellow','路邊黃線','line',.15,8,.006,'#e5c448'],
 ['lane-dashed-white','車道白虛線（整組）','marking-group',.12,10,.008,'#f4f1df'],['lane-double-yellow','雙黃實線（整組）','marking-group',.36,10,.008,'#e5c448'],
 ['drain-cover','水溝蓋','drain',.5,1,.06,'#555e60'],['manhole-cover','維護人孔蓋','manhole',.65,.65,.06,'#5b6060'],
 ['traffic-signal','紅綠燈','signal',.55,.45,3.5,'#333b3d'],['directional-signal','多時向紅綠燈','directional-signal',1.2,.45,3.5,'#333b3d'],['pedestrian-signal','行人紅綠燈','pedestrian-signal',.45,.35,2.5,'#333b3d'],['crosswalk','枕木紋行人穿越道','crosswalk',4,5,.008,'#f2efda'],
 ['footbridge','行人天橋（雙端階梯）','footbridge',2.5,24,5,'#b7bec0'],['underpass','行人地下道（雙端階梯）','underpass',2.5,20,3,'#aeb3b0']
].map(([id,name,shape,width,depth,height,color,markable=false])=>({id,name,shape,category:'outdoor',width,depth,height,color,materialId:'stone',elevation:shape==='underpass'?-height:0,outdoor:true,markable}));
export const ROAD_MARKINGS={none:'無標線',white:'白實線',whiteDash:'白虛線',yellow:'黃實線',doubleYellow:'雙黃實線',crosswalk:'枕木紋行人穿越道',arrow:'直行箭頭'};
export const SIGNAL_STATES={red:'紅燈',yellow:'黃燈',green:'綠燈',off:'熄燈'};
export const SIGNAL_DIRECTIONS={straight:'直行',left:'左轉',right:'右轉',all:'多方向'};

export const signalLampCount=o=>o.outdoor?.lampCount??(o.assetId==='pedestrian-signal'?2:3);
export function signalLampStates(o){const n=signalLampCount(o);return n===1?[o.outdoor.signal==='off'?'red':o.outdoor.signal]:n===2?['red','green']:Array.from({length:n},(_,i)=>i===0?'red':i===1?'yellow':'green');}
