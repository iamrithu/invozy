// Commerce checks for run.ts: categories, orders, coupons and the web
// store, as company A. Called from run.ts before the tenancy section, so
// company B's checks also cover these tables.

type Check = (label: string, cond: boolean, detail?: unknown) => void;
type Ctx = {
  prisma: typeof import('@/lib/prisma').prisma;
  check: Check;
  asOwner: () => unknown;
  asStaff: () => unknown;
  form: (fields: Record<string, string>) => FormData;
};

export async function commerceTests(ctx: Ctx) {
  await categoryTests(ctx);
  await orderTests(ctx);
  await storeTests(ctx);
}

async function categoryTests({ prisma, check, asOwner, asStaff, form }: Ctx) {
  asOwner();
  const cats = await import('@/actions/categories');
  const products = await import('@/actions/products');
  const productForm = (name: string, category: string) => form({ name, category, unit: 'Box', price: '100', tiers: JSON.stringify([{ unit: 'Box', price: 100 }]) });
  const catForm = (fields: Record<string, string>) => form({ status: 'ACTIVE', showOnStore: 'true', ...fields });

  const made = await cats.createCategory({}, catForm({ name: 'Party Packs' }));
  const party = await prisma.category.findUniqueOrThrow({ where: { id: made.id! } });
  check('a category gets a slug from its name', !made.error && party.slug === 'party-packs', made);
  check('a second category with the same name is refused', !!(await cats.createCategory({}, catForm({ name: 'party packs' }))).fieldErrors?.name);
  check('a taken slug is refused', !!(await cats.createCategory({}, catForm({ name: 'Other packs', slug: 'party-packs' }))).fieldErrors?.slug);
  check('a bad slug is refused', !!(await cats.createCategory({}, catForm({ name: 'Bad slug', slug: 'Bad Slug!' }))).fieldErrors?.slug);

  const p1 = await products.createProduct({}, productForm('Pack A', 'party packs'));
  const p1Row = await prisma.product.findUniqueOrThrow({ where: { id: p1.id! } });
  check('a product links to the existing category, matched without case', !p1.error && p1Row.categoryId === party.id && p1Row.category === 'Party Packs', { p1, p1Row });
  const p2 = await products.createProduct({}, productForm('Gel A', 'Gel packs'));
  const gel = await prisma.category.findFirst({ where: { name: 'Gel packs' } });
  check('a new category name on a product creates the category', !p2.error && !!gel && (await prisma.product.findUniqueOrThrow({ where: { id: p2.id! } })).categoryId === gel.id, p2);

  check('staff can disable a category', !(await cats.setCategoryStatus(party.id, 'DISABLED')).error);
  const p3 = await products.createProduct({}, productForm('Pack B', 'Party Packs'));
  check('a disabled category can’t be picked for a new product', !!p3.fieldErrors?.category, p3);
  const keep = await products.updateProduct(p1.id!, {}, productForm('Pack A renamed', 'Party Packs'));
  check('a product keeps its category after it is disabled', !keep.error, keep);
  check('getProductCategories lists active categories only', !(await products.getProductCategories()).includes('Party Packs'));
  await cats.setCategoryStatus(party.id, 'ACTIVE');

  const renamed = await cats.updateCategory(party.id, {}, catForm({ name: 'Event Packs', slug: 'event-packs' }));
  check('renaming a category renames it on its products', !renamed.error && (await prisma.product.findUniqueOrThrow({ where: { id: p1.id! } })).category === 'Event Packs', renamed);

  asStaff();
  check('staff can’t move a category to Trash', !!(await cats.trashCategory(party.id, gel!.id)).error);
  asOwner();
  check('Trash refuses a category with products and nowhere to move them', !!(await cats.trashCategory(party.id)).error);
  const trashed = await cats.trashCategory(party.id, gel!.id);
  const afterTrash = await prisma.category.findUniqueOrThrow({ where: { id: party.id } });
  check('Trash moves the products, then hides the category', !trashed.error && !!afterTrash.deletedAt && (await prisma.product.findUniqueOrThrow({ where: { id: p1.id! } })).categoryId === gel!.id, trashed);
  check('a product can’t pick a category in Trash', !!(await products.createProduct({}, productForm('Pack C', 'Event Packs'))).fieldErrors?.category);
  check('a trashed category’s slug stays reserved', !!(await cats.createCategory({}, catForm({ name: 'Events', slug: 'event-packs' }))).fieldErrors?.slug);
  check('restore brings it back', !(await cats.restoreCategory(party.id)).error && !(await prisma.category.findUniqueOrThrow({ where: { id: party.id } })).deletedAt);
  await cats.trashCategory(party.id);
  check('a category with no products can be deleted for good', !(await cats.purgeCategory(party.id)).error && !(await prisma.category.findUnique({ where: { id: party.id } })));
  const list = await cats.listCategories();
  check('the list counts products per category', list.rows.some((c) => c.id === gel!.id && c.productCount === 2), list.rows.map((c) => [c.name, c.productCount]));
}

