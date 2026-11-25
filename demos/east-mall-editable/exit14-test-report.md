# 頂好廣場 14 號出口步行與 VR 測試

測試對象是 Lumiere 的 14 號出口局部模型。桌面以 Microsoft Edge 透過 HTTP 開啟專案內的 `street-workshop.html`。另由介面實際下載編輯後的獨立 HTML，以新的離線瀏覽器環境重開，核對相同功能。模擬器採用 IWER 的 Quest 3 裝置設定，實體頭顯、手部追蹤與現地丈量尚待驗證。

## 第二廣場至頂好廣場連續往返

此次測試的獨立 HTML 指紋為 `07cd5dc6`。Edge 透過本機 HTTP 開啟[第二廣場步行入口](street-workshop.html#plaza-walk)，只使用鍵盤與滑鼠，以同一位乘客繞行後回到起點。累計步行及乘梯 153.69 模型公尺，擷取 1,583 筆位置，回到距起點約 0.11 公尺處。最大相鄰取樣位移 0.277 公尺，瀏覽器頁面錯誤為 0。這是此次來回操作的長度。[完整路徑與版本](plaza-escalator-roundtrip-test.json)

| 階段 | 實際結果 |
| --- | --- |
| 第二廣場到 14 號梯前 | 從租借紅框內出發，繞過柱墩與梯井側牆，經共用地坪抵達左側電扶梯。[圖面與接合依據](plaza2-exit14-registration.md) |
| 搭上行梯到街面 | 踏入後放開按鍵，人物自動隨梯由 0 m 升至雨棚平台 4.95 m。離梯後以鍵盤下室外短階至 4.35 m，從人行道走進頂好廣場。[雨棚平台](plaza-roundtrip-upper-landing.jpg) · [頂好廣場](plaza-roundtrip-dinghao.jpg) |
| 回到地下 | 從廣場走回雨棚，在另一側搭下行梯到 0 m，再步行回第二廣場。期間未切換場景或跳轉起點。[搭回程電扶梯](plaza-roundtrip-return-escalator.jpg) |
| 逐件編輯及離線重開 | 在原編輯器把廣場的一段圓柱頂高從 1.62 m 改為 1.87 m，把地面租借輪廓由 380 m² 改為 361 m²，回到步行工坊可讀回這兩筆變更。封鎖網路重開匯出的 HTML 後兩筆編輯仍在，B4 的單座上行梯可搭至 B3 平台。[編輯、搭乘與離線紀錄](escalator-journey-test.json) |

同一版本也重跑原有的四套迴歸，合計 40 項全部通過。記錄分別涵蓋[出口固定樓梯（10 項）](exit14-walk-test.json)、[圖面地板（13 項）](station-floor-walk-test.json)、[站內外觀（8 項）](station-interior-walk-test.json)與[B3 挑空走道（9 項）](station-upper-gallery-test.json)。整合工坊另外驗證網頁及離線 HTML 的編輯資料一致、各自在三個場景進出雙眼 WebXR 成功。[整合工坊 20 項檢查](unified-workshop-test.json)

### 模擬頭顯、失敗及複測

用 IWER 的 Quest 3 控制器在第二廣場推動及放開右搖桿，成功進入雙眼模式並退出。退出時的人物位置與模擬頭顯最後的地面位置一致。另一項測試在下行電扶梯中途退出 VR，人物在桌面繼續隨同一部梯走到地下。[第二廣場搖桿與進出 VR](plaza-xr-ground-connection-test.json) · [搭乘中切回桌面](escalator-xr-desktop-transition-test.json)

同一檔案的前兩次接縫測試在自動放開 W 時超出指定停靠點；第一次在柱前通行帶，第二次在梯腳。修正測試操作的放鍵時機後，用原來的八個航點及位置容差走完往返。再用編輯器移開或升高地坪，確認實際缺口會擋住人物，復原後可再次通過。這些操作均使用同一版模型。[第一次失敗](plaza-xr-ground-connection-first-run.json) · [第二次失敗](plaza-xr-ground-connection-second-run.json) · [同版複測](plaza-xr-ground-connection-test.json)

## 固定樓梯版的歷史驗收（2026 年 11 月 23 日）

當時 HTML 指紋前八碼為 `44a887d4`，Microsoft Edge 158.0.4370.33 通過下列檢查，執行期間頁面錯誤為 0。模型尺寸均採局部座標。[完整量測 JSON 與 SHA-256](regressions/44a887d4/exit14-walk-test.json)

| 驗收項目 | 實測結果與證據 |
| --- | --- |
| 地下街到一樓並原路折返 | 上樓 127 筆位置取樣，高程由 0 上升至 4.95 公尺，再降至 4.35 公尺。從同一位置直接折返，109 筆取樣回到地下街。另從街面連結獨立起步下樓，118 筆取樣回到地下。三次相鄰取樣的最大高度變化均為 0.11 公尺。[地下梯腳](exit14-mall-stair.jpg) · [街面梯頭](exit14-sidewalk-stair.jpg) |
| 碰撞與街面橫走 | 樓梯上持續向左移動會被中央扶手擋住，可反向離開。在街面橫走約 4.85 公尺到樹穴，再走約 8.53 公尺到騎樓柱；兩處持續輸入都會停下。[從側面回看出口](exit14-sidewalk-angle.jpg) |
| 逐件編輯和載入 | 單獨選取雨棚招牌，修改局部 X 位置、復原，再修改並匯出。重新匯入 JSON 和離線匯出的 HTML 均讀回 0.23 公尺。 |
| 模擬頭顯線上與離線 | HTTP 工坊與離線 HTML 各按 50 次模擬頭顯向前移動控制，從地下梯前越過雨棚抵達人行道；進入與退出時各自驗證眼視圖數 0 → 2 → 0。斷網 HTML 的 HTTP 請求數為 0。[地下梯口模擬雙眼實際截圖](exit14-headset.jpg) |

## 重現與修正

| 版本指紋前八碼 | 實際觀察 | 複測證據 |
| --- | --- | --- |
| `facea33c` | HTTP 開啟地下端連結後，場景停在街區總覽。樓梯編輯框架沒有顯示。 | 用同一個 `#mall-stairs` 片段重跑舊檔和新版。JSON 報告的 `previousRelease` 保留舊檔 SHA-256、框架可見性與步行模式。 |
| `a4111361` | 原本從地下梯腳仰看，右上方露出騎樓板底，路面像懸在空中。 | 補上梯井側牆與分格吊頂後，重新從同一地下端進入核圖。[修前截圖](exit14-prior-floating-frontage.jpg) · [修後截圖](exit14-mall-stair.jpg) |
| `34637128` | 從樹穴轉向路側並低頭，室外石階與人行道的交界透出一小塊天空。 | `44a887d4` 補齊室外石階側面，用相同步驟重到樹穴，缺口處已見實體石面。兩張 1280 × 800 截圖中，同一個 54 × 77 像素區域（左上 360,445）的近天空色像素從 774 個降到 0 個。以畫面天空像素 RGB(201,220,234) 為參考，每個色頻容差 13。[修前截圖](exit14-curb-before.jpg) · [修後截圖](exit14-curb-road.jpg) |

## 重跑方法

於 Lumiere 專案目錄執行下列指令。測試會啟動臨時本機 HTTP 服務、實際用鍵盤和滑鼠走動，透過工坊選單編輯、下載、重新載入模型，最後操作模擬頭顯面板。輸出的 JSON 記錄每段路徑的起點、最高點、終點、取樣數與錯誤。若有前一版的工作坊 HTML，可加 `--before <舊版 HTML 路徑>` 重現連結失敗。

```powershell
python tests/plaza-escalator-roundtrip.py --evidence demos/east-mall-editable
python tests/station-escalator-xr.py --case all --evidence demos/east-mall-editable
python tests/escalator-journey.py --report demos/east-mall-editable/escalator-journey-test.json
python tests/street-entry-walk.py --evidence demos/east-mall-editable
```

上述首版驗收涵蓋中央固定樓梯、雨棚平台、室外短階與人行道。後續版本加入可載人的雙向電扶梯與連通的頂好廣場租借地坪。樓梯級數、高差及地坪接合位置仍屬模型參數。[實拍與圖面依據](exit14-sources.md)

### 電扶梯與廣場複測

1. 在 [地下端](street-workshop.html#exit14-up) 按 W 踏上左梯後放開，觀察人物持續上行。抵達雨棚後走向右側，在同一場景搭另一台回到地下。B4 的單座電扶梯可由[月台端](street-workshop.html#b4-escalator)試搭，向上運轉。[同場往返、單梯與離線匯出測試](escalator-journey-test.json)
2. 檢查踏階實際像素、全部踏階的 GPU 繪製次數與編輯尺寸後的踏階接縫。留存改版前的靜止畫面和複測時的運轉影片。[幾何與畫面比對報告](escalator-geometry-test.json) · [運轉影片](escalator-moving-treads.webm)
3. 用模擬頭顯搭下行梯，在途中退出 VR。確認桌面仍停留於同一部梯，放開控制器可一路被載到地下。[模擬 VR 與桌面接續測試](escalator-xr-desktop-transition-test.json)
4. 從人行道沿雨棚側步行至頂好廣場租借地坪，再繞回梯頭。頂好廣場編輯器與出口使用同一個多邊形；改動輪廓後可重新匯出供離線步行。[廣場接縫測試](exit14-plaza-walk-test.json)

全線驗收仍未通過。站內 B3、整條地下街與各個街面出口之間尚未形成一條可連續步行的模型路徑。
