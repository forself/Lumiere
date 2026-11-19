export const DEVICE_CAPABILITIES=Object.freeze({'computer-monitor':['power'],'computer-tower':['power'],'electric-fence':['power'],light:['power','level'],ac:['power','temperature'],fridge:['power'],microwave:['power'],tv:['power'],projector:['power'], 'water-heater':['power']});
export const controlKind=assetId=>['switch','switch-double','switch-triple','breaker'].includes(assetId)?'power':assetId==='dimmer'?'level':assetId==='thermostat'?'temperature':null;
export const compatibleTarget=(controller,target)=>!!controlKind(controller.assetId)&&!!DEVICE_CAPABILITIES[target.assetId]?.includes(controlKind(controller.assetId));
export const targetValue=(controller,target)=>{const kind=controlKind(controller.assetId);return kind==='power'?Number(target.deviceState.power):target.deviceState[kind];};
export function syncDeviceLinks(project){
  for(const controller of project.objects)controller.targets.forEach((id,i)=>{if(id){const target=project.objects.find(o=>o.id===id);if(target)controller.controls[i]=targetValue(controller,target);}});
}
