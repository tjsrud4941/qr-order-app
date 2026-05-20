import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f0eb; font-family: 'DM Sans', sans-serif; }
  .menu-card { transition: transform 0.2s, box-shadow 0.2s; }
  .menu-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.10); }
  .menu-card.sold-out { filter: grayscale(0.3); }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
  .fade-up { animation: fadeUp 0.35s ease both; }
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
`

export default function CustomerMenu() {
  const { tableId } = useParams()
  const { t, i18n } = useTranslation()
  const [menus, setMenus] = useState([])
  const [cart, setCart] = useState([])
  const [tableUUID, setTableUUID] = useState(null)
  const [waitCounts, setWaitCounts] = useState({})
  const [avgCookTimes, setAvgCookTimes] = useState({})
  const [listening, setListening] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [activeCategory, setActiveCategory] = useState('전체')
  const recognitionRef = useRef(null)

  useEffect(() => {
    fetchMenus()
    fetchTable()
    fetchWaitCounts()
    fetchAvgCookTimes()
  }, [])

  async function fetchMenus() {
    const { data } = await supabase.from('menus').select('*')
    setMenus(data || [])
  }

  async function fetchTable() {
    const { data } = await supabase
      .from('tables').select('id').eq('table_number', tableId).single()
    if (data) setTableUUID(data.id)
  }

  async function fetchWaitCounts() {
    const { data } = await supabase
      .from('order_items').select('menu_id, orders(status)')
      .in('orders.status', ['pending', 'cooking'])
    const counts = {}
    if (data) data.forEach(item => {
      if (item.orders) counts[item.menu_id] = (counts[item.menu_id] || 0) + 1
    })
    setWaitCounts(counts)
  }

  async function fetchAvgCookTimes() {
    const { data } = await supabase
      .from('orders')
      .select('created_at, completed_at, order_items(menu_id)')
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
    const totals = {}
    const counts = {}
    if (data) {
      data.forEach(order => {
        const actualMin = Math.round(
          (new Date(order.completed_at) - new Date(order.created_at)) / 60000
        )
        order.order_items?.forEach(item => {
          if (!totals[item.menu_id]) { totals[item.menu_id] = 0; counts[item.menu_id] = 0 }
          totals[item.menu_id] += actualMin
          counts[item.menu_id] += 1
        })
      })
    }
    const avgs = {}
    Object.keys(totals).forEach(id => {
      avgs[id] = Math.round(totals[id] / counts[id])
    })
    setAvgCookTimes(avgs)
  }

  function getMenuName(menu) {
    if (i18n.language === 'en') return menu.name_en || menu.name
    if (i18n.language === 'zh') return menu.name_zh || menu.name
    if (i18n.language === 'ja') return menu.name_ja || menu.name
    return menu.name
  }

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
  }

  function removeFromCart(menuId) {
    setCart(prev => {
      const item = prev.find(i => i.id === menuId)
      if (item?.qty === 1) return prev.filter(i => i.id !== menuId)
      return prev.map(i => i.id === menuId ? {...i, qty: i.qty - 1} : i)
    })
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
      const matched = menus.filter(m =>
        [m.name, m.name_en, m.name_zh, m.name_ja].some(n => n && text.includes(n))
      )
      if (!matched.length) return alert(`"${text}" 에 해당하는 메뉴를 찾지 못했어요`)
      matched.forEach(m => { if (m.is_available) addToCart(m) })
      alert(`🎤 ${matched.map(m => m.name).join(', ')} 담았어요!`)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    r.start()
  }

  async function submitOrder() {
    if (!tableUUID) return alert(t('tableNotFound'))
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
    const { data: order } = await supabase
      .from('orders').insert({ table_id: tableUUID, total_price: total }).select().single()
    await supabase.from('order_items').insert(
      cart.map(i => ({ order_id: order.id, menu_id: i.id, quantity: i.qty, price: i.price }))
    )
    for (const item of cart) {
      const newStock = item.stock - item.qty
      await supabase.from('menus').update({ stock: newStock, is_available: newStock > 0 }).eq('id', item.id)
    }
    setCart([])
    alert(t('orderComplete'))
    fetchMenus()
    fetchWaitCounts()
    fetchAvgCookTimes()
  }

  const languages = [{ code: 'ko', label: '한' }, { code: 'en', label: 'EN' }, { code: 'zh', label: '中' }, { code: 'ja', label: '日' }]
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
      <div style={{ minHeight: '100vh', background: '#f5f0eb', display: 'flex', flexDirection: 'column' }}>

        {/* 헤더 */}
        <header style={{ background: '#1c1814', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontFamily: 'Cormorant Garamond', color: '#d4b896', fontSize: '26px', fontWeight: 600, letterSpacing: '0.05em' }}>CAFÉ</span>
            <span style={{ color: '#6b5c4e', fontSize: '13px' }}>Table {tableId}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={startVoice} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px', borderRadius: '20px', border: 'none',
              background: listening ? '#8b2020' : '#2e2620',
              color: listening ? '#ffcccc' : '#d4b896',
              fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans',
              animation: listening ? 'pulse 1s infinite' : 'none'
            }}>
              🎤 {listening ? t('listening') : t('voiceOrder')}
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              {languages.map(lang => (
                <button key={lang.code} onClick={() => i18n.changeLanguage(lang.code)} style={{
                  width: '30px', height: '30px', borderRadius: '50%', border: 'none',
                  background: i18n.language === lang.code ? '#d4b896' : '#2e2620',
                  color: i18n.language === lang.code ? '#1c1814' : '#888',
                  cursor: 'pointer', fontSize: '11px', fontWeight: 600
                }}>{lang.label}</button>
              ))}
            </div>
          </div>
        </header>

        {voiceText && (
          <div style={{ background: '#fff8f0', borderBottom: '1px solid #e8ddd4', padding: '10px 32px', fontSize: '13px', color: '#8b6347' }}>
            🎤 {t('voiceResult')}: "{voiceText}"
          </div>
        )}

        {/* 카테고리 탭 */}
        <div style={{ background: 'white', borderBottom: '1px solid #e8ddd4', padding: '0 32px', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeCategory === cat ? '2px solid #1c1814' : '2px solid transparent',
              color: activeCategory === cat ? '#1c1814' : '#999',
              fontSize: '14px', fontWeight: activeCategory === cat ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans',
              transition: 'all 0.15s'
            }}>{getCategoryLabel(cat)}</button>

            
          ))}
        </div>

        {/* 메뉴 그리드 */}
        <main style={{ flex: 1, padding: '28px 32px', paddingBottom: totalQty > 0 ? '120px' : '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {filtered.map((menu, idx) => {
              const inCart = cart.find(i => i.id === menu.id)
              return (
                <div key={menu.id} className={`menu-card fade-up ${!menu.is_available ? 'sold-out' : ''}`}
                  onClick={() => addToCart(menu)}
                  style={{
                    background: 'white', borderRadius: '16px', padding: '24px',
                    cursor: menu.is_available ? 'pointer' : 'not-allowed',
                    border: inCart ? '2px solid #1c1814' : '2px solid transparent',
                    position: 'relative', animationDelay: `${idx * 0.04}s`
                  }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '12px 0 8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 600, color: '#1c1814', fontFamily: 'DM Sans', lineHeight: 1.3 }}>
                      {getMenuName(menu)}
                    </span>
                    <span style={{ fontSize: '17px', fontWeight: 600, color: '#1c1814', marginLeft: '12px', whiteSpace: 'nowrap' }}>
                      {menu.price.toLocaleString()}원
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {!menu.is_available ? (
                      <span style={{ fontSize: '12px', color: '#c0392b', background: '#fdecea', padding: '3px 10px', borderRadius: '10px' }}>
                        {t('soldOut')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#7a6a5a', background: '#f5f0eb', padding: '3px 10px', borderRadius: '10px' }}>
                        ⏱ {avgCookTimes[menu.id]
                          ? t('cookTimeAI', { min: getEstimatedTime(menu) })
                          : t('cookTime', { min: getEstimatedTime(menu) })}
                      </span>
                    )}
                    {waitCounts[menu.id] > 0 && (
                      <span style={{ fontSize: '12px', color: '#b07d3a', background: '#fef3e2', padding: '3px 10px', borderRadius: '10px' }}>
                        {t('waiting', { count: waitCounts[menu.id] })}
                      </span>
                    )}
                    {menu.is_available && menu.stock < 10 && (
                      <span style={{ fontSize: '12px', color: '#2e7d52', background: '#e8f5ee', padding: '3px 10px', borderRadius: '10px' }}>
                        {t('stock', { count: menu.stock })}
                      </span>
                    )}
                  </div>
                  {inCart && (
                    <div style={{ position: 'absolute', top: '16px', right: '16px', background: '#1c1814', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>
                      {inCart.qty}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </main>

        {/* 주문 하단 바 */}
        {totalQty > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1c1814', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
            <div>
              <div style={{ color: '#d4b896', fontSize: '13px', marginBottom: '2px' }}>
                {cart.map(i => `${getMenuName(i)} ×${i.qty}`).join('  ·  ')}
              </div>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 700 }}>
                {totalPrice.toLocaleString()}원
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button onClick={() => setCart([])} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #3a3028', background: 'none', color: '#888', fontSize: '13px', cursor: 'pointer' }}>
                {t('cancel')}
              </button>
              <button onClick={submitOrder} style={{ padding: '12px 28px', borderRadius: '12px', border: 'none', background: '#d4b896', color: '#1c1814', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans' }}>
                {t('order')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}