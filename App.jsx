import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'

/* ----------------------------- hash router ----------------------------- */

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function parseRoute(h) {
  const p = h.replace(/^#/, '') || '/'
  let m
  if (p === '/archive') return { name: 'archive' }
  if (p === '/projects') return { name: 'projects' }
  if ((m = p.match(/^\/i\/(.+)$/))) return { name: 'idea', id: decodeURIComponent(m[1]) }
  if ((m = p.match(/^\/p\/(.+)$/))) return { name: 'project', id: decodeURIComponent(m[1]) }
  return { name: 'home' }
}

const navigate = (to) => { window.location.hash = to }

const isProjectRoute = (name) => name === 'projects' || name === 'project'

const fmtDate = (s) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// Date-only strings (e.g. Supabase `date` columns) parse as UTC midnight, which can
// display as the previous day in western time zones. Parse the parts manually instead.
const fmtDateOnly = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtCost = (n) =>
  '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Which AI platform an idea was tried on.
const PLATFORMS = [['claude', 'Claude'], ['codex', 'Codex'], ['copilot', 'Copilot'], ['other', 'Other']]
const platformLabel = (v) => (PLATFORMS.find(([k]) => k === v) || [])[1] || null

// Home project statuses.
const STATUSES = [
  ['ideation', 'Ideation'],
  ['ready', 'Ready'],
  ['in_progress', 'In Progress'],
  ['on_hold', 'On Hold'],
  ['completed', 'Completed'],
]
const statusLabel = (v) => (STATUSES.find(([k]) => k === v) || [])[1] || null

/* ================================ App ================================== */

export default function App() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const route = parseRoute(useHashRoute())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  let content
  if (checking) content = <Splash />
  else if (!session) content = <SignIn />
  else content = (
    <Shell route={route}>
      {route.name === 'idea' ? <IdeaDetail id={route.id} />
        : route.name === 'project' ? <ProjectDetail id={route.id} />
        : route.name === 'projects' ? <ProjectBoard />
        : <Board tab={route.name === 'archive' ? 'archive' : 'active'} />}
    </Shell>
  )

  return <>{content}<KeyboardBar /></>
}

// iOS Safari often shows no "Done" key for plain text fields, so the keyboard
// can be hard to dismiss. This floats a "Hide keyboard" bar just above the
// keyboard whenever an input/textarea is focused; tapping it blurs the field.
function KeyboardBar() {
  const [show, setShow] = useState(false)
  const [bottom, setBottom] = useState(null) // px above viewport bottom, or null = pin to top

  useEffect(() => {
    const vv = window.visualViewport
    const isField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
    const onFocusIn = (e) => { if (isField(e.target)) setShow(true) }
    const onFocusOut = () => setTimeout(() => setShow(isField(document.activeElement)), 60)
    const onResize = () => {
      if (!vv) { setBottom(null); return }
      setBottom(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    if (vv) { vv.addEventListener('resize', onResize); vv.addEventListener('scroll', onResize) }
    onResize()
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      if (vv) { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize) }
    }
  }, [])

  if (!show) return null
  const dismiss = (e) => { e.preventDefault(); const el = document.activeElement; if (el && el.blur) el.blur() }
  return (
    <div className={'kbbar' + (bottom == null ? ' kbbar-top' : '')} style={bottom == null ? undefined : { bottom }}>
      <button type="button" className="kbbar-btn" onPointerDown={dismiss}>Hide keyboard ⌄</button>
    </div>
  )
}

/* ------------------------------- chrome -------------------------------- */

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 100 100" width="26" height="26">
        <rect width="100" height="100" rx="23" fill="var(--accent)" />
        <path d="M50 18 L57 43 L82 50 L57 57 L50 82 L43 57 L18 50 L43 43 Z" fill="#fbbf24" />
      </svg>
    </span>
  )
}

// Switches between the two boards. Lives inside .wrap, so it automatically
// picks up whichever theme (--accent etc.) is active for the current mode.
function ModeToggle({ mode }) {
  return (
    <nav className="tabs modetoggle">
      <button className={mode === 'ideas' ? 'on' : ''} onClick={() => navigate('/')}>AI Ideas</button>
      <button className={mode === 'projects' ? 'on' : ''} onClick={() => navigate('/projects')}>Home Projects</button>
    </nav>
  )
}

