export const canViewOwnerCashBalance = (userRole) => (
  userRole === 'admin' ||
  userRole === 'business_reviewer' ||
  userRole === 'readonly_shareholder'
);

export const canViewCapitalDifference = (userRole, currentUser) => {
  if (userRole === 'admin') return true;
  if (!currentUser) return false;
  const name = currentUser.name || '';
  const email = (currentUser.email || '').toLowerCase();
  const id = currentUser.id || '';
  const username = (currentUser.username || '').toLowerCase();
  return (
    name.includes('楊孟') ||
    email === 'qazwsx32100@gmail.com' ||
    id === 'ADMIN' ||
    id === 'SH001' ||
    username === 'yang'
  );
};


