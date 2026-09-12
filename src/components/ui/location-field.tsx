import { getAllStates, getDistricts } from 'india-state-district';
import { Field } from '@/components/ui/field';

// The single source of truth for India's states/UTs — replaces the old
// hardcoded, incomplete INDIAN_STATES list. Values are always stored as full
// state NAMES (e.g. "Tamil Nadu"), never this package's alphabetic codes —
// src/lib/gst.ts's decidesIgst() compares company/customer state by name, and
// GSTIN's own 2-digit numeric state codes are an unrelated scheme.
const STATES = getAllStates();
const STATE_OPTIONS = STATES.map((s) => ({ value: s.name }));
const CODE_BY_NAME = new Map(STATES.map((s) => [s.name, s.code]));

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
