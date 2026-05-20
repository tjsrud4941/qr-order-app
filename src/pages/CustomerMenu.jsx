import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,800&family=Noto+Serif+KR:wght@400;700;900&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
  :root {
    --bg: #faf4ec; --bg-2: #f3e9d8; --paper: #fffdf8;
    --ink: #2a1a10; --ink-soft: #6b5546; --line: #d8c4ac;
    --accent: #b04a2f; --accent-deep: #843623; --gold: #b18852;
    --green: #4f6a3a; --shadow: 0 1px 0 rgba(42,26,16,.06), 0 8px 32px -16px rgba(42,26,16,.18);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans KR", sans-serif; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes popIn { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes ringPulse { 0%{box-shadow:0 0 0 0 rgba(79,106,58,.5)} 100%{box-shadow:0 0 0 24px rgba(79,106,58,0)} }
  .menu-card { transition: all .2s; }
  .menu-card:hover { transform: translateY(-2px); border-color: var(--accent) !important; box-shadow: 0 8px 24px -10px rgba(176,74,47,.3) !important; }
  .fade-up { animation: fadeUp .35s ease both; }
  .pop-in { animation: popIn .3s ease both; }
`

const EMOJI_MAP = {
  '아메리카노': '☕', '카페라떼': '🥛', '바닐라 라떼': '✨', '레모네이드': '🍋',
  '브런치 샌드위치': '🥪', '단호박 스프': '🎃', '치즈케이크': '🍰', '와플': '🧇',
}

export default function CustomerMenu() {
  const { tableId } = useParams()
  const { t, i18n } = useTranslation()
  const [menus, setMenus] = useState([])
  const [cart, setCart] = useState([])
  const [tableUUID, setTableUUID] = useState(null)
  const [waitCounts, setWaitCounts] = useState({})
  const [avgCookTimes, setAvgCookTimes] = useState({})
  const [recommendations, setRecommendations] = useState([])
  const [listening, setListening] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [activeCategory, setActiveCategory] = useState('전체')
  const [isOpen, setIsOpen] = useState(true)
  const [businessHours, setBusinessHours] = useState(null)
  const [orderStatus, setOrderStatus] = useState(null)
  const [orderId, setOrderId] = useState(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    fetchMenus(); fetchTable(); fetchWaitCounts(); fetchAvgCookTimes(); fetchBusinessHours()
  }, [])

  useEffect(() => {
    if (!orderId) return
    const sub = supabase.channel('order-status-' + orderId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => { if (payload.new.status === 'done') setOrderStatus('done') })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [orderId])

  async function fetchMenus() {
    const { data } = await supabase.from('menus').select('*')
    setMenus(data || [])
  }
  async function fetchTable() {
    const { data } = await supabase.from('tables').select('id').eq('table_number', tableId).single()
    if (data) setTableUUID(data.id)
  }
  async function fetchWaitCounts() {
    const { data } = await supabase.from('order_items').select('menu_id, orders(status)').in('orders.status', ['pending', 'cooking'])
    const counts = {}
    if (data) data.forEach(item => { if (item.orders) counts[item.menu_id] = (counts[item.menu_id] || 0) + 1 })
    setWaitCounts(counts)
  }
  async function fetchAvgCookTimes() {
    const { data } = await supabase.from('orders').select('created_at, completed_at, order_items(menu_id)').not('completed_at', 'is', null).order('created_at', { ascending: false }).limit(50)
    const totals = {}, counts = {}
    if (data) {
      data.forEach(order => {
        const min = Math.round((new Date(order.completed_at) - new Date(order.created_at)) / 60000)
        order.order_items?.forEach(item => {
          if (!totals[item.menu_id]) { totals[item.menu_id] = 0; counts[item.menu_id] = 0 }
          totals[item.menu_id] += min; counts[item.menu_id] += 1
        })
      })
    }
    const avgs = {}
    Object.keys(totals).forEach(id => { avgs[id] = Math.round(totals[id] / counts[id]) })
    setAvgCookTimes(avgs)
  }
  async function fetchBusinessHours() {
    const today = new Date().getDay()
    const { data } = await supabase.from('business_hours').select('*').eq('day_of_week', today).single()
    if (data) {
      setBusinessHours(data)
      const now = new Date()
      const cur = now.getHours() * 60 + now.getMinutes()
      const [oH, oM] = data.open_time.split(':').map(Number)
      const [cH, cM] = data.close_time.split(':').map(Number)
      setIsOpen(data.is_open && cur >= oH * 60 + oM && cur <= cH * 60 + cM)
    }
  }
  async function fetchRecommendations(menuId) {
    const { data: orderItems } = await supabase.from('order_items').select('order_id').eq('menu_id', menuId)
    if (!orderItems?.length) return
    const orderIds = orderItems.map(i => i.order_id)
    const { data: coItems } = await supabase.from('order_items').select('menu_id, menus(id, name, price, is_available)').in('order_id', orderIds).neq('menu_id', menuId)
    if (!coItems?.length) return
    const freq = {}
    coItems.forEach(item => {
      const id = item.menu_id
      if (!freq[id]) freq[id] = { ...item.menus, count: 0 }
      freq[id].count += 1
    })
    setRecommendations(Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 2).filter(m => m.is_available))
  }

  function getMenuName(menu) {
    if (i18n.language === 'en') return menu.name_en || menu.name
    if (i18n.language === 'zh') return menu.name_zh || menu.name
    if (i18n.language === 'ja') return menu.name_ja || menu.name
    return menu.name
  }
  function getEmoji(menu) { return EMOJI_MAP[menu.name] || '🍽️' }
  function getEstimatedTime(menu) {
    const wait = waitCounts[menu.id] || 0
    const base = avgCookTimes[menu.id] || menu.cook_time
    return base + (wait * base)
  }

  function addToCart(menu) {
    if (!menu.is_available) return
    setCart(prev => {
      const exists = prev.find(i => i.id === menu.id)
      if (exists) return prev.map(i => i.id === menu.id ? {...i, qty: i.qty + 1} : i)
      return [...prev, {...menu, qty: 1}]
    })
    fetchRecommendations(menu.id)
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return alert('Chrome을 사용해주세요!')
    const r = new SR()
    r.lang = i18n.language === 'en' ? 'en-US' : i18n.language === 'zh' ? 'zh-CN' : i18n.language === 'ja' ? 'ja-JP' : 'ko-KR'
    r.onstart = () => { setListening(true); setVoiceText('') }
    r.onresult = (e) => {
      const text = e.results[0][0].transcript
      setVoiceText(text)
      const matched = menus.filter(m => [m.name, m.name_en, m.name_zh, m.name_ja].some(n => n && text.includes(n)))
      if (!matched.length) return alert(`"${text}" 에 해당하는 메뉴를 찾지 못했어요`)
      matched.forEach(m => { if (m.is_available) addToCart(m) })
      alert(`🎤 ${matched.map(m => m.name).join(', ')} 담았어요!`)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    r.start()
  }

  async function submitOrder() {
    if (!isOpen) return alert('현재 영업시간이 아니에요')
    if (!tableUUID) return alert(t('tableNotFound'))
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
    const { data: order } = await supabase.from('orders').insert({ table_id: tableUUID, total_price: total }).select().single()
    await supabase.from('order_items').insert(cart.map(i => ({ order_id: order.id, menu_id: i.id, quantity: i.qty, price: i.price })))
    for (const item of cart) {
      const newStock = item.stock - item.qty
      await supabase.from('menus').update({ stock: newStock, is_available: newStock > 0 }).eq('id', item.id)
    }
    setOrderId(order.id); setOrderStatus('ordered'); setCart([]); setRecommendations([])
    fetchMenus(); fetchWaitCounts(); fetchAvgCookTimes()
  }

  const languages = [{ code: 'ko', flag: '🇰🇷' }, { code: 'en', flag: '🇺🇸' }, { code: 'zh', flag: '🇨🇳' }, { code: 'ja', flag: '🇯🇵' }]
  const categoryLabels = {
    ko: { '전체': '전체', '푸드': '푸드', '음료': '음료' },
    en: { '전체': 'All', '푸드': 'Food', '음료': 'Drinks' },
    zh: { '전체': '全部', '푸드': '食物', '음료': '饮料' },
    ja: { '전체': 'すべて', '푸드': 'フード', '음료': 'ドリンク' },
  }
  const categories = ['전체', ...new Set(menus.map(m => m.category).filter(Boolean))]
  const getCategoryLabel = (cat) => categoryLabels[i18n.language]?.[cat] || cat
  const filtered = activeCategory === '전체' ? menus : menus.filter(m => m.category === activeCategory)
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const totalQty = cart.reduce((s, i) => s + i.qty, 0)

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', backgroundImage: 'radial-gradient(circle at 10% 0%, rgba(176,74,47,.06) 0%, transparent 40%), radial-gradient(circle at 90% 100%, rgba(177,136,82,.08) 0%, transparent 40%)' }}>

        {/* 주문 완료 팝업 */}
        {orderStatus && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,16,.55)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="pop-in" style={{ background: 'var(--paper)', borderRadius: '16px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
              <div style={{ padding: '32px 28px', textAlign: 'center' }}>
                {orderStatus === 'ordered' ? (
                  <>
                    <div style={{ fontSize: '72px', marginBottom: '12px' }}>🧾</div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 800, fontSize: '26px', marginBottom: '8px' }}>주문 접수!</div>
                    <div style={{ fontSize: '14px', color: 'var(--ink-soft)', marginBottom: '24px' }}>주방에서 정성껏 준비 중이에요 😊</div>
                    <button onClick={() => setOrderStatus(null)} style={{ background: 'var(--accent)', color: 'var(--paper)', border: 'none', padding: '12px 32px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>확인</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '72px', marginBottom: '12px', animation: 'bounce .6s' }}>✅</div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 800, fontSize: '26px', marginBottom: '8px' }}>준비 완료!</div>
                    <div style={{ fontSize: '14px', color: 'var(--ink-soft)', marginBottom: '24px' }}>맛있게 드세요 🍽️</div>
                    <button onClick={() => { setOrderStatus(null); setOrderId(null) }} style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>감사합니다!</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <header style={{ padding: '22px 24px 14px', borderBottom: '1px solid var(--line)', background: 'var(--paper)', position: 'sticky', top: 0, zIndex: 50, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 800, fontSize: '28px', letterSpacing: '-.02em', lineHeight: 1 }}>
                맛집<span style={{ color: 'var(--accent)' }}>.</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase', marginTop: '4px' }}>
                Table {tableId}
                {businessHours && (
                  <span style={{ marginLeft: '12px', color: isOpen ? 'var(--green)' : 'var(--accent)', fontWeight: 600 }}>
                    {isOpen ? `● 영업중 ${businessHours.open_time.slice(0,5)}-${businessHours.close_time.slice(0,5)}` : `✕ 영업종료`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {languages.map(lang => (
                <button key={lang.code} onClick={() => i18n.changeLanguage(lang.code)}
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: i18n.language === lang.code ? '2px solid var(--accent)' : '2px solid transparent', background: 'var(--bg-2)', cursor: 'pointer', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: i18n.language === lang.code ? '0 4px 12px rgba(176,74,47,.25)' : 'none', transition: 'all .2s' }}>
                  {lang.flag}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 대기 현황 바 */}
        {(Object.values(waitCounts).reduce((a, b) => a + b, 0) > 0 || voiceText) && (
          <div style={{ display: 'flex', gap: '12px', padding: '10px 24px', background: 'linear-gradient(90deg, #f5ead4 0%, #f0e1c4 100%)', borderBottom: '1px solid var(--line)', fontSize: '13px', overflowX: 'auto' }}>
            {voiceText && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--paper)', borderRadius: '999px', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
                🎤 <strong style={{ color: 'var(--accent)' }}>{voiceText}</strong>
              </div>
            )}
            {Object.values(waitCounts).reduce((a, b) => a + b, 0) > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'var(--paper)', borderRadius: '999px', border: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                현재 <strong style={{ color: 'var(--accent)' }}>{Object.values(waitCounts).reduce((a, b) => a + b, 0)}건</strong> 대기 중
              </div>
            )}
          </div>
        )}

        {/* 카테고리 탭 */}
        <div style={{ display: 'flex', gap: '0', background: 'var(--paper)', borderBottom: '1px solid var(--line)', padding: '0 24px', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeCategory === cat ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeCategory === cat ? 'var(--accent)' : 'var(--ink-soft)',
              fontFamily: 'Fraunces, serif', fontWeight: activeCategory === cat ? 600 : 400,
              fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '.1em', transition: 'all .15s'
            }}>{getCategoryLabel(cat)}</button>
          ))}
        </div>

        {/* 메뉴 그리드 */}
        <main style={{ padding: '22px 20px', paddingBottom: totalQty > 0 ? '160px' : '40px', maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {filtered.map((menu, idx) => {
              const inCart = cart.find(i => i.id === menu.id)
              return (
                <div key={menu.id} className={`menu-card fade-up`}
                  onClick={() => addToCart(menu)}
                  style={{
                    background: 'var(--paper)', border: inCart ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                    borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column',
                    cursor: menu.is_available ? 'pointer' : 'not-allowed',
                    opacity: menu.is_available ? 1 : 0.55,
                    filter: menu.is_available ? 'none' : 'grayscale(.5)',
                    position: 'relative', animationDelay: `${idx * 0.04}s`,
                    boxShadow: inCart ? '0 8px 24px -10px rgba(176,74,47,.3)' : 'none'
                  }}>
                  {/* 품절 스탬프 */}
                  {!menu.is_available && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'var(--ink)', color: 'var(--paper)', padding: '4px 10px', borderRadius: '4px', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: '11px', letterSpacing: '.15em', transform: 'rotate(8deg)' }}>
                      SOLD OUT
                    </div>
                  )}
                  {/* 담은 수량 뱃지 */}
                  {inCart && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: '14px' }}>
                      {inCart.qty}
                    </div>
                  )}
                  <div style={{ fontSize: '44px', lineHeight: 1, marginBottom: '10px' }}>{getEmoji(menu)}</div>
                  <div style={{ fontFamily: 'Fraunces, "Noto Serif KR", serif', fontWeight: 600, fontSize: '19px', lineHeight: 1.25, marginBottom: '6px' }}>{getMenuName(menu)}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--line)', paddingTop: '10px', marginTop: '10px' }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: '18px', color: 'var(--accent)' }}>
                      {menu.price.toLocaleString()}원
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textAlign: 'right', lineHeight: 1.4 }}>
                      {menu.is_available ? (
                        <>
                          <div>⏱ 약 {getEstimatedTime(menu)}분</div>
                          {waitCounts[menu.id] > 0 && <div style={{ color: 'var(--gold)' }}>대기 {waitCounts[menu.id]}건</div>}
                          {menu.stock < 10 && <div style={{ color: 'var(--accent)' }}>잔여 {menu.stock}개</div>}
                        </>
                      ) : <span style={{ color: 'var(--accent)' }}>품절</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </main>

        {/* 음성 주문 FAB */}
        <button onClick={startVoice} style={{
          position: 'fixed', right: '20px', bottom: totalQty > 0 ? '110px' : '28px',
          width: '64px', height: '64px', borderRadius: '50%', border: 'none',
          background: listening ? 'var(--green)' : 'var(--accent)',
          color: 'white', fontSize: '28px', cursor: 'pointer', zIndex: 60,
          boxShadow: '0 10px 28px -6px rgba(176,74,47,.5)',
          animation: listening ? 'ringPulse 1.2s infinite' : 'none',
          transition: 'all .2s'
        }}>🎤</button>

        {/* 장바구니 하단 바 */}
        {totalQty > 0 && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--ink)', color: 'var(--paper)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 55 }}>
            <div style={{ background: 'var(--accent)', color: 'white', minWidth: '28px', height: '28px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
              {totalQty}
            </div>
            <div style={{ flex: 1 }}>
              {recommendations.length > 0 && (
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.6)', marginBottom: '4px' }}>
                  🍽️ 함께 자주 주문해요:
                  {recommendations.map(rec => (
                    <button key={rec.id} onClick={(e) => { e.stopPropagation(); addToCart(rec) }}
                      style={{ marginLeft: '6px', padding: '2px 8px', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', borderRadius: '10px', color: 'white', fontSize: '11px', cursor: 'pointer' }}>
                      + {rec.name}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: '18px', fontWeight: 700 }}>
                {totalPrice.toLocaleString()}원
              </div>
              <div style={{ fontSize: '11px', opacity: .7 }}>
                {cart.map(i => `${getMenuName(i)} ×${i.qty}`).join(' · ')}
              </div>
            </div>
            <button onClick={() => { setCart([]); setRecommendations([]) }}
              style={{ padding: '10px 14px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: 'white', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              취소
            </button>
            <button onClick={submitOrder}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              주문하기 →
            </button>
          </div>
        )}
      </div>
    </>
  )
}