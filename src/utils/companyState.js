const LEGACY_DEMO_COMPANY_NAMES = new Set([
  '星光藝人經紀公司'
]);

const getCompanyArchiveTime = (item = {}) => {
  const timestamp = Date.parse(item.archivedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getInactiveCompanyIds = (state = {}) => {
  const inactiveIds = new Set();
  const latestArchiveAction = new Map();
  const archive = Array.isArray(state.auditArchive) ? state.auditArchive : [];

  [...archive]
    .filter(item => item?.collection === 'companies' && item.recordId)
    .sort((left, right) => getCompanyArchiveTime(right) - getCompanyArchiveTime(left))
    .forEach((item) => {
      if (!latestArchiveAction.has(item.recordId)) {
        latestArchiveAction.set(item.recordId, item.action);
      }
    });

  latestArchiveAction.forEach((action, companyId) => {
    if (action === 'delete') inactiveIds.add(companyId);
  });

  const companies = Array.isArray(state.companies) ? state.companies : [];
  companies.forEach((company) => {
    if (LEGACY_DEMO_COMPANY_NAMES.has(String(company?.name || '').trim())) {
      inactiveIds.add(company.id);
    }
  });

  return inactiveIds;
};

export const sanitizeInactiveCompanies = (state = {}, referenceState = null) => {
  const referenceArchive = Array.isArray(referenceState?.auditArchive)
    ? referenceState.auditArchive
    : [];
  const currentArchive = Array.isArray(state.auditArchive) ? state.auditArchive : [];
  const inactiveIds = getInactiveCompanyIds({
    companies: [
      ...(Array.isArray(state.companies) ? state.companies : []),
      ...(Array.isArray(referenceState?.companies) ? referenceState.companies : [])
    ],
    auditArchive: [...currentArchive, ...referenceArchive]
  });
  if (inactiveIds.size === 0) return state;

  return {
    ...state,
    companies: Array.isArray(state.companies)
      ? state.companies.filter(company => !inactiveIds.has(company?.id))
      : [],
    shareholders: Array.isArray(state.shareholders)
      ? state.shareholders.map(shareholder => ({
          ...shareholder,
          allowedCompanies: Array.isArray(shareholder.allowedCompanies)
            ? shareholder.allowedCompanies.filter(companyId => !inactiveIds.has(companyId))
            : shareholder.allowedCompanies
        }))
      : []
  };
};

export const getNextCompanyId = (companies = [], auditArchive = []) => {
  const usedNumbers = new Set();
  const collectId = (companyId) => {
    const match = /^COMP(\d+)$/.exec(String(companyId || ''));
    if (match) usedNumbers.add(Number.parseInt(match[1], 10));
  };

  companies.forEach(company => collectId(company?.id));
  auditArchive
    .filter(item => item?.collection === 'companies')
    .forEach(item => collectId(item.recordId));

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `COMP${String(nextNumber).padStart(3, '0')}`;
};
