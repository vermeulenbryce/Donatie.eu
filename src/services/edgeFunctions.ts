import { supabase } from '../lib/supabase'

export interface EdgeEmailPayload {
  to: string
  type: string
  payload?: Record<string, unknown>
  notifyAdmin?: boolean
}

export async function sendEdgeEmail(input: EdgeEmailPayload): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      to: input.to,
      type: input.type,
      payload: input.payload ?? {},
      notifyAdmin: Boolean(input.notifyAdmin),
    },
  })

  if (error) {
    throw new Error(`Edge email mislukt: ${error.message}`)
  }
}
