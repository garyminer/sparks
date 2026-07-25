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
  if ((m = p.match(/^\/i\/(.+)$/))) return { name: 'idea', id: decodeURIComponent(m[1]) }
  return { name: 'home' }
}
const navigate = (to) => { window.location.hash = to }

const fmtDate = (s) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

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

  if (checking) return <Splash />
  if (!session) return <SignIn />

  return (
    <Shell route={route}>
      {route.name === 'idea'
        ? <IdeaDetail id={route.id} />
        : <Board tab={route.name === 'archive' ? 'archive' : 'active'} />}
    </Shell>
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

function Shell({ route, children }) {
  const tab = route.name === 'archive' ? 'archive' : route.name === 'home' ? 'active' : null
  return (
    <div className="wrap">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('/')}>
          <Logo />
          <span>Sparks</span>
        </button>
        <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      {tab && (
        <nav className="tabs">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => navigate('/')}>Ideas</button>
          <button className={tab === 'archive' ? 'on' : ''} onClick={() => navigate('/archive')}>Tried</button>
        </nav>
      )}

      <main>{children}</main>
      <footer className="foot">Capture fast · try it · check it off with what you learned · v1.7</footer>
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
        <p className="muted">AI ideas to try — captured in seconds.</p>
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

/* ------------------------------- board --------------------------------- */
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

  const confirmCheckOff = async (outcome) => {
    const idea = prompting
    setPrompting(null)
    const patch = { tried: true, tried_at: new Date().toISOString(), outcome: outcome || idea.outcome || null }
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
        <SortableIdeas items={active} onCheck={beginCheckOff} onReorder={persistReorder} onTag={toggleTag} />
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

// Touch + mouse drag-to-reorder via Pointer Events (works on iOS Safari).
// A dedicated grip handle starts the drag, so normal scrolling and taps on the
// rest of the card keep working. On drop, the parent persists the new order.
function SortableIdeas({ items, onCheck, onReorder, onTag }) {
  const [order, setOrder] = useState(items)
  const [dragId, setDragId] = useState(null)
  const draggingRef = useRef(false)
  const els = useRef(new Map())
  const orderRef = useRef(items)      // live order for the rAF loop
  const dragIdRef = useRef(null)
  const lastXRef = useRef(0)
  const lastYRef = useRef(0)          // latest pointer position (viewport coords)
  const grabDXRef = useRef(0)         // where inside the card the finger grabbed
  const grabDYRef = useRef(0)
  const widthRef = useRef(0)
  const cloneRef = useRef(null)       // the floating element that tracks the finger
  const rafRef = useRef(0)
  const onReorderRef = useRef(onReorder)
  const winMoveRef = useRef(null)     // window listeners active during a drag
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
      const el = els.current.get(ids[i].id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) { target = i; break }
    }
    const from = ids.findIndex((x) => x.id === id)
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
    onReorderRef.current(orderRef.current.map((x) => x.id))
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

    requestAnimationFrame(positionClone)     // place clone once it has mounted
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(autoScroll)
  }

  const dragged = dragId ? order.find((i) => i.id === dragId) : null
  const cloneStyle = {
    width: widthRef.current,
    transform: `translate(${lastXRef.current - grabDXRef.current}px, ${lastYRef.current - grabDYRef.current}px)`,
  }

  return (
    <>
      {items.length > 1 && <p className="reorder-hint">Drag <span>⠿</span> to reorder by priority</p>}
      <ul className={'cards' + (dragId ? ' is-dragging' : '')}>
        {order.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            innerRef={setEl(idea.id)}
            dragging={dragId === idea.id}   /* renders as a placeholder gap */
            onCheck={() => onCheck(idea)}
            onRestore={() => {}}
            onTag={onTag}
            dragHandle={
              <button
                className="handle"
                aria-label="Drag to reorder"
                onPointerDown={down(idea.id)}
              >⠿</button>
            }
          />
        ))}
      </ul>

      {dragged && (
        <ul className="cards clone-layer" ref={cloneRef} style={cloneStyle} aria-hidden="true">
          <IdeaCard idea={dragged} onCheck={() => {}} onRestore={() => {}} onTag={() => {}} />
        </ul>
      )}
    </>
  )
}

function OutcomeModal({ idea, onCancel, onSave }) {
  const [text, setText] = useState(idea.outcome || '')
  const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); await onSave(text.trim()) }

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nice — how did it go?</h2>
        <p className="muted small">“{idea.title}”. Jot down results or thoughts (optional), then archive it.</p>
        <div className="cap-row">
          <textarea rows={5} autoFocus placeholder="What happened when you tried it?"
            value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="cap-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>Save &amp; archive</button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------- detail / edit ----------------------------- */
function IdeaDetail({ id }) {
  const [idea, setIdea] = useState(undefined) // undefined=loading, null=missing
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [outcome, setOutcome] = useState('')
  const [tags, setTags] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('ideas').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setIdea(data || null)
      if (data) {
        setTitle(data.title); setDesc(data.description || '')
        setOutcome(data.outcome || ''); setTags(data.tags || [])
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
