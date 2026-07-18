import { fetchAppState, saveAppState } from '../api/_auth.js';
import fs from 'fs';
import path from 'path';

// Load .env files if present (like .env.development.local or .env)
const loadEnv = (file) => {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
};

loadEnv('.env.development.local');
loadEnv('.env.local');
loadEnv('.env');

const deviceId = process.argv[2];
if (!deviceId) {
  console.error('❌ Please specify a device ID: node scripts/approve-device.mjs <DEVICE_ID>');
  process.exit(1);
}

async function run() {
  try {
    console.log(`🔍 Fetching current cloud app state...`);
    const row = await fetchAppState();
    const state = row.state;
    if (!state) {
      throw new Error('App state is empty or invalid.');
    }

    if (!state.adminSecurity) {
      state.adminSecurity = {};
    }
    if (!Array.isArray(state.adminSecurity.approvedDevices)) {
      state.adminSecurity.approvedDevices = [];
    }

    const alreadyApproved = state.adminSecurity.approvedDevices.some(d => d.id === deviceId);
    if (alreadyApproved) {
      console.log(`✅ Device ${deviceId} is already approved!`);
      process.exit(0);
    }

    // Add device to approved list
    state.adminSecurity.approvedDevices.push({
      id: deviceId,
      label: '手動恢復裝置',
      userAgent: 'Recovery Script',
      approvedAt: new Date().toISOString(),
      status: 'approved'
    });

    // Remove from pending if present
    if (Array.isArray(state.adminSecurity.pendingDevices)) {
      state.adminSecurity.pendingDevices = state.adminSecurity.pendingDevices.filter(d => d.id !== deviceId);
    }

    console.log(`💾 Saving updated app state with approved device ${deviceId}...`);
    await saveAppState({
      state,
      updatedBy: '系統恢復腳本',
      requestIp: '127.0.0.1'
    });

    console.log(`🎉 Successfully approved device ${deviceId} for admin! You can now log in!`);
  } catch (error) {
    console.error('❌ Failed to approve device:', error.message || error);
    process.exit(1);
  }
}

run();
