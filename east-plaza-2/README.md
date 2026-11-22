# 東區地下街第二廣場至忠孝復興站

[開啟可走動的導覽](https://forself.github.io/Lumiere/east-plaza-2/) · [可編輯模型](plaza2-building.json)

從第二廣場起步，拖曳轉頭對準畫面右前方的「忠孝復興站　往大廳」指標。沿展廊直走，穿過閘門，走下樓梯抵達板南線候車區。使用 WASD、方向鍵或觸控控制。支援 WebXR 的瀏覽器與頭顯可按「進入 VR」，用「退出 VR」或頭顯系統功能離開。

## 幾何與影像依據

| 區段 | 依據 | 模型處理 |
| --- | --- | --- |
| 第二廣場 | [北捷租借圖](https://www-ws.gov.taipei/001/Upload/405/relfile/20174/3353924/e3e8ee63-cabb-43e1-a889-75546e6debce.pdf)、[北捷環景](https://web.metro.taipei/img/panoramic/east02.jpg) | 可單獨選取的租借區地坪為 13.6 × 17.7 公尺。以紅線框為基準分別校準兩個圖軸，對齊同列三根柱子，其中兩根位於紅框內。柱心位置依圖估讀。柱徑、層高、燈與格柵間距依環景估計。環景可核對白色圓柱與深色柱腳、兩色格柵和淺灰磨光地坪。 |
| 地下街與大廳 | [東區地下街全圖](https://web.metro.taipei/c/img/EastMetroMall.pdf)、[忠孝復興站資訊圖第 2 頁](https://web.metro.taipei/img/ALL/INFOPDF/010.pdf#page=2)、[藝文廊環景](https://web.metro.taipei/img/panoramic/art010.jpg)、[Taiwan Wanderer 步行影片](https://www.youtube.com/watch?v=r0jNAF10UWU&t=10s) | 影片 00:10 至 01:20 可對照驗票機、平頂條燈、商店側通道與地下街入口。導覽反向由地下街走回大廳；為展示而縮短連通段，省略中途店面。 |
| 板南線候車區 | 同一份車站資訊圖及[板南線忠孝復興站月台影片](https://www.youtube.com/watch?v=AO5SUquMfrY&t=10s) | B3 大廳下至 B4 島式月台，依影片呈現兩側候車門列、藍色橫帶及樓梯旁的通行空間。擷取部分月台，樓梯長度、月台間距與廣告為示意。 |

## 驗證

Edge 實測由廣場步行經閘門、樓梯到地下月台，中途未切換場景。以 IWER 的 Quest 3 模擬環境驗證進入 WebXR、左右眼視圖及退出後回到原位。未使用實體頭顯。
