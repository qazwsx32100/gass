# ⚡ Gemini 多帳號輪調與即時監控中心 (Gemini Multi-Account Rotator & Dashboard)

專為 **AI 輔助寫程式（Cline、Roo Code、Continue、Cursor、Aider 等）** 打造的高可用負載均衡與故障轉移代理伺服器。

當您使用 AI 密集寫程式而撞到單一帳號的 **429 資源耗盡（RESOURCE_EXHAUSTED / Rate Limit）** 時，本服務會在背景**零秒無縫切換到下一個備援帳號重試**，程式碼生成完全不中斷！

---

## 🌟 核心功能

1. **視覺化即時儀表板 (Web Dashboard)**
   - 瀏覽器開啟 `http://localhost:3333`。
   - 即時查看 3 組帳號的健康燈號（🟢 運行中 / 🔴 429 冷卻倒數中 / ⏸️ 停用）。
   - 累計請求數、成功率、429 化解次數、平均延遲。
   - 每筆請求即時日誌流，清楚標註「🔄 自動故障轉移 (Failover)」軌跡。
2. **雙輪調模式**
   - **故障自動轉移 (Failover)**：平時優先使用主帳號，遇到 429 配額滿時自動切換至備援帳號 A 或 B。
   - **循環負載均衡 (Round-Robin)**：每個請求平均輪流派發給 3 個帳號，降低單一帳號達到每分鐘上限（RPM）的機率。
3. **無縫 429 故障轉移 (Transparent Auto-Failover)**
   - 遇到 Google 429 時，**不對 IDE 報錯**，代理層直接以備援 Key 重試並串流回傳給 IDE。
4. **標準 OpenAI 協定相容**
   - 端點：`http://localhost:3333/v1`
   - 支援 SSE 即時串流（Streaming）與代碼補全。
   - 支援模型：`gemini-2.5-pro`、`gemini-2.5-flash`、`gemini-2.0-flash`、`gemini-1.5-pro` 等。

---

## 🚀 快速啟動

### 方式一：Windows 雙擊啟動
直接雙擊執行 [start.bat](file:///c:/Gass/tools/gemini-rotator/start.bat)，將會自動啟動服務並開啟瀏覽器儀表板。

### 方式二：終端機啟動
```powershell
cd c:\Gass\tools\gemini-rotator
node server.mjs
```

啟動後：
- **視覺化儀表板**：[http://localhost:3333](http://localhost:3333)
- **API 代理端點**：`http://localhost:3333/v1`

---

## 🔑 如何設定您的 3 個 Gemini 帳號金鑰？

1. 分別使用您的 3 個 Google 帳號，前往 [Google AI Studio](https://aistudio.google.com/)。
2. 點擊左上角 **「Get API key」** 建立一組 API Key（格式如 `AIzaSy...`）。
3. 打開儀表板 [http://localhost:3333](http://localhost:3333)，點擊右上角 **「⚙️ 管理帳號金鑰」**。
4. 分別貼入 3 組 Key，點擊 **「儲存並套用」** 即可立即生效！
5. 點擊 **「⚡ 測試連線」** 按鈕驗證 3 組 Key 是否皆能正常與 Google 通訊。

---

## 🛠️ AI 寫程式工具串接設定

### 1. VS Code - Cline / Roo Code
在擴充功能設定中填入：
- **API Provider**: `OpenAI Compatible`
- **Base URL**: `http://localhost:3333/v1`
- **API Key**: `any`（可隨意填寫，金鑰已由輪調中心管理）
- **Model ID**: `gemini-2.5-pro` 或 `gemini-2.5-flash`

### 2. VS Code - Continue.dev
在 `~/.continue/config.json` 加入：
```json
{
  "models": [
    {
      "title": "Gemini 2.5 Pro (3帳號輪調)",
      "provider": "openai",
      "model": "gemini-2.5-pro",
      "apiKey": "dummy",
      "apiBase": "http://localhost:3333/v1"
    }
  ]
}
```

### 3. Cursor
在 Cursor Settings -> Models -> OpenAI API Key：
- **Override OpenAI Base URL**: `http://localhost:3333/v1`
- **OpenAI API Key**: `any`
- 新增模型名稱：`gemini-2.5-pro`

### 4. Aider 終端機寫程式
```powershell
aider --openai-api-base http://localhost:3333/v1 --openai-api-key dummy --model openai/gemini-2.5-pro
```
