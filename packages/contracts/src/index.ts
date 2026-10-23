import { z } from "zod";

export const packetSectionSchema = z.object({
  kind: z.string(),
  pageStart: z.number().int(),
  pageEnd: z.number().int(),
  summary: z.string(),
});

export const packetSchema = z.object({
  filename: z.string(),
  patientName: z.string(),
  dob: z.string(),
  reason: z.string(),
  payer: z.string(),
  confidence: z.number().min(0).max(1),
  sections: z.array(packetSectionSchema),
  memberId: z.string().default(""),
  phone: z.string().default(""),
  serviceArea: z.enum(["in", "out"]).default("in"),
  lastColonoscopy: z.string().default("none"),
  cpt: z.string().default(""),
  diagnosis: z.string().default(""),
});

export const clinicRulesSchema = z.object({
  version: z.number().int(),
  triage: z.object({
    stat: z.array(z.string()),
    symptomatic: z.array(z.string()),
    screening: z.array(z.string()),
  }),
  requiredDocuments: z.array(
    z.object({
      when: z.string(),
      need: z.array(z.string()),
    }),
  ),
  exclusions: z.object({
    colonoscopyWithinDays: z.number().int().optional(),
    outsideServiceArea: z.boolean().optional(),
  }),
  payerRouting: z.array(
    z.object({
      payer: z.string(),
      provider: z.string(),
      timeOfDay: z.enum(["morning", "end_of_day"]).optional(),
    }),
  ),
  outreach: z.object({
    maxAttempts: z.number().int(),
    hoursBetween: z.number().int(),
    screener: z.array(z.string()),
  }),
});

export const dispositionSchema = z.object({
  kind: z.enum(["ready", "fax_back", "ineligible", "needs_human"]),
  category: z.enum(["STAT", "symptomatic", "screening"]).nullable(),
  missing: z.array(z.string()),
  confidence: z.number(),
  detail: z.string().default(""),
});

export const jsonSchemas = {
  packet: z.toJSONSchema(packetSchema),
  clinicRules: z.toJSONSchema(clinicRulesSchema),
  disposition: z.toJSONSchema(dispositionSchema),
};

export type Packet = z.infer<typeof packetSchema>;
export type ClinicRules = z.infer<typeof clinicRulesSchema>;
export type Disposition = z.infer<typeof dispositionSchema>;
