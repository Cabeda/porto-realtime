import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * Send a magic link OTP code via email.
 */
export async function sendMagicLinkEmail(email: string, code: string) {
  const appName = "PortoMove";
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: `${appName} <${FROM_EMAIL}>`,
    to: email,
    subject: `${code} — O seu código de acesso ao ${appName}`,
    html: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px;">
          ${appName}
        </h1>
        <p style="font-size: 14px; color: #666; margin: 0 0 32px;">
          Transportes em Tempo Real no Porto
        </p>
        <p style="font-size: 16px; color: #333; margin: 0 0 16px;">
          O seu código de acesso:
        </p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: monospace;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #666; margin: 0 0 8px;">
          Este código expira em <strong>10 minutos</strong>.
        </p>
        <p style="font-size: 14px; color: #666; margin: 0;">
          Se não pediu este código, pode ignorar este email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0 16px;" />
        <p style="font-size: 12px; color: #999; margin: 0;">
          ${appName} — portomove.pt
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Failed to send magic link email:", error);
    throw new Error("Failed to send email");
  }
}
