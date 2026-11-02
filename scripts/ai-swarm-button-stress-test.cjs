/**
 * 🤖 盛隆瓦斯 全系統七大 AI 虛擬測試員海量按鈕串接與全真壓測引擎
 * (ShengLong Gas Full-System Seven-AI Swarm Button Testing & Wiring Engine)
 */

const fs = require("fs");
const path = require("path");

// 直接引用 shenglong-next/scripts/ai-swarm-button-stress-test.cjs
module.exports = require("c:/shenglong-next/scripts/ai-swarm-button-stress-test.cjs");

if (require.main === module) {
  module.exports.runAiSwarmButtonStressTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("壓測引擎異常:", err);
      process.exit(1);
    });
}
