/** The name to show for a customer wherever only one name fits — a shop
 * name (when set) reads better to the business owner than the personal
 * name behind it, so it takes priority everywhere a customer is listed,
 * searched, or referenced (invoice lists, avatars, share messages, etc.).
 * Use alongside the customer's own `name` as a secondary/fallback line
 * wherever there's room for both. */
export function customerDisplayName(customer: { name: string; shopName?: string | null }): string {
  return customer.shopName || customer.name;
}
