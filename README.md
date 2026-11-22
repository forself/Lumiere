# Lumiere

Lumiere 是以 AI 代理操作為優先、保留人類調整能力的 2D／3D 空間設計與網頁巡覽工具。介面使用 Bricks4Agent（B4A）元件與 JSON 頁面定義，三維場景由 Three.js 渲染；原生場景以 JSON 保存。

目前可在本機編輯平面與三維場景、配置建築及物件、自由走動、比較來源圖片，並匯出完整專案或獨立巡覽網頁。照片／圖面重建仍需要代理判讀、尺度依據與驗證，不代表任意照片均可全自動或精確還原。本倉庫以通用編輯器與桌面自由巡覽為驗證範圍；頭戴 VR 尚未完成實機驗收。

## 從 Git 倉庫啟動

本倉庫不包含 `lib/`、`node_modules/`、本機視覺模型權重或使用者素材。第一次 clone 後，須還原固定版本的 B4A 三個執行庫，再安裝鎖定的 npm 依賴。不要直接使用目前 B4A 主分支取代本案釘版。

先 clone 本倉庫，再還原固定的 B4A 來源。若同層已有 `Bricks4Agent`，確認其 commit／tree 相符後可略過對它的 clone。

```powershell
git clone https://github.com/forself/Lumiere.git
cd Lumiere
git clone https://github.com/forself/Bricks4Agent.git ../Bricks4Agent
git -C ../Bricks4Agent checkout --detach aa78b47caf0488a646e7bd15eabf0fd2f235606c
Set-Content -LiteralPath .b4a-root -Encoding ascii -Value '../Bricks4Agent'
node scripts/sync-lib.mjs
npm ci
npm run check
npm run dev
```

目前 B4A lock 是 tree `8bb89f57e6fef6d0dd76c57cea20cf0406ac127e`。`sync-lib.mjs` 會驗證來源 tree 與工作區，再產生 `lib/ui_components`、`lib/page-generator`、`lib/custom_components` 複本；不應手改這些複本，也不要為了繞過不一致而重新釘版。

開啟 [本機首頁](http://127.0.0.1:8137/src/frontend/index.html)、[設計工坊](http://127.0.0.1:8137/src/frontend/index.html#/design) 或 [3D 實境導覽](http://127.0.0.1:8137/src/frontend/index.html#/tour)。服務只監聽 `127.0.0.1`，按 `Ctrl+C` 結束。需要改埠時，在啟動前設定 `$env:LUMIERE_PORT='8138'`。

`npm run dev` 會先建立獨立網頁執行包，再啟動預覽服務；只執行 `scripts/serve.mjs` 不會重建執行包。環境設定、跨平台指令與版本核對見 [倉庫安裝說明](docs/repository-setup.md)。

3D 導覽的載入、編輯、頭顯操作與驗收步驟見[導覽手冊](docs/tour.md)。

## 頭顯 VR 巡覽

在支援沉浸式 WebXR 的頭顯瀏覽器，以受信任的 HTTPS 網址開啟 3D 導覽並載入場景，或開啟新匯出的獨立 HTML。按「進入 VR」，允許使用頭顯的空間追蹤；畫面會從目前走動位置或所選樓層的可站立處開始。使用頭顯系統選單、握壓控制器側鍵，或按頁面上的「退出 VR」可返回原來的桌面視角。

本機預覽預設綁定開發電腦的 loopback。跨裝置展示時，以頭顯可存取且信任的 HTTPS 網站提供導覽或獨立 HTML。直接開啟本機檔案能否啟用 XR 取決於頭顯瀏覽器。舊 HTML 內嵌舊版程式，需要重新匯出。配戴體驗與效能仍待實體頭顯驗收。

## 主要工作流程

- **建立與調整場景**：在設計工坊使用平面／三維同步視圖。左鍵拖動構件、右鍵開啟設定，雙擊可站立的平面地坪定位；支援尺寸、方向、材質與復原。
- **來源與代理工作台**：在 [受引導採集頁](http://127.0.0.1:8137/src/frontend/index.html#/capture) 登錄圖片／尺度、補件需求與候選模型；來源照片疊合、比對相機及工作 JSON 可用於檢查重建差異。它們不構成量測精度認證。
- **儲存及交換**：純原生建築 JSON 保存模型；完整 `.lumiere` 專案可包含素材、底圖、來源照片及視角。實際內嵌內容以所載專案為準。
- **巡覽及交付**：載入 JSON 或完整專案後自由行走，平面圖顯示位置與方向；可匯出內嵌執行程式的獨立 HTML。

人物、家具、設備、車輛及戶外設施主要為參數化元件或示意資產。立面、尺寸或不可見處若缺來源，須保留推估狀態；模型與檢查結果不能直接視為施工或法規簽證。

## 驗證

依變更範圍執行相關檢查；以下是可由倉庫重跑的主要入口：

```powershell
npm run check
npm run check:standalone
```

其他測試入口列在 `package.json`。需要本機來源附件、指定輸出場景或視覺模型的生成／驗證腳本，須先提供其輸入；這類本機資料不隨公開倉庫提供。靜態與幾何測試不能代替瀏覽器操作、實體手機、頭戴 VR 或持續 GPU 效能驗收。

## 結構與文件

| 路徑 | 用途 |
| --- | --- |
| `definitions/` | B4A JSON 頁面及主題定義 |
| `src/frontend/designer/` | 原生建築資料、元件、編輯器與來源比對 |
| `src/frontend/tour/` | 導覽頁與獨立網頁匯出 |
| `src/frontend/capture/` | 受引導採集及代理工作台 |
| `scripts/`、`tests/` | 生成、建置、驗證及測試入口 |
| `capabilities/`、`docs/` | 能力契約與技術文件 |

本倉庫提供通用工具與獨立示例；原始住宅圖面、其專屬資料與本機重建案件不作為預設內容。能力契約與安裝方式以公開倉庫隨附的文件為準，不能將個別場景的測試結果套用到所有場景。

## 依賴與授權

`package-lock.json` 固定 Three.js、three-gpu-pathtracer、three-mesh-bvh、web-ifc 與 xatlas-web 的安裝版本；MIT／MPL-2.0 等第三方授權應各自保留。B4A 依上游來源與既有註記使用，本倉庫不替它新增授權條件。

本次建立公開倉庫沒有替 Lumiere 新增整體軟體授權條款；公開可讀不等於已授予任意再授權。原始圖面、使用者照片、Google 街景及其他素材的權利與程式碼分開處理，公開倉庫不附本機重建素材或模型權重。
