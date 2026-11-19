# 從 Git 倉庫還原本機開發環境

這份說明以公開倉庫內容建立開發環境，不依賴先前的移轉執行檔。使用者圖片、輸出場景、模型權重與本機憑證另行管理。

## 固定來源

| 項目 | 固定依據 |
| --- | --- |
| B4A 上游 | https://github.com/forself/Bricks4Agent.git |
| B4A commit | `aa78b47caf0488a646e7bd15eabf0fd2f235606c` |
| B4A tree | `8bb89f57e6fef6d0dd76c57cea20cf0406ac127e`，見 `b4a.lock.json` |
| npm 套件 | `package-lock.json`；使用 `npm ci` |

本次工作機可執行 Node.js `22.13.0`、npm `11.4.2`。這是可重現環境紀錄，不代表倉庫會自動安裝 Node.js 或 npm。建置使用 Node 的 VM Modules，npm 腳本已帶入 `--experimental-vm-modules`。

## 還原 B4A 執行庫

先 clone Lumiere 並進入其根目錄。以下假設同層尚無 `Bricks4Agent`；若已有，確認來源與固定版本一致即可。

```powershell
git clone https://github.com/forself/Bricks4Agent.git ../Bricks4Agent
git -C ../Bricks4Agent checkout --detach aa78b47caf0488a646e7bd15eabf0fd2f235606c
git -C ../Bricks4Agent rev-parse 'HEAD^{tree}'
Set-Content -LiteralPath .b4a-root -Encoding ascii -Value '../Bricks4Agent'
node scripts/sync-lib.mjs
```

`rev-parse` 應輸出上表 tree。同步腳本要求該 tree 與乾淨的來源工作區相符，然後複製三個 B4A 執行庫至 `lib/`。`lib/` 是可重建的來源複本，不入 Git，也不可手改。

macOS／Linux 的步驟相同，僅以以下指令取代 PowerShell 的 `Set-Content`：

```sh
printf '%s\n' '../Bricks4Agent' > .b4a-root
```

`.b4a-root` 是被忽略的本機路徑檔。解析器也支援 `B4A_ROOT` 環境變數，但目前完整驗證腳本會直接讀取 `.b4a-root`，因此仍須建立這個檔案。使用非同層來源時，將其中一行換成該 B4A 副本的有效路徑。

日常維護 B4A 本身時可參考 `scripts/dev-link.mjs`，但本案預設驗證要求 `lib/` 為實際複本，故此安裝流程使用 `sync-lib.mjs`。更換 B4A 版本須審查與更新 lock，不應只為讓檢查通過而執行重新釘版。

## 安裝、檢查與啟動

```powershell
npm ci
npm run check
npm run dev
```

進入 http://127.0.0.1:8137/src/frontend/index.html 。設計工坊、巡覽及採集頁分別為 `#/design`、`#/tour`、`#/capture`。`npm run dev` 會先產生獨立網頁執行包；停止服務使用 `Ctrl+C`。

若需換埠：

```powershell
$env:LUMIERE_PORT='8138'
npm run dev
```

POSIX shell 可使用 `LUMIERE_PORT=8138 npm run dev`。僅監聽本機回環位址；它不是已發布的網站，也不是頭戴裝置可直接連入的遠端網址。

## 哪些檔案應重新產生

- `lib/`：由已釘版的 B4A 同步。
- `node_modules/`：由 `npm ci` 安裝。
- `src/frontend/tour/standalone-runtime.json`：執行 `npm run build:standalone` 建立；前端、B4A 定義或相關 CSS 修改後也須重建。
- `output/`／`dist/` 等產物：按所需匯出或生成腳本建立，不是 clone 後應已存在的輸入。

視覺模型是額外的本機試驗環境，不屬於網站啟動前提。不要將模型權重、虛擬環境或存取憑證放進 Git。特定圖面／街景重建腳本若要求本機附件，須由使用者自行提供；倉庫不承諾包含這些原始素材。

## 驗證界線

`npm run check` 檢查語法、定義、匯入、依賴及 B4A 三庫內容一致性。`npm run check:standalone` 檢查執行包與匯出契約。其他領域入口見 `package.json`；需要本機來源或先前輸出檔案的腳本不應當成無輸入的通用測試。

完整來源、素材及實體裝置不在公開倉庫中；歷史文件引用的畫面證據、PDF 或模型輸出不代表 clone 後已附帶，也不等於本次機器已重新驗收。
