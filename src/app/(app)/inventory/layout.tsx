import { ModuleGate } from '@/components/modules/module-gate';

/** Shown only when the company has the "inventory" module (src/lib/modules.ts). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGate module="inventory">{children}</ModuleGate>;
}
