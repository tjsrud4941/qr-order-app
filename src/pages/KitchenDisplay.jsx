import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f0eb; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px);} to { opacity:1; transform:translateY(0);} }
  .order-card { animation: fadeUp 0.3s ease both; transition: transform 0.2s, box-shadow 0.2s; }
  .order-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.10); }
  @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
  .pending-dot { animation: blink 1.2s infinite; }
`

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([])
  const [waitCount, setWaitCount] = useState(0)
  const [cookingCount, setCookingCount] = useState(0)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    fetchOrders()
    const subscription = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => { supabase.removeChannel(subscription); clearInterval(timer) }
  }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menus(name))')
      .in('status', ['pending', 'cooking'])
      .order('created_at', { ascending: true })
    setOrders(data || [])
    setWaitCount(data?.filter(o => o.status === 'pending').length || 0)
    setCookingCount(data?.filter(o => o.status === 'cooking').length || 0)
  }

  async function updateStatus(orderId, status) {
    const updateData = { status }
    if (status === 'done') {
      updateData.completed_at = new Date().toISOString()
    }
    await supabase.from('orders').update(updateData).eq('id', orderId)
    fetchOrders()
  }

  function getElapsed(createdAt) {
    const diff = Math.floor((new Date() - new Date(createdAt)) / 1000)
    if (diff < 60) return `${diff}초 전`
    return `${Math.floor(diff / 60)}분 전`
  }

  const pending = orders.filter(o => o.status === 'pending')
  const cooking = orders.filter(o => o.status === 'cooking')

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb' }}>

        {/* 헤더 */}
        <header style={{ background: '#1c1814', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontFamily: 'Cormorant Garamond', color: '#d4b896', fontSize: '24px', fontWeight: 600 }}>
              주방 디스플레이
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ background: '#fff3e0', color: '#e65100', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
                대기 {waitCount}건
              </span>
              <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
                조리중 {cookingCount}건
              </span>
            </div>
          </div>
          <div style={{ color: '#a08060', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
            {currentTime.toLocaleTimeString('ko-KR')}
          </div>
        </header>

        <main style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

          {/* 대기 컬럼 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span className="pending-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e65100', display: 'inline-block' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#e65100', letterSpacing: '0.05em' }}>대기중</span>
            </div>
            {pending.length === 0 && (
              <div style={{ color: '#bbb', fontSize: '14px', padding: '40px', textAlign: 'center', border: '2px dashed #e8ddd4', borderRadius: '16px', background: 'white' }}>
                대기 주문 없음
              </div>
            )}
            {pending.map((order, idx) => (
              <div key={order.id} className="order-card"
                style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '12px', borderLeft: '4px solid #ff9800', animationDelay: `${idx * 0.05}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1c1814' }}>
                    #{order.id.slice(-4).toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: '#aaa', background: '#f5f0eb', padding: '3px 10px', borderRadius: '10px' }}>
                    {getElapsed(order.created_at)}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: '16px' }}>
                  {order.order_items?.map(item => (
                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0ebe4', fontSize: '14px', color: '#444' }}>
                      <span>{item.menus?.name}</span>
                      <span style={{ color: '#a08060', fontWeight: 600 }}>×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => updateStatus(order.id, 'cooking')}
                  style={{ width: '100%', padding: '12px', background: '#1c1814', color: '#d4b896', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans' }}>
                  조리 시작 →
                </button>
              </div>
            ))}
          </div>

          {/* 조리중 컬럼 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1565c0', display: 'inline-block' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#1565c0', letterSpacing: '0.05em' }}>조리중</span>
            </div>
            {cooking.length === 0 && (
              <div style={{ color: '#bbb', fontSize: '14px', padding: '40px', textAlign: 'center', border: '2px dashed #e8ddd4', borderRadius: '16px', background: 'white' }}>
                조리중인 주문 없음
              </div>
            )}
            {cooking.map((order, idx) => (
              <div key={order.id} className="order-card"
                style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '12px', borderLeft: '4px solid #2196F3', animationDelay: `${idx * 0.05}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1c1814' }}>
                    #{order.id.slice(-4).toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: '#aaa', background: '#f5f0eb', padding: '3px 10px', borderRadius: '10px' }}>
                    {getElapsed(order.created_at)}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: '16px' }}>
                  {order.order_items?.map(item => (
                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0ebe4', fontSize: '14px', color: '#444' }}>
                      <span>{item.menus?.name}</span>
                      <span style={{ color: '#5b8dd9', fontWeight: 600 }}>×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => updateStatus(order.id, 'done')}
                  style={{ width: '100%', padding: '12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans' }}>
                  완료 ✓
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </>
  )
}