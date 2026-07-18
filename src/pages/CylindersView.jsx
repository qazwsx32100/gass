import React, { useEffect, useState, useMemo } from 'react';
import {
  getGasInventoryPeriods, saveGasInventoryPeriods,
  getGasPurchases, saveGasPurchases,
  getGasCylinders, saveGasCylinders,
  getGasCylinderMovements, saveGasCylinderMovements,
  getGasDeliveryVehicles, saveGasDeliveryVehicles,
  getCustomerCylinderDeposits, saveCustomerCylinderDeposits,
  getCustomers, getLogs, addLog,
  USER_ROLES, archiveChange, archiveDeletion,
  isPeriodLocked
} from '../db/storage';
import { canInputBasicLedger } from '../utils/permissions';
import { getGasInventoryForMonth } from '../utils/financials';
const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const GAS_CYLINDER_STATUS_OPTIONS = [
  { value: 'empty', label: '空瓶' },
  { value: 'full', label: '實瓶' },
  { value: 'residual', label: '殘氣' },
  { value: 'maintenance', label: '維修中' },
  { value: 'scrapped', label: '報廢' }
];

const GAS_LOCATION_OPTIONS = [
  { value: 'warehouse', label: '倉庫' },
  { value: 'vehicle', label: '配送車' },
  { value: 'customer', label: '客戶' },
  { value: 'filling_station', label: '分裝廠' },
  { value: 'maintenance_vendor', label: '維修廠' }
];

const GAS_OWNERSHIP_OPTIONS = [
  { value: 'owned', label: '自有瓶' },
  { value: 'leased', label: '租賃瓶' },
  { value: 'customer_owned', label: '客戶瓶' },
  { value: 'supplier_owned', label: '供應商瓶' }
];

const GAS_DEPOSIT_STATUS_OPTIONS = [
  { value: 'active', label: '押瓶中' },
  { value: 'returned', label: '已退瓶' },
  { value: 'disputed', label: '爭議' },
  { value: 'lost', label: '遺失' }
];

const GAS_MOVEMENT_TYPE_OPTIONS = [
  { value: 'inbound', label: '入庫' },
  { value: 'load_vehicle', label: '裝車' },
  { value: 'deliver_customer', label: '配送給客戶' },
  { value: 'return_from_customer', label: '客戶退瓶' },
  { value: 'return_to_warehouse', label: '車輛回庫' },
  { value: 'send_maintenance', label: '送檢 / 維修' },
  { value: 'scrap', label: '報廢' },
  { value: 'manual_adjustment', label: '人工調整' }
];

const optionLabel = (options, value) => options.find(option => option.value === value)?.label || value || '-';

