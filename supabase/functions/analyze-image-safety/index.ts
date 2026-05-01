// Azure AI Content Safety — image:analyze (severity 0,2,4,6 per categorie).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   AZURE_CONTENT_SAFETY_ENDPOINT  = https://<naam>.cognitiveservices.azure.com  (zonder trailing slash)
//   AZURE_CONTENT_SAFETY_KEY       = Ocp-Apim-Subscription-Key
//   AZURE_IMAGE_REJECT_SEVERITY    = optioneel, default 4  (weiger bij severity >= dit: 4 of 6 blokkeert)
//
// Zonder endpoint/key: { ok: true, skipped: 'not_configured' } (development).
//
// POST JSON: { imageBase64: string }  (optioneel data:image/...;base64, prefix wordt gestript)
// Response: { ok: boolean, reason?: string, bypass?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0"
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors"

type AzureCat = { category?: string; severity?: number }

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function stripDataUrlPayload(raw: string): string {
  const s = raw.trim().replace(/\s/g, "")
  const m = /^data:image\/[\w+.~-]+;base64,(.+)$/i.exec(s)
  return m ? m[1]! : s
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "unauthorized", reason: "missing_bearer_token" }, 401)
  }

  const jwt = authHeader.slice(7).trim()
  let body: { imageBase64?: string }
  try {
    body = (await req.json()) as { imageBase64?: string }
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400)
  }

  const payload = typeof body.imageBase64 === "string" ? body.imageBase64 : ""
  if (!payload.trim()) {
    return json({ ok: false, error: "missing_imageBase64" }, 400)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "server_config" }, 500)
  }

  const sb = createClient(supabaseUrl, serviceKey)
  const { data: userRes, error: userErr } = await sb.auth.getUser(jwt)
  if (userErr || !userRes.user?.id) {
    return json({ ok: false, error: "unauthorized", reason: "invalid_session" }, 401)
  }
  const uid = userRes.user.id

  const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle()
  const meta = userRes.user.app_metadata as Record<string, unknown> | undefined
  const roleAdmin = meta?.role === "admin"
  const isAdmin = roleAdmin === true || prof?.is_admin === true

  if (isAdmin) {
    return json({ ok: true, bypass: "admin" })
  }

  const azureEndpoint = (Deno.env.get("AZURE_CONTENT_SAFETY_ENDPOINT") ?? "").replace(/\/$/, "")
  const azureKey = Deno.env.get("AZURE_CONTENT_SAFETY_KEY") ?? ""
  const rejectAt = Number(Deno.env.get("AZURE_IMAGE_REJECT_SEVERITY") ?? "4")

  if (!azureEndpoint || !azureKey) {
    console.warn("[analyze-image-safety] Azure niet geconfigureerd — moderatie overgeslagen.")
    return json({ ok: true, skipped: "not_configured" })
  }

  const b64 = stripDataUrlPayload(payload)
  if (b64.length < 80) {
    return json({ ok: false, error: "bad_image_payload" }, 400)
  }

  const url =
    `${azureEndpoint}/contentsafety/image:analyze?api-version=2024-09-01`

  let azRes: Response
  try {
    azRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": azureKey,
      },
      body: JSON.stringify({
        image: { content: b64 },
        categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
        outputType: "FourSeverityLevels",
      }),
    })
  } catch (e) {
    console.error("[analyze-image-safety] Azure fetch failed", e)
    return json({ ok: false, error: "azure_unreachable" }, 502)
  }

  if (!azRes.ok) {
    const t = await azRes.text()
    console.warn("[analyze-image-safety] Azure HTTP", azRes.status, t.slice(0, 500))
    return json({ ok: false, error: "azure_error", status: azRes.status }, 502)
  }

  let parsed: { categoriesAnalysis?: AzureCat[] }
  try {
    parsed = (await azRes.json()) as { categoriesAnalysis?: AzureCat[] }
  } catch {
    return json({ ok: false, error: "azure_bad_json" }, 502)
  }

  const cats = parsed.categoriesAnalysis ?? []
  const threshold = Number.isFinite(rejectAt) ? rejectAt : 4
  const blocked = cats.some((c) => typeof c.severity === "number" && c.severity >= threshold && c.severity > 0)

  if (blocked) {
    const worst = cats.reduce((m, c) => Math.max(m, c.severity ?? 0), 0)
    return json({
      ok: false,
      reason: "content_policy",
      detail: { categories: cats, worst },
    })
  }

  return json({ ok: true, categories: cats })
})
