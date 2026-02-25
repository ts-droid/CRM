import { PlanStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getResearchConfig } from "@/lib/admin/settings";
import { sendEmailMessage, sendSlackMessage } from "@/lib/notifications";

const REMINDER_STATE_KEY = "reminder_state";

type ReminderState = {
  sentKeys: Record<string, string>;
  lastRunAt?: string;
};

type ReminderItem = {
  key: string;
  line: string;
};

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function getReminderState(): Promise<ReminderState> {
  const row = await prisma.appSetting.findUnique({ where: { key: REMINDER_STATE_KEY } });
  if (!row || typeof row.value !== "object" || !row.value) return { sentKeys: {} };
  const value = row.value as Record<string, unknown>;
  const sentKeys = value.sentKeys && typeof value.sentKeys === "object" ? (value.sentKeys as Record<string, string>) : {};
  return {
    sentKeys,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : undefined
  };
}

async function saveReminderState(state: ReminderState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: REMINDER_STATE_KEY },
    update: { value: state },
    create: { key: REMINDER_STATE_KEY, value: state }
  });
}

export async function runReminderSweep(): Promise<{
  sent: number;
  skipped: number;
  reminders: string[];
}> {
  const config = await getResearchConfig();
  if (!config.remindersEnabled) {
    return { sent: 0, skipped: 0, reminders: [] };
  }

  const now = new Date();
  const dayKey = todayKey(now);
  const deadlineUntil = new Date(now);
  deadlineUntil.setDate(deadlineUntil.getDate() + config.reminderDaysBeforeDeadline);

  const openStatuses = [PlanStatus.PLANNED, PlanStatus.IN_PROGRESS, PlanStatus.ON_HOLD];

  const [duePlans, allCustomers, recentActivities, state] = await Promise.all([
    prisma.plan.findMany({
      where: {
        status: { in: openStatuses },
        endDate: { not: null, lte: deadlineUntil }
      },
      include: {
        customer: {
          select: { name: true }
        }
      }
    }),
    prisma.customer.findMany({
      select: { id: true, name: true, updatedAt: true }
    }),
    prisma.activity.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - config.inactivityReminderDays * 24 * 60 * 60 * 1000)
        }
      },
      select: { customerId: true, createdAt: true }
    }),
    getReminderState()
  ]);

  const activeCustomerIds = new Set(recentActivities.map((item) => item.customerId));
  const items: ReminderItem[] = [];

  for (const plan of duePlans) {
    const key = `deadline:${plan.id}:${dayKey}`;
    const endDate = plan.endDate ? plan.endDate.toISOString().slice(0, 10) : "-";
    items.push({
      key,
      line: `Plan deadline: ${plan.customer.name} · ${plan.title} · due ${endDate} · owner ${plan.owner || "-"}`
    });
  }

  for (const customer of allCustomers) {
    if (activeCustomerIds.has(customer.id)) continue;
    const key = `inactive:${customer.id}:${dayKey}`;
    const updatedAt = customer.updatedAt.toISOString().slice(0, 10);
    items.push({
      key,
      line: `Inactive customer: ${customer.name} · no activity in ${config.inactivityReminderDays} days · last update ${updatedAt}`
    });
  }

  const freshItems = items.filter((item) => !state.sentKeys[item.key]);
  if (!freshItems.length) {
    await saveReminderState({ ...state, lastRunAt: now.toISOString() });
    return { sent: 0, skipped: items.length, reminders: [] };
  }

  const lines = freshItems.map((item) => item.line).slice(0, 80);
  const title = `Vendora CRM reminders (${dayKey})`;

  if (config.notifyViaSlack && config.slackWebhookUrl) {
    await sendSlackMessage({
      webhookUrl: config.slackWebhookUrl,
      title,
      lines
    });
  }

  if (config.notifyViaEmail && config.reminderRecipients.length) {
    const smtpUser = process.env.SMTP_USER || "";
    await sendEmailMessage({
      from: config.gmailFrom || smtpUser,
      replyTo: config.gmailReplyTo || undefined,
      recipients: config.reminderRecipients,
      subject: title,
      lines
    });
  }

  const nextState: ReminderState = {
    lastRunAt: now.toISOString(),
    sentKeys: {
      ...state.sentKeys
    }
  };

  for (const item of freshItems) {
    nextState.sentKeys[item.key] = now.toISOString();
  }

  await saveReminderState(nextState);
  return { sent: freshItems.length, skipped: items.length - freshItems.length, reminders: lines };
}
