/** The GST-style templates (CLASSIC and CLEAN) share one sheet component,
 * HSN columns, transport/dispatch blocks, e-Invoice/e-Way Bill support and
 * the completeness checklist; MODERN is the simple retail layout. */
export type InvoiceTemplateName = 'MODERN' | 'CLASSIC' | 'CLEAN';

export function isGstLayout(template: string | null | undefined): boolean {
  return template === 'CLASSIC' || template === 'CLEAN';
}
