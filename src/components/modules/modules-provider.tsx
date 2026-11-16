'use client';

import { createContext, useContext, useMemo } from 'react';
import { isModuleEnabled, isPathEnabled, type ModuleKey } from '@/lib/modules';

// The signed-in company's switched-off modules, for the client-side shell
// (sidebar, bottom nav, command palette, top bar). Set once by the app
// layout from Company.disabledModules. Hiding a link is only cosmetic — the
// module's pages (module-gate.tsx), its own server actions and its API
// routes (src/lib/require-module.ts) are gated on the server too.

const DisabledModules = createContext<readonly string[]>([]);

export function ModulesProvider({ disabled, children }: { disabled: readonly string[]; children: React.ReactNode }) {
  return <DisabledModules.Provider value={disabled}>{children}</DisabledModules.Provider>;
}

export function useModules() {
  const disabled = useContext(DisabledModules);
  return useMemo(
    () => ({
      enabled: (key: ModuleKey) => isModuleEnabled(disabled, key),
      pathEnabled: (path: string) => isPathEnabled(disabled, path),
    }),
    [disabled]
  );
}
