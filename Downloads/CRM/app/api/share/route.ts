import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResearchConfig } from "@/lib/admin/settings";
import { sendEmailMessage, sendSlackMessage } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

type SharePayload = {
  targetType?: "plan" | "activity";
  targetId?: string;
  channels?: {
    slack?: boolean;
    email?: boolean;
  };
  recipients?: string[];
  note?: string;
};

function readSessionToken(cookieHeader: string): string | null {
  const cookiePart = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookiePart) return null;
  const raw = cookiePart.slice(`${SESSION_COOKIE}=`.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function withAppUrl(path: string): string {
  const appUrl = String(process.env.APP_URL || "").trim();
  if (!appUrl) return path;
  const normalized = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
  return `${normalized.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const item of value) {
    const email = String(item ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    out.add(email);
  }
  return Array.from(out).slice(0, 30);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SharePayload;
    const targetType = body.targetType;
    const targetId = String(body.targetId ?? "").trim();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: "targetType and targetId are required" }, { status: 400 });
    }

    const useSlack = body.channels?.slack === true;
    const useEmail = body.channels?.email === true;
    if (!useSlack && !useEmail) {
      return NextResponse.json({ error: "Choose at least one channel" }, { status: 400 });
    }

    const config = await getResearchConfig();
    const note = String(body.note ?? "").trim();

    const cookieHeader = req.headers.get("cookie") || "";
    const token = readSessionToken(cookieHeader);
    const session = token ? await verifySession(token) : null;
    const actor = session?.email || "CRM user";

    let customerId = "";
    let customerName = "";
    let title = "";
    let details = "";
    let crmPath = "/";

    if (targetType === "plan") {
      const plan = await prisma.plan.findUnique({
        where: { id: targetId },
        include: { customer: { select: { id: true, name: true } } }
      });
      if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

      customerId = plan.customerId;
      customerName = plan.customer.name;
      title = plan.title;
      details = [
        `Status: ${plan.status}`,
        `Priority: ${plan.priority}`,
        `Owner: ${plan.owner || "-"}`,
        `Deadline: ${plan.endDate ? plan.endDate.toISOString().slice(0, 10) : "-"}`
      ].join(" · ");
      crmPath = `/customers/${plan.customerId}`;
    } else {
      const activity = await prisma.activity.findUnique({
        where: { id: targetId },
        include: {
          customer: { select: { id: true, name: true } },
          plan: { select: { id: true, title: true } }
        }
      });
      if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });

      customerId = activity.customerId;
      customerName = activity.customer.name;
      title = activity.plan?.title ? `Activity (${activity.plan.title})` : "Activity";
      details = activity.message;
      crmPath = `/customers/${activity.customerId}`;
    }

    const link = withAppUrl(crmPath);
    const lines = [
      `Customer: ${customerName}`,
      `Item: ${title}`,
      details,
      note ? `Note: ${note}` : "",
      `Link: ${link}`
    ].filter(Boolean);

    if (useSlack) {
      if (!config.notifyViaSlack || !config.slackWebhookUrl) {
        return NextResponse.json({ error: "Slack notifications are not configured in Admin > Settings." }, { status: 400 });
      }
      await sendSlackMessage({
        webhookUrl: config.slackWebhookUrl,
        title: targetType === "plan" ? "Vendora CRM plan share" : "Vendora CRM activity share",
        lines
      });
    }

    if (useEmail) {
      const recipients = normalizeRecipients(body.recipients);
      if (!recipients.length) {
        return NextResponse.json({ error: "Email recipients are required for email sharing." }, { status: 400 });
      }
      const smtpUser = process.env.SMTP_USER || "";
      await sendEmailMessage({
        from: config.gmailFrom || smtpUser,
        replyTo: config.gmailReplyTo || undefined,
        recipients,
        subject: targetType === "plan" ? `Vendora CRM plan share: ${title}` : `Vendora CRM activity share: ${customerName}`,
        lines
      });
    }

    await logActivity({
      type: ActivityType.NOTE,
      message: `${targetType === "plan" ? "Plan" : "Activity"} shared by ${actor} via ${[useSlack ? "slack" : "", useEmail ? "email" : ""].filter(Boolean).join("+")}`,
      customerId,
      metadata: {
        targetType,
        targetId,
        actor,
        channels: { slack: useSlack, email: useEmail },
        recipients: useEmail ? normalizeRecipients(body.recipients) : []
      }
    });

    return NextResponse.json({
      ok: true,
      sent: {
        slack: useSlack,
        email: useEmail
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not share item" }, { status: 400 });
  }
}

