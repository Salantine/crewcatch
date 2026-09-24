import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type CallCompletedEvent,
  type DispatchChannel,
  type Lead,
  type TranscriptMessage,
  type CallIntent,
  type UrgencyLevel,
  Lead as LeadSchema,
} from "@/lib/domain/schemas";

/**
 * Ingestion persistence.
 *
 * ⚠ Uses the service-role client, which BYPASSES RLS. This module is the
 * ingestion path only — a webhook is unauthenticated at the database level
 * (it is authenticated by HMAC signature at the HTTP layer), so it cannot use
 * the RLS-scoped client. It must never be imported by a contractor-facing
 * render path. `eslint` enforces this via no-restricted-imports.
 *
 * Every function here fails soft: a persistence error must never propagate to
 * the vendor as a 5xx, because Retell retries, and a retry storm against a
 * half-broken database is worse than one dropped call that we log.
 */

export type PersistOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; detail?: string };

/** Postgres unique-violation. Used for webhook idempotency. */
const UNIQUE_VIOLATION = "23505";

export interface ResolvedContractor {
  contractorId: string;
  dispatchChannels: DispatchChannel[];
  number: string;
}

/**
 * Maps an inbound dialled number to the contractor who owns it.
 *
 * Returns `ok: false` rather than throwing when the number is unknown: an
 * unmapped number means a provisioning or config gap, and dropping the call
 * quietly is correct — dispatching it to the wrong contractor is not.
 */
export async function resolveContractorForNumber(
  dialledNumber: string,
): Promise<PersistOutcome<ResolvedContractor>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("phone_numbers")
      .select("contractor_id, number, contractors!inner(dispatch_channels)")
      .eq("number", dialledNumber)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "lookup_failed", detail: error.message };
    }
    if (!data) {
      return { ok: false, reason: "unmapped_number" };
    }

    // The join returns contractors as an object (it is an inner join on a
    // to-one FK), but Supabase types it as an array — normalise both shapes.
    const joined = data.contractors as unknown;
    const row = Array.isArray(joined) ? joined[0] : joined;
    const channels = (row as { dispatch_channels?: DispatchChannel[] } | undefined)
      ?.dispatch_channels;

    return {
      ok: true,
      data: {
        contractorId: data.contractor_id,
        number: data.number,
        dispatchChannels: channels?.length ? channels : ["sms"],
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "lookup_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface PersistCallInput {
  event: CallCompletedEvent;
  contractorId: string;
  intent: CallIntent;
  urgency: UrgencyLevel;
  qualified: boolean;
}

/**
 * Persists a completed call.
 *
 * Idempotent by design: Retell retries webhooks, and the
 * `unique (contractor_id, external_call_id)` constraint from 0001 is the
 * guard. On conflict we read the existing row and reuse its id rather than
 * inserting a second one — a duplicate call double-counts the lead in the
 * owner's ROI dashboard, which is the number they are paying for.
 */
export async function persistCall(
  input: PersistCallInput,
): Promise<PersistOutcome<{ id: string; created: boolean }>> {
  const { event, contractorId, intent, urgency, qualified } = input;

  try {
    const supabase = createAdminClient();

    const row = {
      contractor_id: contractorId,
      external_call_id: event.externalCallId,
      direction: "inbound" as const,
      started_at: event.startedAt,
      ended_at: event.endedAt,
      duration_seconds: event.durationSeconds,
      intent,
      urgency,
      qualified,
      transcript: event.transcript as TranscriptMessage[],
    };

    const { data, error } = await supabase
      .from("calls")
      .insert(row)
      .select("id")
      .single();

    if (!error) {
      return { ok: true, data: { id: (data as { id: string }).id, created: true } };
    }

    if (error.code === UNIQUE_VIOLATION) {
      // Retry already handled — return the original row's id.
      const { data: existing, error: readErr } = await supabase
        .from("calls")
        .select("id")
        .eq("contractor_id", contractorId)
        .eq("external_call_id", event.externalCallId)
        .maybeSingle();

      if (readErr) {
        return { ok: false, reason: "idempotency_read_failed", detail: readErr.message };
      }
      if (!existing) {
        return { ok: false, reason: "idempotency_row_missing" };
      }
      return {
        ok: true,
        data: { id: (existing as { id: string }).id, created: false },
      };
    }

    return { ok: false, reason: "insert_failed", detail: error.message };
  } catch (err) {
    return {
      ok: false,
      reason: "insert_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export type LeadDraft = Omit<Lead, "id" | "capturedAt" | "contractorId" | "callId">;

/** Persists a lead and returns its id. */
export async function persistLead(
  contractorId: string,
  callId: string,
  lead: LeadDraft,
): Promise<PersistOutcome<{ id: string }>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("leads")
      .insert({
        contractor_id: contractorId,
        call_id: callId,
        name: lead.name,
        phone: lead.phone,
        address: lead.address ?? null,
        intent: lead.intent,
        urgency: lead.urgency,
        issue: lead.issue,
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, reason: "insert_failed", detail: error.message };
    }
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    return {
      ok: false,
      reason: "insert_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Records a dispatch attempt. Called on every attempt, success or failure, so
 * a failed send is visible in the portal rather than silently lost.
 */
export async function recordDispatchEvent(input: {
  contractorId: string;
  leadId: string;
  channel: DispatchChannel;
  accepted: boolean;
  providerMessageId?: string;
  detail?: string;
  dispatchedAt?: string;
}): Promise<PersistOutcome<{ id: string }>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("dispatch_events")
      .insert({
        contractor_id: input.contractorId,
        lead_id: input.leadId,
        channel: input.channel,
        accepted: input.accepted,
        provider_message_id: input.providerMessageId ?? null,
        detail: input.detail ?? null,
        dispatched_at: input.dispatchedAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, reason: "insert_failed", detail: error.message };
    }
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    return {
      ok: false,
      reason: "insert_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Narrow a persisted lead row back through the domain schema. */
export function toLeadDomain(row: Record<string, unknown>): Lead {
  return LeadSchema.parse({
    id: row.id,
    contractorId: row.contractor_id,
    callId: row.call_id,
    name: row.name,
    phone: row.phone,
    address: row.address ?? undefined,
    intent: row.intent,
    urgency: row.urgency,
    issue: row.issue,
    capturedAt: row.captured_at,
  });
}