function Shell({ route, children }) {
  const mode = isProjectRoute(route.name) ? 'projects' : 'ideas'
  const tab = route.name === 'archive' ? 'archive' : route.name === 'home' ? 'active' : null

  return (
    <div className={'wrap' + (mode === 'projects' ? ' theme-projects' : '')}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate(mode === 'projects' ? '/projects' : '/')}>
          <Logo />
          <span>Sparks</span>
        </button>
        <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <ModeToggle mode={mode} />

      {tab && (
        <nav className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => navigate('/')}>Ideas</button>
          <button className={tab === 'archive' ? 'on' : ''} onClick={() => navigate('/archive')}>Tried</button>
        </nav>
      )}

      <main>{children}</main>
      <footer className="foot">Capture fast · prioritize · follow through · v2.0</footer>
    </div>
  )
}

function Splash() {
  return <div className="splash"><Logo /><span>Sparks</span></div>
}

/* ------------------------------- auth ---------------------------------- */

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMsg(error.message)
    setBusy(false)
  }

  const magic = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setMsg(error ? error.message : 'Check your email for a sign-in link.')
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-head"><Logo /><h1>Sparks</h1></div>
        <p className="muted">AI ideas to try, home projects to knock out — captured in seconds.</p>
        <input type="email" placeholder="Email" value={email}
          autoComplete="username"
          onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && signIn()} />
        <button className="primary" disabled={busy} onClick={signIn}>Sign in</button>
        <button className="ghost" disabled={busy || !email} onClick={magic}>Email me a link instead</button>
        {msg && <p className="msg">{msg}</p>}
      </div>
    </div>
  )
}

/* --------------------------- drag-to-reorder ---------------------------- */

