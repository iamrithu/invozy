// Optional modules the platform admin can switch off per company (/admin →
// a company → Modules). Company.disabledModules stores the keys that are OFF,
// so a module added here later is on for every company without a backfill.
//
// Switching a module off hides it from the navigation and replaces its
// pages with a "not enabled" notice (src/components/modules/module-gate.tsx).
// Nothing is deleted — switching it back on brings everything back as it was.
// The core (dashboard, invoices, customers, products, company, account) is
// always on.

export const MODULES = [
  { key: 'inventory', label: 'Inventory', description: 'Stock counts, low-stock and reorder alerts, batches and expiry.', paths: ['/inventory'] },
  { key: 'purchases', label: 'Purchases & suppliers', description: 'Supplier bills that add stock and record input GST.', paths: ['/purchases', '/suppliers'] },
  { key: 'returns', label: 'Returns & credit notes', description: 'Sales returns, credit notes, refunds and credit adjustments.', paths: ['/credit-notes'] },
  { key: 'reports', label: 'Reports & exports', description: 'Sales, GST, receivables and collections reports; CSV, GSTR-1 and Tally exports.', paths: ['/reports', '/api/export'] },
  { key: 'team', label: 'Team logins', description: 'Extra owner and staff logins for the company.', paths: ['/team'] },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_KEYS: readonly ModuleKey[] = MODULES.map((m) => m.key);

export function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(key);
}

export function moduleInfo(key: ModuleKey) {
  return MODULES.find((m) => m.key === key)!;
}

/** The module a path belongs to, or null for the always-on core. */
export function moduleForPath(path: string): ModuleKey | null {
  for (const m of MODULES) if (m.paths.some((p) => path === p || path.startsWith(`${p}/`))) return m.key;
  return null;
}

export function isModuleEnabled(disabled: readonly string[] | null | undefined, key: ModuleKey): boolean {
  return !disabled?.includes(key);
}

export function isPathEnabled(disabled: readonly string[] | null | undefined, path: string): boolean {
  const key = moduleForPath(path);
  return key === null || isModuleEnabled(disabled, key);
}
