import nodemailer from "nodemailer";

type SlackInput = {
  webhookUrl: string;
  title: string;
  lines: string[];
};

type EmailInput = {
  from: string;
  replyTo?: string;
  recipients: string[];
  subject: string;
  lines: string[];
};

let smtpTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (smtpTransport) return smtpTransport;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!host || !port || !user || !pass) return null;

  smtpTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return smtpTransport;
}

export async function sendSlackMessage(input: SlackInput): Promise<void> {
  if (!input.webhookUrl) return;
  await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${input.title}\n${input.lines.map((line) => `• ${line}`).join("\n")}`
    })
  });
}

export async function sendEmailMessage(input: EmailInput): Promise<void> {
  if (!input.recipients.length) return;
  const transport = getTransport();
  if (!transport) return;

  await transport.sendMail({
    from: input.from,
    replyTo: input.replyTo || undefined,
    to: input.recipients.join(", "),
    subject: input.subject,
    text: [input.subject, "", ...input.lines.map((line) => `- ${line}`)].join("\n")
  });
}
