// Secrets (Supabase Dashboard → Edge Functions → Secrets, of CLI):
//   MOLLIE_API_KEY   = test_... of live_... (https://www.mollie.com/dashboard/developers/api-keys)
//   SITE_URL         = https://jouwdomein.nl  (geen trailing slash; redirect na betaling)
//
// Zonder MOLLIE_API_KEY blijft de oude stub-actief response (handig voor lokaal testen).

import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

type CreateBody = {
  donationId?: string
  amount?: number
  donorEmail?: string | null
  donorName?: string | null
  charityName?: string | null
  donationType?: "eenmalig" | "maandelijks" | null
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function formatEur(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0.00"
  return (Math.round(amount * 100) / 100).toFixed(2)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed", message: "Alleen POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return json({
      mode: "pending_contract",
      message: "Ongeldige JSON body.",
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }

  const donationId = typeof body.donationId === "string" ? body.donationId.trim() : ""
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  const charityName = typeof body.charityName === "string" ? body.charityName.trim() : ""
  const donationType = body.donationType === "maandelijks" ? "maandelijks" : "eenmalig"

  if (!donationId || !Number.isFinite(amount) || amount <= 0) {
    return json({
      mode: "pending_contract",
      message: "donationId en geldig amount zijn verplicht.",
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }

  const apiKey = Deno.env.get("MOLLIE_API_KEY")?.trim()
  if (!apiKey) {
    return json({
      mode: "pending_contract",
      message: "Mollie stub actief (geen MOLLIE_API_KEY in secrets).",
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }

  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "").trim()
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "").trim()
  if (!siteUrl) {
    return json({
      mode: "pending_contract",
      message: "SITE_URL ontbreekt in Edge Function secrets (voor redirect na betaling).",
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }
  if (!supabaseUrl) {
    return json({
      mode: "pending_contract",
      message: "SUPABASE_URL ontbreekt (normaal automatisch op Supabase).",
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }

  const redirectUrl = `${siteUrl}/donations?mollie=return`
  const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`

  const molliePayload: Record<string, unknown> = {
    amount: { currency: "EUR", value: formatEur(amount) },
    description: `Donatie ${donationId.slice(0, 8)}${charityName ? ` – ${charityName}` : ""}`,
    redirectUrl,
    webhookUrl,
    metadata: {
      donation_id: donationId,
      donation_type: donationType,
    },
  }

  if (donationType === "maandelijks") {
    molliePayload.sequenceType = "first"
  }

  const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(molliePayload),
  })

  const raw = await mollieRes.text()
  let payment: Record<string, unknown> = {}
  try {
    payment = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    payment = {}
  }

  if (!mollieRes.ok) {
    const detail = typeof payment.detail === "string"
      ? payment.detail
      : typeof payment.title === "string"
      ? payment.title
      : raw.slice(0, 400)
    return json({
      mode: "pending_contract",
      message: `Mollie weigerde de betaling: ${detail}`,
      checkoutUrl: null,
      molliePaymentId: null,
    })
  }

  const links = payment._links as Record<string, { href?: string }> | undefined
  const checkoutUrl = links?.checkout?.href ?? null
  const molliePaymentId = typeof payment.id === "string" ? payment.id : null

  return json({
    mode: "live",
    message: "Mollie checkout klaar. Volg de link om te betalen.",
    checkoutUrl,
    molliePaymentId,
  })
})