// Touch + mouse drag-to-reorder via Pointer Events (works on iOS Safari).
// A dedicated grip handle starts the drag, so normal scrolling and taps on the
// rest of the card keep working. On drop, the parent persists the new order.
// Generic over item shape via getId/renderItem, so both boards share one
// implementation instead of two copies that could drift apart.
function SortableList({ items, getId, onReorder, renderItem }) {
  const [order, setOrder] = useState(items)
  const [dragId, setDragId] = useState(null)
  const draggingRef = useRef(false)
  const els = useRef(new Map())
  const orderRef = useRef(items) // live order for the rAF loop
  const dragIdRef = useRef(null)
  const lastXRef = useRef(0)
  const lastYRef = useRef(0) // latest pointer position (viewport coords)
  const grabDXRef = useRef(0) // where inside the card the finger grabbed
  const grabDYRef = useRef(0)
  const widthRef = useRef(0)
  const cloneRef = useRef(null) // the floating element that tracks the finger
  const rafRef = useRef(0)
  const onReorderRef = useRef(onReorder)
  const winMoveRef = useRef(null) // window listeners active during a drag
  const winUpRef = useRef(null)

  useEffect(() => { onReorderRef.current = onReorder }, [onReorder])

  // Resync with incoming data whenever we're not mid-drag.
  useEffect(() => { if (!draggingRef.current) { setOrder(items); orderRef.current = items } }, [items])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    if (winMoveRef.current) window.removeEventListener('pointermove', winMoveRef.current)
    if (winUpRef.current) {
      window.removeEventListener('pointerup', winUpRef.current)
      window.removeEventListener('pointercancel', winUpRef.current)
    }
  }, [])

  const setEl = (id) => (el) => { el ? els.current.set(id, el) : els.current.delete(id) }
  const setBoth = (next) => { orderRef.current = next; setOrder(next) }

  // Pin the floating clone under the finger (direct DOM write = no React churn).
  const positionClone = () => {
    const node = cloneRef.current
    if (!node) return
    node.style.transform =
      `translate(${lastXRef.current - grabDXRef.current}px, ${lastYRef.current - grabDYRef.current}px)`
  }

  // Slot the dragged item wherever the finger currently sits.
  const reorderTo = (y) => {
    const ids = orderRef.current
    const id = dragIdRef.current
    if (id == null) return
    let target = ids.length - 1
    for (let i = 0; i < ids.length; i++) {
      const el = els.current.get(getId(ids[i]))
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) { target = i; break }
    }
    const from = ids.findIndex((x) => getId(x) === id)
    if (from < 0 || from === target) return
    const next = ids.slice()
    next.splice(target, 0, next.splice(from, 1)[0])
    setBoth(next)
  }

  // Scroll the page when the finger nears the top/bottom edge, then re-sort.
  const EDGE = 90, MAX_SPEED = 16
  const autoScroll = () => {
    if (!draggingRef.current) return
    const y = lastYRef.current, vh = window.innerHeight
    let dy = 0
    if (y < EDGE) dy = -Math.ceil(MAX_SPEED * (EDGE - y) / EDGE)
    else if (y > vh - EDGE) dy = Math.ceil(MAX_SPEED * (y - (vh - EDGE)) / EDGE)
    if (dy !== 0) { window.scrollBy(0, dy); reorderTo(y) }
    rafRef.current = requestAnimationFrame(autoScroll)
  }

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    dragIdRef.current = null
    cancelAnimationFrame(rafRef.current)
    if (winMoveRef.current) window.removeEventListener('pointermove', winMoveRef.current)
    if (winUpRef.current) {
      window.removeEventListener('pointerup', winUpRef.current)
      window.removeEventListener('pointercancel', winUpRef.current)
    }
    winMoveRef.current = null
    winUpRef.current = null
    setDragId(null)
    onReorderRef.current(orderRef.current.map(getId))
  }

  const down = (id) => (e) => {
    e.preventDefault()
    const li = els.current.get(id)
    const r = li ? li.getBoundingClientRect() : { left: 0, top: 0, width: 0 }
    grabDXRef.current = e.clientX - r.left
    grabDYRef.current = e.clientY - r.top
    widthRef.current = r.width
    lastXRef.current = e.clientX
    lastYRef.current = e.clientY
    draggingRef.current = true
    dragIdRef.current = id
    setDragId(id)

    // Listen on window so release is caught no matter how the DOM reorders.
    const onMove = (ev) => {
      if (!draggingRef.current) return
      ev.preventDefault()
      lastXRef.current = ev.clientX
      lastYRef.current = ev.clientY
      positionClone()
      reorderTo(ev.clientY)
    }
    winMoveRef.current = onMove
    winUpRef.current = endDrag
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    requestAnimationFrame(positionClone) // place clone once it has mounted
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(autoScroll)
  }

  const dragged = dragId != null ? order.find((i) => getId(i) === dragId) : null
  const cloneStyle = {
    width: widthRef.current,
    transform: `translate(${lastXRef.current - grabDXRef.current}px, ${lastYRef.current - grabDYRef.current}px)`,
  }

  return (
    <>
      {items.length > 1 && <p className="reorder-hint">Drag <span>⠿</span> to reorder by priority</p>}
      <ul className={'cards' + (dragId ? ' is-dragging' : '')}>
        {order.map((item) => {
          const id = getId(item)
          return renderItem(item, {
            innerRef: setEl(id),
            dragging: dragId === id, /* renders as a placeholder gap */
            dragHandle: (
              <button className="handle" aria-label="Drag to reorder" onPointerDown={down(id)}>⠿</button>
            ),
          })
        })}
      </ul>
      {dragged && (
        <ul className="cards clone-layer" ref={cloneRef} style={cloneStyle} aria-hidden="true">
          {renderItem(dragged, { innerRef: undefined, dragging: false, dragHandle: null })}
        </ul>
      )}
    </>
  )
}

/* ------------------------------- board (AI ideas) ------------------------------- */

