import test from 'node:test';
import assert from 'node:assert/strict';
import driverTasksHandler from '../api/driver-tasks.js';
import {
  getDriversList,
  getCentralOrders,
  addCentralOrder,
  assignOrderDriver,
  updateOrderDeliveryStatus,
  settleOrderCheckout
} from '../src/utils/orderCentral.js';

test('api/driver-tasks: handles CORS preflight OPTIONS', async () => {
  const headers = {};
  const req = { method: 'OPTIONS', headers: {} };
  const res = {
    statusCode: 0,
    setHeader(k, v) { headers[k] = v; },
    end() {}
  };
  await driverTasksHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
});

test('api/driver-tasks: GET returns tasks and cumulative unpaidAmount for driver', async () => {
  const headers = {};
  let bodyStr = '';
  const req = { method: 'GET', query: { code: 'D01' }, headers: {} };
  const res = {
    statusCode: 0,
    setHeader(k, v) { headers[k] = v; },
    end(data) { bodyStr = data; }
  };
  await driverTasksHandler(req, res);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(bodyStr);
  assert.equal(json.success, true);
  assert.equal(json.driverCode, 'D01');
  assert.equal(json.driverName, '游柏林');
  assert.ok(Array.isArray(json.tasks));
  assert.ok(json.tasks.length > 0);
  assert.equal(typeof json.unpaidAmount, 'number');
  assert.ok(json.unpaidAmount > 0);
});

test('api/driver-tasks: POST updates delivery status successfully', async () => {
  let bodyStr = '';
  const req = {
    method: 'POST',
    body: { orderId: 'SL-20261001-01', newStatus: 'delivering' },
    headers: {}
  };
  const res = {
    statusCode: 0,
    setHeader() {},
    end(data) { bodyStr = data; }
  };
  await driverTasksHandler(req, res);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(bodyStr);
  assert.equal(json.success, true);
  assert.equal(json.newStatus, 'delivering');
});

test('orderCentral: provides drivers list and order lifecycle', () => {
  const drivers = getDriversList();
  assert.ok(Array.isArray(drivers));
  assert.ok(drivers.some(d => d.name === '游柏林'));
  assert.ok(drivers.some(d => d.name === '小龍'));

  const orders = getCentralOrders();
  assert.ok(Array.isArray(orders));
  assert.ok(orders.length > 0);

  const newOrder = addCentralOrder({
    customerName: '測試火鍋店',
    phone: '0988-123-456',
    address: '新北市板橋區文化路100號',
    total: 1700
  });
  assert.ok(newOrder.orderId);
  assert.equal(newOrder.customerName, '測試火鍋店');

  const assigned = assignOrderDriver(newOrder.orderId, '游柏林');
  assert.equal(assigned.assignedDriver, '游柏林');
  assert.equal(assigned.status, 'assigned');

  const delivered = updateOrderDeliveryStatus(newOrder.orderId, 'delivered');
  assert.equal(delivered.status, 'delivered');
  assert.ok(delivered.deliveredAt);

  const settled = settleOrderCheckout(newOrder.orderId, { method: '現金' });
  assert.equal(settled.isSettled, true);
  assert.equal(settled.status, 'settled');
});
