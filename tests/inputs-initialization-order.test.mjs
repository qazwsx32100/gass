import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('InputsView initializes form state before deriving the selected account group', () => {
  const source = readFileSync(new URL('../src/pages/InputsView.jsx', import.meta.url), 'utf8');
  const formStateIndex = source.indexOf('const [formData, setFormData] = useState');
  const selectionIndex = source.indexOf('const selectedTopLevelCode = getTopLevelAccount');
  assert.notEqual(formStateIndex, -1);
  assert.notEqual(selectionIndex, -1);
  assert.ok(formStateIndex < selectionIndex, 'formData must be initialized before it is read during render');
});
