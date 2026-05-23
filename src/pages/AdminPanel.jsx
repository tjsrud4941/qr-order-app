import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');
  :root {
    --bg: #1a1410; --panel: #241c16; --panel-2: #2e2520;
    --ink: #f5ead4; --ink-soft: #b09c84; --line: #3d3128;
    --accent: #e0a36b; --green: #88c070; --red: #e07060; --gold: #d4b070;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans KR", sans-serif; background: var(--bg); color: var(--ink); }
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  .menu-row { animation: fadeUp .3s ease both; transition: box-shadow .2s; }
  .menu-row:hover { box-shadow: 0 6px 20px rgba(0,0,0,.2); }
  .toggle-btn { transition: all .2s; }
  .toggle-btn:hover { opacity: .85; transform: scale(1.03); }
  input:focus, select:focus { outline: none; border-color: var(--accent) !important; }
`

const COLORS = ['#e0a36b', '#88c070', '#d4b070', '#e07060', '#7ab8d4', '#c084e0']

export default function AdminPanel() {
  const [menus, setMenus] = useState([])
  const [activeCategory, setActiveCategory] = useState('전체')
  const [saving, setSaving] = useState(null)
  const [staffCalls, setStaffCalls] = useState([])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [newMenu, setNewMenu] = useState({
    name: '', name_en: '', name_zh: '', name_ja: '',
    price: '', category: '음료', cook_time: 5, stock: 99
  })
  const [hourlyData, setHourlyData] = useState([])
  const [menuData, setMenuData] = useState([])
  const [stats, setStats] = useState({ total: 0, count: 0, avg: 0, topMenu: '' })
  const [predictions, setPredictions] = useState({
    tomorrowOrders: 0, peakTime: '-',
    timeSlotMenus: [
      { label: '오전', range: '09-12시', top: [] },
      { label: '점심', range: '12-14시', top: [] },
      { label: '오후', range: '14-18시', top: [] },
      { label: '저녁', range: '18-22시', top: [] },
    ],
    dayMenus: [
      { day: '월', top: [] }, { day: '화', top: [] }, { day: '수', top: [] },
      { day: '목', top: [] }, { day: '금', top: [] }, { day: '토', top: [] }, { day: '일', top: [] }
    ]
  })

  useEffect(() => {
    fetchMenus()
    fetchDashboardData()
    fetchStaffCalls()
    const sub = supabase.channel('staff_calls_admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_calls' }, fetchStaffCalls)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function fetchMenus() {
    const { data } = await supabase.from('menus').select('*').order('created_at')
    setMenus(data || [])
  }

  async function fetchStaffCalls() {
    const { data } = await supabase.from('staff_calls').select('*').eq('status', 'pending').order('created_at', { ascending: false })
    setStaffCalls(data || [])
  }

  async function dismissStaffCall(id) {
    await supabase.from('staff_calls').update({ status: 'done' }).eq('id', id)
    fetchStaffCalls()
  }

  async function addMenu() {
    if (!newMenu.name || !newMenu.price) return alert('메뉴명과 가격은 필수예요!')
    await supabase.from('menus').insert({
      name: newMenu.name,
      name_en: newMenu.name_en || newMenu.name,
      name_zh: newMenu.name_zh || newMenu.name,
      name_ja: newMenu.name_ja || newMenu.name,
      price: parseInt(newMenu.price),
      category: newMenu.category,
      cook_time: parseInt(newMenu.cook_time),
      stock: parseInt(newMenu.stock),
      is_available: true,
    })
    setNewMenu({ name: '', name_en: '', name_zh: '', name_ja: '', price: '', category: '음료', cook_time: 5, stock: 99 })
    setShowAddMenu(false)
    fetchMenus()
  }

  async function fetchDashboardData() {
    const { data: ordersData } = await supabase
      .from('orders').select('*, order_items(quantity, price, menus(name))').eq('status', 'done').order('created_at', { ascending: true })
    if (!ordersData) return

    const total = ordersData.reduce((s, o) => s + o.total_price, 0)
    const count = ordersData.length
    const avg = count > 0 ? Math.round(total / count) : 0

    const hourly = {}
    ordersData.forEach(order => {
      const hour = new Date(order.created_at).getHours()
      const label = `${hour}시`
      if (!hourly[label]) hourly[label] = { time: label, 주문수: 0 }
      hourly[label].주문수 += 1
    })
    setHourlyData(Object.values(hourly).sort((a, b) => parseInt(a.time) - parseInt(b.time)))

    const menuCount = {}
    ordersData.forEach(order => {
      order.order_items?.forEach(item => {
        const name = item.menus?.name || '알 수 없음'
        if (!menuCount[name]) menuCount[name] = { name, 판매수: 0, 매출: 0 }
        menuCount[name].판매수 += item.quantity
        menuCount[name].매출 += item.price * item.quantity
      })
    })
    const menuArr = Object.values(menuCount).sort((a, b) => b.판매수 - a.판매수)
    setMenuData(menuArr)
    setStats({ total, count, avg, topMenu: menuArr[0]?.name || '-' })

    try {
      const BASE = 'http://127.0.0.1:8000'
      const [tomorrow, peaktime, timeslot, dayofweek] = await Promise.all([
        fetch(`${BASE}/predict/tomorrow`).then(r => r.json()),
        fetch(`${BASE}/predict/peaktime`).then(r => r.json()),
        fetch(`${BASE}/predict/timeslot`).then(r => r.json()),
        fetch(`${BASE}/predict/dayofweek`).then(r => r.json()),
      ])
      setPredictions({
        tomorrowOrders: tomorrow.expected_orders || 0,
        peakTime: peaktime.peak_label || '-',
        timeSlotMenus: timeslot.timeslots || [],
        dayMenus: dayofweek.days || []
      })
    } catch (e) { console.error('AI API 오류:', e) }
  }

  async function toggleAvailable(menu) {
    setSaving(menu.id)
    await supabase.from('menus').update({ is_available: !menu.is_available }).eq('id', menu.id)
    await fetchMenus(); setSaving(null)
  }
  async function updateStock(menu, value) {
    const stock = parseInt(value)
    if (isNaN(stock)) return
    setSaving(menu.id)
    await supabase.from('menus').update({ stock, is_available: stock > 0 }).eq('id', menu.id)
    await fetchMenus(); setSaving(null)
  }
  async function updateCookTime(menu, value) {
    const cook_time = parseInt(value)
    if (isNaN(cook_time)) return
    await supabase.from('menus').update({ cook_time }).eq('id', menu.id)
    await fetchMenus()
  }
  async function updateImageUrl(menu, value) {
    await supabase.from('menus').update({ image_url: value }).eq('id', menu.id)
    fetchMenus()
  }

  const categories = ['전체', ...new Set(menus.map(m => m.category).filter(Boolean))]
  const filtered = activeCategory === '전체' ? menus : menus.filter(m => m.category === activeCategory)
  const soldOutCount = menus.filter(m => !m.is_available).length

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: 'var(--panel-2)',
    border: '1px solid var(--line)', borderRadius: '8px',
    color: 'var(--ink)', fontSize: '14px', fontFamily: 'inherit'
  }
  const labelStyle = {
    fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '4px',
    textTransform: 'uppercase', letterSpacing: '.1em', display: 'block'
  }

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

        {/* 헤더 */}
        <header style={{ padding: '18px 28px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel)' }}>
          <div>
            <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '24px', letterSpacing: '-.02em' }}>
              맛집<span style={{ color: 'var(--accent)' }}>.</span> <span style={{ fontWeight: 300, color: 'var(--ink-soft)' }}>대시보드</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', letterSpacing: '.2em', textTransform: 'uppercase', marginTop: '2px' }}>Owner Dashboard</div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setShowAddMenu(true)}
              style={{ padding: '8px 18px', background: 'var(--accent)', color: '#1a1410', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + 메뉴 추가
            </button>
            {soldOutCount > 0 && (
              <span style={{ padding: '6px 14px', borderRadius: '999px', background: 'rgba(224,112,96,.15)', color: 'var(--red)', fontSize: '12px', fontWeight: 600 }}>
                품절 {soldOutCount}개
              </span>
            )}
            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>총 {menus.length}개 메뉴</span>
          </div>
        </header>

        {/* 직원 호출 알림 */}
        {staffCalls.length > 0 && (
          <div style={{ background: 'rgba(212,176,112,.15)', borderBottom: '1px solid var(--line)', padding: '12px 28px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>🔔 직원 호출</span>
            {staffCalls.map(call => (
              <div key={call.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--panel-2)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--gold)' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink)' }}>Table {call.table_number}</span>
                <button onClick={() => dismissStaffCall(call.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: '14px', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* 메뉴 추가 모달 */}
        {showAddMenu && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'var(--panel)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', border: '1px solid var(--line)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '20px' }}>메뉴 추가</span>
                <button onClick={() => setShowAddMenu(false)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: '24px', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: '메뉴명 (한국어) *', key: 'name', placeholder: '아메리카노' },
                  { label: '메뉴명 (영어)', key: 'name_en', placeholder: 'Americano' },
                  { label: '메뉴명 (중국어)', key: 'name_zh', placeholder: '美式咖啡' },
                  { label: '메뉴명 (일본어)', key: 'name_ja', placeholder: 'アメリカーノ' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={labelStyle}>{field.label}</label>
                    <input value={newMenu[field.key]} onChange={e => setNewMenu({...newMenu, [field.key]: e.target.value})}
                      placeholder={field.placeholder} style={inputStyle} />
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>가격 *</label>
                    <input type="number" value={newMenu.price} onChange={e => setNewMenu({...newMenu, price: e.target.value})}
                      placeholder="3000" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>조리시간(분)</label>
                    <input type="number" value={newMenu.cook_time} onChange={e => setNewMenu({...newMenu, cook_time: e.target.value})}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>재고</label>
                    <input type="number" value={newMenu.stock} onChange={e => setNewMenu({...newMenu, stock: e.target.value})}
                      style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>카테고리</label>
                  <select value={newMenu.category} onChange={e => setNewMenu({...newMenu, category: e.target.value})} style={inputStyle}>
                    <option value="음료">음료</option>
                    <option value="푸드">푸드</option>
                  </select>
                </div>
                <button onClick={addMenu}
                  style={{ width: '100%', padding: '14px', background: 'var(--accent)', color: '#1a1410', border: 'none', borderRadius: '10px', fontFamily: 'inherit', fontWeight: 700, fontSize: '15px', cursor: 'pointer', marginTop: '4px' }}>
                  + 메뉴 추가
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', padding: '22px 28px', background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
          {[
            { label: '총 매출', value: `${stats.total.toLocaleString()}`, unit: '원', color: 'var(--accent)' },
            { label: '총 주문수', value: stats.count, unit: '건', color: 'var(--green)' },
            { label: '평균 주문금액', value: `${stats.avg.toLocaleString()}`, unit: '원', color: 'var(--gold)' },
            { label: '인기 메뉴', value: stats.topMenu || '-', unit: '', color: 'var(--ink)' },
          ].map((stat, idx) => (
            <div key={idx} style={{ background: 'var(--panel-2)', padding: '18px', borderRadius: '12px', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: idx === 3 ? '20px' : '32px', lineHeight: 1.1, marginTop: '6px', color: stat.color }}>
                {stat.value}<span style={{ fontSize: '14px' }}>{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '22px 28px' }}>

          {/* AI 예측 */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden', marginBottom: '22px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '18px' }}>🤖 Python AI 예측</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--panel-2)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '8px' }}>내일 예상 주문수</div>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '40px', color: 'var(--green)', lineHeight: 1 }}>{predictions.tomorrowOrders}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>건 예상</div>
                </div>
                <div style={{ background: 'var(--panel-2)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '8px' }}>예상 피크타임</div>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '40px', color: 'var(--gold)', lineHeight: 1 }}>{predictions.peakTime}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>가장 바쁜 시간</div>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '10px' }}>⏰ 시간대별 인기 메뉴</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {predictions.timeSlotMenus.map((slot, idx) => (
                    <div key={idx} style={{ background: 'var(--panel-2)', borderRadius: '10px', padding: '12px', border: '1px solid var(--line)' }}>
                      <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px' }}>{slot.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ink-soft)', marginBottom: '8px' }}>{slot.range}</div>
                      {slot.top.length === 0 ? <div style={{ fontSize: '11px', color: 'var(--line)' }}>데이터 없음</div> :
                        slot.top.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                            <span style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {item.name}</span>
                            <span style={{ color: 'var(--accent)' }}>{item.count}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '10px' }}>📅 요일별 인기 메뉴</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                  {predictions.dayMenus.map((d, idx) => (
                    <div key={idx} style={{ background: 'var(--panel-2)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid var(--line)' }}>
                      <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '13px', color: 'var(--gold)', marginBottom: '6px' }}>{d.day}</div>
                      {d.top.length === 0 ? <div style={{ fontSize: '10px', color: 'var(--line)' }}>-</div> :
                        d.top.slice(0, 2).map((item, i) => (
                          <div key={i} style={{ fontSize: '10px', color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)', marginBottom: '2px' }}>{item.name}</div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 차트 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px', marginBottom: '22px' }}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '18px' }}>⏰ 시간대별 주문수</div>
              </div>
              <div style={{ padding: '14px 20px' }}>
                {hourlyData.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: 'var(--ink-soft)', fontSize: '14px' }}>데이터 없음</div> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                      <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }} />
                      <Line type="monotone" dataKey="주문수" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--gold)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '18px' }}>🍽️ 메뉴별 판매 비율</div>
              </div>
              <div style={{ padding: '14px 20px' }}>
                {menuData.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: 'var(--ink-soft)', fontSize: '14px' }}>데이터 없음</div> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={menuData} dataKey="판매수" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: 'var(--ink-soft)' }}>
                        {menuData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* 메뉴 관리 */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '18px' }}>메뉴 관리</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    padding: '5px 14px', border: '1px solid', borderColor: activeCategory === cat ? 'var(--accent)' : 'var(--line)',
                    borderRadius: '999px', background: activeCategory === cat ? 'rgba(224,163,107,.15)' : 'none',
                    color: activeCategory === cat ? 'var(--accent)' : 'var(--ink-soft)',
                    fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>{cat}</button>
                ))}
              </div>
            </div>

            {/* 테이블 헤더 */}
            <div style={{ padding: '10px 20px', display: 'grid', gridTemplateColumns: '1fr 150px 100px 120px 120px 100px', gap: '12px', color: 'var(--ink-soft)', fontSize: '11px', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--line)', background: 'var(--panel-2)' }}>
              <span>메뉴명</span>
              <span style={{ textAlign: 'center' }}>이미지 URL</span>
              <span style={{ textAlign: 'center' }}>가격</span>
              <span style={{ textAlign: 'center' }}>재고</span>
              <span style={{ textAlign: 'center' }}>조리시간(분)</span>
              <span style={{ textAlign: 'center' }}>상태</span>
            </div>

            {/* 메뉴 목록 */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {filtered.map((menu, idx) => (
                <div key={menu.id} className="menu-row"
                  style={{
                    padding: '14px 20px', display: 'grid',
                    gridTemplateColumns: '1fr 150px 100px 120px 120px 100px',
                    gap: '12px', alignItems: 'center',
                    opacity: menu.is_available ? 1 : 0.5,
                    animationDelay: `${idx * 0.04}s`,
                    borderLeft: menu.is_available ? '3px solid var(--green)' : '3px solid var(--line)',
                    borderBottom: idx < filtered.length - 1 ? '1px solid var(--line)' : 'none'
                  }}>

                  {/* 메뉴명 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {menu.image_url ? (
                      <img src={menu.image_url} alt={menu.name}
                        style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                        onError={e => e.target.style.display = 'none'} />
                    ) : (
                      <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'var(--panel-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🍽️</div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>{menu.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>{menu.category}</div>
                    </div>
                  </div>

                  {/* 이미지 URL */}
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="text"
                      defaultValue={menu.image_url || ''}
                      key={menu.image_url}
                      placeholder="이미지 URL"
                      onBlur={e => updateImageUrl(menu, e.target.value)}
                      style={{ width: '130px', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '11px', background: 'var(--panel-2)', color: 'var(--ink)', fontFamily: 'inherit' }}
                    />
                  </div>

                  {/* 가격 */}
                  <div style={{ textAlign: 'center', fontFamily: 'inherit', fontWeight: 700, fontSize: '15px', color: 'var(--accent)' }}>
                    {menu.price.toLocaleString()}원
                  </div>

                  {/* 재고 */}
                  <div style={{ textAlign: 'center' }}>
                    <input type="number" defaultValue={menu.stock} key={menu.stock}
                      onBlur={e => updateStock(menu, e.target.value)}
                      style={{ width: '80px', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '14px', textAlign: 'center', background: 'var(--panel-2)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                  </div>

                  {/* 조리시간 */}
                  <div style={{ textAlign: 'center' }}>
                    <input type="number" defaultValue={menu.cook_time} key={menu.cook_time}
                      onBlur={e => updateCookTime(menu, e.target.value)}
                      style={{ width: '80px', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '14px', textAlign: 'center', background: 'var(--panel-2)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                  </div>

                  {/* 상태 */}
                  <div style={{ textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button className="toggle-btn" onClick={() => toggleAvailable(menu)} disabled={saving === menu.id}
                      style={{
                        padding: '6px 14px', borderRadius: '999px', border: 'none',
                        background: menu.is_available ? 'rgba(136,192,112,.18)' : 'rgba(224,112,96,.18)',
                        color: menu.is_available ? 'var(--green)' : 'var(--red)',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minWidth: '68px'
                      }}>
                      {saving === menu.id ? '...' : menu.is_available ? '판매중' : '품절'}
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`${menu.name} 삭제할까요?`)) return
                      await supabase.from('menus').delete().eq('id', menu.id)
                      fetchMenus()
                    }}
                      style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: 'rgba(224,112,96,.18)', color: 'var(--red)', fontSize: '12px', cursor: 'pointer' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}