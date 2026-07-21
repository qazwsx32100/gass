import { USER_ROLES } from '../db/storage';

const ALL_TABS = ['dashboard', 'reports', 'inputs', 'cylinders', 'settings', 'firebase', 'shareholderZone', 'auditZone'];

export const SENSITIVE_BOOKKEEPER_TABS = ['dashboard', 'reports'];

export const getAllowedTabsForUser = (userRole, user) => {
  if (userRole === USER_ROLES.ADMIN) return ALL_TABS;

  const configuredTabs = user?.allowedTabs || [];
  const baseTabs = configuredTabs.includes('inputs') && !configuredTabs.includes('cylinders')
    ? [...configuredTabs, 'cylinders']
    : configuredTabs;

  const hasShareholderAccess = userRole === USER_ROLES.READONLY_SHAREHOLDER || userRole === USER_ROLES.BUSINESS_REVIEWER;
  const hasAuditAccess = userRole === USER_ROLES.BOOKKEEPER || userRole === USER_ROLES.BUSINESS_REVIEWER;
  let finalTabs = [...baseTabs];
  
  if (hasShareholderAccess && !finalTabs.includes('shareholderZone')) {
    finalTabs.push('shareholderZone');
  }
  if (hasAuditAccess && !finalTabs.includes('auditZone')) {
    finalTabs.push('auditZone');
  }

  if (userRole === USER_ROLES.BOOKKEEPER) {
    return finalTabs.filter(tab => ['dashboard', 'reports', 'inputs', 'cylinders', 'auditZone'].includes(tab));
  }

  if (userRole === USER_ROLES.READONLY_SHAREHOLDER) {
    const tabs = finalTabs.filter(tab => ['dashboard', 'reports', 'settings', 'shareholderZone'].includes(tab));
    return tabs.includes('settings') ? tabs : [...tabs, 'settings'];
  }

  if (userRole === USER_ROLES.BUSINESS_REVIEWER) {
    const tabs = finalTabs.filter(tab => ['dashboard', 'reports', 'inputs', 'cylinders', 'settings', 'shareholderZone', 'auditZone'].includes(tab));
    return tabs.includes('settings') ? tabs : [...tabs, 'settings'];
  }

  return ['dashboard'];
};

export const canViewShareholderInfo = (userRole) => (
  userRole === USER_ROLES.ADMIN ||
  userRole === USER_ROLES.BUSINESS_REVIEWER ||
  userRole === USER_ROLES.READONLY_SHAREHOLDER
);

export const canEditShareholderSettings = (userRole) => userRole === USER_ROLES.ADMIN;

export const canViewAuditLogs = (userRole) => (
  userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.BUSINESS_REVIEWER
);

export const canViewShareholderLedger = (userRole) => (
  userRole === USER_ROLES.ADMIN ||
  userRole === USER_ROLES.BUSINESS_REVIEWER ||
  userRole === USER_ROLES.READONLY_SHAREHOLDER
);

export const canManageShareholderLedger = (userRole) => (
  userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.BUSINESS_REVIEWER
);

export const canViewLoans = (userRole) => (
  userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.BUSINESS_REVIEWER
);

export const canViewShareholderReports = (userRole) => (
  userRole !== USER_ROLES.BOOKKEEPER
);

export const canExportReports = (userRole) => (
  userRole === USER_ROLES.ADMIN ||
  userRole === USER_ROLES.BUSINESS_REVIEWER ||
  userRole === USER_ROLES.READONLY_SHAREHOLDER
);

export const canInputBasicLedger = (userRole) => (
  userRole === USER_ROLES.ADMIN ||
  userRole === USER_ROLES.BUSINESS_REVIEWER ||
  userRole === USER_ROLES.BOOKKEEPER
);

export const canReviewLedger = (userRole) => (
  userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.BUSINESS_REVIEWER
);

export const canVoidLedger = (userRole) => userRole === USER_ROLES.ADMIN;

export const canViewCreatorAudit = (userRole) => (
  userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.BUSINESS_REVIEWER
);
