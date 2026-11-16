import { getCompany } from './get-company';
import { isModuleEnabled, moduleInfo, type ModuleKey } from './modules';

/** Server-side half of the module switches (src/lib/modules.ts): a module's
 * own server actions and routes call this first, so a company the platform
 * admin has switched a module off for can't keep using it by calling them
 * directly. Also enforces sign-in (via getCompany). Actions shared with the
 * always-on core (the dashboard's stock widgets, the invoice builder's cost
 * and batch hints, the product form's stock switch) deliberately don't. */
export async function requireModule(key: ModuleKey): Promise<void> {
  const company = await getCompany();
  if (!isModuleEnabled(company.disabledModules, key)) {
    throw new Error(`${moduleInfo(key).label} isn’t enabled for your company.`);
  }
}
