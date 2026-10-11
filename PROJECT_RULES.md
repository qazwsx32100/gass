# 👑 盛隆瓦斯開發與維護核心準則 (ShengLong Core Rules)

> **最高決策者**：老闆 (Telegram ID: `8862712587`，唯一 SuperAdmin)  
> **指定雲端資料夾**：[Google 雲端維護紀錄資料夾](https://drive.google.com/drive/u/1/folders/1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM) (`1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM`)  
> **官方 GitHub 倉庫**：https://github.com/qazwsx32100/gass 與 https://github.com/qazwsx32100/shenglong-next  

---

## 🚨 強制執行 SOP（每做完一個改動必須執行）：

### 1. 📌 全局任務看板與待完成清單同步 (TODO Board)
* 每當有新的工作、需求規劃或修復進行時：
  * **啟動任務時**：立即在 `docs/TODO.md` 登記為 `[ ]` (待辦) 或 `[/]` (進行中)，明確記錄：
    * 🎯 **優先級** (`P0` / `P1` / `P2`)
    * ⏱️ **估計花費時間**
    * 🖥️ **負責設備/端點** (例如：店面主機、Vercel 雲端 API、LINE Webhook、Android App)
    * 👑 **老闆指示備註**
    * 🔗 **關聯檔案或計畫書路徑**
  * **完成任務時**：在 `docs/TODO.md` 打勾 `[x]` 並移入「近期已驗收完成」，載明完成日期與成果。
  * **桌面鏡像同步**：每次更新 `docs/TODO.md`，必須同步複製覆蓋至老闆桌面：`C:\Users\懶\Desktop\盛隆瓦斯_進行中與待完成項目看板.md`，方便老闆隨時掌握最新進度。

### 2. ☁️ Google 雲端維護紀錄即時更新
* 每完成任何一項功能新增、調整、介面優化或 Bug 修復，**必須立即更新**：
  * `docs/GOOGLE_DRIVE_RELEASE_RECORD.md`
  * `CHANGELOG.md`
* 必須在完成回應時，輸出標準格式之 **「Google 雲端專用更新日誌」**，方便老闆備查與同步至 Google 雲端硬碟指定資料夾。

### 3. 🐙 GitHub 雙軌自動同步
* 每次完成任務，必須執行 Git 變更封裝與推播：
  ```bash
  git add .
  git commit -m "feat/fix: [詳細變更說明] [ver: 2026MMDD_auto_release]"
  git push origin main
  ```

### 3. 🛡️ 雙守護進程與權限保護
* 保障本機雙服務持續長駐：
  * 主進程：`sync-stock.cjs` (即時庫存、訂單、派單同步)
  * 軍師特助：`advisor-bot.cjs` (@shenlong_advisor_bot，通訊埠 48996 實體隔離)
* 嚴格禁止降級或修改 Telegram ID `8862712587` 之唯一 SuperAdmin 最高權限。
