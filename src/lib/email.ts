import nodemailer from 'nodemailer'
import { log } from './logger'

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null

const FROM_ADDRESS = process.env.SMTP_FROM || 'support@hai-app.net'
const FROM_NAME = 'حي — Hai Support'

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

/** Send email via SMTP. Returns true if sent, false if SMTP not configured or failed. */
export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<boolean> {
  if (!transporter) {
    log.warn('SMTP not configured — email not sent', { to, subject })
    return false
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    })
    log.info('Email sent', { to, subject })
    return true
  } catch (err) {
    log.error('Failed to send email', err, { to, subject })
    return false
  }
}

/** Send support reply email to a user */
export async function sendSupportReply(userEmail: string, ticketSubject: string, replyText: string) {
  return sendEmail({
    to: userEmail,
    subject: `رد على تذكرتك: ${ticketSubject} | Hai Support`,
    text: `مرحباً،\n\nتم الرد على تذكرتك:\n\n${replyText}\n\n---\nفريق دعم حي\nsupport@hai-app.net`,
    html: `
      <div dir="rtl" style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #006d57; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0;">حي — Hai</h2>
        </div>
        <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; margin-bottom: 8px;"><strong>رد على تذكرتك:</strong></p>
          <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; color: #1f2937; line-height: 1.7;">
            ${replyText.replace(/\n/g, '<br>')}
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            فريق دعم حي — support@hai-app.net
          </p>
        </div>
      </div>
    `,
  })
}

/** Send a direct email from admin to user */
export async function sendAdminEmail(userEmail: string, subject: string, body: string) {
  return sendEmail({
    to: userEmail,
    subject: `${subject} | حي — Hai`,
    text: `مرحباً،\n\n${body}\n\n---\nفريق دعم حي\nsupport@hai-app.net`,
    html: `
      <div dir="rtl" style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #006d57; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0;">حي — Hai</h2>
        </div>
        <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; color: #1f2937; line-height: 1.7;">
            ${body.replace(/\n/g, '<br>')}
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            فريق دعم حي — support@hai-app.net
          </p>
        </div>
      </div>
    `,
  })
}
