import { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LogActivityInput = {
  type: ActivityType;
  message: string;
  customerId: string;
  planId?: string;
  contactId?: string;
  actorName?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logActivity(input: LogActivityInput) {
  try {
    await prisma.activity.create({
      data: {
        type: input.type,
        message: input.message,
        customerId: input.customerId,
        planId: input.planId,
        contactId: input.contactId,
        actorName: input.actorName,
        metadata: input.metadata
      }
    });
  } catch {
    // Best effort logging; CRM core flow should not fail due to activity logging.
  }
}
