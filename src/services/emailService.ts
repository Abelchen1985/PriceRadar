/**
 * Outbound Email Delivery
 *
 * Extracted from server.ts so the same send logic can be used both by the
 * live Express server (for on-demand alerts, local dev) and by
 * scripts/sync-prices.ts (the GitHub Actions scheduled sync, which has no
 * Express app at all). Keeping one copy means a fix here applies to both
 * instead of silently drifting apart.
 *
 * Provider priority: Resend (if RESEND_API_KEY is set) then SMTP (if
 * SMTP_USER + SMTP_PASS are set) then a no-op "Simulator" result.
 */

import nodemailer from "nodemailer";

export interface EmailDeliveryResult {
  success: boolean;
  provider: "Resend" | "SMTP" | "Simulator";
  messageId?: string;
  error?: string;
}

export async function sendExternalEmail(to: string, subject: string, html: string): Promise<EmailDeliveryResult> {
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEmail = process.env.EMAIL_FROM || "PriceRadar <onboarding@resend.dev>";
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { success: false, provider: "Resend", error: data.message || "Resend API returned error" };
      }
      return { success: true, provider: "Resend", messageId: data.id };
    } catch (e: any) {
      return { success: false, provider: "Resend", error: e.message };
    }
  }

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const cleanUser = (process.env.SMTP_USER || "").trim();
      const cleanPass = (process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
      const host = process.env.SMTP_HOST || "smtp.gmail.com";
      const isGmail = host.includes("gmail") || cleanUser.endsWith("@gmail.com");

      const transportConfig: any = isGmail
        ? {
            service: "gmail",
            auth: {
              user: cleanUser,
              pass: cleanPass
            }
          }
        : {
            host,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
              user: cleanUser,
              pass: cleanPass
            }
          };

      const transporter = nodemailer.createTransport(transportConfig);
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"PriceRadar Alerts" <${cleanUser}>`,
        to,
        subject,
        html
      });
      return { success: true, provider: "SMTP", messageId: info.messageId };
    } catch (e: any) {
      let msg = e.message || "SMTP error";
      if (msg.includes("534") || msg.includes("Application-specific password required")) {
        msg = "Google requires a 16-character App Password (not standard account password). Generate one at https://myaccount.google.com/apppasswords with 2-Step Verification enabled.";
      }
      return { success: false, provider: "SMTP", error: msg };
    }
  }

  return {
    success: false,
    provider: "Simulator",
    error: "No external outbound email service configured. (Add RESEND_API_KEY or SMTP_USER/SMTP_PASS as a secret to send real emails.)"
  };
}
