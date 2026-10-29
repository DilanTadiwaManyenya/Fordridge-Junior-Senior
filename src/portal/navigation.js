const financeItems = [
  {
    roles: ['student', 'parent', 'principal', 'accountant', 'admin'],
    to: '/portal/fees',
    label: 'Finance',
    icon: '$',
  },
  {
    roles: ['admin'],
    to: '/portal/income-expenses',
    label: 'Income & expenses',
    icon: '↕',
  },
  {
    roles: ['admin'],
    to: '/portal/cashbook',
    label: 'Expenses & Cashbook',
    icon: '¤',
  },
  {
    roles: ['admin'],
    to: '/portal/inventory-stock',
    label: 'Inventory & POS',
    icon: '▣',
  },
  {
    roles: ['staff', 'admin'],
    href: 'https://inventory-management-system-3xi2f.sevalla.page/',
    label: 'External Inventory & POS',
    icon: '▣',
  },
]

export function getFinanceNavigation(role) {
  return {
    heading: role === 'accountant' ? 'Accountant workspace' : 'Finance',
    items: financeItems
      .filter((item) => item.roles.includes(role))
      .map(({ roles: _roles, ...item }) => item),
  }
}

export function canReviewIncomeExpenses(role) {
  return role === 'admin'
}