async function orderTests({ prisma, check, asOwner, asStaff }: Ctx) {
  asOwner();
  const orders = await import('@/actions/orders');
  const coupons = await import('@/actions/coupons');
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const gel = await prisma.product.findFirstOrThrow({ where: { name: 'Gel A' } });
  const cust = await prisma.customer.create({ data: { name: 'Order Test Traders', state: 'Tamil Nadu', terms: 'Net 15' } });
  const cust2 = await prisma.customer.create({ data: { name: 'Second Buyer', state: 'Karnataka' } });
  const line = (qty: number) => ({ productId: gel.id, name: gel.name, unit: 'Box', qty, rate: 100, discount: 0 });
  const base = (qty: number, extra: Partial<import('@/actions/orders').OrderInput> = {}) => ({ customerId: cust.id, channel: 'PHONE' as const, lines: [line(qty)], ...extra });

  // Coupons and automatic discounts
  const ice = await coupons.createCoupon({ code: 'ice10', title: '10% off gel', kind: 'PERCENT', value: 10, maxDiscount: 300, minOrderValue: 1000, scope: 'CATEGORIES', categoryIds: [gel.categoryId!], channels: ['MANUAL', 'WEB'], usageLimit: 2, perCustomerLimit: 1 });
  check('a coupon is created with its code upper-cased', !ice.error && (await prisma.coupon.findUniqueOrThrow({ where: { id: ice.id! } })).code === 'ICE10', ice);
  check('a duplicate code is refused', !!(await coupons.createCoupon({ code: 'ICE10', title: 'x', kind: 'FLAT', value: 5, channels: ['MANUAL'] })).fieldErrors?.code);
  check('a percentage over 100 is refused', !!(await coupons.createCoupon({ code: 'BIG', title: 'x', kind: 'PERCENT', value: 150, channels: ['MANUAL'] })).fieldErrors?.value);
  asStaff();
  check('staff can’t create coupons', !!(await coupons.createCoupon({ code: 'STAFF1', title: 'x', kind: 'FLAT', value: 5, channels: ['MANUAL'] })).error);
  asOwner();
  const bulk = await coupons.createCoupon({ automatic: true, title: 'Bulk order', kind: 'PERCENT', value: 3, minOrderValue: 10000, channels: ['MANUAL', 'WEB'] });
  check('an automatic discount is created without a code', !bulk.error && (await prisma.coupon.findUniqueOrThrow({ where: { id: bulk.id! } })).code === null, bulk);
  const freedel = await coupons.createCoupon({ code: 'FREEDEL', title: 'Free delivery', kind: 'FREE_DELIVERY', minOrderValue: 500, channels: ['MANUAL'], combinable: true });

  // Quote and create
  const q = await orders.quoteOrder(base(20, { couponCode: 'ice10' }));
  check('a quote applies the coupon to its category, before GST', !q.error && near(q.quote!.coupon!.amount, 200) && near(q.quote!.taxable, 1800) && near(q.quote!.total, 2124), q);
  const o1 = await orders.createOrder(base(20, { couponCode: 'ICE10', deliverySlot: 'Tomorrow 6–8 AM' }), 'order');
  const o1Row = await prisma.order.findUniqueOrThrow({ where: { id: o1.id! } });
  check('a manual order is created confirmed, with its own number', !o1.error && o1Row.status === 'CONFIRMED' && /^ORD-\d+$/.test(o1Row.number), o1);
  check('…its coupon use is counted', (await prisma.coupon.findUniqueOrThrow({ where: { id: ice.id! } })).usedCount === 1 && !!(await prisma.couponRedemption.findUnique({ where: { orderId: o1.id! } })));
  check('…and no invoice yet (invoices come on dispatch)', !o1Row.invoiceId);
  check('the same customer can’t use ICE10 twice', !!(await orders.createOrder(base(20, { couponCode: 'ICE10' }), 'order')).error);

  const big = await orders.quoteOrder(base(120, { couponCode: 'ICE10' }));
  check('a big order gets the automatic discount, and a non-combinable coupon is refused', !big.error && near(big.quote!.auto!.amount, 360) && !!big.quote!.couponError, big);
  const fd = await orders.quoteOrder(base(10, { couponCode: 'FREEDEL', deliveryCharge: 100 }));
  check('a free-delivery coupon waives the delivery charge', !fd.error && fd.quote!.deliveryCharge === 0 && fd.quote!.deliveryWaived === 100, fd);
  const igst = await orders.quoteOrder({ ...base(10), customerId: cust2.id });
  check('an inter-state customer is charged IGST', !igst.error && igst.quote!.useIgst && near(igst.quote!.igst, 180), igst);

  // Lifecycle: pack → dispatch (invoice) → deliver (paid)
  check('pack', !(await orders.packOrder(o1.id!)).error);
  const d1 = await orders.dispatchOrder(o1.id!, { vehicleNo: 'TN 37 BX 4410', driverName: 'Murugan' });
  const o1Inv = await prisma.order.findUniqueOrThrow({ where: { id: o1.id! }, include: { invoice: true } });
  check('dispatch generates the invoice', !d1.error && !!o1Inv.invoice && o1Inv.status === 'OUT_FOR_DELIVERY', d1);
  check('…which matches the order’s total and carries the discount and vehicle', !!o1Inv.invoice && near(Number(o1Inv.invoice.total), Number(o1Inv.total)) && near(Number(o1Inv.invoice.overallDiscountValue), 200) && o1Inv.invoice.transportVehicleNo === 'TN 37 BX 4410', o1Inv.invoice);
  check('an invoiced order can’t be edited', !!(await orders.updateOrder(o1.id!, base(5))).error);
  check('an invoiced order can’t be cancelled', !!(await orders.cancelOrder(o1.id!, 'test')).error);
  const del = await orders.deliverOrder(o1.id!, { collected: true, mode: 'UPI' });
  check('delivering with payment collected marks the invoice paid', !del.error && (await prisma.invoice.findUniqueOrThrow({ where: { id: o1Inv.invoiceId! } })).status === 'PAID', del);

  // Cancel gives the coupon use back
  const cust3 = await prisma.customer.create({ data: { name: 'Third Buyer', state: 'Tamil Nadu' } });
  const o2 = await orders.createOrder({ ...base(15, { couponCode: 'ICE10' }), customerId: cust3.id }, 'order');
  check('a second customer uses ICE10 (its last use)', !o2.error && (await prisma.coupon.findUniqueOrThrow({ where: { id: ice.id! } })).usedCount === 2, o2);
  const cust4 = await prisma.customer.create({ data: { name: 'Fourth Buyer', state: 'Tamil Nadu' } });
  check('ICE10 is refused once its total uses are spent', !!(await orders.createOrder({ ...base(15, { couponCode: 'ICE10' }), customerId: cust4.id }, 'order')).error);
  check('cancelling an order gives the coupon use back', !(await orders.cancelOrder(o2.id!, 'Customer called')).error && (await prisma.coupon.findUniqueOrThrow({ where: { id: ice.id! } })).usedCount === 1);

  // Edit, draft, quick sale
  const o3 = await orders.createOrder(base(4), 'order');
  const up = await orders.updateOrder(o3.id!, base(6, { deliveryCharge: 50 }));
  const o3Row = await prisma.order.findUniqueOrThrow({ where: { id: o3.id! } });
  check('editing an order reprices it (delivery taxed like the goods)', !up.error && near(Number(o3Row.total), Math.round(650 * 1.18)), { up, total: o3Row.total });
  const draft = await orders.createOrder(base(2), 'draft');
  check('a draft is saved unconfirmed', !draft.error && (await prisma.order.findUniqueOrThrow({ where: { id: draft.id! } })).status === 'DRAFT');
  check('a draft can be deleted', !(await orders.deleteDraftOrder(draft.id!)).error && !(await prisma.order.findUnique({ where: { id: draft.id! } })));
  const quick = await orders.createOrder({ ...base(3), channel: 'WALK_IN' }, 'quick', { paid: true, paymentMode: 'Cash' });
  const quickRow = await prisma.order.findUniqueOrThrow({ where: { id: quick.id! }, include: { invoice: true } });
  check('a quick sale is delivered with a paid invoice', !quick.error && quickRow.status === 'DELIVERED' && quickRow.invoice?.status === 'PAID', { quick, status: quickRow.status, inv: quickRow.invoice?.status });

  // Settings: invoice on confirm, and two clicks make one invoice
  asStaff();
  check('staff can’t change order settings', !!(await orders.updateOrderSettings({ orderPrefix: 'SO', nextOrderNo: 500, invoiceTrigger: 'ON_CONFIRM', autoConfirmWebOrders: false })).error);
  asOwner();
  check('the owner switches to invoice-on-confirm and a new prefix', !(await orders.updateOrderSettings({ orderPrefix: 'SO', nextOrderNo: 500, invoiceTrigger: 'ON_CONFIRM', autoConfirmWebOrders: false })).error);
  const o4 = await orders.createOrder(base(2), 'order');
  const o4Row = await prisma.order.findUniqueOrThrow({ where: { id: o4.id! } });
  check('…then a new order is SO-500 and invoiced on confirm', o4Row.number === 'SO-500' && !!o4Row.invoiceId, o4Row);
  await orders.updateOrderSettings({ orderPrefix: 'SO', nextOrderNo: 600, invoiceTrigger: 'MANUAL', autoConfirmWebOrders: false });
  const o5 = await orders.createOrder(base(2), 'order');
  const [g1, g2] = await Promise.all([orders.generateOrderInvoice(o5.id!), orders.generateOrderInvoice(o5.id!)]);
  const invCount = await prisma.invoice.count({ where: { order: { id: o5.id! } } });
  check('two clicks on Generate make one invoice', invCount === 1 && (!g1.error || !g2.error), { g1, g2, invCount });
  const list = await orders.listOrders({ tab: 'all' });
  check('the list counts orders by stage', list.counts.cancelled === 1 && list.counts.delivered >= 2 && list.rows.length > 0, list.counts);
  const view = await orders.getOrder(o1.id!);
  check('an order reads back with its timeline and invoice', !!view && view.events.some((e) => e.type === 'INVOICED') && view.invoice?.status === 'PAID', view?.events.map((e) => e.type));
  await orders.updateOrderSettings({ orderPrefix: 'ORD', nextOrderNo: 700, invoiceTrigger: 'ON_DISPATCH', autoConfirmWebOrders: false });
  void freedel;
}

