import { getAllStates, getDistricts } from 'india-state-district';
import { Field } from '@/components/ui/field';
import { Tag } from '@/components/ui/form-sheet';
import { GSTIN_PATTERN, gstStateCode, gstinStateKey } from '@/lib/gst-state-codes';

// The single source of truth for India's states/UTs — replaces the old
// hardcoded, incomplete INDIAN_STATES list. Values are always stored as full
// state NAMES (e.g. "Tamil Nadu"), never this package's alphabetic codes —
// src/lib/gst.ts's decidesIgst() compares company/customer state by name, and
// GSTIN's own 2-digit numeric state codes are an unrelated scheme.
const STATES = getAllStates();
const STATE_OPTIONS = STATES.map((s) => ({ value: s.name }));
const CODE_BY_NAME = new Map(STATES.map((s) => [s.name, s.code]));

export const STATE_NAMES = STATES.map((s) => s.name);

export function districtsFor(state: string): string[] {
  const code = CODE_BY_NAME.get(state);
  return code ? getDistricts(code) : [];
}

export function StateSelect({
  label = 'State',
  name,
  value,
  onChange,
  error,
  required,
}: {
  label?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <Field
      as="select"
      label={label}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={STATE_OPTIONS}
      error={error}
      required={required}
    />
  );
}

export function DistrictSelect({
  label = 'District',
  name,
  state,
  value,
  onChange,
  error,
}: {
  label?: string;
  name: string;
  state: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const code = CODE_BY_NAME.get(state);
  const districts = code ? getDistricts(code) : [];

  return (
    <Field
      as="select"
      label={label}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!state}
      options={[{ value: '', label: state ? 'Select district (optional)' : 'Select a state first' }, ...districts.map((d) => ({ value: d }))]}
      error={error}
    />
  );
}

/** What a typed GSTIN says: `valid` once it has the full GSTIN shape, and
 * the state it was issued in (a name StateSelect knows) — so a form can
 * fill in the state for the user. */
export function checkGstin(raw: string): { valid: boolean; state: string | null; code: string } {
  const gstin = raw.trim().toUpperCase();
  const key = gstin.length >= 2 ? gstinStateKey(gstin) : null;
  const state = key ? (STATES.find((s) => s.name.toLowerCase() === key)?.name ?? null) : null;
  return { valid: GSTIN_PATTERN.test(gstin), state, code: state ? gstStateCode(state) : '' };
}

/** Help line under a GSTIN field: "Valid · Tamil Nadu (33)" once it's
 * complete, how many characters are left while typing, `blank` when empty. */
export function GstinStatus({ gstin, blank }: { gstin: string; blank: React.ReactNode }) {
  const g = gstin.trim();
  if (!g) return <>{blank}</>;
  const { valid, state, code } = checkGstin(g);
  if (valid)
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Tag tone="green">Valid</Tag>
        {state ? `${state} (${code})` : 'Unknown state code'}
      </span>
    );
  return <>{g.length < 15 ? `${15 - g.length} more character${15 - g.length === 1 ? '' : 's'}, like 33AAAAA0000A1Z5` : 'This doesn’t look like a GSTIN. Check it against their bill.'}</>;
}
