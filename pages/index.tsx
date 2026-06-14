import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import styles from '../styles/App.module.css'

type MembershipType = 'tt' | 'enc'

interface Trip {
  id: string
  park: string
  type: MembershipType
  checkin: string
  checkout: string
  nights: number
  costPerNight: number  // 0 = free, >0 = resort fee
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type Tab = 'dashboard' | 'trips' | 'rules' | 'ai' | 'settings'

const TT_TOTAL = 120

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(n: number): string {
  return n === 0 ? '$0' : `$${n.toFixed(2).replace(/\.00$/, '')}`
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [trips, setTrips] = useState<Trip[]>([])

  // form state
  const [park, setPark] = useState('')
  const [mtype, setMtype] = useState<MembershipType>('tt')
  const [checkin, setCheckin] = useState('')
  const [checkout, setCheckout] = useState('')
  const [costPerNight, setCostPerNight] = useState('0')
  const [addMsg, setAddMsg] = useState('')
  const [addError, setAddError] = useState(false)

  // AI state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi Greg! Your TT membership has a 120-night annual cap. Encore is unlimited nights — governed by a 14-night max / 7-day out rotation. Ask me anything about planning, parks, or membership strategy. Your dog rides along too! 🐕",
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // settings
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tt_trips_v4')
      if (saved) setTrips(JSON.parse(saved))
      const savedKey = localStorage.getItem('tt_anthropic_key')
      if (savedKey) { setApiKey(savedKey); setApiKeySaved(true) }
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('tt_trips_v4', JSON.stringify(trips)) } catch {}
  }, [trips])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // computed
  const ttTrips = trips.filter(t => t.type === 'tt')
  const encTrips = trips.filter(t => t.type === 'enc')
  const ttUsed = ttTrips.reduce((s, t) => s + t.nights, 0)
  const ttRemaining = Math.max(0, TT_TOTAL - ttUsed)
  const ttPct = Math.round((ttRemaining / TT_TOTAL) * 100)

  const totalSpent = trips.reduce((s, t) => s + t.costPerNight * t.nights, 0)
  const totalNights = trips.reduce((s, t) => s + t.nights, 0)
  const avgCostPerNight = totalNights > 0 ? totalSpent / totalNights : 0

  const lastEnc = encTrips.length
    ? encTrips.slice().sort((a, b) => new Date(b.checkout).getTime() - new Date(a.checkout).getTime())[0]
    : null
  const encNextEligible = lastEnc ? addDays(lastEnc.checkout, 7) : null
  const encDaysUntil = encNextEligible ? daysBetween(todayStr(), encNextEligible) : null
  const encEligibleNow = encDaysUntil !== null && encDaysUntil <= 0

  function handleAddTrip() {
    setAddMsg('')
    setAddError(false)
    if (!park.trim() || !checkin || !checkout) {
      setAddMsg('Please fill in all fields.')
      setAddError(true)
      return
    }
    const nights = daysBetween(checkin, checkout)
    if (nights <= 0) {
      setAddMsg('Check-out must be after check-in.')
      setAddError(true)
      return
    }
    const cpn = parseFloat(costPerNight) || 0
    if (mtype === 'enc' && nights > 14) {
      setAddMsg('Note: Encore max is 14 consecutive nights per stay.')
    }
    const newTrip: Trip = {
      id: Date.now().toString(),
      park: park.trim(),
      type: mtype,
      checkin,
      checkout,
      nights,
      costPerNight: cpn,
    }
    setTrips(prev => [...prev, newTrip])
    setPark('')
    setCheckin('')
    setCheckout('')
    setCostPerNight('0')
    if (!(mtype === 'enc' && nights > 14)) {
      const tripCost = cpn * nights
      setAddMsg(`Added ${nights} night${nights === 1 ? '' : 's'} at ${newTrip.park} · ${tripCost === 0 ? 'Free stay' : formatMoney(tripCost) + ' total'}`)
    }
    setTimeout(() => setAddMsg(''), 5000)
  }

  function handleDeleteTrip(id: string) {
    setTrips(prev => prev.filter(t => t.id !== id))
  }

  function handleSaveKey() {
    if (!apiKey.trim()) return
    try { localStorage.setItem('tt_anthropic_key', apiKey.trim()) } catch {}
    setApiKeySaved(true)
    setShowKey(false)
  }

  function handleClearKey() {
    setApiKey('')
    setApiKeySaved(false)
    try { localStorage.removeItem('tt_anthropic_key') } catch {}
  }

  async function handleSendChat(text?: string) {
    const q = (text ?? chatInput).trim()
    if (!q || chatLoading) return
    setChatInput('')

    const userMsg: ChatMessage = { role: 'user', content: q }
    setChatMessages(prev => [...prev, userMsg])
    setChatLoading(true)

    const encNote = lastEnc
      ? `Last Encore checkout: ${lastEnc.checkout}. Next eligible: ${encNextEligible} (${encEligibleNow ? 'eligible now' : `${encDaysUntil} days away`}).`
      : 'No Encore stays logged yet.'

    const system = `You are a Thousand Trails and Encore membership expert assistant for full-time RVers. The user is Greg — a full-time RVer with a 50-amp RV and a dog.

Greg's membership status:
- Thousand Trails: ${ttRemaining} nights remaining (${ttUsed} of ${TT_TOTAL} used this year). Hard annual cap.
- Encore / Trails Collection: NO annual night cap. Rotation: 14 nights max per park, then 7-night out-of-system wait.
- ${encNote}
- Total spent on stays: $${totalSpent.toFixed(2)} across ${totalNights} nights (avg $${avgCostPerNight.toFixed(2)}/night)
- Logged trips (${trips.length} total): ${trips.length ? trips.map(t => `${t.park} (${t.type.toUpperCase()}, ${t.checkin}→${t.checkout}, ${t.nights}n, $${(t.costPerNight * t.nights).toFixed(2)})`).join('; ') : 'none yet'}

Be helpful, accurate, and concise (under 180 words). Never say Encore has an annual night cap — it does not.`

    const history: ChatMessage[] = [...chatMessages, userMsg]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          messages: history.map(m => ({ role: m.role, content: m.content })),
          apiKey: apiKey.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.error === 'NO_API_KEY') {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚙️ No API key configured. Go to the Settings tab and paste your Anthropic API key to enable the AI assistant.',
        }])
      } else if (data.error === 'INVALID_KEY') {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: '🔑 The API key appears to be invalid. Double-check it in the Settings tab — it should start with sk-ant-...',
        }])
      } else {
        const reply = data.text ?? data.error ?? 'No response received.'
        setChatMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const sortedTrips = [...trips].sort((a, b) => new Date(b.checkin).getTime() - new Date(a.checkin).getTime())

  return (
    <>
      <Head>
        <title>TT Membership Manager</title>
        <meta name="description" content="Thousand Trails & Encore membership tracker for full-time RVers" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.layout}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>⛺</span>
              <div>
                <div className={styles.logoTitle}>TT Membership Manager</div>
                <div className={styles.logoSub}>Thousand Trails &amp; Encore tracker</div>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          <nav className={styles.tabs}>
            {(['dashboard', 'trips', 'rules', 'ai', 'settings'] as Tab[]).map(t => (
              <button
                key={t}
                className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'dashboard' && '📊 '}
                {t === 'trips' && '🗓️ '}
                {t === 'rules' && '📋 '}
                {t === 'ai' && '🤖 '}
                {t === 'settings' && '⚙️ '}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div className={styles.section}>

              {/* Cost summary */}
              <div className={styles.costBanner}>
                <div className={styles.costStat}>
                  <div className={styles.costLabel}>Total spent</div>
                  <div className={styles.costValue}>{formatMoney(totalSpent)}</div>
                </div>
                <div className={styles.costDivider} />
                <div className={styles.costStat}>
                  <div className={styles.costLabel}>Total nights</div>
                  <div className={styles.costValue}>{totalNights}</div>
                </div>
                <div className={styles.costDivider} />
                <div className={styles.costStat}>
                  <div className={styles.costLabel}>Avg cost/night</div>
                  <div className={styles.costValue}>{formatMoney(avgCostPerNight)}</div>
                </div>
                <div className={styles.costDivider} />
                <div className={styles.costStat}>
                  <div className={styles.costLabel}>Trips logged</div>
                  <div className={styles.costValue}>{trips.length}</div>
                </div>
              </div>

              {/* TT block */}
              <div className={styles.membershipBlock}>
                <div className={styles.membershipLabel}>
                  <span className={styles.badgeTT}>Thousand Trails</span>
                  <span className={styles.membershipNote}>120-night annual cap</span>
                </div>
                <div className={styles.metricsRow}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Nights remaining</div>
                    <div className={styles.metricValue} style={{ color: 'var(--forest)' }}>{ttRemaining}</div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{
                        width: `${ttPct}%`,
                        background: ttPct > 40 ? 'var(--forest-light)' : ttPct > 15 ? 'var(--amber)' : 'var(--rust)',
                      }} />
                    </div>
                    <div className={styles.metricSub}>{ttUsed} used of {TT_TOTAL}</div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>TT cost total</div>
                    <div className={styles.metricValue} style={{ fontSize: '22px' }}>
                      {formatMoney(ttTrips.reduce((s, t) => s + t.costPerNight * t.nights, 0))}
                    </div>
                    <div className={styles.metricSub}>{ttTrips.length} stay{ttTrips.length !== 1 ? 's' : ''} · {ttUsed} nights</div>
                  </div>
                </div>
              </div>

              {/* Encore block */}
              <div className={styles.membershipBlock}>
                <div className={styles.membershipLabel}>
                  <span className={styles.badgeEnc}>Encore / Trails Collection</span>
                  <span className={styles.membershipNote}>No annual cap — rotation based</span>
                </div>
                <div className={styles.metricsRow}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Last Encore checkout</div>
                    <div className={styles.metricValueMd}>{lastEnc ? formatDate(lastEnc.checkout) : '—'}</div>
                    <div className={styles.metricSub}>7-day wait starts here</div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Next Encore eligible</div>
                    <div className={styles.metricValueMd}>{encNextEligible ? formatDate(encNextEligible) : '—'}</div>
                    <div className={`${styles.statusDot} ${!lastEnc ? styles.dotGreen : encEligibleNow ? styles.dotGreen : styles.dotAmber}`}>
                      {!lastEnc ? 'No recent Encore stay' : encEligibleNow ? 'Eligible now' : `${encDaysUntil} day${encDaysUntil === 1 ? '' : 's'} until eligible`}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricLabel}>Encore cost total</div>
                    <div className={styles.metricValue} style={{ fontSize: '22px' }}>
                      {formatMoney(encTrips.reduce((s, t) => s + t.costPerNight * t.nights, 0))}
                    </div>
                    <div className={styles.metricSub}>{encTrips.length} stay{encTrips.length !== 1 ? 's' : ''} · 14 nights max each</div>
                  </div>
                </div>
                <div className={styles.infoBox}>
                  Encore has <strong>no annual night cap</strong>. Limited to 14 consecutive nights per park, then a 7-night out-of-system wait.
                </div>
              </div>

              {/* Add stay form */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>Log a stay</div>
                <div className={styles.formGrid}>
                  <div className={styles.formRow}>
                    <label className={styles.label}>Park name</label>
                    <input className={styles.input} type="text" placeholder="e.g. Hershey, PA"
                      value={park} onChange={e => setPark(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTrip()} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>Membership</label>
                    <select className={styles.select} value={mtype} onChange={e => setMtype(e.target.value as MembershipType)}>
                      <option value="tt">Thousand Trails</option>
                      <option value="enc">Encore</option>
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>Check-in</label>
                    <input className={styles.input} type="date" value={checkin} onChange={e => setCheckin(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>Check-out</label>
                    <input className={styles.input} type="date" value={checkout} onChange={e => setCheckout(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.label}>Cost/night ($)</label>
                    <input className={styles.input} type="number" min="0" step="0.01" placeholder="0 = free"
                      value={costPerNight} onChange={e => setCostPerNight(e.target.value)} />
                  </div>
                </div>
                {checkin && checkout && daysBetween(checkin, checkout) > 0 && (
                  <div className={styles.tripPreview}>
                    {daysBetween(checkin, checkout)} nights ·{' '}
                    {parseFloat(costPerNight) > 0
                      ? `${formatMoney(parseFloat(costPerNight))}/night = ${formatMoney(parseFloat(costPerNight) * daysBetween(checkin, checkout))} total`
                      : 'Free stay'}
                  </div>
                )}
                <div className={styles.formActions}>
                  <button className={styles.btnPrimary} onClick={handleAddTrip}>+ Add stay</button>
                  {addMsg && <span className={addError ? styles.msgError : styles.msgSuccess}>{addMsg}</span>}
                </div>
              </div>

              {/* Recent stays */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>Recent stays</div>
                {sortedTrips.length === 0
                  ? <div className={styles.empty}>No stays logged yet — add one above.</div>
                  : sortedTrips.slice(0, 5).map(t => <TripRow key={t.id} trip={t} onDelete={handleDeleteTrip} />)
                }
              </div>
            </div>
          )}

          {/* ── TRIPS ── */}
          {tab === 'trips' && (
            <div className={styles.section}>
              {trips.length > 0 && (
                <div className={styles.costBanner}>
                  <div className={styles.costStat}>
                    <div className={styles.costLabel}>Total spent</div>
                    <div className={styles.costValue}>{formatMoney(totalSpent)}</div>
                  </div>
                  <div className={styles.costDivider} />
                  <div className={styles.costStat}>
                    <div className={styles.costLabel}>Total nights</div>
                    <div className={styles.costValue}>{totalNights}</div>
                  </div>
                  <div className={styles.costDivider} />
                  <div className={styles.costStat}>
                    <div className={styles.costLabel}>Avg/night</div>
                    <div className={styles.costValue}>{formatMoney(avgCostPerNight)}</div>
                  </div>
                  <div className={styles.costDivider} />
                  <div className={styles.costStat}>
                    <div className={styles.costLabel}>TT nights used</div>
                    <div className={styles.costValue}>{ttUsed} / {TT_TOTAL}</div>
                  </div>
                </div>
              )}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  All stays
                  <span className={styles.badgeInfo}>{trips.length} trip{trips.length !== 1 ? 's' : ''}</span>
                </div>
                {sortedTrips.length === 0
                  ? <div className={styles.empty}>No stays logged yet. Go to Dashboard to add one.</div>
                  : sortedTrips.map(t => <TripRow key={t.id} trip={t} onDelete={handleDeleteTrip} />)
                }
              </div>
            </div>
          )}

          {/* ── RULES ── */}
          {tab === 'rules' && (
            <div className={styles.section}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>Thousand Trails rules <span className={styles.badgeTT}>TT</span></div>
                <ul className={styles.rulesList}>
                  <RuleItem icon="🌙"><><strong>120 nights per year</strong> — hard annual cap, resets on your membership anniversary.</></RuleItem>
                  <RuleItem icon="📅">Book up to <strong>7 days in advance</strong> for short stays, or <strong>90–180 days</strong> depending on your tier.</RuleItem>
                  <RuleItem icon="🔁">Max <strong>21 consecutive nights</strong> per park (14 during high-use periods).</RuleItem>
                  <RuleItem icon="⏱️"><>Zone exclusion: after 5+ nights, wait <strong>7 nights out of the system</strong> before checking into another TT park in the same zone.</></RuleItem>
                  <RuleItem icon="➡️">Park-to-park members can go directly TT → TT with no wait.</RuleItem>
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHeader}>Encore / Trails Collection rules <span className={styles.badgeEnc}>Encore</span></div>
                <ul className={styles.rulesList}>
                  <RuleItem icon="♾️"><><strong>No annual night cap</strong> — Encore nights are unlimited. You&apos;re governed by rotation rules, not a day bank.</></RuleItem>
                  <RuleItem icon="🌙">Max <strong>14 consecutive nights</strong> per Encore park (7 nights if tenting).</RuleItem>
                  <RuleItem icon="⏱️"><>After any Encore stay, you must be <strong>out of ALL Encore parks for 7 nights</strong> before your next Encore stay.</></RuleItem>
                  <RuleItem icon="🚫"><>You <strong>cannot go Encore → Encore directly</strong>. Sit out 7 days, or bridge through a TT park (park-to-park required).</></RuleItem>
                  <RuleItem icon="📅">Book Encore parks up to <strong>60 days in advance</strong> (90 days with Trails Collection Plus / Adventure tier).</RuleItem>
                  <RuleItem icon="🐕">Pets generally welcome — confirm with each park. Some Encore parks have a <strong>15-year RV age limit</strong>.</RuleItem>
                </ul>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHeader}>Full-timer strategy <span className={styles.badgeOk}>Tips</span></div>
                <ul className={styles.rulesList}>
                  <RuleItem icon="💡">Use Encore for premium/coastal parks — they don&apos;t eat your 120 TT nights.</RuleItem>
                  <RuleItem icon="🗺️">Plan Encore → TT → Encore hops to stay in-system continuously (park-to-park required).</RuleItem>
                  <RuleItem icon="🔔">Book Encore 60 days out for peak-season parks — availability fills fast.</RuleItem>
                  <RuleItem icon="💰">18 Encore resorts charge up to $20/night extra — still a deal vs. $55+ rack rates.</RuleItem>
                </ul>
              </div>
            </div>
          )}

          {/* ── AI ── */}
          {tab === 'ai' && (
            <div className={styles.section}>
              {!apiKeySaved && (
                <div className={styles.keyWarning}>
                  <span>🔑</span>
                  <span>AI assistant needs an Anthropic API key. <button className={styles.linkBtn} onClick={() => setTab('settings')}>Go to Settings →</button></span>
                </div>
              )}
              <div className={`${styles.card} ${styles.aiCard}`}>
                <div className={styles.chipRow}>
                  {[
                    'How do I plan an Encore → TT → Encore rotation without downtime?',
                    'When should I use Encore vs TT nights?',
                    'How can I stay full-time without burning my 120 TT nights?',
                    'Best Encore parks on the East Coast?',
                  ].map(q => (
                    <button key={q} className={styles.chip} onClick={() => handleSendChat(q)}>{q} ↗</button>
                  ))}
                </div>
                <div className={styles.messages}>
                  {chatMessages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? styles.msgUser : styles.msgAI}>{m.content}</div>
                  ))}
                  {chatLoading && <div className={styles.msgAI}><span className={styles.typing}>Thinking…</span></div>}
                  <div ref={messagesEndRef} />
                </div>
                <div className={styles.chatInputRow}>
                  <input className={styles.input} type="text" placeholder="Ask about parks, rules, planning..."
                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !chatLoading && handleSendChat()}
                    disabled={chatLoading} />
                  <button className={styles.btnPrimary} onClick={() => handleSendChat()} disabled={chatLoading}>Send</button>
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === 'settings' && (
            <div className={styles.section}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>Anthropic API Key</div>
                <p className={styles.settingsNote}>
                  The AI assistant tab uses Claude via the Anthropic API. Your key is stored only in your browser&apos;s local storage and sent directly to the server — it is never logged or shared.
                  Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className={styles.link}>console.anthropic.com</a>.
                </p>
                {apiKeySaved ? (
                  <div className={styles.keyStatus}>
                    <span className={styles.keyOk}>✓ API key saved</span>
                    <button className={styles.btnSmall} onClick={handleClearKey}>Remove key</button>
                  </div>
                ) : (
                  <div className={styles.keyInputRow}>
                    <div className={styles.keyInputWrap}>
                      <input
                        className={styles.input}
                        type={showKey ? 'text' : 'password'}
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                        autoComplete="off"
                      />
                      <button className={styles.eyeBtn} onClick={() => setShowKey(v => !v)} aria-label="Toggle visibility">
                        {showKey ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <button className={styles.btnPrimary} onClick={handleSaveKey} disabled={!apiKey.trim()}>
                      Save key
                    </button>
                  </div>
                )}
                <div className={styles.settingsTip}>
                  If you&apos;re deploying to Vercel, you can also set <code>ANTHROPIC_API_KEY</code> as an environment variable in your Vercel project settings — no key entry needed in the UI.
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>Data</div>
                <p className={styles.settingsNote}>All trip data is stored in your browser&apos;s local storage. Nothing is sent to any server.</p>
                <button className={styles.btnDanger} onClick={() => {
                  if (confirm('Delete all logged trips? This cannot be undone.')) {
                    setTrips([])
                    try { localStorage.removeItem('tt_trips_v4') } catch {}
                  }
                }}>
                  Clear all trips
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className={styles.footer}>
          <p>Built for full-time RV life · Thousand Trails &amp; Encore membership manager</p>
        </footer>
      </div>
    </>
  )
}

function TripRow({ trip, onDelete }: { trip: Trip; onDelete: (id: string) => void }) {
  const tripCost = trip.costPerNight * trip.nights
  return (
    <div className={styles.tripRow}>
      <div className={styles.tripInfo}>
        <div className={styles.tripPark}>
          {trip.park}
          <span className={trip.type === 'tt' ? styles.badgeTT : styles.badgeEnc}>
            {trip.type === 'tt' ? 'TT' : 'Encore'}
          </span>
        </div>
        <div className={styles.tripMeta}>
          {formatDate(trip.checkin)} → {formatDate(trip.checkout)} · {trip.nights} night{trip.nights !== 1 ? 's' : ''}
        </div>
      </div>
      <div className={styles.tripCost}>
        <div className={styles.tripCostTotal}>{tripCost === 0 ? 'Free' : formatMoney(tripCost)}</div>
        {trip.costPerNight > 0 && (
          <div className={styles.tripCostPer}>{formatMoney(trip.costPerNight)}/night</div>
        )}
      </div>
      <button className={styles.deleteBtn} onClick={() => onDelete(trip.id)} aria-label="Remove stay">✕</button>
    </div>
  )
}

function RuleItem({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li className={styles.ruleItem}>
      <span className={styles.ruleIcon}>{icon}</span>
      <span>{children}</span>
    </li>
  )
}
