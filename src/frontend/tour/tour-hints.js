// Instructions for the two ways people operate the tour. The touch copy only
// names gestures a phone or tablet has: no wheel, mouse button or keyboard key.
export const TOUR_HINTS = Object.freeze({
  pointer: Object.freeze({
    help: '環繞：拖曳與滾輪。走動：WASD／方向鍵，或按住觸控按鈕移動、轉向；拖曳畫面轉頭。雙擊平面地坪定位，紅點顯示位置；Esc 離開。',
    emptyNote: '檔案只在本機讀取。載入後可用平面圖定位，再以 WASD／方向鍵自由走動。',
    walk: '自由走動：WASD／方向鍵或觸控按鈕移動、拖曳轉頭；雙擊平面圖定位，Esc 離開。',
    orbit: '環繞檢視：拖曳旋轉，滾輪縮放。',
    viewSuffix: '；可繼續拖曳旋轉或滾輪縮放。',
    floorChanged: '已切換平面樓層；雙擊地坪可前往該層。',
    placementSuffix: '：點選 3D 或平面圖中的地坪；Esc 取消。',
    planCaption: '雙擊定位',
    planHint: null,
    sceneTitle: '拖曳環繞檢視；自由走動時以 WASD／方向鍵移動，拖曳轉頭。',
    planTitle: '左鍵雙擊地坪定位；滾輪縮放，右鍵拖曳平移；紅點代表目前位置。',
    touchHelp: '按住移動／轉向；拖曳畫面抬頭、低頭',
    vrTitle: '使用頭顯進入空間；握壓控制器側鍵可退出。',
    vrUnavailableTitle: '查看頭顯及安全連線需求',
    vrUnavailable: '請在支援 WebXR 的頭顯瀏覽器開啟安全來源（例如 HTTPS），並確認裝置已連線。仍可使用桌面自由走動。',
    vrStarting: '請在頭顯中確認進入 VR；握壓控制器側鍵可退出。'
  }),
  touch: Object.freeze({
    help: '環繞：單指拖曳旋轉，雙指縮放與平移。走動：按住畫面上的按鈕移動、轉向，拖曳畫面或轉動手機環顧。在平面圖點兩下地坪定位，紅點顯示位置。',
    emptyNote: '檔案只在本機讀取。載入後可用平面圖定位，再按住畫面上的按鈕自由走動。',
    walk: '自由走動：按住畫面上的按鈕移動，拖曳畫面或轉動手機環顧；在平面圖點兩下可定位。',
    orbit: '環繞檢視：單指拖曳旋轉，雙指縮放與平移。',
    viewSuffix: '；可繼續單指拖曳旋轉或雙指縮放。',
    floorChanged: '已切換平面樓層；在地坪點兩下可前往該層。',
    placementSuffix: '：點一下 3D 或平面圖中的地坪；按「取消放置」可取消。',
    planCaption: '點兩下定位',
    planHint: '點兩下地坪巡覽',
    sceneTitle: '單指拖曳環繞檢視；自由走動時按住畫面上的按鈕移動，拖曳畫面轉頭。',
    planTitle: '在地坪點兩下定位；紅點代表目前位置。',
    touchHelp: '按住移動／轉向；拖曳畫面抬頭、低頭',
    vrTitle: '把手機橫放進紙板眼鏡觀看；看著地面或門窗點一下螢幕操作，按返回鍵退出。',
    vrUnavailableTitle: '查看手機 VR 的瀏覽器與安全連線需求',
    vrUnavailable: '這個瀏覽器沒有提供 VR 模式；請用 Android 版 Chrome，並從安全來源（HTTPS 或 localhost）開啟。仍可使用觸控走動。',
    vrStarting: '正在進入 VR；請把手機橫放進紙板眼鏡，按返回鍵可退出。'
  })
});

export const GYRO_HINTS = Object.freeze({
  help: '轉動手機環顧；按住按鈕移動，左右拖曳可轉向',
  on: '已開啟陀螺儀轉頭：拿起手機轉動即可環顧，按住按鈕移動。',
  off: '已關閉陀螺儀轉頭，改用拖曳畫面或轉向鍵。',
  denied: '未取得動作與方向感測權限，改用觸控轉頭。',
  unavailable: '這個裝置沒有回報方向感測資料，改用觸控轉頭。'
});

export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

// Phones and tablets: the primary pointer is a finger and nothing hovers.
export function touchPrimary(target = globalThis) {
  return !!target.matchMedia?.(TOUCH_QUERY).matches;
}

export function tourHints(touch) {
  return TOUR_HINTS[touch ? 'touch' : 'pointer'];
}
