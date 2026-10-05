export const canViewOwnerCashBalance = (userRole) => (
  userRole === 'admin' ||
  userRole === 'business_reviewer' ||
  userRole === 'readonly_shareholder'
);