function Board({ tab }) {
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const [prompting, setPrompting] = useState(null) // idea being checked off

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    setIdeas(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const active = useMemo(() =>
    ideas.filter((i) => !i.tried)
      .sort((a, b) => (a.position - b.position) || (new Date(b.created_at) - new Date(a.created_at))),
    [ideas])

  const archived = useMemo(() =>
    ideas.filter((i) => i.tried)
      .sort((a, b) => new Date(b.tried_at || b.created_at) - new Date(a.tried_at || a.created_at)),
    [ideas])

  const base = tab === 'archive' ? archived : active

  const allTags = useMemo(() => {
    const s = new Set()
    ideas.forEach((i) => (i.tags || []).forEach((t) => s.add(t)))
    return [...s].sort()
  }, [ideas])

  const toggleTag = (t) => setActiveTag((cur) => (cur === t ? null : t))

  const filtered = useMemo(() => {
    let list = base
    if (activeTag) list = list.filter((i) => (i.tags || []).includes(activeTag))
    const t = q.trim().toLowerCase()
    if (t) list = list.filter((i) =>
      [i.title, i.description, i.outcome, ...(i.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(t))
    return list
  }, [base, q, activeTag])

  // optimistic helpers
  const addIdea = async ({ title, description, tags }) => {
    // new ideas land at the top of the priority list
    const activePos = ideas.filter((i) => !i.tried).map((i) => i.position ?? 0)
    const top = activePos.length ? Math.min(...activePos) - 1 : 0
    const { data, error } = await supabase
      .from('ideas')
      .insert({ title, description: description || null, position: top, tags: tags || [] })
      .select()
      .single()
    if (!error && data) setIdeas((prev) => [data, ...prev])
  }

  // Persist a new manual order: renumber active rows to 0..n, write only the ones that moved.
  const persistReorder = async (orderedIds) => {
    const changed = []
    orderedIds.forEach((id, idx) => {
      const cur = ideas.find((i) => i.id === id)
      if (cur && cur.position !== idx) changed.push({ id, position: idx })
    })
    if (!changed.length) return
    setIdeas((prev) => prev.map((i) => {
      const u = changed.find((c) => c.id === i.id)
      return u ? { ...i, position: u.position } : i
    }))
    await Promise.all(changed.map((c) =>
      supabase.from('ideas').update({ position: c.position }).eq('id', c.id)))
  }

  const beginCheckOff = (idea) => setPrompting(idea)

  const confirmCheckOff = async (outcome, platform) => {
    const idea = prompting
    setPrompting(null)
    const patch = {
      tried: true,
      tried_at: new Date().toISOString(),
      outcome: outcome || idea.outcome || null,
      platform: platform || idea.platform || null,
    }
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, ...patch } : i)))
    await supabase.from('ideas').update(patch).eq('id', idea.id)
  }

  const restore = async (idea) => {
    const patch = { tried: false, tried_at: null }
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, ...patch } : i)))
    await supabase.from('ideas').update(patch).eq('id', idea.id)
  }

  return (
    <>
      {tab === 'active' && <Capture onAdd={addIdea} allTags={allTags} />}
      <div className="listhead">
        <input className="search" placeholder={tab === 'archive' ? 'Search tried ideas' : 'Search ideas'}
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="count">{filtered.length}</span>
      </div>

      {allTags.length > 0 && (
        <div className="tagfilter">
          {allTags.map((t) => (
            <button key={t} className={'tagchip' + (activeTag === t ? ' on' : '')}
              onClick={() => toggleTag(t)}>{t}</button>
          ))}
          {activeTag && (
            <button className="tagchip clear" onClick={() => setActiveTag(null)}>clear ✕</button>
          )}
        </div>
      )}

      {loading ? (
        <p className="muted pad">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted pad">
          {tab === 'archive'
            ? (activeTag || q ? 'No tried ideas match.' : 'Nothing tried yet. Check an idea off when you’ve run it.')
            : activeTag || q ? 'No matches.' : 'No ideas yet — capture one above.'}
        </p>
      ) : tab === 'active' && !q.trim() && !activeTag ? (
        <SortableList
          items={active}
          getId={(i) => i.id}
          onReorder={persistReorder}
          renderItem={(idea, dragProps) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              innerRef={dragProps.innerRef}
              dragging={dragProps.dragging}
              dragHandle={dragProps.dragHandle}
              onCheck={() => beginCheckOff(idea)}
              onRestore={() => {}}
              onTag={toggleTag}
            />
          )}
        />
      ) : (
        <ul className="cards">
          {filtered.map((i) => (
            <IdeaCard key={i.id} idea={i}
              onCheck={() => beginCheckOff(i)}
              onRestore={() => restore(i)}
              onTag={toggleTag} />
          ))}
        </ul>
      )}

      {prompting && (
        <OutcomeModal idea={prompting}
          onCancel={() => setPrompting(null)}
          onSave={confirmCheckOff} />
      )}
    </>
  )
}

