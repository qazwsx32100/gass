export const canViewOwnerCashBalance = (userRole) => (
  userRole === 'admin' ||
  userRole === 'business_reviewer' ||
  userRole === 'readonly_shareholder'
);

export const canViewCapitalDifference = (userRole, currentUser) => {
  if (userRole !== 'admin') return false;
  if (!currentUser) return true;
  const name = currentUser.name || '';
  const email = currentUser.email || '';
  const id = currentUser.id || '';
  const username = currentUser.username || '';
  return name.includes('楊孟') || email === 'qazwsx32100@gmail.com' || id === 'SH001' || username === 'yang';
};


