import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = { title: 'Terms & Conditions — Invozy' };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance of terms',
    body: [
      'By creating an account or otherwise using Invozy ("the Service"), you agree to these Terms & Conditions. If you are creating an account on behalf of a business, you confirm you have the authority to bind that business to these terms.',
    ],
  },
  {
    title: '2. What Invozy is',
    body: [
      'Invozy is GST invoicing and billing software: it helps you maintain a product catalog, customer list, and generate GST-compliant invoices and reports. Each business that signs up gets its own isolated workspace ("Company").',
    ],
  },
  {
    title: '3. Free tier, and paid plans later',
    body: [
      'Invozy is currently free to use in full, during this early stage of the product. We plan to introduce paid subscription plans in the future. If and when that happens, existing free accounts will be given advance notice before any change that affects them — you will not be silently switched to a paid plan or lose access to your data without warning.',
    ],
  },
  {
    title: '4. Your account',
    body: [
      'You are responsible for keeping your login credentials confidential and for all activity under your account. You must provide accurate information when signing up, and keep your Company’s GST and billing details up to date — Invozy is not responsible for incorrect invoices caused by inaccurate information you enter.',
    ],
  },
  {
    title: '5. Acceptable use',
    body: [
      'You agree not to use the Service to store or transmit unlawful content, attempt to access another Company’s data, interfere with the Service’s operation, or reverse-engineer the software beyond what is permitted by law.',
    ],
  },
  {
    title: '6. Your data',
    body: [
      'Data you enter (products, customers, invoices, uploaded photos and logos) belongs to you and your Company. We store it to provide the Service to you and do not sell it to third parties. Uploaded images are stored on our servers and served back to your workspace.',
      'You are responsible for the accuracy and legality of GST and financial data you enter — Invozy does not file GST returns or provide tax advice on your behalf.',
    ],
  },
  {
    title: '7. Limitation of liability',
    body: [
      'The Service is provided "as is", without warranties of any kind. To the maximum extent permitted by law, Invozy is not liable for indirect, incidental, or consequential damages arising from your use of the Service, including errors in generated invoices or GST calculations that you did not verify before sending to a customer or filing authority.',
    ],
  },
  {
    title: '8. Termination',
    body: [
      'You may stop using the Service at any time. We may suspend or terminate accounts that violate these terms, engage in abuse, or pose a security risk to other Companies on the platform.',
    ],
  },
  {
    title: '9. Changes to these terms',
    body: [
      'We may update these terms as the Service evolves, particularly once paid plans are introduced. Material changes will be communicated to account holders in advance where reasonably possible.',
    ],
  },
  {
    title: '10. Contact',
    body: ['Questions about these terms can be directed to ritimahesh29@gmail.com or +91 93449 62754.'],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-[720px] items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center">
          <Image src="/brand/logo.png" alt="Invozy" width={994} height={324} className="h-8 w-auto" />
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft hover:text-ink">
          <ArrowLeft size={13} /> Back home
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-20">
        <div className="rounded-xl2 border border-line bg-surface p-6 shadow-card md:p-8">
          <h1 className="text-[22px] font-extrabold text-ink">Terms &amp; Conditions</h1>
          <p className="mt-1.5 text-[12px] text-ink-faint">Last updated {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <p className="mt-4 rounded-lg2 border border-dashed border-line bg-bg p-3.5 text-[12px] leading-relaxed text-ink-faint">
            This is a standard template, not a substitute for legal advice. Before charging money or handling production customer data at scale, have these terms reviewed by a
            qualified professional for your jurisdiction.
          </p>

          <div className="mt-6 space-y-6">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="text-[14px] font-extrabold text-ink">{s.title}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="mt-1.5 text-[13px] leading-relaxed text-ink-body">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
