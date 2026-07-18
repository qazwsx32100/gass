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
  const [viewingDetailItem, setViewingDetailItem] = useState(null);
  const [showStockPanel, setShowStockPanel] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [purchaseStartDate, setPurchaseStartDate] = useState('');
  const [purchaseEndDate, setPurchaseEndDate] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    qty50kg: '', qty20kg: '', qty16kg: '', qty10kg: '', qty4kg: '',
    empty50kg: '', empty20kg: '', empty16kg: '', empty10kg: '', empty4kg: '',
    test50kg: '', test20kg: '', test16kg: '', test10kg: '', test4kg: '',
    scrap50kg: '', scrap20kg: '', scrap16kg: '', scrap10kg: '', scrap4kg: '',
    gas50kg: '', gas20kg: '', gas16kg: '', gas10kg: '', gas4kg: '',
    totalGasKg: '',
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

  const cylinderStockSummary = useMemo(() => {
    const summary = {
      warehouseFull: { '50': 0, '20': 0, '16': 0, '10': 0, '4': 0, total: 0 },
      warehouseEmpty: { '50': 0, '20': 0, '16': 0, '10': 0, '4': 0, total: 0 },
      locations: {
        warehouse: 0,
        vehicle: 0,
        customer: 0,
        filling_station: 0,
        maintenance_vendor: 0,
        total: 0
      }
    };

    gasCylinders.forEach(cyl => {
      const spec = String(cyl.specKg || '20');
      const status = cyl.status || 'empty';
      const loc = cyl.locationType || 'warehouse';

      if (summary.locations[loc] !== undefined) {
        summary.locations[loc]++;
        summary.locations.total++;
      }

      if (loc === 'warehouse') {
        if (status === 'full') {
          if (summary.warehouseFull[spec] !== undefined) {
            summary.warehouseFull[spec]++;
          }
          summary.warehouseFull.total++;
        } else if (status === 'empty') {
          if (summary.warehouseEmpty[spec] !== undefined) {
            summary.warehouseEmpty[spec]++;
          }
          summary.warehouseEmpty.total++;
        }
      }
    });

    return summary;
  }, [gasCylinders]);

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
  const purchaseGrossKg = useMemo(() => {
    const q50 = Number(formData.qty50kg) || 0;
    const q20 = Number(formData.qty20kg) || 0;
    const q16 = Number(formData.qty16kg) || 0;
    const q10 = Number(formData.qty10kg) || 0;
    const q4  = Number(formData.qty4kg)  || 0;
    return q50 * 50 + q20 * 20 + q16 * 16 + q10 * 10 + q4 * 4;
  }, [formData.qty50kg, formData.qty20kg, formData.qty16kg, formData.qty10kg, formData.qty4kg]);

  const purchaseResidualGasKg = useMemo(() => {
    return Number(formData.totalGasKg) || 0;
  }, [formData.totalGasKg]);

  // Net kg billed = gross - residual gas (存氣)
  const purchaseTotalKg = useMemo(() => Math.max(0, purchaseGrossKg - purchaseResidualGasKg),
    [purchaseGrossKg, purchaseResidualGasKg]);

  const purchasePrice = useMemo(() => {
    return getMonthlyGasPriceForDate(formData.date);
  }, [formData.date, gasInventoryPeriods]);

  const purchaseTotalAmount = useMemo(() => {
    return Math.round(purchaseTotalKg * purchasePrice);
  }, [purchaseTotalKg, purchasePrice]);

  // Cylinder reconciliation counters
  const purchaseTotalCollected = useMemo(() => {
    const empties = (Number(formData.empty50kg)||0)+(Number(formData.empty20kg)||0)+(Number(formData.empty16kg)||0)+(Number(formData.empty10kg)||0)+(Number(formData.empty4kg)||0);
    const tests   = (Number(formData.test50kg) ||0)+(Number(formData.test20kg) ||0)+(Number(formData.test16kg) ||0)+(Number(formData.test10kg) ||0)+(Number(formData.test4kg)  ||0);
    return empties + tests;
  }, [formData.empty50kg, formData.empty20kg, formData.empty16kg, formData.empty10kg, formData.empty4kg,
      formData.test50kg,  formData.test20kg,  formData.test16kg,  formData.test10kg,  formData.test4kg]);

  const purchaseTotalReceived = useMemo(() => {
    return (Number(formData.qty50kg)||0)+(Number(formData.qty20kg)||0)+(Number(formData.qty16kg)||0)+(Number(formData.qty10kg)||0)+(Number(formData.qty4kg)||0);
  }, [formData.qty50kg, formData.qty20kg, formData.qty16kg, formData.qty10kg, formData.qty4kg]);

  const purchaseTotalScrapped = useMemo(() => {
    return (Number(formData.scrap50kg)||0)+(Number(formData.scrap20kg)||0)+(Number(formData.scrap16kg)||0)+(Number(formData.scrap10kg)||0)+(Number(formData.scrap4kg)||0);
  }, [formData.scrap50kg, formData.scrap20kg, formData.scrap16kg, formData.scrap10kg, formData.scrap4kg]);

  const purchaseBal50 = useMemo(() => ((Number(formData.empty50kg)||0)+(Number(formData.test50kg)||0)) - (Number(formData.qty50kg)||0), [formData.empty50kg, formData.test50kg, formData.qty50kg]);
  const purchaseBal20 = useMemo(() => ((Number(formData.empty20kg)||0)+(Number(formData.test20kg)||0)) - (Number(formData.qty20kg)||0), [formData.empty20kg, formData.test20kg, formData.qty20kg]);
  const purchaseBal16 = useMemo(() => ((Number(formData.empty16kg)||0)+(Number(formData.test16kg)||0)) - (Number(formData.qty16kg)||0), [formData.empty16kg, formData.test16kg, formData.qty16kg]);
  const purchaseBal10 = useMemo(() => ((Number(formData.empty10kg)||0)+(Number(formData.test10kg)||0)) - (Number(formData.qty10kg)||0), [formData.empty10kg, formData.test10kg, formData.qty10kg]);
  const purchaseBal4  = useMemo(() => ((Number(formData.empty4kg)||0) +(Number(formData.test4kg)||0))  - (Number(formData.qty4kg)||0),  [formData.empty4kg,  formData.test4kg,  formData.qty4kg]);

  // Computed fields during Monthly Period Config entry
  const monthlySumPurchaseKg = useMemo(() => {
    return gasPurchases
      .filter(p => p.date && typeof p.date === 'string' && p.date.startsWith(formData.yearMonth))
      .reduce((sum, p) => sum + (p.totalKg || 0), 0);
  }, [gasPurchases, formData.yearMonth]);

  const monthlySumPurchaseAmount = useMemo(() => {
    return gasPurchases
      .filter(p => p.date && typeof p.date === 'string' && p.date.startsWith(formData.yearMonth))
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
      qty50kg: '', qty20kg: '', qty16kg: '', qty10kg: '', qty4kg: '',
      empty50kg: '', empty20kg: '', empty16kg: '', empty10kg: '', empty4kg: '',
      test50kg: '', test20kg: '', test16kg: '', test10kg: '', test4kg: '',
      scrap50kg: '', scrap20kg: '', scrap16kg: '', scrap10kg: '', scrap4kg: '',
      gas50kg: '', gas20kg: '', gas16kg: '', gas10kg: '', gas4kg: '',
      totalGasKg: '',
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
      empty50kg: item.empty50kg?.toString() || '',
      empty20kg: item.empty20kg?.toString() || '',
      empty16kg: item.empty16kg?.toString() || '',
      empty10kg: item.empty10kg?.toString() || '',
      empty4kg: item.empty4kg?.toString() || '',
      test50kg: item.test50kg?.toString() || '',
      test20kg: item.test20kg?.toString() || '',
      test16kg: item.test16kg?.toString() || '',
      test10kg: item.test10kg?.toString() || '',
      test4kg: item.test4kg?.toString() || '',
      scrap50kg: item.scrap50kg?.toString() || '',
      scrap20kg: item.scrap20kg?.toString() || '',
      scrap16kg: item.scrap16kg?.toString() || '',
      scrap10kg: item.scrap10kg?.toString() || '',
      scrap4kg: item.scrap4kg?.toString() || '',
      gas50kg: item.gas50kg?.toString() || '',
      gas20kg: item.gas20kg?.toString() || '',
      gas16kg: item.gas16kg?.toString() || '',
      gas10kg: item.gas10kg?.toString() || '',
      gas4kg: item.gas4kg?.toString() || '',
      totalGasKg: (item.totalGasKg !== undefined ? item.totalGasKg : ((Number(item.gas50kg)||0)+(Number(item.gas20kg)||0)+(Number(item.gas16kg)||0)+(Number(item.gas10kg)||0)+(Number(item.gas4kg)||0)))?.toString() || '',
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
        empty50kg: parseInt(formData.empty50kg, 10) || 0,
        empty20kg: parseInt(formData.empty20kg, 10) || 0,
        empty16kg: parseInt(formData.empty16kg, 10) || 0,
        empty10kg: parseInt(formData.empty10kg, 10) || 0,
        empty4kg: parseInt(formData.empty4kg, 10) || 0,
        test50kg: parseInt(formData.test50kg, 10) || 0,
        test20kg: parseInt(formData.test20kg, 10) || 0,
        test16kg: parseInt(formData.test16kg, 10) || 0,
        test10kg: parseInt(formData.test10kg, 10) || 0,
        test4kg: parseInt(formData.test4kg, 10) || 0,
        scrap50kg: parseInt(formData.scrap50kg, 10) || 0,
        scrap20kg: parseInt(formData.scrap20kg, 10) || 0,
        scrap16kg: parseInt(formData.scrap16kg, 10) || 0,
        scrap10kg: parseInt(formData.scrap10kg, 10) || 0,
        scrap4kg: parseInt(formData.scrap4kg, 10) || 0,
        gas50kg: parseFloat(formData.totalGasKg) || 0,
        gas20kg: 0,
        gas16kg: 0,
        gas10kg: 0,
        gas4kg: 0,
        totalGasKg: parseFloat(formData.totalGasKg) || 0,
        grossKg: purchaseGrossKg,
        totalGasKg: purchaseResidualGasKg,
        totalKg: purchaseTotalKg,
        totalCollected: purchaseTotalCollected,
        totalReceived: purchaseTotalReceived,
        cylinderBalance: purchaseTotalCollected - purchaseTotalReceived,
        totalScrapped: purchaseTotalScrapped,
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
          📦 瓦斯進貨
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

      {/* 鋼瓶庫存概要 */}
      {activeSubTab === 'gasPurchases' && (
        <div style={{ marginBottom: '20px' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowStockPanel(!showStockPanel)}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.88rem'
            }}
          >
            <span>📊</span> {showStockPanel ? '隱藏目前倉庫鋼瓶庫存' : '查看目前倉庫鋼瓶庫存'} {showStockPanel ? '▲' : '▼'}
          </button>

          {showStockPanel && (
            <div style={{ 
              background: 'var(--bg-secondary)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '12px', 
              padding: '16px', 
              marginTop: '12px',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* 倉庫實瓶庫存 */}
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--accent-green)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--accent-green)' }}>🟢 倉庫實瓶存量</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {['50', '20', '16', '10', '4'].map(spec => (
                      <div key={spec} style={{ background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '6px', textAlign: 'center', flex: '1 1 50px' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{spec}kg</div>
                        <div style={{ fontWeight: '700', fontSize: '1rem' }}>{cylinderStockSummary.warehouseFull[spec] || 0} 桶</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    總計：<strong>{cylinderStockSummary.warehouseFull.total} 桶</strong>
                  </div>
                </div>

                {/* 倉庫空瓶庫存 */}
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--accent-gold)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--accent-gold)' }}>🟡 倉庫空瓶存量</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {['50', '20', '16', '10', '4'].map(spec => (
                      <div key={spec} style={{ background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '6px', textAlign: 'center', flex: '1 1 50px' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{spec}kg</div>
                        <div style={{ fontWeight: '700', fontSize: '1rem' }}>{cylinderStockSummary.warehouseEmpty[spec] || 0} 桶</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                    總計：<strong>{cylinderStockSummary.warehouseEmpty.total} 桶</strong>
                  </div>
                </div>

                {/* 鋼瓶分佈位置 */}
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--accent-blue)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--accent-blue)' }}>📍 鋼瓶分佈位置 (含所有狀態)</div>
                  <div style={{ gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', display: 'grid' }}>
                    <div>倉庫：<strong>{cylinderStockSummary.locations.warehouse}</strong> 桶</div>
                    <div>配送車：<strong>{cylinderStockSummary.locations.vehicle}</strong> 桶</div>
                    <div>客戶端：<strong>{cylinderStockSummary.locations.customer}</strong> 桶</div>
                    <div>分裝廠：<strong>{cylinderStockSummary.locations.filling_station}</strong> 桶</div>
                    <div>維修中：<strong>{cylinderStockSummary.locations.maintenance_vendor}</strong> 桶</div>
                    <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '4px', gridColumn: 'span 2' }}>
                      公司總資產鋼瓶數：<strong>{cylinderStockSummary.locations.total} 桶</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data Table */}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            {activeSubTab === 'gasPurchases' && (
              <tr>
                <th>交易 ID</th>
                <th>日期</th>
                <th style={{ background: 'rgba(5,178,165,0.08)' }}>進桶 (回來)</th>
                <th style={{ background: 'rgba(5,178,165,0.08)' }}>收空桶</th>
                <th style={{ background: 'rgba(5,178,165,0.08)' }}>檢驗桶</th>
                <th style={{ background: 'rgba(248,113,113,0.1)' }}>報廢桶</th>
                <th style={{ background: 'rgba(251,191,36,0.1)' }}>收桶合計</th>
                <th style={{ background: 'rgba(251,191,36,0.1)' }}>尚未回來</th>
                <th>進貨量 (kg)</th>
                <th>淨進貨 (kg)</th>
                <th>存氣扣抵 (kg)</th>
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

                  {activeSubTab === 'gasPurchases' && (() => {
                    const totalIn     = (item.qty50kg||0)+(item.qty20kg||0)+(item.qty16kg||0)+(item.qty10kg||0)+(item.qty4kg||0);
                    const totalEmpty  = (item.empty50kg||0)+(item.empty20kg||0)+(item.empty16kg||0)+(item.empty10kg||0)+(item.empty4kg||0);
                    const totalTest   = (item.test50kg||0)+(item.test20kg||0)+(item.test16kg||0)+(item.test10kg||0)+(item.test4kg||0);
                    const totalScrap  = (item.scrap50kg||0)+(item.scrap20kg||0)+(item.scrap16kg||0)+(item.scrap10kg||0)+(item.scrap4kg||0);
                    const collected   = totalEmpty + totalTest;
                    const balance     = collected - totalIn;
                    const gasDeduct   = (item.gas50kg||0)+(item.gas20kg||0)+(item.gas16kg||0)+(item.gas10kg||0)+(item.gas4kg||0);
                    const bal50 = ((item.empty50kg||0)+(item.test50kg||0)) - (item.qty50kg||0);
                    const bal20 = ((item.empty20kg||0)+(item.test20kg||0)) - (item.qty20kg||0);
                    const bal16 = ((item.empty16kg||0)+(item.test16kg||0)) - (item.qty16kg||0);
                    const bal10 = ((item.empty10kg||0)+(item.test10kg||0)) - (item.qty10kg||0);
                    const bal4  = ((item.empty4kg||0)+(item.test4kg||0)) - (item.qty4kg||0);
                    return (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => setViewingDetailItem(item)}
                            title="點選查看進貨明細"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-blue)',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0,
                              fontFamily: 'inherit',
                              fontWeight: 'bold',
                              textAlign: 'left'
                            }}
                          >
                            {item.date}
                          </button>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(5,178,165,0.05)', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{totalIn}</span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {[item.qty50kg,item.qty20kg,item.qty16kg,item.qty10kg,item.qty4kg].map((v,i)=>v>0?`${[50,20,16,10,4][i]}kg×${v}`:null).filter(Boolean).join(' ')||'-'}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(5,178,165,0.05)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <span>{totalEmpty||'-'}</span>
                          <div style={{ fontSize: '0.72rem' }}>
                            {[item.empty50kg,item.empty20kg,item.empty16kg,item.empty10kg,item.empty4kg].map((v,i)=>v>0?`${[50,20,16,10,4][i]}×${v}`:null).filter(Boolean).join(' ')||''}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(5,178,165,0.05)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <span>{totalTest||'-'}</span>
                          <div style={{ fontSize: '0.72rem' }}>
                            {[item.test50kg,item.test20kg,item.test16kg,item.test10kg,item.test4kg].map((v,i)=>v>0?`${[50,20,16,10,4][i]}×${v}`:null).filter(Boolean).join(' ')||''}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(248,113,113,0.07)', textAlign: 'center', color: totalScrap>0?'var(--accent-red)':'var(--text-secondary)' }}>
                          {totalScrap||'-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(251,191,36,0.07)', fontWeight: 700, textAlign: 'center' }}>
                          {collected||'-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', background: 'rgba(251,191,36,0.07)', textAlign: 'center', color: balance>0?'var(--accent-gold)':balance<0?'var(--accent-red)':'var(--text-secondary)' }}>
                          <span style={{ fontWeight: 700 }}>{balance !== 0 ? balance : '-'}</span>
                          {balance !== 0 && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {[bal50, bal20, bal16, bal10, bal4].map((v,i)=>v !== 0?`${[50,20,16,10,4][i]}×${v}`:null).filter(Boolean).join(' ')}
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{(item.grossKg||0).toLocaleString()} kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{(item.totalKg||0).toLocaleString()} kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {gasDeduct > 0 ? `${gasDeduct} kg` : '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.monthlyGasPrice ? `$${item.monthlyGasPrice}` : '-'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 'bold' }}>{formatCurrency(item.amount)}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: '200px' }}>{item.remarks}</td>
                      </>
                    );
                  })()}

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
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                {editingItem ? '✏️ 修改' : '➕ 建立'}{
                  activeSubTab === 'gasPurchases' ? '瓦斯進貨' :
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
                    <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>各規格回收空瓶數量 (桶)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>50 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.empty50kg} onChange={e => setFormData({ ...formData, empty50kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>20 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.empty20kg} onChange={e => setFormData({ ...formData, empty20kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>16 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.empty16kg} onChange={e => setFormData({ ...formData, empty16kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>10 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.empty10kg} onChange={e => setFormData({ ...formData, empty10kg: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>4 kg</label>
                          <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData.empty4kg} onChange={e => setFormData({ ...formData, empty4kg: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    {/* 檢驗桶 */}
                    <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--accent-blue)', borderLeftWidth: '4px' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block', color: 'var(--accent-blue)' }}>🔬 各規格送檢桶數量（送去工廠檢驗，尚未回來）</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {[['50kg', 'test50kg'], ['20kg', 'test20kg'], ['16kg', 'test16kg'], ['10kg', 'test10kg'], ['4kg', 'test4kg']].map(([label, key]) => (
                          <div className="form-group" style={{ margin: 0 }} key={key}>
                            <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>{label}</label>
                            <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData[key]} onChange={e => setFormData({ ...formData, [key]: e.target.value })} />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 報廢桶 */}
                    <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--accent-red)', borderLeftWidth: '4px' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block', color: 'var(--accent-red)' }}>🗑️ 各規格報廢桶數量（永久報廢，不會回來）</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {[['50kg', 'scrap50kg'], ['20kg', 'scrap20kg'], ['16kg', 'scrap16kg'], ['10kg', 'scrap10kg'], ['4kg', 'scrap4kg']].map(([label, key]) => (
                          <div className="form-group" style={{ margin: 0 }} key={key}>
                            <label className="form-label" style={{ fontSize: '0.78rem', textAlign: 'center', display: 'block' }}>{label}</label>
                            <input type="number" min="0" className="form-control" style={{ textAlign: 'center' }} value={formData[key]} onChange={e => setFormData({ ...formData, [key]: e.target.value })} />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 存氣 */}
                    <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--accent-gold)', borderLeftWidth: '4px' }}>
                      <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block', color: 'var(--accent-gold)' }}>💡 回收空桶存氣總量 (kg)（回收空桶內尚有殘氣，將自進氣量中扣除）</label>
                      <div className="form-group" style={{ margin: 0, maxWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="number" min="0" step="0.1" className="form-control" style={{ textAlign: 'left' }} placeholder="請輸入存氣總公斤數" value={formData.totalGasKg} onChange={e => setFormData({ ...formData, totalGasKg: e.target.value })} />
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>kg</span>
                        </div>
                      </div>
                    </div>
                    {/* Summary */}
                    <div style={{ background: 'var(--bg-secondary)', padding: '14px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px 24px' }}>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>收桶合計（送出桶）</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{purchaseTotalCollected} 桶</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>= 空桶 + 檢驗桶</div>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>進桶（回來桶）</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-green)' }}>{purchaseTotalReceived} 桶</div>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>尚未回來</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: purchaseTotalCollected - purchaseTotalReceived > 0 ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                          {purchaseTotalCollected - purchaseTotalReceived} 桶
                        </div>
                        {purchaseTotalCollected - purchaseTotalReceived !== 0 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {[
                              [50, purchaseBal50],
                              [20, purchaseBal20],
                              [16, purchaseBal16],
                              [10, purchaseBal10],
                              [4, purchaseBal4]
                            ].map(([size, val]) => val !== 0 ? `${size}kg×${val}` : null).filter(Boolean).join(' ')}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>報廢桶合計</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: purchaseTotalScrapped > 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          {purchaseTotalScrapped} 桶
                        </div>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>毛進氣 (kg)</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{purchaseGrossKg.toLocaleString()} kg</div>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>扣除存氣後淨量</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-blue)' }}>{purchaseTotalKg.toLocaleString()} kg</div>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>進氣金額</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-blue)' }}>{formatCurrency(purchaseTotalAmount)}</div>
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

      {/* Daily Purchase Detail Modal */}
      {viewingDetailItem && (
        <div className="modal-overlay" onClick={() => setViewingDetailItem(null)}>
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                📅 瓦斯進貨明細 ({viewingDetailItem.date})
              </h3>
              <button type="button" className="modal-close" onClick={() => setViewingDetailItem(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Left: Inbound/Outbound counts */}
                <div>
                  <h4 style={{ margin: '0 0 8px 0', borderBottom: '2px solid var(--accent-green)', paddingBottom: '4px', fontSize: '0.95rem' }}>🟢 回來實瓶 (進桶)</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <li>50kg: <strong>{viewingDetailItem.qty50kg || 0}</strong> 桶</li>
                    <li>20kg: <strong>{viewingDetailItem.qty20kg || 0}</strong> 桶</li>
                    <li>16kg: <strong>{viewingDetailItem.qty16kg || 0}</strong> 桶</li>
                    <li>10kg: <strong>{viewingDetailItem.qty10kg || 0}</strong> 桶</li>
                    <li>4kg: <strong>{viewingDetailItem.qty4kg || 0}</strong> 桶</li>
                    <li style={{ borderTop: '1px dashed var(--border-color)', marginTop: '4px', paddingTop: '4px', listStyle: 'none', marginLeft: '-20px' }}>
                      ⚖️ 估算毛重：<strong>{Number(viewingDetailItem.grossKg || 0).toLocaleString()} kg</strong>
                    </li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', borderBottom: '2px solid var(--accent-gold)', paddingBottom: '4px', fontSize: '0.95rem' }}>🟡 回收空桶 (送出)</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <li>50kg: <strong>{viewingDetailItem.empty50kg || 0}</strong> 桶</li>
                    <li>20kg: <strong>{viewingDetailItem.empty20kg || 0}</strong> 桶</li>
                    <li>16kg: <strong>{viewingDetailItem.empty16kg || 0}</strong> 桶</li>
                    <li>10kg: <strong>{viewingDetailItem.empty10kg || 0}</strong> 桶</li>
                    <li>4kg: <strong>{viewingDetailItem.empty4kg || 0}</strong> 桶</li>
                  </ul>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '4px', fontSize: '0.95rem' }}>🧪 送檢鋼瓶</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <li>50kg: <strong>{viewingDetailItem.test50kg || 0}</strong> 桶</li>
                    <li>20kg: <strong>{viewingDetailItem.test20kg || 0}</strong> 桶</li>
                    <li>16kg: <strong>{viewingDetailItem.test16kg || 0}</strong> 桶</li>
                    <li>10kg: <strong>{viewingDetailItem.test10kg || 0}</strong> 桶</li>
                    <li>4kg: <strong>{viewingDetailItem.test4kg || 0}</strong> 桶</li>
                  </ul>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', borderBottom: '2px solid var(--accent-red)', paddingBottom: '4px', fontSize: '0.95rem' }}>🗑️ 報廢鋼瓶</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <li>50kg: <strong>{viewingDetailItem.scrap50kg || 0}</strong> 桶</li>
                    <li>20kg: <strong>{viewingDetailItem.scrap20kg || 0}</strong> 桶</li>
                    <li>16kg: <strong>{viewingDetailItem.scrap16kg || 0}</strong> 桶</li>
                    <li>10kg: <strong>{viewingDetailItem.scrap10kg || 0}</strong> 桶</li>
                    <li>4kg: <strong>{viewingDetailItem.scrap4kg || 0}</strong> 桶</li>
                  </ul>
                </div>
              </div>

              {/* Summary and Financials */}
              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', fontSize: '0.9rem', lineHeight: '1.7', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>📊 進銷對帳與金額彙總</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  <div>收桶合計（空桶+檢驗）：<strong>{viewingDetailItem.totalCollected || 0}</strong> 桶</div>
                  <div>進桶（回來實瓶）：<strong>{viewingDetailItem.totalReceived || 0}</strong> 桶</div>
                  <div>
                    留在工廠（尚未回來）：
                    <strong style={{ color: viewingDetailItem.cylinderBalance > 0 ? 'var(--accent-gold)' : 'inherit' }}>
                      {viewingDetailItem.cylinderBalance || 0}
                    </strong> 桶
                    {viewingDetailItem.cylinderBalance !== 0 && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        ({[
                          [50, ((viewingDetailItem.empty50kg||0)+(viewingDetailItem.test50kg||0)) - (viewingDetailItem.qty50kg||0)],
                          [20, ((viewingDetailItem.empty20kg||0)+(viewingDetailItem.test20kg||0)) - (viewingDetailItem.qty20kg||0)],
                          [16, ((viewingDetailItem.empty16kg||0)+(viewingDetailItem.test16kg||0)) - (viewingDetailItem.qty16kg||0)],
                          [10, ((viewingDetailItem.empty10kg||0)+(viewingDetailItem.test10kg||0)) - (viewingDetailItem.qty10kg||0)],
                          [4,  ((viewingDetailItem.empty4kg||0) +(viewingDetailItem.test4kg||0))  - (viewingDetailItem.qty4kg||0)]
                        ].map(([size, val]) => val !== 0 ? `${size}kg×${val}` : null).filter(Boolean).join(' ')})
                      </span>
                    )}
                  </div>
                  <div>報廢桶合計：<strong style={{ color: viewingDetailItem.totalScrapped > 0 ? 'var(--accent-red)' : 'inherit' }}>{viewingDetailItem.totalScrapped || 0}</strong> 桶</div>
                  <div style={{ gridColumn: 'span 2', borderTop: '1px dashed var(--border-color)', margin: '4px 0' }}></div>
                  <div>扣抵存氣總量：<strong>{viewingDetailItem.totalGasKg || 0} kg</strong></div>
                  <div>扣除後進氣淨量：<strong>{Number(viewingDetailItem.totalKg || 0).toLocaleString()} kg</strong></div>
                  <div>當月單價：<strong>${viewingDetailItem.monthlyGasPrice || 0} / kg</strong></div>
                  <div style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>進貨費用金額：{formatCurrency(viewingDetailItem.amount)}</div>
                </div>
                {viewingDetailItem.remarks && (
                  <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    📝 <strong>備註</strong>：{viewingDetailItem.remarks}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setViewingDetailItem(null)}>關閉視窗</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
