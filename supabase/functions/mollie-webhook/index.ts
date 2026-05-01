// Mollie roept deze URL aan bij statuswijzigingen.
// We halen de betaling opnieuw op bij Mollie (betrouwbaarder dan alleen de webhook-body).

import { createClient } from "jsr:@supabase/supabase-js@2"

async function sendDonationPaidEmail(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  name: string,
  amount: number,
) {
  if (!to?.includes("@")) {
    console.warn("mollie-webhook: geen donor_email, skip send-email")
    return
  }
  const amountStr = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number.isFinite(amount) ? amount : 0,
  )
  const base = supabaseUrl.replace(/\/$/, "")
  const res = await fetch(`${base}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      to: to.trim(),
      type: "donation_paid",
      payload: { name: (name && name.trim()) || "daar", amount: amountStr },
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    console.error("mollie-webhook: send-email", res.status, t.slice(0, 300))
  }
}

async function parsePaymentId(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    try {
      const j = (await req.json()) as { id?: string }
      return typeof j.id === "string" ? j.id : null
    } catch {
      return null
    }
  }
  const text = await req.text()
  const params = new URLSearchParams(text)
  const id = params.get("id")
  return id?.trim() || null
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 })
  }

  const apiKey = Deno.env.get("MOLLIE_API_KEY")?.trim()
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim()
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()

  if (!apiKey || !supabaseUrl || !serviceKey) {
    console.error("mollie-webhook: ontbrekende env (MOLLIE_API_KEY, SUPABASE_URL, SERVICE_ROLE)")
    return new Response("server misconfigured", { status: 500 })
  }

  const paymentId = await parsePaymentId(req)
  if (!paymentId) {
    return new Response("missing id", { status: 400 })
  }

  const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const raw = await mollieRes.text()
  let payment: Record<string, unknown> = {}
  try {
    payment = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    payment = {}
  }

  if (!mollieRes.ok) {
    console.error("mollie-webhook: Mollie GET failed", mollieRes.status, raw.slice(0, 200))
    return new Response("mollie fetch failed", { status: 502 })
  }

  const status = typeof payment.status === "string" ? payment.status : ""
  const metadata = payment.metadata as Record<string, unknown> | undefined
  const donationIdRaw = metadata?.donation_id
  const donationId = typeof donationIdRaw === "string" ? donationIdRaw.trim() : ""

  if (!donationId) {
    console.warn("mollie-webhook: geen donation_id in metadata", paymentId)
    return new Response("ok", { status: 200 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: row, error: loadError } = await supabase
    .from("donations")
    .select("id, status, metadata, amount, donor_email, donor_name")
    .eq("id", donationId)
    .maybeSingle()

  if (loadError || !row) {
    console.error("mollie-webhook: donation niet gevonden", donationId, loadError?.message)
    return new Response("ok", { status: 200 })
  }

  const prevMeta = (row.metadata as Record<string, unknown> | null) ?? {}

  if (status === "paid") {
    if (row.status === "paid") {
      return new Response("ok", { status: 200 })
    }

    const paidAt = new Date().toISOString()
    const metadataNext = {
      ...prevMeta,
      mollie_payment_id: paymentId,
      mollie_status: status,
      paid_at: paidAt,
    }

    const { error: updateError } = await supabase
      .from("donations")
      .update({
        status: "paid",
        payment_method: "mollie",
        paid_at: paidAt,
        metadata: metadataNext,
      })
      .eq("id", donationId)

    if (updateError) {
      console.error("mollie-webhook: update failed", updateError.message)
      return new Response("update failed", { status: 500 })
    }

    const d = row as {
      amount?: number | null
      donor_email?: string | null
      donor_name?: string | null
    }
    await sendDonationPaidEmail(
      supabaseUrl,
      serviceKey,
      String(d.donor_email ?? ""),
      String(d.donor_name ?? ""),
      Number(d.amount ?? 0),
    )

    return new Response("ok", { status: 200 })
  }

  // Terugbetaling / chargeback: punten niet definitief (metadata) + trigger kan owner-bonus terugdraaien
  if (status === "refunded" || status === "charged_back") {
    if (row.status !== "paid") {
      return new Response("ok", { status: 200 })
    }

    const metadataNext = {
      ...prevMeta,
      mollie_payment_id: paymentId,
      mollie_status: status,
      points_status: "cancelled",
      points_cancelled_at: new Date().toISOString(),
    }

    const { error: refundErr } = await supabase
      .from("donations")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        metadata: metadataNext,
      })
      .eq("id", donationId)

    if (refundErr) {
      console.error("mollie-webhook: refund update failed", refundErr.message)
      return new Response("update failed", { status: 500 })
    }

    return new Response("ok", { status: 200 })
  }

  // Betaling nooit voltooid
  if (status === "canceled" || status === "expired" || status === "failed") {
    if (row.status !== "pending") {
      return new Response("ok", { status: 200 })
    }

    const metadataNext = {
      ...prevMeta,
      mollie_payment_id: paymentId,
      mollie_status: status,
      points_status: "cancelled",
      points_cancelled_at: new Date().toISOString(),
    }

    const { error: cancelErr } = await supabase
      .from("donations")
      .update({
        status: "cancelled",
        metadata: metadataNext,
      })
      .eq("id", donationId)

    if (cancelErr) {
      console.error("mollie-webhook: cancel update failed", cancelErr.message)
    }

    return new Response("ok", { status: 200 })
  }

  return new Response("ok", { status: 200 })
})