export default function CylindersView({ companyId, triggerRefresh, onDataChange, operatorName = '未知使用者', currentUser, userRole }) {
  const [activeSubTab, setActiveSubTab] = useState('gasPurchases');
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [purchaseStartDate, setPurchaseStartDate] = useState('');
  const [purchaseEndDate, setPurchaseEndDate] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    qty50kg: '',
    qty20kg: '',
    qty16kg: '',
    qty10kg: '',
    qty4kg: '',
    remarks: '',
    yearMonth: new Date().toISOString().substring(0, 7),
    openingKg: '',
    openingCost: '',
    purchaseKg: '',
    purchaseAmount: '',
    shrinkageKg: '',
    physicalEndingKg: '',
    monthlyGasPrice: '',
    cylinderNo: '',
    specKg: '',
    status: 'empty',
    ownershipStatus: 'owned',
    barcode: '',
    qrCode: '',
    locationType: 'warehouse',
    locationId: '',
    vehicleId: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    depositAmount: '',
    depositStatus: 'active',
    startedAt: new Date().toISOString().split('T')[0],
    returnedAt: '',
    movementDate: new Date().toISOString().split('T')[0],
    movementType: 'manual_adjustment'
  });

  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.BUSINESS_REVIEWER].includes(userRole);
  const canWrite = canInputBasicLedger(userRole);

  const blockIfPeriodLocked = (dateOrYearMonth, actionLabel = '新增') => {
    if (!isPeriodLocked(companyId, dateOrYearMonth)) return false;
    window.alert(`此月份已鎖帳，不能${actionLabel}。請重新開放月份後再操作。`);
    return true;
  };

  // Load datasets
  const gasPurchases = useMemo(() => getGasPurchases().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasInventoryPeriods = useMemo(() => getGasInventoryPeriods().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasCylinders = useMemo(() => getGasCylinders().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasDeliveryVehicles = useMemo(() => getGasDeliveryVehicles().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const customerCylinderDeposits = useMemo(() => getCustomerCylinderDeposits().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasCylinderMovements = useMemo(() => getGasCylinderMovements().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const customers = useMemo(() => getCustomers().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);

  // Helpers
  const getCylinderLabel = (id) => {
    const cylinder = gasCylinders.find(item => item.id === id);
    return cylinder?.cylinderNo || id || '-';
  };

  const getVehicleLabel = (id) => {
    const vehicle = gasDeliveryVehicles.find(item => item.id === id || item.plateNo === id);
    return vehicle ? `${vehicle.plateNo}${vehicle.name ? ` / ${vehicle.name}` : ''}` : id || '-';
  };

  const getGasLocationDisplay = (type, id, item = {}) => {
    if (type === 'vehicle') return getVehicleLabel(id || item.vehicleId);
    if (type === 'customer') return item.customerName || customers.find(c => c.id === (id || item.customerId))?.name || id || '客戶';
    return optionLabel(GAS_LOCATION_OPTIONS, type);
  };

  const getVehicleCylinderSummary = (vehicle) => {
    const vehicleCylinders = gasCylinders.filter(cylinder =>
      cylinder.locationType === 'vehicle' &&
      (cylinder.vehicleId === vehicle.id || cylinder.locationId === vehicle.id || cylinder.locationId === vehicle.plateNo)
    );
    const fullCount = vehicleCylinders.filter(cylinder => cylinder.status === 'full').length;
    const emptyCount = vehicleCylinders.filter(cylinder => cylinder.status === 'empty').length;
    const totalKg = vehicleCylinders
      .filter(cylinder => ['full', 'residual'].includes(cylinder.status))
      .reduce((sum, cylinder) => sum + Number(cylinder.specKg || 0), 0);
    return { fullCount, emptyCount, totalKg, totalCount: vehicleCylinders.length };
  };

  const getMonthlyGasPriceForDate = (dateStr) => {
    const yyyymm = dateStr.substring(0, 7);
    const period = gasInventoryPeriods.find(p => p.yearMonth === yyyymm);
    return period?.monthlyGasPrice || 0;
  };

  const generateId = (type, date) => {
    const datePrefix = date ? date.replace(/-/g, '').substring(0, 6) : new Date().toISOString().replace(/-/g, '').substring(0, 6);
    const prefix = {
      gasPurchase: `GPP${datePrefix}`,
      gas: `GAS${datePrefix}`,
      gasCylinder: `CYL${datePrefix}`,
      gasVehicle: `VEH${datePrefix}`,
      gasDeposit: `DEP${datePrefix}`,
      gasMovement: `MOV${datePrefix}`
    }[type];

    let list = [];
    if (type === 'gasPurchase') list = getGasPurchases();
    if (type === 'gas') list = getGasInventoryPeriods();
    if (type === 'gasCylinder') list = getGasCylinders();
    if (type === 'gasVehicle') list = getGasDeliveryVehicles();
    if (type === 'gasDeposit') list = getCustomerCylinderDeposits();
    if (type === 'gasMovement') list = getGasCylinderMovements();

    const matches = list
      .map(item => item.id)
      .filter(id => id && id.startsWith(prefix));

    if (matches.length === 0) {
      return `${prefix}001`;
    }

    const seqs = matches.map(id => parseInt(id.replace(prefix, ''), 10));
    const nextSeq = Math.max(...seqs) + 1;
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  const appendGasCylinderMovement = ({ before = null, after, movementType = 'manual_adjustment', remarks = '' }) => {
    if (!after?.id) return;
    const movementDate = formData.movementDate || new Date().toISOString().split('T')[0];
    const db = getGasCylinderMovements();
    const fromLocationType = before?.locationType || '';
    const fromLocationId = before?.locationId || before?.vehicleId || before?.customerId || '';
    const toLocationType = after.locationType || '';
    const toLocationId = after.locationId || after.vehicleId || after.customerId || '';

    db.push({
      id: generateId('gasMovement', movementDate),
      companyId,
      cylinderId: after.id,
      movementDate,
      movementType,
      fromLocationType,
      fromLocationId,
      toLocationType,
      toLocationId,
      customerId: after.customerId || '',
      vehicleId: after.vehicleId || '',
      operator: operatorName,
      remarks: remarks || formData.remarks || '',
      createdAt: new Date().toISOString()
    });
    saveGasCylinderMovements(db);
  };

  // Computed fields during Daily Purchase entry
  const purchaseTotalKg = useMemo(() => {
    const q50 = Number(formData.qty50kg) || 0;
    const q20 = Number(formData.qty20kg) || 0;
    const q16 = Number(formData.qty16kg) || 0;
    const q10 = Number(formData.qty10kg) || 0;
    const q4 = Number(formData.qty4kg) || 0;
    return q50 * 50 + q20 * 20 + q16 * 16 + q10 * 10 + q4 * 4;
  }, [formData.qty50kg, formData.qty20kg, formData.qty16kg, formData.qty10kg, formData.qty4kg]);

  const purchasePrice = useMemo(() => {
    return getMonthlyGasPriceForDate(formData.date);
  }, [formData.date, gasInventoryPeriods]);

  const purchaseTotalAmount = useMemo(() => {
    return Math.round(purchaseTotalKg * purchasePrice);
  }, [purchaseTotalKg, purchasePrice]);

  // Computed fields during Monthly Period Config entry
  const monthlySumPurchaseKg = useMemo(() => {
    return gasPurchases
      .filter(p => p.date.startsWith(formData.yearMonth))
      .reduce((sum, p) => sum + (p.totalKg || 0), 0);
  }, [gasPurchases, formData.yearMonth]);

  const monthlySumPurchaseAmount = useMemo(() => {
    return gasPurchases
      .filter(p => p.date.startsWith(formData.yearMonth))
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [gasPurchases, formData.yearMonth]);

  // Sync computed purchases into formData if activeSubTab is 'gas'
  useEffect(() => {
    if (activeSubTab === 'gas') {
      setFormData(prev => ({
        ...prev,
        purchaseKg: monthlySumPurchaseKg.toString(),
        purchaseAmount: monthlySumPurchaseAmount.toString()
      }));
    }
  }, [monthlySumPurchaseKg, monthlySumPurchaseAmount, activeSubTab]);

  // Filters lists
  const filteredItems = useMemo(() => {
    if (activeSubTab === 'gasPurchases') {
      let list = [...gasPurchases];
      if (purchaseStartDate) list = list.filter(item => item.date >= purchaseStartDate);
      if (purchaseEndDate) list = list.filter(item => item.date <= purchaseEndDate);
      return list.sort((a, b) => b.date.localeCompare(a.date));
    }
    if (activeSubTab === 'gas') {
      return [...gasInventoryPeriods].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    }
    if (activeSubTab === 'gasCylinders') {
      let list = [...gasCylinders];
      if (searchText) {
        const query = searchText.toLowerCase();
        list = list.filter(item =>
          (item.cylinderNo || '').toLowerCase().includes(query) ||
          (item.barcode || '').toLowerCase().includes(query) ||
          (item.qrCode || '').toLowerCase().includes(query) ||
          (item.remarks || '').toLowerCase().includes(query)
        );
      }
      if (locationFilter) {
        list = list.filter(item => item.locationType === locationFilter);
      }
      return list;
    }
    if (activeSubTab === 'gasVehicles') {
      return [...gasDeliveryVehicles];
    }
    if (activeSubTab === 'gasDeposits') {
      let list = [...customerCylinderDeposits];
      if (searchText) {
        const query = searchText.toLowerCase();
        list = list.filter(item =>
          (item.customerName || '').toLowerCase().includes(query) ||
          (item.customerPhone || '').toLowerCase().includes(query) ||
          (item.remarks || '').toLowerCase().includes(query)
        );
      }
      return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }
    if (activeSubTab === 'gasMovements') {
      return [...gasCylinderMovements].sort((a, b) => new Date(b.createdAt || b.movementDate) - new Date(a.createdAt || a.movementDate));
    }
    return [];
  }, [activeSubTab, gasPurchases, gasInventoryPeriods, gasCylinders, gasDeliveryVehicles, customerCylinderDeposits, gasCylinderMovements, purchaseStartDate, purchaseEndDate, searchText, locationFilter]);

  // Open modals
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      qty50kg: '',
      qty20kg: '',
      qty16kg: '',
      qty10kg: '',
      qty4kg: '',
      remarks: '',
      yearMonth: new Date().toISOString().substring(0, 7),
      openingKg: '',
      openingCost: '',
      purchaseKg: '',
      purchaseAmount: '',
      shrinkageKg: '',
      physicalEndingKg: '',
      monthlyGasPrice: '',
      cylinderNo: '',
      specKg: '',
      status: 'empty',
      ownershipStatus: 'owned',
      barcode: '',
      qrCode: '',
      locationType: 'warehouse',
      locationId: '',
      vehicleId: '',
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      depositAmount: '',
      depositStatus: 'active',
      startedAt: new Date().toISOString().split('T')[0],
      returnedAt: '',
      movementDate: new Date().toISOString().split('T')[0],
      movementType: 'manual_adjustment'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      ...formData,
      ...item,
      // Handle string format conversion for number values
      qty50kg: item.qty50kg?.toString() || '',
      qty20kg: item.qty20kg?.toString() || '',
      qty16kg: item.qty16kg?.toString() || '',
      qty10kg: item.qty10kg?.toString() || '',
      qty4kg: item.qty4kg?.toString() || '',
      openingKg: item.openingKg?.toString() || '',
      openingCost: item.openingCost?.toString() || '',
      purchaseKg: item.purchaseKg?.toString() || '',
      purchaseAmount: item.purchaseAmount?.toString() || '',
      shrinkageKg: item.shrinkageKg?.toString() || '',
      physicalEndingKg: item.physicalEndingKg?.toString() || '',
      monthlyGasPrice: item.monthlyGasPrice?.toString() || '',
      specKg: item.specKg?.toString() || '',
      depositAmount: item.depositAmount?.toString() || '',
      cylinderSpecKg: item.cylinderSpecKg?.toString() || '',
      capacityCylinders: item.capacityCylinders?.toString() || '',
      capacityKg: item.capacityKg?.toString() || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const now = new Date().toISOString();
    let success = false;

    // Period locked check
    if (activeSubTab === 'gasPurchases') {
      if (blockIfPeriodLocked(formData.date, editingItem ? '修改' : '新增')) return;
    } else if (activeSubTab === 'gas') {
      if (blockIfPeriodLocked(formData.yearMonth, editingItem ? '修改' : '新增')) return;
    } else if (activeSubTab === 'gasCylinders' || activeSubTab === 'gasDeposits') {
      const targetDate = formData.movementDate || formData.startedAt || new Date().toISOString().split('T')[0];
      if (blockIfPeriodLocked(targetDate, editingItem ? '修改' : '新增')) return;
    }

    if (activeSubTab === 'gasPurchases') {
      const db = getGasPurchases();
      const payload = {
        companyId,
        date: formData.date,
        qty50kg: parseInt(formData.qty50kg, 10) || 0,
        qty20kg: parseInt(formData.qty20kg, 10) || 0,
        qty16kg: parseInt(formData.qty16kg, 10) || 0,
        qty10kg: parseInt(formData.qty10kg, 10) || 0,
        qty4kg: parseInt(formData.qty4kg, 10) || 0,
        totalKg: purchaseTotalKg,
        monthlyGasPrice: purchasePrice,
        amount: purchaseTotalAmount,
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (editingItem) {
        const index = db.findIndex(x => x.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], ...payload };
          saveGasPurchases(db);
          archiveChange({ collection: 'gasPurchases', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '瓦斯進貨修改' });
          addLog(operatorName, 'UPDATE_GAS_PURCHASE', `Update daily gas purchase ${formData.date}: ${purchaseTotalKg} kg, ${formatCurrency(purchaseTotalAmount)}.`);
          success = true;
        }
      } else {
        const newId = generateId('gasPurchase', formData.date);
        db.push({ id: newId, ...payload, createdAt: now });
        saveGasPurchases(db);
        addLog(operatorName, 'CREATE_GAS_PURCHASE', `Create daily gas purchase ${formData.date}: ${purchaseTotalKg} kg, ${formatCurrency(purchaseTotalAmount)}.`);
        success = true;
      }
    }

    else if (activeSubTab === 'gas') {
      const db = getGasInventoryPeriods();
      const payload = {
        companyId,
        yearMonth: formData.yearMonth,
        openingKg: parseFloat(formData.openingKg) || 0,
        openingCost: parseFloat(formData.openingCost) || 0,
        purchaseKg: parseFloat(formData.purchaseKg) || 0,
        purchaseAmount: parseFloat(formData.purchaseAmount) || 0,
        shrinkageKg: parseFloat(formData.shrinkageKg) || 0,
        physicalEndingKg: formData.physicalEndingKg === '' ? null : parseFloat(formData.physicalEndingKg),
        monthlyGasPrice: parseFloat(formData.monthlyGasPrice) || 0,
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], ...payload };
          saveGasInventoryPeriods(db);
          archiveChange({ collection: 'gasInventoryPeriods', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '瓦斯進貨月度設定修改' });
          addLog(operatorName, 'UPDATE_GAS_INVENTORY', `Update monthly gas settings ${payload.yearMonth}: Price $${payload.monthlyGasPrice}/kg.`);
          success = true;
        }
      } else {
        const duplicated = db.some(item => item.companyId === companyId && item.yearMonth === payload.yearMonth);
        if (duplicated) {
          window.alert('該月份的設定已存在，請確認是否重複建立。');
          return;
        }
        const newId = generateId('gas', `${payload.yearMonth}-01`);
        db.push({ id: newId, ...payload, createdAt: now });
        saveGasInventoryPeriods(db);
        addLog(operatorName, 'CREATE_GAS_INVENTORY', `Create monthly gas settings ${payload.yearMonth}: Price $${payload.monthlyGasPrice}/kg.`);
        success = true;
      }
    }

    else if (activeSubTab === 'gasCylinders') {
      const db = getGasCylinders();
      const movementDate = formData.movementDate || new Date().toISOString().split('T')[0];
      const selectedCustomer = customers.find(item => item.id === formData.customerId);
      const selectedVehicle = gasDeliveryVehicles.find(item => item.id === formData.vehicleId);
      const payload = {
        companyId,
        cylinderNo: String(formData.cylinderNo || '').trim(),
        barcode: String(formData.barcode || '').trim(),
        qrCode: String(formData.qrCode || '').trim(),
        specKg: parseFloat(formData.specKg) || 0,
        ownershipStatus: formData.ownershipStatus || 'owned',
        status: formData.status || 'empty',
        locationType: formData.locationType || 'warehouse',
        locationId: formData.locationType === 'vehicle'
          ? formData.vehicleId || ''
          : formData.locationType === 'customer'
            ? formData.customerId || ''
            : formData.locationId || '',
        customerId: formData.locationType === 'customer' ? formData.customerId || '' : '',
        customerName: formData.locationType === 'customer' ? selectedCustomer?.name || formData.customerName || '' : '',
        vehicleId: formData.locationType === 'vehicle' ? formData.vehicleId || '' : '',
        vehicleName: formData.locationType === 'vehicle' ? selectedVehicle?.plateNo || formData.vehicleId || '' : '',
        depositAmount: parseFloat(formData.depositAmount) || 0,
        lastInspectionDate: formData.lastInspectionDate || '',
        nextInspectionDate: formData.nextInspectionDate || '',
        inspectionDueDate: formData.inspectionDueDate || '',
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.cylinderNo) {
        window.alert('請輸入鋼瓶編號。');
        return;
      }

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          const duplicated = db.some(item => item.id !== editingItem.id && item.companyId === companyId && item.cylinderNo === payload.cylinderNo);
          if (duplicated) {
            window.alert('鋼瓶編號已存在，請確認是否重複建立。');
            return;
          }
          db[index] = { ...db[index], ...payload };
          saveGasCylinders(db);
          const locationChanged = editingItem.locationType !== db[index].locationType ||
            editingItem.locationId !== db[index].locationId ||
            editingItem.status !== db[index].status;
          if (locationChanged) {
            appendGasCylinderMovement({
              before: editingItem,
              after: db[index],
              movementType: formData.movementType || 'manual_adjustment',
              remarks: formData.remarks || `鋼瓶 ${payload.cylinderNo} 異動`
            });
          }
          archiveChange({ collection: 'gasCylinders', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '鋼瓶資料修改' });
          addLog(operatorName, 'UPDATE_GAS_CYLINDER', `Update gas cylinder ${payload.cylinderNo}.`);
          success = true;
        }
      } else {
        const duplicated = db.some(item => item.companyId === companyId && item.cylinderNo === payload.cylinderNo);
        if (duplicated) {
          window.alert('鋼瓶編號已存在，請確認是否重複建立。');
          return;
        }
        const newId = generateId('gasCylinder', movementDate);
        const newRecord = { id: newId, ...payload, createdAt: now };
        db.push(newRecord);
        saveGasCylinders(db);
        appendGasCylinderMovement({
          before: null,
          after: newRecord,
          movementType: formData.movementType || 'inbound',
          remarks: formData.remarks || `新增鋼瓶 ${payload.cylinderNo}`
        });
        addLog(operatorName, 'CREATE_GAS_CYLINDER', `Create gas cylinder ${payload.cylinderNo}.`);
        success = true;
      }
    }

    else if (activeSubTab === 'gasVehicles') {
      const db = getGasDeliveryVehicles();
      const payload = {
        companyId,
        plateNo: String(formData.plateNo || '').trim(),
        name: formData.name || '',
        driverName: formData.driverName || '',
        capacityCylinders: parseInt(formData.capacityCylinders, 10) || 0,
        capacityKg: parseFloat(formData.capacityKg) || 0,
        active: formData.active ?? true,
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.plateNo) {
        window.alert('請輸入車牌號碼。');
        return;
      }

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          const duplicated = db.some(item => item.id !== editingItem.id && item.companyId === companyId && item.plateNo === payload.plateNo);
          if (duplicated) {
            window.alert('車牌號碼已存在，請確認是否重複建立。');
            return;
          }
          db[index] = { ...db[index], ...payload };
          saveGasDeliveryVehicles(db);
          archiveChange({ collection: 'gasDeliveryVehicles', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '配送車資料修改' });
          addLog(operatorName, 'UPDATE_GAS_VEHICLE', `Update gas delivery vehicle ${payload.plateNo}.`);
          success = true;
        }
      } else {
        const duplicated = db.some(item => item.companyId === companyId && item.plateNo === payload.plateNo);
        if (duplicated) {
          window.alert('車牌號碼已存在，請確認是否重複建立。');
          return;
        }
        const newId = generateId('gasVehicle', formData.date);
        db.push({ id: newId, ...payload, createdAt: now });
        saveGasDeliveryVehicles(db);
        addLog(operatorName, 'CREATE_GAS_VEHICLE', `Create gas delivery vehicle ${payload.plateNo}.`);
        success = true;
      }
    }

    else if (activeSubTab === 'gasDeposits') {
      const db = getCustomerCylinderDeposits();
      const cylinders = getGasCylinders();
      const selectedCylinder = cylinders.find(item => item.id === formData.cylinderId);
      const selectedCustomer = customers.find(item => item.id === formData.customerId);
      const payload = {
        companyId,
        customerId: formData.customerId || '',
        customerName: formData.customerName || selectedCustomer?.name || '',
        customerPhone: formData.customerPhone || selectedCustomer?.phone || '',
        customerAddress: formData.customerAddress || selectedCustomer?.address || '',
        cylinderId: formData.cylinderId || '',
        cylinderSpecKg: parseFloat(formData.cylinderSpecKg) || selectedCylinder?.specKg || 0,
        depositAmount: parseFloat(formData.depositAmount) || 0,
        depositStatus: formData.depositStatus || 'active',
        startedAt: formData.startedAt || new Date().toISOString().split('T')[0],
        returnedAt: formData.depositStatus === 'returned' ? formData.returnedAt || new Date().toISOString().split('T')[0] : formData.returnedAt || '',
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.customerName) {
        window.alert('請輸入客戶名稱。');
        return;
      }

      let savedDeposit = null;
      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], ...payload };
          savedDeposit = db[index];
          saveCustomerCylinderDeposits(db);
          archiveChange({ collection: 'customerCylinderDeposits', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '客戶押瓶修改' });
          addLog(operatorName, 'UPDATE_GAS_DEPOSIT', `Update customer cylinder deposit ${payload.customerName}.`);
          success = true;
        }
      } else {
        const newId = generateId('gasDeposit', payload.startedAt);
        savedDeposit = { id: newId, ...payload, createdAt: now };
        db.push(savedDeposit);
        saveCustomerCylinderDeposits(db);
        addLog(operatorName, 'CREATE_GAS_DEPOSIT', `Create customer cylinder deposit ${payload.customerName}.`);
        success = true;
      }

      if (savedDeposit?.cylinderId) {
        const cylinderIndex = cylinders.findIndex(item => item.id === savedDeposit.cylinderId);
        if (cylinderIndex !== -1) {
          const beforeCylinder = { ...cylinders[cylinderIndex] };
          if (savedDeposit.depositStatus === 'returned') {
            cylinders[cylinderIndex] = {
              ...cylinders[cylinderIndex],
              locationType: 'warehouse',
              locationId: '',
              customerId: '',
              customerName: '',
              vehicleId: '',
              status: 'empty',
              updatedAt: now
            };
          } else if (savedDeposit.depositStatus === 'active') {
            cylinders[cylinderIndex] = {
              ...cylinders[cylinderIndex],
              locationType: 'customer',
              locationId: savedDeposit.customerId || savedDeposit.customerName,
              customerId: savedDeposit.customerId || '',
              customerName: savedDeposit.customerName,
              vehicleId: '',
              depositAmount: savedDeposit.depositAmount,
              updatedAt: now
            };
          }
          saveGasCylinders(cylinders);
          appendGasCylinderMovement({
            before: beforeCylinder,
            after: cylinders[cylinderIndex],
            movementType: savedDeposit.depositStatus === 'returned' ? 'return_from_customer' : 'deliver_customer',
            remarks: savedDeposit.depositStatus === 'returned'
              ? `客戶 ${savedDeposit.customerName} 退瓶`
              : `客戶 ${savedDeposit.customerName} 押瓶建立`
          });
        }
      }
    }

    if (success) {
      setIsModalOpen(false);
      onDataChange();
    }
  };

  const handleDelete = (id) => {
    const reason = window.prompt('請輸入刪除原因。');
    if (reason === null) return; // cancel
    if (!reason.trim()) {
      window.alert('必須輸入原因才能刪除。');
      return;
    }

    let success = false;

    if (activeSubTab === 'gasPurchases') {
      const db = getGasPurchases();
      const item = db.find(g => g.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.date, '刪除資料')) return;
        archiveDeletion({ collection: 'gasPurchases', record: item, actor: operatorName, reason });
        saveGasPurchases(db.filter(g => g.id !== id));
        addLog(operatorName, 'DELETE_GAS_PURCHASE', `Delete daily gas purchase ${item.date} (${id}).`);
        success = true;
      }
    } else if (activeSubTab === 'gas') {
      const db = getGasInventoryPeriods();
      const item = db.find(g => g.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.yearMonth, '刪除資料')) return;
        archiveDeletion({ collection: 'gasInventoryPeriods', record: item, actor: operatorName, reason });
        saveGasInventoryPeriods(db.filter(g => g.id !== id));
        addLog(operatorName, 'DELETE_GAS_INVENTORY', `Delete monthly gas settings ${item.yearMonth}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasCylinders') {
      const db = getGasCylinders();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'gasCylinders', record: item, actor: operatorName, reason });
        saveGasCylinders(db.filter(g => g.id !== id));
        addLog(operatorName, 'DELETE_GAS_CYLINDER', `Delete gas cylinder ${item.cylinderNo || id}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasVehicles') {
      const db = getGasDeliveryVehicles();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'gasDeliveryVehicles', record: item, actor: operatorName, reason });
        saveGasDeliveryVehicles(db.filter(g => g.id !== id));
        addLog(operatorName, 'DELETE_GAS_VEHICLE', `Delete gas delivery vehicle ${item.plateNo || id}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasDeposits') {
      const db = getCustomerCylinderDeposits();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'customerCylinderDeposits', record: item, actor: operatorName, reason });
        saveCustomerCylinderDeposits(db.filter(g => g.id !== id));
        addLog(operatorName, 'DELETE_GAS_DEPOSIT', `Delete customer cylinder deposit ${item.customerName || id}.`);
        success = true;
      }
    }

    if (success) {
      onDataChange();
    }
  };

  return (
    <div className="card shadow-sm" style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
      {/* Page Title & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>🏷️ 鋼瓶與瓦斯進貨管理</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>追蹤瓦斯的進貨流水帳、當月單價，以及鋼瓶與配送車庫存狀態</p>
        </div>
        {canWrite && (isAdmin || activeSubTab !== 'gasMovements') && (
          <button className="btn btn-primary btn-lg" onClick={handleOpenAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>➕</span> 建立新項目
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-container" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '1px', marginBottom: '20px', overflowX: 'auto' }}>
        <button className={`tab-btn ${activeSubTab === 'gasPurchases' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gasPurchases'); setSearchText(''); }} style={{ color: 'var(--accent-blue)', fontWeight: '700' }}>
          📦 瓦斯進貨流水帳
        </button>
        <button className={`tab-btn ${activeSubTab === 'gas' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gas'); setSearchText(''); }} style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
          📅 瓦斯月度庫存價格
        </button>
        <button className={`tab-btn ${activeSubTab === 'gasCylinders' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gasCylinders'); setSearchText(''); }} style={{ color: 'var(--text-primary)' }}>
          🍼 鋼瓶清冊
        </button>
        <button className={`tab-btn ${activeSubTab === 'gasVehicles' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gasVehicles'); setSearchText(''); }}>
          🚚 配送車庫存
        </button>
        <button className={`tab-btn ${activeSubTab === 'gasDeposits' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gasDeposits'); setSearchText(''); }}>
          🤝 客戶押瓶
        </button>
        <button className={`tab-btn ${activeSubTab === 'gasMovements' ? 'active' : ''}`} onClick={() => { setActiveSubTab('gasMovements'); setSearchText(''); }} style={{ color: 'var(--accent-red)', fontWeight: '700' }}>
          🔄 鋼瓶異動紀錄
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="filters-row" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {activeSubTab === 'gasPurchases' && (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>開始日期</label>
              <input type="date" className="form-control" style={{ width: '160px' }} value={purchaseStartDate} onChange={e => setPurchaseStartDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>結束日期</label>
              <input type="date" className="form-control" style={{ width: '160px' }} value={purchaseEndDate} onChange={e => setPurchaseEndDate(e.target.value)} />
            </div>
          </>
        )}

        {(activeSubTab === 'gasCylinders' || activeSubTab === 'gasDeposits') && (
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder={activeSubTab === 'gasCylinders' ? "搜尋鋼瓶編號、條碼、備註..." : "搜尋客戶名稱、電話..."}
              className="form-control"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
        )}

        {activeSubTab === 'gasCylinders' && (
          <div className="form-group" style={{ margin: 0 }}>
            <select className="select-dropdown" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
              <option value="">所有位置</option>
              {GAS_LOCATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="table-responsive">
        <table className="table">
          <thead>
            {activeSubTab === 'gasPurchases' && (
              <tr>
                <th>交易 ID</th>
                <th>日期</th>
                <th>50kg (桶)</th>
                <th>20kg (桶)</th>
                <th>16kg (桶)</th>
                <th>10kg (桶)</th>
                <th>4kg (桶)</th>
                <th>總進貨 (kg)</th>
                <th>當月單價</th>
                <th>進氣金額</th>
                <th>備註</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
              </tr>
            )}
            {activeSubTab === 'gas' && (
              <tr>
                <th>代碼 ID</th>
                <th>成本期間</th>
                <th>期初庫存</th>
                <th>當月進貨</th>
                <th>當月進價 / kg</th>
                <th>估算銷氣量</th>
                <th>銷氣成本</th>
                <th>期末庫存</th>
                <th>備註</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
              </tr>
            )}
            {activeSubTab === 'gasCylinders' && (
              <tr>
                <th>鋼瓶 ID</th>
                <th>瓶號 / 規格</th>
                <th>狀態</th>
                <th>目前位置</th>
                <th>條碼 / QR Code</th>
                <th>檢驗期限</th>
                <th>備註</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
              </tr>
            )}
            {activeSubTab === 'gasVehicles' && (
              <tr>
                <th>車輛 ID</th>
                <th>車牌 / 名稱</th>
                <th>司機</th>
                <th>車上實瓶</th>
                <th>車上空瓶</th>
                <th>車上公斤數</th>
                <th>容量 / 狀態</th>
                <th>備註</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
              </tr>
            )}
            {activeSubTab === 'gasDeposits' && (
              <tr>
                <th>押瓶 ID</th>
                <th>客戶</th>
                <th>鋼瓶</th>
                <th>規格</th>
                <th>押金</th>
                <th>狀態</th>
                <th>押瓶 / 退瓶日期</th>
                <th>備註</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
              </tr>
            )}
            {activeSubTab === 'gasMovements' && (
              <tr>
                <th>異動 ID</th>
                <th>日期</th>
                <th>鋼瓶</th>
                <th>異動類型</th>
                <th>從</th>
                <th>到</th>
                <th>操作人</th>
                <th>備註</th>
              </tr>
            )}
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  📭 查無符合條件的資料。
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.id}</td>

                  {activeSubTab === 'gasPurchases' && (
                    <>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.qty50kg || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.qty20kg || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.qty16kg || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.qty10kg || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.qty4kg || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{item.totalKg.toLocaleString()} kg</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.monthlyGasPrice ? `$${item.monthlyGasPrice}` : '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 'bold' }}>{formatCurrency(item.amount)}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                    </>
                  )}

                  {activeSubTab === 'gas' && (() => {
                    const calc = getGasInventoryForMonth(companyId, item.yearMonth);
                    return (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{item.yearMonth}</td>
                        <td>
                          <div>{calc.openingKg.toLocaleString()} kg</div>
                          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatCurrency(calc.openingCost)}</div>
                        </td>
                        <td>
                          <div>{calc.purchaseKg.toLocaleString()} kg</div>
                          <div style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8rem' }}>{formatCurrency(calc.purchaseAmount)}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          ${item.monthlyGasPrice ? item.monthlyGasPrice.toFixed(2) : '0.00'} / kg
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{calc.soldKg.toLocaleString()} kg</td>
                        <td style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(calc.gasCogs)}</td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-mono)' }}>{calc.endingKg.toLocaleString()} kg</div>
                          <div style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8rem' }}>{formatCurrency(calc.endingCost)}</div>
                        </td>
                        <td>{item.remarks}</td>
                      </>
                    );
                  })()}

                  {activeSubTab === 'gasCylinders' && (
                    <>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.cylinderNo || '-'}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {Number(item.specKg || 0).toLocaleString()} kg / {optionLabel(GAS_OWNERSHIP_OPTIONS, item.ownershipStatus)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${item.status === 'full' ? 'approved' : item.status === 'scrapped' ? 'void' : item.status === 'maintenance' ? 'pending' : 'draft'}`}>
                          {optionLabel(GAS_CYLINDER_STATUS_OPTIONS, item.status)}
                        </span>
                      </td>
                      <td>
                        <div>{optionLabel(GAS_LOCATION_OPTIONS, item.locationType)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {getGasLocationDisplay(item.locationType, item.locationId, item)}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                        <div>{item.barcode || '-'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{item.qrCode || '-'}</div>
                      </td>
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)', color: item.inspectionDueDate && item.inspectionDueDate < new Date().toISOString().split('T')[0] ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: item.inspectionDueDate && item.inspectionDueDate < new Date().toISOString().split('T')[0] ? 700 : 400 }}>
                          {item.inspectionDueDate || item.nextInspectionDate || '未填'}
                        </div>
                        {item.lastInspectionDate && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>上次：{item.lastInspectionDate}</div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                    </>
                  )}

                  {activeSubTab === 'gasVehicles' && (() => {
                    const vehicleSummary = getVehicleCylinderSummary(item);
                    return (
                      <>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.plateNo || '-'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.name || '配送車'}</div>
                        </td>
                        <td>{item.driverName || '-'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{vehicleSummary.fullCount.toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{vehicleSummary.emptyCount.toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 700 }}>{vehicleSummary.totalKg.toLocaleString()} kg</td>
                        <td>
                          <div>{Number(item.capacityCylinders || 0).toLocaleString()} 支 / {Number(item.capacityKg || 0).toLocaleString()} kg</div>
                          <span className={`badge ${item.active === false ? 'void' : 'approved'}`}>{item.active === false ? '停用' : '使用中'}</span>
                        </td>
                        <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                      </>
                    );
                  })()}

                  {activeSubTab === 'gasDeposits' && (
                    <>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.customerName || '-'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.customerPhone || '-'}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{getCylinderLabel(item.cylinderId)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(item.cylinderSpecKg || 0).toLocaleString()} kg</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>{formatCurrency(item.depositAmount || 0)}</td>
                      <td>
                        <span className={`badge ${item.depositStatus === 'active' ? 'approved' : item.depositStatus === 'returned' ? 'draft' : item.depositStatus === 'lost' ? 'void' : 'pending'}`}>
                          {optionLabel(GAS_DEPOSIT_STATUS_OPTIONS, item.depositStatus)}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontFamily: 'var(--font-mono)' }}>{item.startedAt || '-'}</div>
                        {item.returnedAt && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>退：{item.returnedAt}</div>}
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                    </>
                  )}

                  {activeSubTab === 'gasMovements' && (
                    <>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.movementDate || '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{getCylinderLabel(item.cylinderId)}</td>
                      <td>
                        <span className="badge pending">{optionLabel(GAS_MOVEMENT_TYPE_OPTIONS, item.movementType)}</span>
                      </td>
                      <td>{getGasLocationDisplay(item.fromLocationType, item.fromLocationId, item)}</td>
                      <td>{getGasLocationDisplay(item.toLocationType, item.toLocationId, item)}</td>
                      <td>{item.operator || '-'}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                    </>
                  )}

                  {isAdmin && activeSubTab !== 'gasMovements' && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(item)} style={{ marginRight: '8px' }}>
                        修改
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>
                        刪除
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CRUD Add/Edit Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                {editingItem ? '✏️ 修改' : '➕ 建立'}{
                  activeSubTab === 'gasPurchases' ? '瓦斯進貨流水帳' :
                  activeSubTab === 'gas' ? '瓦斯月度設定' :
                  activeSubTab === 'gasCylinders' ? '鋼瓶資料' :
                  activeSubTab === 'gasVehicles' ? '配送車輛' :
                  activeSubTab === 'gasDeposits' ? '客戶押瓶' : ''
                }
              </h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {activeSubTab === 'gasPurchases' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">進貨日期</label>
                        <input type="date" required className="form-control" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">當月瓦斯進貨單價 (kg)</label>
                        <input type="text" disabled className="form-control" style={{ background: 'var(--bg-card)' }} value={purchasePrice ? `$${purchasePrice} / kg` : '未設定價格'} />
                        {purchasePrice === 0 && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--accent-red)', marginTop: '4px' }}>
                            ⚠️ 該月份的當月進貨單價尚未在「瓦斯月度設定」中進行設定！
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>各規格進貨數量 (桶)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>50 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.qty50kg} onChange={e => setFormData({ ...formData, qty50kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>20 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.qty20kg} onChange={e => setFormData({ ...formData, qty20kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>16 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.qty16kg} onChange={e => setFormData({ ...formData, qty16kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>10 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.qty10kg} onChange={e => setFormData({ ...formData, qty10kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>4 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.qty4kg} onChange={e => setFormData({ ...formData, qty4kg: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">總公斤數 (kg)</label>
                        <input type="text" disabled className="form-control" style={{ background: 'var(--bg-card)', fontWeight: 'bold' }} value={`${purchaseTotalKg.toLocaleString()} kg`} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">總進貨金額</label>
                        <input type="text" disabled className="form-control" style={{ background: 'var(--bg-card)', fontWeight: 'bold', color: 'var(--accent-blue)' }} value={formatCurrency(purchaseTotalAmount)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">備註</label>
                      <input type="text" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                  </>
                )}

                {activeSubTab === 'gas' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">成本期間</label>
                        <input type="month" required className="form-control" value={formData.yearMonth} onChange={e => setFormData({ ...formData, yearMonth: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">當月瓦斯進貨單價 (元 / kg)</label>
                        <input type="number" min="0" step="0.01" required className="form-control" placeholder="此處設定將用於每日流水帳金額計算" value={formData.monthlyGasPrice} onChange={e => setFormData({ ...formData, monthlyGasPrice: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">期初庫存公斤數</label>
                        <input type="number" min="0" step="0.01" className="form-control" value={formData.openingKg} onChange={e => setFormData({ ...formData, openingKg: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">期初庫存成本</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.openingCost} onChange={e => setFormData({ ...formData, openingCost: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">當月進貨公斤數 (唯讀/流水帳累計)</label>
                        <input type="number" disabled className="form-control" style={{ background: 'var(--bg-card)' }} value={formData.purchaseKg} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">當月進貨金額 (唯讀/流水帳累計)</label>
                        <input type="number" disabled className="form-control" style={{ background: 'var(--bg-card)' }} value={formData.purchaseAmount} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">損耗 / 調整公斤數</label>
                        <input type="number" min="0" step="0.01" className="form-control" value={formData.shrinkageKg} onChange={e => setFormData({ ...formData, shrinkageKg: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">實際期末庫存公斤數</label>
                        <input type="number" min="0" step="0.01" placeholder="留空則由系統計算" className="form-control" value={formData.physicalEndingKg} onChange={e => setFormData({ ...formData, physicalEndingKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">備註</label>
                      <input type="text" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                    <div className="alert-box info" style={{ marginTop: 0 }}>
                      月度進貨公斤數與金額，是依據「瓦斯進貨流水帳」當月的進貨資料自動加總產生。
                    </div>
                  </>
                )}

                {activeSubTab === 'gasCylinders' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">鋼瓶編號</label>
                        <input type="text" required placeholder="例如：CYL-0001" className="form-control" value={formData.cylinderNo} onChange={e => setFormData({ ...formData, cylinderNo: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">規格公斤數</label>
                        <input type="number" min="0" step="0.1" required className="form-control" value={formData.specKg} onChange={e => setFormData({ ...formData, specKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">鋼瓶狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                          {GAS_CYLINDER_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">瓶權狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.ownershipStatus} onChange={e => setFormData({ ...formData, ownershipStatus: e.target.value })}>
                          {GAS_OWNERSHIP_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">條碼欄位</label>
                        <input type="text" placeholder="預留掃碼用" className="form-control" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">QR Code 欄位</label>
                        <input type="text" placeholder="預留 QR Code 用" className="form-control" value={formData.qrCode} onChange={e => setFormData({ ...formData, qrCode: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">目前位置類型</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.locationType} onChange={e => setFormData({ ...formData, locationType: e.target.value, locationId: '', vehicleId: '', customerId: '' })}>
                          {GAS_LOCATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">異動記錄日期</label>
                        <input type="date" className="form-control" value={formData.movementDate} onChange={e => setFormData({ ...formData, movementDate: e.target.value })} />
                      </div>
                    </div>

                    {formData.locationType === 'vehicle' && (
                      <div className="form-group">
                        <label className="form-label">選擇車輛</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.vehicleId || formData.locationId} onChange={e => setFormData({ ...formData, vehicleId: e.target.value, locationId: e.target.value })}>
                          <option value="">選擇配送車...</option>
                          {gasDeliveryVehicles.map(veh => <option key={veh.id} value={veh.id}>{veh.plateNo} {veh.name ? `(${veh.name})` : ''}</option>)}
                        </select>
                      </div>
                    )}

                    {formData.locationType === 'customer' && (
                      <div className="form-row" style={{ alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">選擇系統內客戶</label>
                          <select className="select-dropdown" style={{ width: '100%' }} value={formData.customerId} onChange={e => {
                            const selected = customers.find(c => c.id === e.target.value);
                            setFormData({
                              ...formData,
                              customerId: e.target.value,
                              customerName: selected?.name || formData.customerName
                            });
                          }}>
                            <option value="">選擇客戶...</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">或輸入臨時客戶名稱</label>
                          <input type="text" className="form-control" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {['filling_station', 'maintenance_vendor'].includes(formData.locationType) && (
                      <div className="form-group">
                        <label className="form-label">目的地名稱</label>
                        <input type="text" className="form-control" placeholder="請輸入廠商名稱" value={formData.locationId} onChange={e => setFormData({ ...formData, locationId: e.target.value })} />
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">上次檢驗日期</label>
                        <input type="date" className="form-control" value={formData.lastInspectionDate} onChange={e => setFormData({ ...formData, lastInspectionDate: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">檢驗期限 / 下次檢驗日期</label>
                        <input type="date" className="form-control" value={formData.inspectionDueDate || formData.nextInspectionDate} onChange={e => setFormData({ ...formData, inspectionDueDate: e.target.value, nextInspectionDate: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">鋼瓶異動類型 (用於異動紀錄描述)</label>
                      <select className="select-dropdown" style={{ width: '100%' }} value={formData.movementType} onChange={e => setFormData({ ...formData, movementType: e.target.value })}>
                        {GAS_MOVEMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">備註</label>
                      <input type="text" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                  </>
                )}

                {activeSubTab === 'gasVehicles' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">車牌號碼</label>
                        <input type="text" required placeholder="例如：ABC-1234" className="form-control" value={formData.plateNo} onChange={e => setFormData({ ...formData, plateNo: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">車輛名稱描述</label>
                        <input type="text" placeholder="例如：1號車" className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">配送司機</label>
                      <input type="text" className="form-control" value={formData.driverName} onChange={e => setFormData({ ...formData, driverName: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">額定容納桶數</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.capacityCylinders} onChange={e => setFormData({ ...formData, capacityCylinders: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">額定容納重量 (kg)</label>
                        <input type="number" min="0" step="0.1" className="form-control" value={formData.capacityKg} onChange={e => setFormData({ ...formData, capacityKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">車輛狀態</label>
                      <select className="select-dropdown" style={{ width: '100%' }} value={formData.active === false ? 'inactive' : 'active'} onChange={e => setFormData({ ...formData, active: e.target.value === 'active' })}>
                        <option value="active">使用中</option>
                        <option value="inactive">已停用</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">備註</label>
                      <input type="text" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                  </>
                )}

                {activeSubTab === 'gasDeposits' && (
                  <>
                    <div className="form-row" style={{ alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">選擇系統內客戶</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.customerId} onChange={e => {
                          const selected = customers.find(c => c.id === e.target.value);
                          setFormData({
                            ...formData,
                            customerId: e.target.value,
                            customerName: selected?.name || formData.customerName,
                            customerPhone: selected?.phone || formData.customerPhone,
                            customerAddress: selected?.address || formData.customerAddress
                          });
                        }}>
                          <option value="">選擇客戶...</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">客戶姓名</label>
                        <input type="text" required className="form-control" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">客戶電話</label>
                        <input type="text" className="form-control" value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">客戶地址</label>
                        <input type="text" className="form-control" value={formData.customerAddress} onChange={e => setFormData({ ...formData, customerAddress: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-row" style={{ alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">繫結鋼瓶</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.cylinderId} onChange={e => {
                          const selected = gasCylinders.find(cyl => cyl.id === e.target.value);
                          setFormData({ ...formData, cylinderId: e.target.value, cylinderSpecKg: selected?.specKg || formData.cylinderSpecKg });
                        }}>
                          <option value="">選擇鋼瓶...</option>
                          {gasCylinders.map(cylinder => <option key={cylinder.id} value={cylinder.id}>{cylinder.cylinderNo} / {Number(cylinder.specKg || 0).toLocaleString()}kg / {optionLabel(GAS_CYLINDER_STATUS_OPTIONS, cylinder.status)}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">鋼瓶規格公斤數 (kg)</label>
                        <input type="number" min="0" step="0.1" className="form-control" value={formData.cylinderSpecKg} onChange={e => setFormData({ ...formData, cylinderSpecKg: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">收取代收押金</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.depositAmount} onChange={e => setFormData({ ...formData, depositAmount: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">押瓶狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.depositStatus} onChange={e => setFormData({ ...formData, depositStatus: e.target.value })}>
                          {GAS_DEPOSIT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">起租 / 押瓶日期</label>
                        <input type="date" className="form-control" value={formData.startedAt} onChange={e => setFormData({ ...formData, startedAt: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">退瓶日期</label>
                        <input type="date" className="form-control" value={formData.returnedAt} onChange={e => setFormData({ ...formData, returnedAt: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">備註</label>
                      <input type="text" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>取消</button>
                <button type="submit" className="btn btn-primary">儲存變更</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