function Capture({ onAdd, allTags }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    await onAdd({ title: t, description: desc.trim(), tags })
    setTitle(''); setDesc(''); setTags([]); setOpen(false); setBusy(false)
  }

  return (
    <div className="capture">
      <div className="cap-row">
        <input
          className="cap-title"
          placeholder="Capture an AI idea to try…"
          value={title}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
      </div>
      {open && (
        <>
          <div className="cap-row">
            <textarea
              className="cap-desc"
              placeholder="Details / notes (optional)"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <TagEditor value={tags} onChange={setTags} suggestions={allTags} />
          <div className="cap-actions">
            <button className="ghost" onClick={() => { setOpen(false); setDesc(''); setTags([]) }}>Cancel</button>
            <button className="primary" disabled={busy || !title.trim()} onClick={submit}>Add idea</button>
          </div>
        </>
      )}
    </div>
  )
}

// Normalize tags: lowercase, collapse whitespace, cap length.
const normalizeTag = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30)

function TagEditor({ value, onChange, suggestions = [] }) {
  const [input, setInput] = useState('')

  const addMany = (raws) => {
    const clean = raws.map(normalizeTag).filter(Boolean).filter((t) => !value.includes(t))
    const uniq = [...new Set(clean)]
    if (uniq.length) onChange([...value, ...uniq])
    setInput('')
  }
  const remove = (t) => onChange(value.filter((x) => x !== t))

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (input.trim()) addMany([input]) }
    else if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1])
  }

  const sugg = suggestions.filter((s) => !value.includes(s)).slice(0, 8)

  return (
    <div className="tageditor">
      <div className="taginput-row">
        {value.map((t) => (
          <span key={t} className="tag removable">
            {t}
            <button type="button" className="tagx" aria-label={'Remove ' + t} onClick={() => remove(t)}>✕</button>
          </span>
        ))}
        <input
          className="tagfield"
          placeholder={value.length ? 'add tag' : 'tags (e.g. coding, writing)'}
          value={input}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) addMany(v.split(','))
            else setInput(v)
          }}
          onKeyDown={onKey}
          onBlur={() => input.trim() && addMany([input])}
        />
      </div>
      {sugg.length > 0 && (
        <div className="tagsugg">
          {sugg.map((s) => (
            <button key={s} type="button" className="tagchip" onClick={() => addMany([s])}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Pick which AI platform an idea was tried on. Tap a selected pill again to clear.
function PlatformPicker({ value, onChange }) {
  return (
    <div className="platforms">
      {PLATFORMS.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={'tagchip' + (value === k ? ' on' : '')}
          onClick={() => onChange(value === k ? null : k)}
        >{label}</button>
      ))}
    </div>
  )
}

function IdeaCard({ idea, onCheck, onRestore, onTag, innerRef, dragging, dragHandle }) {
  const tags = idea.tags || []
  return (
    <li ref={innerRef} className={'card' + (idea.tried ? ' done' : '') + (dragging ? ' dragging' : '')}>
      {dragHandle}
      <button
        className={'check' + (idea.tried ? ' on' : '')}
        aria-label={idea.tried ? 'Restore to ideas' : 'Mark as tried'}
        onClick={() => (idea.tried ? onRestore() : onCheck())}
      >
        {idea.tried ? '✓' : ''}
      </button>
      <div className="card-main">
        <button className="card-body" onClick={() => navigate('/i/' + idea.id)}>
          <div className="card-title">{idea.title}</div>
          {idea.description && <div className="card-desc">{idea.description}</div>}
          <div className="card-meta">
            <span>{fmtDate(idea.created_at)}</span>
            {idea.tried && idea.tried_at && <span>· tried {fmtDate(idea.tried_at)}</span>}
            {idea.tried && idea.platform && <span>· via {platformLabel(idea.platform)}</span>}
          </div>
          {idea.tried && idea.outcome && <div className="card-outcome">{idea.outcome}</div>}
        </button>
        {tags.length > 0 && (
          <div className="tagrow">
            {tags.map((t) => (
              <button key={t} type="button" className="tag" onClick={() => onTag && onTag(t)}>{t}</button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function OutcomeModal({ idea, onCancel, onSave }) {
  const [text, setText] = useState(idea.outcome || '')
  const [platform, setPlatform] = useState(idea.platform || null)
  const [busy, setBusy] = useState(false)

  const save = async () => { setBusy(true); await onSave(text.trim(), platform) }

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nice — how did it go?</h2>
        <p className="muted small">“{idea.title}”. Jot down results or thoughts (optional), then archive it.</p>
        <div className="cap-row">
          <textarea rows={5} autoFocus placeholder="What happened when you tried it?"
            value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <p className="fieldlabel">Which platform did you use?</p>
        <PlatformPicker value={platform} onChange={setPlatform} />
        <div className="cap-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>Save &amp; archive</button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------- detail / edit (ideas) ----------------------------- */

function IdeaDetail({ id }) {
  const [idea, setIdea] = useState(undefined) // undefined=loading, null=missing
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [outcome, setOutcome] = useState('')
  const [tags, setTags] = useState([])
  const [platform, setPlatform] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('ideas').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setIdea(data || null)
      if (data) {
        setTitle(data.title); setDesc(data.description || '')
        setOutcome(data.outcome || ''); setTags(data.tags || [])
        setPlatform(data.platform || null)
      }
    })
    supabase.from('ideas').select('tags').then(({ data }) => {
      const s = new Set()
      ;(data || []).forEach((r) => (r.tags || []).forEach((t) => s.add(t)))
      setSuggestions([...s].sort())
    })
  }, [id])

  if (idea === undefined) return <p className="muted pad">Loading…</p>
  if (idea === null) return (
    <div className="pad">
      <p className="muted">That idea doesn’t exist.</p>
      <button className="ghost" onClick={() => navigate('/')}>← Back</button>
    </div>
  )

  const save = async () => {
    const patch = {
      title: title.trim() || idea.title,
      description: desc.trim() || null,
      outcome: outcome.trim() || null,
      tags,
      platform: platform || null,
    }
    setIdea((p) => ({ ...p, ...patch }))
    await supabase.from('ideas').update(patch).eq('id', idea.id)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const toggleTried = async () => {
    const patch = idea.tried
      ? { tried: false, tried_at: null }
      : { tried: true, tried_at: new Date().toISOString() }
    setIdea((p) => ({ ...p, ...patch }))
    await supabase.from('ideas').update(patch).eq('id', idea.id)
  }

  const remove = async () => {
    if (!confirm('Delete this idea permanently?')) return
    await supabase.from('ideas').delete().eq('id', idea.id)
    navigate('/')
  }

  return (
    <div className="detail">
      <button className="ghost back" onClick={() => navigate(idea.tried ? '/archive' : '/')}>← Back</button>
      <label className="fld">
        <span>Title</span>
        <div className="cap-row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </label>
      <label className="fld">
        <span>Details</span>
        <div className="cap-row">
          <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </label>
      <div className="fld">
        <span>Tags</span>
        <TagEditor value={tags} onChange={setTags} suggestions={suggestions} />
      </div>
      <label className="fld">
        <span>Results / thoughts</span>
        <div className="cap-row">
          <textarea rows={5} value={outcome} onChange={(e) => setOutcome(e.target.value)}
            placeholder="What happened when you tried it?" />
        </div>
      </label>
      <div className="fld">
        <span>Platform used</span>
        <PlatformPicker value={platform} onChange={setPlatform} />
      </div>
      <div className="detail-meta">
        Added {fmtDate(idea.created_at)}{idea.tried && idea.tried_at ? ` · tried ${fmtDate(idea.tried_at)}` : ''}
      </div>
      <div className="detail-actions">
        <button className="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</button>
        <button className="toggle" onClick={toggleTried}>
          {idea.tried ? 'Move back to ideas' : 'Mark as tried'}
        </button>
        <button className="danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}

/* ------------------------------- board (home projects) ------------------------------- */

function ProjectBoard() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [activeStatus, setActiveStatus] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('home_projects')
      .select('*')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const sorted = useMemo(() =>
    projects.slice().sort((a, b) => (a.position - b.position) || (new Date(b.created_at) - new Date(a.created_at))),
    [projects])

  const filtered = useMemo(() => {
    let list = sorted
    if (activeStatus) list = list.filter((p) => p.status === activeStatus)
    const t = q.trim().toLowerCase()
    if (t) list = list.filter((p) =>
      [p.title, p.description, p.materials].filter(Boolean).join(' ').toLowerCase().includes(t))
    return list
  }, [sorted, activeStatus, q])

  const addProject = async ({ title, description, materials, due_date, cost, status }) => {
    // new projects land at the top of the priority list, same as ideas
    const positions = projects.map((p) => p.position ?? 0)
    const top = positions.length ? Math.min(...positions) - 1 : 0
    const { data, error } = await supabase
      .from('home_projects')
      .insert({
        title,
        description: description || null,
        materials: materials || null,
        due_date: due_date || null,
        cost: cost === '' || cost == null ? null : Number(cost),
        status: status || 'ideation',
        position: top,
      })
      .select()
      .single()
    if (!error && data) setProjects((prev) => [data, ...prev])
  }

  const persistReorder = async (orderedIds) => {
    const changed = []
    orderedIds.forEach((id, idx) => {
      const cur = projects.find((p) => p.id === id)
      if (cur && cur.position !== idx) changed.push({ id, position: idx })
    })
    if (!changed.length) return
    setProjects((prev) => prev.map((p) => {
      const u = changed.find((c) => c.id === p.id)
      return u ? { ...p, position: u.position } : p
    }))
    await Promise.all(changed.map((c) =>
      supabase.from('home_projects').update({ position: c.position }).eq('id', c.id)))
  }

  const updateStatus = async (project, status) => {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status } : p)))
    await supabase.from('home_projects').update({ status }).eq('id', project.id)
  }

  return (
    <>
      <ProjectCapture onAdd={addProject} />
      <div className="listhead">
        <input className="search" placeholder="Search projects"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="count">{filtered.length}</span>
      </div>

      <div className="tagfilter">
        {STATUSES.map(([k, label]) => (
          <button key={k} className={'tagchip' + (activeStatus === k ? ' on' : '')}
            onClick={() => setActiveStatus((cur) => (cur === k ? null : k))}>{label}</button>
        ))}
        {activeStatus && (
          <button className="tagchip clear" onClick={() => setActiveStatus(null)}>clear ✕</button>
        )}
      </div>

      {loading ? (
        <p className="muted pad">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted pad">
          {activeStatus || q ? 'No matches.' : 'No projects yet — capture one above.'}
        </p>
      ) : !q.trim() && !activeStatus ? (
        <SortableList
          items={sorted}
          getId={(p) => p.id}
          onReorder={persistReorder}
          renderItem={(project, dragProps) => (
            <ProjectCard
              key={project.id}
              project={project}
              innerRef={dragProps.innerRef}
              dragging={dragProps.dragging}
              dragHandle={dragProps.dragHandle}
              onStatus={(s) => updateStatus(project, s)}
            />
          )}
        />
      ) : (
        <ul className="cards">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onStatus={(s) => updateStatus(p, s)} />
          ))}
        </ul>
      )}
    </>
  )
}

function ProjectCapture({ onAdd }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [materials, setMaterials] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState('ideation')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setTitle(''); setDesc(''); setMaterials(''); setDueDate(''); setCost(''); setStatus('ideation'); setOpen(false)
  }

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    await onAdd({
      title: t,
      description: desc.trim(),
      materials: materials.trim(),
      due_date: dueDate || null,
      cost,
      status,
    })
    reset(); setBusy(false)
  }

  return (
    <div className="capture">
      <div className="cap-row">
        <input
          className="cap-title"
          placeholder="Capture a home project…"
          value={title}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
      </div>
      {open && (
        <>
          <div className="cap-row">
            <textarea
              className="cap-desc"
              placeholder="Details / notes (optional)"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="cap-row">
            <textarea
              className="cap-desc"
              placeholder="Materials needed (optional)"
              rows={2}
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
            />
          </div>
          <div className="cap-row">
            <label className="minifield full">
              <span>Due date</span>
              <div className="fieldrow">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                {dueDate && (
                  <button type="button" className="fieldclear" aria-label="Clear due date"
                    onClick={() => setDueDate('')}>✕</button>
                )}
              </div>
            </label>
          </div>
          <div className="cap-row">
            <label className="minifield full">
              <span>Cost</span>
              <input type="number" step="0.01" placeholder="optional"
                value={cost} onChange={(e) => setCost(e.target.value)} />
            </label>
          </div>
          <p className="fieldlabel">Status</p>
          <StatusPicker value={status} onChange={setStatus} />
          <div className="cap-actions">
            <button className="ghost" onClick={reset}>Cancel</button>
            <button className="primary" disabled={busy || !title.trim()} onClick={submit}>Add project</button>
          </div>
        </>
      )}
    </div>
  )
}

