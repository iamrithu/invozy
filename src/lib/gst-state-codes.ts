// Official GST state codes (Stcd/Pos fields in the e-Invoice/e-Way Bill
// schemas require the 2-digit code, not the state name Company/Customer
// store). Public, notified list — https://www.gst.gov.in state code master.
const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  'andhra pradesh (before division)': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
  'other territory': '97',
  'center jurisdiction': '99',
};

/** Returns the 2-digit GST state code for a stored state name, or '99' if
 * unrecognized (NIC rejects a missing/malformed code, so callers should
 * treat that as a validation error, not silently submit anyway). */
export function gstStateCode(stateName: string): string {
  return GST_STATE_CODES[stateName.trim().toLowerCase()] ?? '99';
}
