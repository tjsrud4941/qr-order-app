import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f0eb; font-family: 'DM Sans', sans-serif; }
`

const COLORS = ['#1c1814', '#d4b896', '#4CAF50', '#2196F3', '#ff9800', '#e91e63']

export default function Dashboard() {
  const [orders, setOrders] = useState([])
  const [hourlyData, setHourlyData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [menuData, setMenuData] = useState([])
  const [stats, setStats] = useState({ total: 0, count: 0, avg: 0, topMenu: '' })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, price, menus(name))')
      .eq('status', 'done')
      .order('created_at', { ascending: true })

    if (!data) return
    setOrders(data)
    processData(data)
  }

  function processData(data) {
    // 총 매출 통계
    const total = data.reduce((s, o) => s + o.total_price, 0)
    const count = data.length
    const avg = count > 0 ? Math.round(total / count) : 0

    // 시간대별 매출
    const hourly = {}
    data.forEach(order => {
      const hour = new Date(order.created_at).getHours()
      const label = `${hour}시`
      if (!hourly[label]) hourly[label] = { time: label, 매출: 0, 주문수: 0 }
      hourly[label].매출 += order.total_price
      hourly[label].주문수 += 1
    })
    setHourlyData(Object.values(hourly).sort((a, b) => parseInt(a.time) - parseInt(b.time)))

    // 요일별 매출
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const daily = {}
    data.forEach(order => {
      const day = days[new Date(order.created_at).getDay()]
      if (!daily[day]) daily[day] = { day, 매출: 0, 주문수: 0 }
      daily[day].매출 += order.total_price
      daily[day].주문수 += 1
    })
    setDailyData(days.map(d => daily[d] || { day: d, 매출: 0, 주문수: 0 }))

    // 메뉴별 판매량
    const menuCount = {}
    data.forEach(order => {
      order.order_items?.forEach(item => {
        const name = item.menus?.name || '알 수 없음'
        if (!menuCount[name]) menuCount[name] = { name, 판매수: 0, 매출: 0 }
        menuCount[name].판매수 += item.quantity
        menuCount[name].매출 += item.price * item.quantity
      })
    })
    const menuArr = Object.values(menuCount).sort((a, b) => b.판매수 - a.판매수)
    setMenuData(menuArr)

    const topMenu = menuArr[0]?.name || '-'
    setStats({ total, count, avg, topMenu })
  }

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb' }}>

        {/* 헤더 */}
        <header style={{ background: '#1c1814', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <span style={{ fontFamily: 'Cormorant Garamond', color: '#d4b896', fontSize: '24px', fontWeight: 600 }}>
            매출 대시보드
          </span>
          <button onClick={fetchData} style={{ padding: '7px 16px', borderRadius: '20px', border: 'none', background: '#2e2620', color: '#d4b896', fontSize: '13px', cursor: 'pointer' }}>
            새로고침
          </button>
        </header>

        <main style={{ padding: '28px 32px' }}>

          {/* 핵심 지표 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
            {[
              { label: '총 매출', value: `${stats.total.toLocaleString()}원`, icon: '💰' },
              { label: '총 주문수', value: `${stats.count}건`, icon: '📋' },
              { label: '평균 주문금액', value: `${stats.avg.toLocaleString()}원`, icon: '📊' },
              { label: '인기 메뉴', value: stats.topMenu, icon: '🏆' },
            ].map((item, idx) => (
              <div key={idx} style={{ background: 'white', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{item.icon}</div>
                <div style={{ fontSize: '13px', color: '#a08060', marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1c1814' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 시간대별 매출 */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1814', marginBottom: '20px' }}>⏰ 시간대별 매출</h3>
            {hourlyData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bbb', padding: '40px' }}>데이터가 없어요</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe4" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => `${value.toLocaleString()}원`} />
                  <Legend />
                  <Line type="monotone" dataKey="매출" stroke="#1c1814" strokeWidth={2} dot={{ fill: '#d4b896' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* 요일별 주문수 */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1814', marginBottom: '20px' }}>📅 요일별 주문수</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe4" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="주문수" fill="#d4b896" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 메뉴별 판매 비율 */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1814', marginBottom: '20px' }}>🍽️ 메뉴별 판매 비율</h3>
              {menuData.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#bbb', padding: '40px' }}>데이터가 없어요</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={menuData} dataKey="판매수" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                      {menuData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 메뉴별 매출 순위 */}
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1814', marginBottom: '20px' }}>🏆 메뉴별 매출 순위</h3>
            {menuData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bbb', padding: '40px' }}>데이터가 없어요</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={menuData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe4" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={v => `${v.toLocaleString()}원`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip formatter={(value) => `${value.toLocaleString()}원`} />
                  <Bar dataKey="매출" fill="#1c1814" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </main>
      </div>
    </>
  )
}