// Pick a project's status. Unlike PlatformPicker this is required, so there's
// no "tap again to clear" behavior — a project always has exactly one status.
function StatusPicker({ value, onChange }) {
  return (
    <div className="platforms">
      {STATUSES.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={'tagchip' + (value === k ? ' on' : '')}
          onClick={() => onChange(k)}
        >{label}</button>
      ))}
    </div>
  )
}

function ProjectCard({ project, innerRef, dragging, dragHandle }) {
  return (
    <li ref={innerRef} className={'card' + (dragging ? ' dragging' : '')}>
      {dragHandle}
      <div className="card-main">
        <button className="card-body" onClick={() => navigate('/p/' + project.id)}>
          <div className="card-title">{project.title}</div>
          {project.description && <div className="card-desc">{project.description}</div>}
          <div className="card-meta">
            <span className="tag status-tag">{statusLabel(project.status)}</span>
            {project.due_date && <span>· due {fmtDateOnly(project.due_date)}</span>}
            {project.cost != null && <span>· {fmtCost(project.cost)}</span>}
          </div>
        </button>
      </div>
    </li>
  )
}

/* --------------------------- detail / edit (projects) ----------------------------- */

function ProjectDetail({ id }) {
  const [project, setProject] = useState(undefined) // undefined=loading, null=missing
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [materials, setMaterials] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState('ideation')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('home_projects').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setProject(data || null)
      if (data) {
        setTitle(data.title); setDesc(data.description || ''); setMaterials(data.materials || '')
        setDueDate(data.due_date || ''); setCost(data.cost != null ? String(data.cost) : '')
        setStatus(data.status || 'ideation')
      }
    })
  }, [id])

  if (project === undefined) return <p className="muted pad">Loading…</p>
  if (project === null) return (
    <div className="pad">
      <p className="muted">That project doesn’t exist.</p>
      <button className="ghost" onClick={() => navigate('/projects')}>← Back</button>
    </div>
  )

  const save = async () => {
    const patch = {
      title: title.trim() || project.title,
      description: desc.trim() || null,
      materials: materials.trim() || null,
      due_date: dueDate || null,
      cost: cost === '' ? null : Number(cost),
      status,
    }
    setProject((p) => ({ ...p, ...patch }))
    await supabase.from('home_projects').update(patch).eq('id', project.id)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const remove = async () => {
    if (!confirm('Delete this project permanently?')) return
    await supabase.from('home_projects').delete().eq('id', project.id)
    navigate('/projects')
  }

  return (
    <div className="detail">
      <button className="ghost back" onClick={() => navigate('/projects')}>← Back</button>
      <label className="fld">
        <span>Title</span>
        <div className="cap-row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </label>
      <label className="fld">
        <span>Details</span>
        <div className="cap-row">
          <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </label>
      <label className="fld">
        <span>Materials needed</span>
        <div className="cap-row">
          <textarea rows={3} value={materials} onChange={(e) => setMaterials(e.target.value)} />
        </div>
      </label>
      <div className="fld">
        <span>Due date</span>
        <div className="cap-row fieldrow">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {dueDate && (
            <button type="button" className="fieldclear" aria-label="Clear due date"
              onClick={() => setDueDate('')}>✕</button>
          )}
        </div>
      </div>
      <div className="fld">
        <span>Cost</span>
        <div className="cap-row">
          <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>
      <div className="fld">
        <span>Status</span>
        <StatusPicker value={status} onChange={setStatus} />
      </div>
      <div className="detail-meta">Added {fmtDate(project.created_at)}</div>
      <div className="detail-actions">
        <button className="primary" onClick={save}>{saved ? 'Saved ✓' : 'Save'}</button>
        <button className="danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}
