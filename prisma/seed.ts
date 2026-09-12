import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_OWNER_EMAIL = 'owner@arcticblocks.test';
const DEMO_OWNER_PASSWORD = 'demo1234';

async function main() {
  const existing = await prisma.company.findFirst();
  if (existing) {
    console.log('A company already exists — skipping seed. Delete it first if you want to reseed.');
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: 'Arctic Blocks Ice Co.',
      domain: 'arcticblocks.com',
      address: 'Plot 14, SIDCO Industrial Estate, Coimbatore, Tamil Nadu 641021',
      state: 'Tamil Nadu',
      gstin: '33AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      phone: '+91 98765 43210',
      email: 'accounts@arcticblocks.com',
      bankName: 'Arctic Blocks Ice Co.',
      bankAcc: '50100234567890',
      ifsc: 'HDFC0001234',
      branch: 'HDFC Bank, RS Puram',
      upi: 'arcticblocks@hdfcbank',
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 18,
      cgstEnabled: true,
      sgstEnabled: true,
      igstEnabled: true,
      invoicePrefix: 'INV',
      invoiceFY: '2026-27',
      nextInvoiceNo: 1,
      terms: 'Payment due within the agreed terms. Ice is a perishable good — please verify quantity and condition on delivery.',
    },
  });

  const products = await Promise.all(
    [
      { name: 'Ice Block 25kg', category: 'Block ice', unit: 'block', price: 180, hsn: '2201' },
      { name: 'Ice Slab 50kg', category: 'Block ice', unit: 'slab', price: 320, hsn: '2201' },
      { name: 'Premium Block Ice 15kg', category: 'Block ice', unit: 'kg', price: 110, hsn: '2201' },
      { name: 'Ice Cube 5kg bag', category: 'Cube ice', unit: 'bag', price: 60, hsn: '2201', packQty: 40 },
      { name: 'Standard Cube Ice 10kg', category: 'Cube ice', unit: 'bag', price: 47, hsn: '2201' },
      { name: 'Party Pack Cube Ice 5kg', category: 'Cube ice', unit: 'bag', price: 152, hsn: '2201' },
      { name: 'Crushed Ice 10kg', category: 'Crushed ice', unit: 'bag', price: 95, hsn: '2201' },
      { name: 'Bulk Crushed Ice 15kg', category: 'Crushed ice', unit: 'box', price: 54, hsn: '2201' },
      { name: 'Fresh Cut Crushed Ice 50kg', category: 'Crushed ice', unit: 'box', price: 89, hsn: '2201' },
      { name: 'Dry Ice 1kg', category: 'Dry ice', unit: 'kg', price: 140, hsn: '2851' },
      { name: 'Rapid Chill Dry Ice 25kg', category: 'Dry ice', unit: 'block', price: 236, hsn: '2851', packQty: 24 },
      { name: 'Export Grade Dry Ice 20kg', category: 'Other', unit: 'block', price: 61, hsn: '2851' },
    ].map((p) => prisma.product.create({ data: { ...p, companyId: company.id } }))
  );

  const customers = await Promise.all(
    [
      { name: 'Deccan Beverages', phone: '9844012233', state: 'Karnataka', gstin: '29CCCCC2222C1Z8', address: '45 MG Road, Bengaluru, Karnataka', terms: 'Net 15', creditLimit: 50000 },
      { name: 'Coastal Fisheries Ltd', phone: '9840055667', state: 'Tamil Nadu', gstin: '33DDDDD3333D1Z2', address: '12 Harbour Road, Chennai, Tamil Nadu', terms: 'Net 30', creditLimit: 100000 },
      { name: 'Sunrise Catering Services', phone: '9976543210', state: 'Tamil Nadu', terms: 'Due on receipt', creditLimit: 0 },
    ].map((c) => prisma.customer.create({ data: { ...c, companyId: company.id } }))
  );

  const invoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      customerId: customers[0].id,
      number: 'INV/2026-27/0001',
      date: new Date(),
      due: new Date(Date.now() + 15 * 86400000),
      status: 'SENT',
      overallDiscountType: 'PERCENT',
      overallDiscountValue: 5,
      items: {
        create: [
          { productId: products[3].id, name: products[3].name, hsn: products[3].hsn, unit: products[3].unit, qty: 41, rate: Number(products[3].price), discount: 0 },
          { productId: products[9].id, name: products[9].name, hsn: products[9].hsn, unit: products[9].unit, qty: 10, rate: Number(products[9].price), discount: 0 },
        ],
      },
    },
  });
  await prisma.company.update({ where: { id: company.id }, data: { nextInvoiceNo: 2 } });

  const passwordHash = await bcrypt.hash(DEMO_OWNER_PASSWORD, 10);
  await prisma.user.create({
    data: { email: DEMO_OWNER_EMAIL, passwordHash, companyId: company.id, role: 'OWNER' },
  });

  console.log('Seeded:', { company: company.name, products: products.length, customers: customers.length, invoices: 1 });
  console.log('Demo login:', { email: DEMO_OWNER_EMAIL, password: DEMO_OWNER_PASSWORD });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
