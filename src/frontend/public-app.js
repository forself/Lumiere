import {BasicButton,Heading,Text} from './extensions/ui-index.js';
import {Router} from './core/Router.js';
import {DesignerPage} from './designer/DesignerPage.js';
import {CapturePage} from './capture/CapturePage.js';
import {TourPage} from './tour/TourPage.js';

// 公開版從通用設計工坊開始，不載入任何客戶住宅圖面或既有個案。
class LumiereRouter extends Router {
    _showFallback(title,message) {
        this.currentPage?.destroy?.();
        this.currentPage=null;
        const container=this.layout?.getContentArea();
        if(!container)return;
        container.replaceChildren();
        const host=document.createElement('section');
        host.className='route-fallback';
        const components=[
            new Heading({text:title,level:1}),
            new Text({text:message,variant:'body'}),
            new BasicButton({type:'custom',customLabel:'返回設計工坊',showIcon:false,variant:'primary',onClick:()=>this.navigate('/design')}),
        ];
        container.appendChild(host);
        components.forEach(component=>component.mount(host));
        this.currentPage={destroy(){components.forEach(component=>component.destroy());host.remove();}};
    }

    _handle404(){this._showFallback('找不到這個工作頁','請返回設計工坊，建立或載入自己的場景。');}
    _handleError(){this._showFallback('工作頁暫時無法載入','請返回設計工坊，再試一次。');}
}

const router=new LumiereRouter({
    mode:'hash',
    layout:{getContentArea:()=>document.getElementById('app')},
    routes:[
        {path:'/',exact:true,component:DesignerPage,meta:{title:'Lumière — 空間設計工坊'}},
        {path:'/design',exact:true,component:DesignerPage,meta:{title:'空間設計工坊 — Lumière'}},
        {path:'/capture',exact:true,component:CapturePage,meta:{title:'受引導採集 — Lumière'}},
        {path:'/tour',exact:true,component:TourPage,meta:{title:'3D實境導覽 — Lumière'}},
    ],
});
router.afterEach(()=>{window.__appReady=true;});
router.start();
