export const canViewOwnerCashBalance = (userRole, user) => (
  userRole === 'admin' &&
  user?.id === 'ADMIN' &&
  String(user?.email || '').trim().toLowerCase() === 'qazwsx32100@gmail.com'
);
