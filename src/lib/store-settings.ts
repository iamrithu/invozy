// Online store settings, stored as JSON on Company.storeSettings. Read
// through this so a missing or older value always has every field.

export type StoreSettings = {
  /** Smallest order (goods, before GST) the store accepts. */
  minOrder: number;
  /** "HH:MM" IST. Orders after it are for tomorrow. */
  sameDayCutoff: string;
  /** Delivery slots the customer picks from. */
  slots: string[];
  payCod: boolean;
  payUpi: boolean;
  /** One line under the store name. */
  welcome: string;
  /** Shown on the store for questions. */
  contactPhone: string;
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  minOrder: 0,
  sameDayCutoff: '18:00',
  slots: ['8–10 AM', '10 AM–12 PM', '2–4 PM', '4–6 PM'],
  payCod: true,
  payUpi: true,
  welcome: '',
  contactPhone: '',
};

export function readStoreSettings(raw: unknown): StoreSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof StoreSettings, unknown>>;
  const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : d);
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    minOrder: num(v.minOrder, DEFAULT_STORE_SETTINGS.minOrder),
    sameDayCutoff: /^\d{2}:\d{2}$/.test(String(v.sameDayCutoff)) ? String(v.sameDayCutoff) : DEFAULT_STORE_SETTINGS.sameDayCutoff,
    slots: Array.isArray(v.slots) ? v.slots.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 12) : DEFAULT_STORE_SETTINGS.slots,
    payCod: bool(v.payCod, true),
    payUpi: bool(v.payUpi, true),
    welcome: str(v.welcome, '').slice(0, 160),
    contactPhone: str(v.contactPhone, '').slice(0, 20),
  };
}

/** Today in IST, or tomorrow once the same-day cut-off has passed. */
export function earliestDeliveryDate(settings: StoreSettings, now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const [h, m] = settings.sameDayCutoff.split(':').map(Number);
  const pastCutoff = ist.getUTCHours() * 60 + ist.getUTCMinutes() >= h * 60 + m;
  if (pastCutoff) ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
}
