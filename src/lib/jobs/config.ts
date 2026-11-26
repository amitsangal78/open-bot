import { z } from "zod";
export const scheduleConfigSchema = z
  .object({
    query: z.string().max(500).optional(),
    accountIds: z.array(z.string().min(1).max(200)).max(10).optional(),
    symbol: z.string().max(30).optional(),
    notify: z.boolean().optional(),
    documentHandoff: z.boolean().optional(),
  })
  .strict();
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;
