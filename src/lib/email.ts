// Minimal transactional-email sender for the password-reset flow. When
// SMTP_HOST isn't configured (e.g. local dev with no mail account set up),
// falls back to logging the message so the flow is still fully testable —
// see .env.example for how to wire up a real SMTP provider.
export async function sendEmail(to: string, subject: string, html: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST) {
    console.log(`[email] SMTP not configured — would send to ${to}:\nSubject: ${subject}\n${html}`);
    return;
  }

  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: SMTP_FROM ?? SMTP_USER, to, subject, html });
}
