// Live routing dispatcher: attempts ranked partners in order, with bounded
// failover, per-attempt idempotency and full audit logging.

import { logDecision, resolveRoute, type RouteRequest } from "./routeResolver.ts";

type Client = { from: (t: string) => any };

export interface DispatchContext {
  transfer_id: string;
  transfer: Record<string, any>;
  requested_by?: string | null;
  supabaseUrl: string;
  serviceKey: string;
  authHeader?: string | null;
}

export interface DispatchResult {
  routed: boolean; // false => caller should fall back to legacy rails
  reason?: string;
  payoutResult?: any;
  partner_code?: string;
  attempts?: number;
}

/** Provider errors that must never be retried on another rail. */
const NON_RETRYABLE = [
  "invalid account",
  "invalid recipient",
  "account not found",
  "name mismatch",
  "compliance",
  "sanction",
  "blocked",
  "kyc",
  "duplicate",
  "already processed",
  "insufficient balance",
];

/** An ambiguous provider response may mean funds moved — never fail over. */
const AMBIGUOUS = ["timeout", "timed out", "network error", "unknown status", "pending confirmation"];

function classify(errorText: string): "retryable" | "non_retryable" | "ambiguous" {
  const t = (errorText || "").toLowerCase();
  if (AMBIGUOUS.some((k) => t.includes(k))) return "ambiguous";
  if (NON_RETRYABLE.some((k) => t.includes(k))) return "non_retryable";
  return "retryable";
}

async function logAttempt(supabase: Client, row: Record<string, unknown>) {
  const { error } = await supabase.from("routing_attempts").insert(row);
  if (error) console.error("routing_attempts insert failed", error.message);
}

/**
 * Try to execute the payout through the routing engine.
 * Returns `{ routed: false }` whenever the engine is not in charge, so the
 * caller keeps its existing hardcoded rail logic untouched.
 */
export async function dispatchRoutedPayout(
  supabase: Client,
  req: RouteRequest,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  let resolution;
  try {
    resolution = await resolveRoute(supabase, req);
  } catch (e) {
    console.error("resolveRoute failed", e);
    return { routed: false, reason: "resolver_error" };
  }

  if (resolution.killSwitch) return { routed: false, reason: "kill_switch" };
  if (resolution.mode !== "live") return { routed: false, reason: "shadow_mode" };
  if (!resolution.liveCorridor) return { routed: false, reason: "corridor_not_live" };

  const candidates = resolution.candidates.filter((c) => !!c.function_slug);
  if (!candidates.length) return { routed: false, reason: "no_candidates" };

  const decisionId = await logDecision(supabase, {
    mode: "live",
    req,
    resolution,
    transfer_id: ctx.transfer_id,
    requested_by: ctx.requested_by ?? null,
  });

  const maxRetries = Math.max(1, Number(resolution.rule?.max_retries ?? 2));
  const pool = candidates.slice(0, maxRetries);
  const t = ctx.transfer;

  let attemptNumber = 0;
  let lastError = "Payout failed on all routed rails";

  for (const candidate of pool) {
    attemptNumber += 1;
    const idempotencyKey = `${ctx.transfer_id}:${candidate.partner_code}:${attemptNumber}`;
    const started = Date.now();
    let outcome = "failed";
    let retryable = false;
    let providerRef: string | null = null;
    let errorMessage: string | null = null;
    let payoutResult: any = null;

    try {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/${candidate.function_slug}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ctx.authHeader || `Bearer ${ctx.serviceKey}`,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          transfer_id: ctx.transfer_id,
          amount: Number(t.target_amount ?? t.source_amount),
          currency: t.target_currency ?? t.source_currency,
          recipient_name: t.recipient_name,
          account_number: t.recipient_account_number ?? null,
          bank_code: t.recipient_bank_code ?? null,
          phone_number: t.recipient_phone ?? null,
          routed_by_engine: true,
          idempotency_key: idempotencyKey,
        }),
      });
      payoutResult = await res.json().catch(() => ({}));

      if (res.ok && payoutResult?.success !== false && payoutResult?.stub !== true) {
        outcome = payoutResult?.pending_liquidity || payoutResult?.queued ? "queued" : "success";
        providerRef = payoutResult?.provider_reference ?? payoutResult?.reference ?? null;
      } else {
        errorMessage = String(
          payoutResult?.error || payoutResult?.provider_message || `HTTP ${res.status}`,
        ).slice(0, 500);
      }
    } catch (e) {
      errorMessage = (e instanceof Error ? e.message : "dispatch error").slice(0, 500);
    }

    const kind = errorMessage ? classify(errorMessage) : "retryable";
    retryable = !!errorMessage && kind === "retryable";
    if (errorMessage && kind === "ambiguous") outcome = "ambiguous";

    await logAttempt(supabase, {
      transfer_id: ctx.transfer_id,
      routing_decision_id: decisionId,
      partner_id: candidate.partner_id,
      partner_code: candidate.partner_code,
      function_slug: candidate.function_slug,
      attempt_number: attemptNumber,
      outcome,
      retryable,
      provider_reference: providerRef,
      error_message: errorMessage,
      latency_ms: Date.now() - started,
      idempotency_key: idempotencyKey,
    });

    if (outcome === "success" || outcome === "queued") {
      if (decisionId) {
        await supabase
          .from("routing_decisions")
          .update({ actual_partner_id: candidate.partner_id })
          .eq("id", decisionId);
      }
      return {
        routed: true,
        payoutResult: { ...payoutResult, rail: candidate.partner_code, routed_by_engine: true },
        partner_code: candidate.partner_code,
        attempts: attemptNumber,
      };
    }

    lastError = errorMessage ?? lastError;

    if (kind === "ambiguous") {
      // Funds may have moved — stop and flag for manual review.
      await supabase
        .from("transfers")
        .update({ status: "processing", failure_reason: `Manual review: ${lastError}`.slice(0, 500) })
        .eq("id", ctx.transfer_id);
      return {
        routed: true,
        payoutResult: {
          success: true,
          queued: true,
          pending_liquidity: true,
          rail: candidate.partner_code,
          manual_review: true,
          message: "Payment received. We're confirming delivery with our partner.",
        },
        partner_code: candidate.partner_code,
        attempts: attemptNumber,
      };
    }

    if (kind === "non_retryable") {
      return {
        routed: true,
        payoutResult: { success: false, error: lastError, rail: candidate.partner_code, routed_by_engine: true },
        partner_code: candidate.partner_code,
        attempts: attemptNumber,
      };
    }
    // retryable => continue to next candidate
  }

  return {
    routed: true,
    payoutResult: {
      success: false,
      error: lastError,
      code: "routing_exhausted",
      routed_by_engine: true,
      attempts: attemptNumber,
    },
    attempts: attemptNumber,
  };
}
