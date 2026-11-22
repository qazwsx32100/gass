/**
 * ai-engineering-service.ts
 * 盛隆瓦斯工務與安檢 AI：30 年法定鋼瓶壽命、8 次定期檢驗模型與安全巡檢
 *
 * 遵循最高執行指令 Directive #3 第 4 條：
 * 法定壽命 30 年，30 年法定檢驗 8 次（前 20 年每 5 年 1 次共 3 次，後 10 年每 2 年 1 次共 5 次），
 * 每次檢驗費 $360 元（含角閥）。
 */

export interface CylinderRecord {
  bottleId: string;
  manufactureYear?: number;
  lastInspectionDate?: string;
  nextInspectionDate: string;
  spec?: string;
  holderName?: string;
}

export type InspectionStatus = "VALID" | "DUE_SOON" | "EXPIRED";

export interface CylinderInspectionAudit {
  bottleId: string;
  nextInspectionDate: string;
  daysRemaining: number;
  status: InspectionStatus;
  canDispatch: boolean;
  warning: string;
}

export interface CylinderInspectionSchedule {
  manufactureYear: number;
  legalLifespanYears: number;
  totalInspections: number;
  inspectionFeePerTime: number;
  inspectionIntervals: number[];
  inspectionYears: number[];
  retirementYear: number;
}

export interface FleetAuditSummary {
  total: number;
  validCount: number;
  dueSoonCount: number;
  expiredCount: number;
  complianceRate: number;
  cylinders: CylinderInspectionAudit[];
}

export function calculateCylinderInspectionSchedule(
  manufactureYear: number
): CylinderInspectionSchedule {
  const legalLifespanYears = 30;
  const totalInspections = 8;
  const inspectionFeePerTime = 360;
  const inspectionIntervals = [5, 5, 5, 2, 2, 2, 2, 2];

  let cumulativeYear = manufactureYear;
  const inspectionYears = inspectionIntervals.map((interval) => {
    cumulativeYear += interval;
    return cumulativeYear;
  });

  return {
    manufactureYear,
    legalLifespanYears,
    totalInspections,
    inspectionFeePerTime,
    inspectionIntervals,
    inspectionYears,
    retirementYear: manufactureYear + legalLifespanYears,
  };
}

export function checkCylinderInspectionStatus(
  cylinder: CylinderRecord,
  referenceDate: Date = new Date()
): CylinderInspectionAudit {
  const nextTime = new Date(cylinder.nextInspectionDate).getTime();
  const refTime = referenceDate.getTime();
  const diffMs = nextTime - refTime;
  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let status: InspectionStatus = "VALID";
  let canDispatch = true;
  let warning = "🟢 檢驗合格";

  if (daysRemaining < 0) {
    status = "EXPIRED";
    canDispatch = false;
    warning = `🚨 逾期鋼瓶：已逾期 ${Math.abs(daysRemaining)} 天，違反消防法規，嚴格禁止出貨！`;
  } else if (daysRemaining <= 30) {
    status = "DUE_SOON";
    canDispatch = true;
    warning = `🟡 檢驗臨期：將於 ${daysRemaining} 天內到期，請安排批次送往檢驗場！`;
  }

  return {
    bottleId: cylinder.bottleId,
    nextInspectionDate: cylinder.nextInspectionDate,
    daysRemaining,
    status,
    canDispatch,
    warning,
  };
}

export function auditCylinderFleet(
  fleet: CylinderRecord[],
  referenceDate: Date = new Date()
): FleetAuditSummary {
  let validCount = 0;
  let dueSoonCount = 0;
  let expiredCount = 0;

  const audited = fleet.map((c) => {
    const res = checkCylinderInspectionStatus(c, referenceDate);
    if (res.status === "VALID") validCount++;
    else if (res.status === "DUE_SOON") dueSoonCount++;
    else if (res.status === "EXPIRED") expiredCount++;
    return res;
  });

  const compliantCount = validCount + dueSoonCount;
  const complianceRate = fleet.length > 0
    ? Math.round((compliantCount / fleet.length) * 10000) / 100
    : 100;

  return {
    total: fleet.length,
    validCount,
    dueSoonCount,
    expiredCount,
    complianceRate,
    cylinders: audited,
  };
}
