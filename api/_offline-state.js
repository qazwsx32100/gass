import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedState = null;

export const getEmergencyOfflineState = () => {
  if (cachedState) return cachedState;
  try {
    const candidates = [
      path.join(__dirname, '_offline_state.json'),
      path.join(process.cwd(), 'api', '_offline_state.json'),
      path.join(process.cwd(), '_offline_state.json')
    ];
    for (const target of candidates) {
      if (fs.existsSync(target)) {
        cachedState = JSON.parse(fs.readFileSync(target, 'utf8'));
        return cachedState;
      }
    }
  } catch (error) {
    console.error('Failed to load emergency offline state snapshot:', error);
  }
  return {
    state: {},
    updated_at: new Date().toISOString(),
    updated_by: 'offline_emergency_fallback'
  };
};