async function storeTests({ prisma, check, asOwner, asStaff }: Ctx) {
  asOwner();
  const storefront = await import('@/actions/storefront');
  const store = await import('@/actions/store');
  const groups = await import('@/actions/customer-groups');
  const coupons = await import('@/actions/coupons');
  const orders = await import('@/actions/orders');
  const payments = await import('@/actions/payments');
  const routes = await import('@/actions/routes');
  const { todayIst } = await import('@/lib/dates');
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const gel = await prisma.product.findFirstOrThrow({ where: { name: 'Gel A' } });
  const settings = { minOrder: 300, sameDayCutoff: '23:59', slots: ['8–10 AM'], payCod: true, payUpi: true, welcome: '', contactPhone: '' };

  // Store settings and zones
  asStaff();
  check('staff can’t open the store', !!(await storefront.updateStore({ slug: 'test-co', enabled: true, settings })).error);
  asOwner();
  check('a reserved store address is refused', !!(await storefront.updateStore({ slug: 'admin', enabled: true, settings })).error);
  check('the owner opens the store', !(await storefront.updateStore({ slug: 'test-co', enabled: true, settings })).error);
  const zone = await storefront.saveZone(null, { name: 'City', pincodes: '641001, 641002 641002', charge: 50, freeAbove: 2500, minOrder: 0 });
  check('a zone keeps unique 6-digit PIN codes', !zone.error && (await prisma.deliveryZone.findUniqueOrThrow({ where: { id: zone.id! } })).pincodes.length === 2, zone);
  check('a PIN code can’t be in two zones', !!(await storefront.saveZone(null, { name: 'Other', pincodes: '641002', charge: 0 })).error);
  check('a bad PIN code is refused', !!(await storefront.saveZone(null, { name: 'Bad', pincodes: '64100', charge: 0 })).error);

  // Checkout
  const customersBefore = await prisma.customer.count();
  const cart = [{ productId: gel.id, unit: 'Box', qty: 5 }];
  const q = await store.quoteStoreOrder('test-co', { cart, pincode: '641001', state: 'Tamil Nadu' });
  check('a store quote prices from the catalog with the zone’s delivery', !q.error && near(q.quote!.subtotal, 500) && q.quote!.deliveryCharge === 50 && q.quote!.zoneName === 'City', q);
  check('a quote writes no customer', (await prisma.customer.count()) === customersBefore);
  check('a PIN code outside every zone blocks checkout', !!(await store.quoteStoreOrder('test-co', { cart, pincode: '600001' })).quote?.blocker);
  check('the minimum order blocks a small cart', !!(await store.quoteStoreOrder('test-co', { cart: [{ productId: gel.id, unit: 'Box', qty: 1 }], pincode: '641001' })).quote?.blocker);
  const buyer = { name: 'Web Buyer', phone: '9876500011', address: '1 Main Road', pincode: '641001', state: 'Tamil Nadu', payment: 'COD' as const, cart, deliveryDate: todayIst(), slot: '8–10 AM' };
  check('the bot trap refuses a filled hidden field', !!(await store.placeStoreOrder('test-co', { ...buyer, website: 'spam' })).error);
  check('an unknown store refuses orders', !!(await store.placeStoreOrder('no-such-store', buyer)).error);
  const placed = await store.placeStoreOrder('test-co', buyer);
  const webOrder = placed.number ? await prisma.order.findFirst({ where: { number: placed.number }, include: { customer: true } }) : null;
  check('a web order arrives as New, from the web store, with a tracking link', !placed.error && !!placed.token && webOrder?.status === 'PENDING' && webOrder?.source === 'WEB', placed);
  check('…priced from the catalog with delivery and GST', !!webOrder && near(Number(webOrder.total), Math.round(550 * 1.18)), webOrder?.total);
  check('…and the buyer is added as a customer', webOrder?.customer.name === 'Web Buyer' && webOrder?.customer.phone === '9876500011');
  const again = await store.placeStoreOrder('test-co', { ...buyer, name: 'Web Buyer again' });
  const againRow = again.number ? await prisma.order.findFirst({ where: { number: again.number } }) : null;
  check('a returning buyer is matched by phone', !again.error && againRow?.customerId === webOrder?.customerId, again);
  check('pending web orders are counted for the badge', (await orders.pendingOrderCount()) >= 2);
  check('staff confirm a web order', !(await orders.confirmOrder(webOrder!.id)).error);
  await storefront.updateStore({ slug: 'test-co', enabled: false, settings });
  check('a closed store refuses orders', !!(await store.placeStoreOrder('test-co', buyer)).error);

  // Customer groups and group-only coupons
  const wholesale = await groups.saveCustomerGroup(null, { name: 'Wholesale' });
  check('a customer group is created', !wholesale.error, wholesale);
  check('a duplicate group name is refused', !!(await groups.saveCustomerGroup(null, { name: 'wholesale' })).error);
  const member = await prisma.customer.create({ data: { name: 'Group Member', state: 'Tamil Nadu' } });
  const outsider = await prisma.customer.create({ data: { name: 'Not In Group', state: 'Tamil Nadu' } });
  check('customers are put into a group', (await groups.setCustomersGroup([member.id], wholesale.id!)).moved === 1);
  await coupons.createCoupon({ code: 'WHOLE5', title: '5% wholesale', kind: 'PERCENT', value: 5, channels: ['MANUAL'], customerGroupIds: [wholesale.id!] });
  const line = { productId: gel.id, name: 'Gel A', unit: 'Box', qty: 10, rate: 100, discount: 0 };
  const forMember = await orders.quoteOrder({ customerId: member.id, channel: 'PHONE', lines: [line], couponCode: 'WHOLE5' });
  const forOutsider = await orders.quoteOrder({ customerId: outsider.id, channel: 'PHONE', lines: [line], couponCode: 'WHOLE5' });
  check('a group coupon works for its group only', near(forMember.quote?.coupon?.amount ?? 0, 50) && !!forOutsider.quote?.couponError, { forMember, forOutsider });
  check('deleting a group frees its customers', !(await groups.deleteCustomerGroup(wholesale.id!)).error && (await prisma.customer.findUniqueOrThrow({ where: { id: member.id } })).groupId === null);

  // Payments and routes
  const pay = await payments.listPayments({ from: todayIst(), to: todayIst() });
  check('payments lists today’s receipts with their invoice', pay.rows.length > 0 && pay.sum > 0 && pay.rows.every((r) => !!r.invoice.number), pay.byMode);
  await prisma.customer.update({ where: { id: member.id }, data: { route: 'Harbour' } });
  const r = await routes.listRoutes();
  check('routes group customers by their route', r.routes.some((x) => x.route === 'Harbour' && x.customers.some((c) => c.id === member.id)));
}
