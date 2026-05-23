import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
  :root {
    --bg: #faf4ec; --bg-2: #f3e9d8; --paper: #fffdf8;
    --ink: #2a1a10; --ink-soft: #6b5546; --line: #d8c4ac;
    --accent: #b04a2f; --gold: #b18852; --green: #4f6a3a;
    --shadow: 0 1px 0 rgba(42,26,16,.06), 0 8px 32px -16px rgba(42,26,16,.18);
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
  .qty-btn { transition: all .15s; }
  .qty-btn:hover { background: var(--accent) !important; color: white !important; }
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
  const [showCart, setShowCart] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    fetchMenus().then(() => {
      fetchTable()
      fetchWaitCounts()
      fetchBusinessHours()
    })
  }, [])

  useEffect(() => {
    if (menus.length > 0) fetchAvgCookTimes()
  }, [menus])

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
    try {
      const BASE = 'http://127.0.0.1:8000'
      const cookTimes = {}
      await Promise.all(
        menus.map(async (menu) => {
          const res = await fetch(`${BASE}/predict/cooktime/${encodeURIComponent(menu.name)}`)
          const data = await res.json()
          cookTimes[menu.id] = data.estimated_minutes || menu.cook_time
        })
      )
      setAvgCookTimes(cookTimes)
    } catch (e) { console.error('조리시간 AI API 오류:', e) }
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
  function getEstimatedTime(menu) { return avgCookTimes[menu.id] || menu.cook_time }

  function addToCart(menu) {
    if (!menu.is_available) return
    setCart(prev => {
      const exists = prev.find(i => i.id === menu.id)
      if (exists) return prev.map(i => i.id === menu.id ? {...i, qty: i.qty + 1} : i)
      return [...prev, {...menu, qty: 1}]
    })
    fetchRecommendations(menu.id)
  }

  function updateCartQty(menuId, delta) {
    setCart(prev => {
      const item = prev.find(i => i.id === menuId)
      if (!item) return prev
      if (item.qty + delta <= 0) return prev.filter(i => i.id !== menuId)
      return prev.map(i => i.id === menuId ? {...i, qty: i.qty + delta} : i)
    })
  }

  function removeFromCart(menuId) {
    setCart(prev => prev.filter(i => i.id !== menuId))
  }

  async function callStaff() {
    if (!tableUUID) return alert('테이블 정보를 찾을 수 없어요')
    const { error } = await supabase.from('staff_calls').insert({
      table_id: tableUUID, table_number: parseInt(tableId), status: 'pending'
    })
    if (!error) alert('직원을 호출했어요! 잠시만 기다려주세요 🙏')
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
    setOrderId(order.id); setOrderStatus('ordered'); setCart([]); setRecommendations([]); setShowCart(false)
    fetchMenus(); fetchWaitCounts()
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

        {/* 주문 완료 팝업 */}
        {orderStatus && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,16,.55)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="pop-in" style={{ background: 'var(--paper)', borderRadius: '16px', maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
              <div style={{ padding: '36px 28px', textAlign: 'center' }}>
                {orderStatus === 'ordered' ? (
                  <>
                    <div style={{ fontSize: '64px', marginBottom: '12px' }}>🧾</div>
                    <div style={{ fontWeight: 700, fontSize: '22px', marginBottom: '8px' }}>주문 접수!</div>
                    <div style={{ fontSize: '14px', color: 'var(--ink-soft)', marginBottom: '24px' }}>주방에서 정성껏 준비 중이에요 😊</div>
                    <button onClick={() => setOrderStatus(null)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>확인</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '64px', marginBottom: '12px', animation: 'bounce .6s' }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: '22px', marginBottom: '8px' }}>준비 완료!</div>
                    <div style={{ fontSize: '14px', color: 'var(--ink-soft)', marginBottom: '24px' }}>맛있게 드세요 🍽️</div>
                    <button onClick={() => { setOrderStatus(null); setOrderId(null) }} style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>감사합니다!</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 장바구니 수정 모달 */}
        {showCart && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,16,.55)', backdropFilter: 'blur(4px)', zIndex: 998, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div className="pop-in" style={{ background: 'var(--paper)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* 모달 헤더 */}
              <div style={{ padding: '20px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700, fontSize: '18px' }}>🛒 장바구니</span>
                <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', fontSize: '22px', color: 'var(--ink-soft)', cursor: 'pointer' }}>✕</button>
              </div>

              {/* 장바구니 아이템 */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '12px 24px' }}>
                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)', fontSize: '14px' }}>장바구니가 비었어요</div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                      {/* 이미지/이모지 */}
                      <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)', fontSize: '24px' }}>
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                          : getEmoji(item)
                        }
                      </div>
                      {/* 메뉴명 + 가격 */}
                      <div style={{ flex: 1, marginLeft: '12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>{getMenuName(item)}</div>
                        <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600, marginTop: '2px' }}>{(item.price * item.qty).toLocaleString()}원</div>
                      </div>
                      {/* 수량 조절 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button className="qty-btn" onClick={() => updateCartQty(item.id, -1)}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--line)', background: 'white', color: 'var(--ink)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                          −
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '16px', minWidth: '20px', textAlign: 'center' }}>{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateCartQty(item.id, 1)}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--line)', background: 'white', color: 'var(--ink)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                          +
                        </button>
                        <button onClick={() => removeFromCart(item.id)}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--bg-2)', color: 'var(--ink-soft)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {/* 추천 메뉴 */}
                {recommendations.length > 0 && cart.length > 0 && (
                  <div style={{ marginTop: '16px', padding: '14px', background: 'var(--bg-2)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '10px', fontWeight: 600 }}>🍽️ 함께 자주 주문해요</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {recommendations.map(rec => (
                        <button key={rec.id} onClick={() => addToCart(rec)}
                          style={{ padding: '8px 14px', background: 'white', border: '1px solid var(--line)', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
                          + {rec.name} {rec.price.toLocaleString()}원
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 모달 푸터 */}
              {cart.length > 0 && (
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', background: 'var(--paper)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--ink-soft)' }}>총 {totalQty}개</span>
                    <span style={{ fontWeight: 700, fontSize: '20px', color: 'var(--accent)' }}>{totalPrice.toLocaleString()}원</span>
                  </div>
                  <button onClick={submitOrder}
                    style={{ width: '100%', padding: '15px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '16px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    주문하기 →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 헤더 */}
        <header style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--line)', background: 'var(--paper)', position: 'sticky', top: 0, zIndex: 50, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '22px', letterSpacing: '-.02em', lineHeight: 1 }}>
                맛집<span style={{ color: 'var(--accent)' }}>.</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px' }}>
                Table {tableId}
                {businessHours && (
                  <span style={{ marginLeft: '10px', color: isOpen ? 'var(--green)' : 'var(--accent)', fontWeight: 600 }}>
                    {isOpen ? `● 영업중 ${businessHours.open_time.slice(0,5)}-${businessHours.close_time.slice(0,5)}` : '✕ 영업종료'}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {languages.map(lang => (
                <button key={lang.code} onClick={() => i18n.changeLanguage(lang.code)}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', border: i18n.language === lang.code ? '2px solid var(--accent)' : '2px solid transparent', background: 'var(--bg-2)', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                  {lang.flag}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 대기 현황 바 */}
        {(Object.values(waitCounts).reduce((a, b) => a + b, 0) > 0 || voiceText) && (
          <div style={{ display: 'flex', gap: '10px', padding: '8px 20px', background: 'linear-gradient(90deg, #f5ead4 0%, #f0e1c4 100%)', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
            {voiceText && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: 'var(--paper)', borderRadius: '999px', border: '1px solid var(--line)', whiteSpace: 'nowrap', fontSize: '13px' }}>
                🎤 <strong style={{ color: 'var(--accent)' }}>{voiceText}</strong>
              </div>
            )}
            {Object.values(waitCounts).reduce((a, b) => a + b, 0) > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', background: 'var(--paper)', borderRadius: '999px', border: '1px solid var(--line)', whiteSpace: 'nowrap', fontSize: '13px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                현재 <strong style={{ color: 'var(--accent)' }}>{Object.values(waitCounts).reduce((a, b) => a + b, 0)}건</strong> 대기 중
              </div>
            )}
          </div>
        )}

        {/* 카테고리 탭 */}
        <div style={{ display: 'flex', background: 'var(--paper)', borderBottom: '1px solid var(--line)', padding: '0 20px', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: '13px 18px', border: 'none', background: 'none',
              borderBottom: activeCategory === cat ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeCategory === cat ? 'var(--accent)' : 'var(--ink-soft)',
              fontWeight: activeCategory === cat ? 700 : 400,
              fontSize: '14px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
              fontFamily: 'inherit'
            }}>{getCategoryLabel(cat)}</button>
          ))}
        </div>

        {/* 메뉴 그리드 */}
        <main style={{ padding: '20px', paddingBottom: totalQty > 0 ? '120px' : '100px', maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
            {filtered.map((menu, idx) => {
              const inCart = cart.find(i => i.id === menu.id)
              return (
                <div key={menu.id} className="menu-card fade-up"
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
                  {!menu.is_available && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'var(--ink)', color: 'var(--paper)', padding: '3px 9px', borderRadius: '4px', fontWeight: 700, fontSize: '10px', letterSpacing: '.15em', transform: 'rotate(8deg)' }}>
                      SOLD OUT
                    </div>
                  )}
                  {inCart && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                      {inCart.qty}
                    </div>
                  )}
                  <div style={{ marginBottom: '10px' }}>
                    {menu.image_url ? (
                      <>
                        <img src={menu.image_url} alt={menu.name}
                          style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: '8px' }}
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
                        />
                        <div style={{ fontSize: '42px', lineHeight: 1, display: 'none' }}>{getEmoji(menu)}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: '42px', lineHeight: 1 }}>{getEmoji(menu)}</div>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '17px', lineHeight: 1.3, marginBottom: '6px' }}>
                    {getMenuName(menu)}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--line)', paddingTop: '10px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--accent)' }}>
                      {menu.price.toLocaleString()}원
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textAlign: 'right', lineHeight: 1.5 }}>
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

        {/* 직원 호출 버튼 */}
        <button onClick={callStaff} style={{
          position: 'fixed', right: '20px', bottom: totalQty > 0 ? '100px' : '20px',
          width: '56px', height: '56px', borderRadius: '50%', border: 'none',
          background: 'var(--gold)', color: 'white', fontSize: '22px',
          cursor: 'pointer', zIndex: 60,
          boxShadow: '0 8px 24px -4px rgba(177,136,82,.5)',
          transition: 'all .2s'
        }}>🔔</button>

        {/* 음성 주문 버튼 */}
        <button onClick={startVoice} style={{
          position: 'fixed', right: '20px', bottom: totalQty > 0 ? '165px' : '85px',
          width: '56px', height: '56px', borderRadius: '50%', border: 'none',
          background: listening ? 'var(--green)' : 'var(--accent)',
          color: 'white', fontSize: '24px', cursor: 'pointer', zIndex: 60,
          boxShadow: '0 8px 24px -4px rgba(176,74,47,.5)',
          animation: listening ? 'ringPulse 1.2s infinite' : 'none',
          transition: 'all .2s'
        }}>🎤</button>

        {/* 장바구니 하단 바 */}
        {totalQty > 0 && (
          <div onClick={() => setShowCart(true)} style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            background: 'var(--ink)', color: 'var(--paper)',
            padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '12px',
            zIndex: 55, cursor: 'pointer'
          }}>
            <div style={{ background: 'var(--accent)', color: 'white', minWidth: '26px', height: '26px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
              {totalQty}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', opacity: .7 }}>
                {cart.map(i => `${getMenuName(i)} ×${i.qty}`).join(' · ')}
              </div>
              <div style={{ fontWeight: 700, fontSize: '18px', marginTop: '1px' }}>
                {totalPrice.toLocaleString()}원
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={(e) => { e.stopPropagation(); setShowCart(true) }}
                style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.3)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                🛒 장바구니
              </button>
              <button onClick={(e) => { e.stopPropagation(); submitOrder() }}
                style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                주문하기 →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}