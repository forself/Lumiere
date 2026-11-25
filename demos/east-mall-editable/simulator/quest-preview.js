import { XRDevice, metaQuest3 } from './iwer.module.min.js';

export function installSimulator(){
    const device=new XRDevice(metaQuest3,{stereoEnabled:true});
    device.installRuntime({forceInstall:true});

    function showControls(session,canvas){
        let yaw=0;
        const startX=device.position.x,startZ=device.position.z;
        const panel=document.createElement('nav');
        panel.setAttribute('aria-label','模擬頭顯控制');
        Object.assign(panel.style,{
            position:'fixed',top:'auto',left:'50%',right:'auto',bottom:'12px',
            transform:'translateX(-50%)',zIndex:'2147483647',display:'flex',alignItems:'center',
            justifyContent:'center',width:'max-content',maxWidth:'94vw',padding:'8px',
            gap:'6px',flexWrap:'wrap',background:'#fffef4',borderRadius:'6px'
        });
        const title=document.createElement('strong');
        title.textContent='Quest 3 模擬';
        panel.append(title);
        function turn(degrees){
            yaw+=degrees*Math.PI/180;
            device.quaternion.set(0,Math.sin(yaw/2),0,Math.cos(yaw/2));
        }
        function action(label,run){
            const button=document.createElement('button');
            button.textContent=label;
            button.onclick=()=>{run();canvas.focus();};
            panel.append(button);
        }
        turn(0);
        function advance(metres){
            device.position.x-=Math.sin(yaw)*metres;
            device.position.z-=Math.cos(yaw)*metres;
        }
        action('左轉',()=>turn(15));
        action('右轉',()=>turn(-15));
        action('左移頭部',()=>{device.position.x-=.15;});
        action('右移頭部',()=>{device.position.x+=.15;});
        action('向前移動',()=>advance(.35));
        action('向後移動',()=>advance(-.35));
        let activeStick=null;
        function releaseStick(button){
            if(activeStick!==button)return;
            device.controllers.right.updateAxes('thumbstick',0,0);
            button.setAttribute('aria-pressed','false');activeStick=null;
        }
        function stickButton(label,axis){
            const button=document.createElement('button');
            button.type='button';button.textContent=label;button.setAttribute('aria-pressed','false');
            const press=()=>{
                if(activeStick&&activeStick!==button)releaseStick(activeStick);
                activeStick=button;button.setAttribute('aria-pressed','true');
                device.controllers.right.updateAxes('thumbstick',0,axis);
            };
            button.onpointerdown=event=>{
                if(event.button!==0)return;
                event.preventDefault();button.setPointerCapture(event.pointerId);press();
            };
            button.onlostpointercapture=()=>releaseStick(button);
            button.onkeydown=event=>{
                if(event.key===' '||event.key==='Enter'){event.preventDefault();press();}
            };
            button.onkeyup=event=>{
                if(event.key===' '||event.key==='Enter'){event.preventDefault();releaseStick(button);}
            };
            button.onblur=()=>releaseStick(button);
            panel.append(button);
        }
        stickButton('右搖桿前進',-1);
        stickButton('右搖桿後退',1);
        action('回正',()=>{yaw=0;turn(0);device.position.x=startX;device.position.z=startZ;});
        action('退出模擬',()=>session.end());
        document.body.append(panel);
        session.addEventListener('end',()=>{
            if(activeStick)releaseStick(activeStick);
            panel.remove();device.position.x=startX;device.position.z=startZ;yaw=0;turn(0);
        },{once:true});
    }
    return {showControls};
}

