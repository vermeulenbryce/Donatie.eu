import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import {
  answerDonnieQuestion,
  donnieChipSet,
  donnieGreetingHtml,
  type DonnieNav,
} from '../../features/donnie/donnieAnswerEngine'
import { getDonnieContext } from '../../features/donnie/donnieContext'
import { runDonniePdfReport } from '../../features/donnie/donniePdfReport'
import { sanitizeDonnieBubbleHtml } from '../../lib/sanitizeDonnieHtml'

export const DONNIE_OPEN_QUESTION_EVENT = 'dnl-open-donnie-question'

/** Zelfde asset als in `index.html` (embedded JPEG in de Donnie-bubble). */
const DONNIE_AVATAR_SRC = '/donnie-avatar.jpg'
const DONNIE_TOOLTIP_SHOW_DELAY_MS = 5000
const DONNIE_TOOLTIP_AUTO_HIDE_MS = 5000

function donnieImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget
  if (el.dataset.fallback === '1') return
  el.dataset.fallback = '1'
  el.src = '/donatie-logo.svg'
}

type Msg = { id: string; role: 'user' | 'bot'; text: string; html?: string }

function formatBotHtml(text: string): string {
  return text.replace(/\n/g, '<br>')
}

export function DonnieChatbot({ shell }: { shell: LegacyShellUser | null }) {
  const navigate = useNavigate()
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [chips, setChips] = useState<string[]>([])
  const [tooltip, setTooltip] = useState<'welcome' | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const msgsRef = useRef<HTMLDivElement | null>(null)
  const hasShownGreeting = useRef(false)
  const openForQuestion = useRef(false)

  const scrollBottom = useCallback(() => {
    const el = msgsRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollBottom()
  }, [messages, typing, scrollBottom])

  useEffect(() => {
    const id = 'donnie-keyframes-style'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent =
      '@keyframes donniePulse{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}' +
      '@keyframes donnieBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}' +
      '@keyframes slideInRight{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}'
    document.head.appendChild(s)
  }, [])

  const navRef = useRef<DonnieNav | null>(null)
  navRef.current = {
    schedule: (outerMs, action) => {
      window.setTimeout(() => {
        setOpen(false)
        window.setTimeout(action, 200)
      }, outerMs)
    },
    go: (path) => {
      navigate(path)
    },
  }

  const pushBot = useCallback((text: string, html?: string) => {
    setMessages((m) => [...m, { id: `${baseId}-b-${m.length}`, role: 'bot', text, html }])
  }, [baseId])

  const pushUser = useCallback(
    (text: string) => {
      setMessages((m) => [...m, { id: `${baseId}-u-${m.length}`, role: 'user', text }])
    },
    [baseId],
  )

  const showChips = useCallback((list: string[]) => {
    setChips(list)
  }, [])

  const runAsk = useCallback(
    (question: string) => {
      if (typing) return
      pushUser(question)
      setTyping(true)
      const ctx = getDonnieContext(shell)
      const delay = 600 + Math.random() * 300
      window.setTimeout(() => {
        setTyping(false)
        const nav = navRef.current!
        const answer = answerDonnieQuestion(question, ctx, nav)
        pushBot(answer.text, answer.html)
        if (answer.chips?.length) showChips(answer.chips)
      }, delay)
    },
    [pushBot, pushUser, shell, showChips, typing],
  )

  useEffect(() => {
    if (!open) return
    if (openForQuestion.current) {
      openForQuestion.current = false
      hasShownGreeting.current = true
      return
    }
    if (hasShownGreeting.current) return
    hasShownGreeting.current = true
    const t = window.setTimeout(() => {
      const ctx = getDonnieContext(shell)
      pushBot(donnieGreetingHtml(ctx))
      window.setTimeout(() => showChips(donnieChipSet(ctx.type)), 400)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, pushBot, shell, showChips])

  const toggle = useCallback(() => {
    // Zodra de gebruiker met de chatbot interageert, verdwijnt de welkom-tooltip
    // en komt die niet meer terug binnen deze page-load.
    setTooltip(null)
    setOpen((o) => !o)
    window.setTimeout(() => inputRef.current?.focus(), 280)
  }, [])

  useEffect(() => {
    if (welcomed) return
    let tHide = 0
    const tShow = window.setTimeout(() => {
      setWelcomed(true)
      const bubble = document.getElementById('donnieBubble')
      if (bubble) {
        bubble.style.animation = 'donniePulse 1s ease 2'
        window.setTimeout(() => {
          bubble.style.animation = ''
        }, 2200)
      }
      setTooltip('welcome')
      tHide = window.setTimeout(() => setTooltip(null), DONNIE_TOOLTIP_AUTO_HIDE_MS)
    }, DONNIE_TOOLTIP_SHOW_DELAY_MS)
    return () => {
      window.clearTimeout(tShow)
      window.clearTimeout(tHide)
    }
  }, [welcomed])

  useEffect(() => {
    if (shell?.email) return
    hasShownGreeting.current = false
    setMessages([])
    setChips([])
  }, [shell?.email])

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const ce = ev as CustomEvent<{ question?: string }>
      const q = ce.detail?.question?.trim()
      if (!q) return
      openForQuestion.current = true
      setOpen(true)
      window.setTimeout(() => runAsk(q), 320)
    }
    window.addEventListener(DONNIE_OPEN_QUESTION_EVENT, onOpen as EventListener)
    return () => window.removeEventListener(DONNIE_OPEN_QUESTION_EVENT, onOpen as EventListener)
  }, [runAsk])

  const onMsgClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const t = (e.target as HTMLElement).closest('[data-donnie-pdf]')
      if (!t) return
      const kind = t.getAttribute('data-donnie-pdf') as 'particulier' | 'bedrijf' | 'influencer' | null
      if (!kind) return
      runDonniePdfReport(kind, shell, (msg) => pushBot(msg))
    },
    [pushBot, shell],
  )

  const ctxForTooltip = getDonnieContext(shell)

  return (
    <>
      <div
        id="donnieBubble"
        onClick={toggle}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9000,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
          boxShadow: '0 4px 20px rgba(26,35,126,.45)',
          display: open ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'transform .2s',
          fontSize: '1.6rem',
          userSelect: 'none',
        }}
        title="Chat met Donnie"
      >
        <img
          src={DONNIE_AVATAR_SRC}
          alt="Donnie"
          width={60}
          height={60}
          onError={donnieImgError}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
        />
        <span
          id="donnieDot"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 12,
            height: 12,
            background: '#22c55e',
            borderRadius: '50%',
            border: '2px solid #fff',
            display: 'block',
          }}
        />
      </div>

      <div
        id="donnieWindow"
        style={{
          position: 'fixed',
          bottom: 96,
          right: 24,
          zIndex: 9000,
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 8px 40px rgba(0,0,0,.18)',
          display: open ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: 560,
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <img
              src={DONNIE_AVATAR_SRC}
              alt=""
              width={40}
              height={40}
              onError={donnieImgError}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, color: '#fff', fontSize: '.95rem', fontFamily: 'Fraunces,serif' }}>Donnie</div>
            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.8)' }}>Jouw Donatie.eu assistent</div>
          </div>
          <button
            type="button"
            onClick={toggle}
            style={{
              background: 'rgba(255,255,255,.15)',
              border: 'none',
              borderRadius: '50%',
              width: 30,
              height: 30,
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>

        <div
          ref={msgsRef}
          id="donnieMessages"
          onClick={onMsgClick}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: 380,
            scrollBehavior: 'smooth',
            background: '#f8faff',
          }}
        >
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="donnie-msg user" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
                <div className="donnie-bubble user" style={{ maxWidth: 240, padding: '9px 13px', borderRadius: 16, fontSize: '.83rem', lineHeight: 1.5, background: 'linear-gradient(135deg,#1a237e,#3a98f8)', color: '#fff', borderBottomRightRadius: 4 }}>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="donnie-msg" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="donnie-avatar" style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                  <img
                    src={DONNIE_AVATAR_SRC}
                    alt=""
                    width={28}
                    height={28}
                    onError={donnieImgError}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div
                  className="donnie-bubble bot"
                  style={{
                    maxWidth: 240,
                    padding: '9px 13px',
                    borderRadius: 16,
                    fontSize: '.83rem',
                    lineHeight: 1.5,
                    background: '#fff',
                    border: '1.5px solid #e5e7eb',
                    color: '#1f2937',
                    borderBottomLeftRadius: 4,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeDonnieBubbleHtml(formatBotHtml(m.text) + (m.html || '')),
                  }}
                />
              </div>
            ),
          )}
          {typing ? (
            <div className="donnie-msg" id="donnieTypingEl" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="donnie-bubble bot" style={{ padding: '10px 16px' }}>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <span style={{ width: 7, height: 7, background: '#93c5fd', borderRadius: '50%', animation: 'donnieBounce .8s ease infinite' }} />
                  <span style={{ width: 7, height: 7, background: '#93c5fd', borderRadius: '50%', animation: 'donnieBounce .8s .15s ease infinite' }} />
                  <span style={{ width: 7, height: 7, background: '#93c5fd', borderRadius: '50%', animation: 'donnieBounce .8s .3s ease infinite' }} />
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          id="donnieChips"
          style={{
            padding: '8px 12px',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            borderTop: '1px solid #f0f0f0',
            background: '#fff',
            maxHeight: 100,
            overflowY: 'auto',
          }}
        >
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className="donnie-chip"
              onClick={() => runAsk(c)}
              style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1.5px solid #bfdbfe',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: '.75rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, background: '#fff' }}>
          <input
            ref={inputRef}
            id="donnieInput"
            className="input"
            placeholder="Stel een vraag aan Donnie..."
            style={{ flex: 1, fontSize: '.85rem', borderRadius: 20, padding: '9px 16px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const q = inputRef.current?.value.trim()
                if (!q) return
                if (inputRef.current) inputRef.current.value = ''
                runAsk(q)
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const q = inputRef.current?.value.trim()
              if (!q) return
              if (inputRef.current) inputRef.current.value = ''
              runAsk(q)
            }}
            style={{
              background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 38,
              height: 38,
              cursor: 'pointer',
              fontSize: '1rem',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Verstuur"
          >
            →
          </button>
        </div>
      </div>

      {tooltip === 'welcome' ? (
        <button
          type="button"
          onClick={() => {
            setTooltip(null)
            setOpen(true)
          }}
          style={{
            position: 'fixed',
            bottom: 94,
            right: 18,
            background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 14,
            fontSize: '.82rem',
            fontWeight: 600,
            zIndex: 9998,
            maxWidth: 210,
            boxShadow: '0 4px 20px rgba(26,35,126,.4)',
            animation: 'slideInRight .3s ease',
            cursor: 'pointer',
            lineHeight: 1.45,
            border: 'none',
            textAlign: 'left',
          }}
        >
          {ctxForTooltip.naam ? (
            <>
              👋 Hoi <strong>{ctxForTooltip.naam}</strong>! Kan ik je helpen?
              <span style={{ display: 'block', fontSize: '.72rem', opacity: 0.85, marginTop: 2 }}>Klik om te chatten</span>
            </>
          ) : (
            <>
              👋 Hoi! Ik ben <strong>Donnie</strong>. Vraag me alles!
              <span style={{ display: 'block', fontSize: '.72rem', opacity: 0.85, marginTop: 2 }}>Klik om te chatten</span>
            </>
          )}
        </button>
      ) : null}

    </>
  )
}
