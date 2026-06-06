import { callAction } from './index'
export function getDashboardStats() { return callAction('getEnhancedDashboardStats') }
export function getFinanceOverview() { return callAction('getFinanceOverview') }
