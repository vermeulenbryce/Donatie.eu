// Verstuurt e-mail op basis van site_email_templates (Resend).
// Secrets: RESEND_API_KEY, EMAIL_FROM (bijv. "Donatie.eu <noreply@donatie.eu>")
//         SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY worden door Supabase geïnjecteerd.
//
// Body (JSON): { to: string, type: string, payload?: object }
//   type = template key (bijv. welcome, donation_paid). Placeholders in HTML/subject: {{name}}, {{amount}}, …

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

type SendBody = {
  to?: string
  type?: string
  payload?: Record<string, unknown>
  notifyAdmin?: boolean
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function applyTemplate(text: string, payload: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const v = payload[k]
    if (v == null) return ""
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v)
    return ""
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405)
  }

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  const to = typeof body.to === "string" ? body.to.trim() : ""
  const type = typeof body.type === "string" ? body.type.trim() : ""
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: "invalid_to" }, 400)
  }
  if (!type) {
    return json({ error: "type_required" }, 400)
  }

  const url = Deno.env.get("SUPABASE_URL")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !service) {
    return json({ error: "server_misconfigured", message: "Supabase service credentials ontbreken." }, 500)
  }

  const resend = Deno.env.get("RESEND_API_KEY")
  const from = Deno.env.get("EMAIL_FROM") ?? "Donatie <onboarding@resend.dev>"
  if (!resend) {
    return json(
      {
        error: "resend_not_configured",
        message: "Zet RESEND_API_KEY in Edge Function secrets (en eventueel EMAIL_FROM).",
      },
      503,
    )
  }

  const supabase = createClient(url, service)
  const { data: row, error: qErr } = await supabase
    .from("site_email_templates")
    .select("subject, html")
    .eq("key", type)
    .maybeSingle()

  if (qErr) {
    return json({ error: "template_query_failed", message: qErr.message }, 500)
  }
  if (!row) {
    return json({ error: "template_not_found", key: type }, 404)
  }

  const payload = (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>
  const subject = applyTemplate(String(row.subject ?? ""), payload)
  const html = applyTemplate(String(row.html ?? ""), payload)

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  })

  if (!r.ok) {
    const t = await r.text()
    return json(
      { error: "resend_failed", status: r.status, details: t.slice(0, 500) },
      502,
    )
  }

  return json({ ok: true, key: type })
})
