import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');
  :root {
    --bg: #1a1410; --panel: #241c16; --panel-2: #2e2520;
    --ink: #f5ead4; --ink-soft: #b09c84; --line: #3d3128;
    --accent: #e0a36b; --green: #88c070; --red: #e07060; --gold: #d4b070;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Sans KR", sans-serif; background: var(--bg); color: var(--ink); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes bellRing { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-15deg)} 40%{transform:rotate(15deg)} 60%{transform:rotate(-10deg)} 80%{transform:rotate(10deg)} }
  .order-card { animation: fadeUp .3s ease both; transition: transform .2s; }
  .order-card:hover { transform: translateY(-2px); }
  .blink { animation: pulse 1.2s infinite; }
  .bell-ring { animation: bellRing .6s ease; }
`

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([])
  const [waitCount, setWaitCount] = useState(0)
  const [cookingCount, setCookingCount] = useState(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [staffCalls, setStaffCalls] = useState([])
  const [bellRing, setBellRing] = useState(false)

  useEffect(() => {
    fetchOrders()
    fetchStaffCalls()

    const orderSub = supabase.channel('orders_kitchen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()

    const staffSub = supabase.channel('staff_calls_kitchen')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_calls' }, () => {
        fetchStaffCalls()
        setBellRing(true)
        setTimeout(() => setBellRing(false), 600)
      })
      .subscribe()

    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => {
      supabase.removeChannel(orderSub)
      supabase.removeChannel(staffSub)
      clearInterval(timer)
    }
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

  async function fetchStaffCalls() {
    const { data } = await supabase
      .from('staff_calls')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setStaffCalls(data || [])
  }

  async function dismissStaffCall(id) {
    await supabase.from('staff_calls').update({ status: 'done' }).eq('id', id)
    fetchStaffCalls()
  }

  async function updateStatus(orderId, status) {
    const updateData = { status }
    if (status === 'done') updateData.completed_at = new Date().toISOString()
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

        {/* 헤더 */}
        <header style={{ padding: '18px 28px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel)' }}>
          <div>
            <div style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: '24px', letterSpacing: '-.02em' }}>
              맛집<span style={{ color: 'var(--accent)' }}>.</span> <span style={{ fontWeight: 300, color: 'var(--ink-soft)' }}>주방</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', letterSpacing: '.2em', textTransform: 'uppercase', marginTop: '2px' }}>Kitchen Display</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '999px', background: 'rgba(136,192,112,.12)', fontSize: '12px', color: 'var(--green)' }}>
              <span className="blink" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              LIVE
            </div>
            <div style={{ color: 'var(--ink-soft)', fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
              {currentTime.toLocaleTimeString('ko-KR')}
            </div>
          </div>
        </header>

        {/* 직원 호출 알림 */}
        {staffCalls.length > 0 && (
          <div style={{ background: 'rgba(212,176,112,.15)', borderBottom: '1px solid var(--line)', padding: '12px 28px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={bellRing ? 'bell-ring' : ''} style={{ fontSize: '18px' }}>🔔</span>
            <span style={{ fontSize: '13px', color: 'var(--gold)', fontWeight: 600 }}>직원 호출</span>
            {staffCalls.map(call => (
              <div key={call.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--panel-2)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--gold)' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink)' }}>Table {call.table_number}</span>
                <button onClick={() => dismissStaffCall(call.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: '14px', padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* 통계 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', padding: '22px 28px', background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
          {[
            { label: '조리 중', value: cookingCount, color: 'var(--green)', unit: '건' },
            { label: '대기', value: waitCount, color: 'var(--gold)', unit: '건' },
            { label: '직원 호출', value: staffCalls.length, color: staffCalls.length > 0 ? 'var(--gold)' : 'var(--ink-soft)', unit: '건' },
          ].map((stat, idx) => (
            <div key={idx} style={{ background: 'var(--panel-2)', padding: '18px', borderRadius: '12px', border: `1px solid ${idx === 2 && staffCalls.length > 0 ? 'var(--gold)' : 'var(--line)'}` }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', letterSpacing: '.15em', textTransform: 'uppercase' }}>{stat.label}</div>
              <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '36px', lineHeight: 1.1, marginTop: '6px', color: stat.color }}>
                {stat.value} <span style={{ fontSize: '16px' }}>{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 주문 컬럼 */}
        <main style={{ padding: '22px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' }}>

          {/* 대기 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span className="blink" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '16px', color: 'var(--gold)', letterSpacing: '.1em', textTransform: 'uppercase' }}>대기중</span>
            </div>
            {pending.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)', fontSize: '14px', border: '1px dashed var(--line)', borderRadius: '12px' }}>
                대기 주문 없음
              </div>
            )}
            {pending.map((order, idx) => (
              <div key={order.id} className="order-card"
                style={{ padding: '14px', marginBottom: '12px', borderRadius: '10px', background: 'var(--panel-2)', borderLeft: '4px solid var(--gold)', animationDelay: `${idx * 0.05}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '22px' }}>
                    #{order.id.slice(-4).toUpperCase()}
                  </div>
                  <div style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(212,176,112,.18)', color: 'var(--gold)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    대기 중
                  </div>
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--ink-soft)', marginBottom: '8px' }}>
                  {order.order_items?.map(item => (
                    <div key={item.id}>
                      <strong style={{ color: 'var(--ink)' }}>{item.menus?.name}</strong> × {item.quantity}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px dashed var(--line)', fontSize: '12px', color: 'var(--ink-soft)' }}>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, color: 'var(--accent)', fontSize: '16px' }}>
                    {order.total_price?.toLocaleString()}원
                  </div>
                  <div>{getElapsed(order.created_at)}</div>
                </div>
                <button onClick={() => updateStatus(order.id, 'cooking')}
                  style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'var(--green)', color: '#1a1410', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  조리 시작 →
                </button>
              </div>
            ))}
          </div>

          {/* 조리중 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              <span style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '16px', color: 'var(--green)', letterSpacing: '.1em', textTransform: 'uppercase' }}>조리중</span>
            </div>
            {cooking.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-soft)', fontSize: '14px', border: '1px dashed var(--line)', borderRadius: '12px' }}>
                조리중인 주문 없음
              </div>
            )}
            {cooking.map((order, idx) => (
              <div key={order.id} className="order-card"
                style={{ padding: '14px', marginBottom: '12px', borderRadius: '10px', background: 'var(--panel-2)', borderLeft: '4px solid var(--green)', animationDelay: `${idx * 0.05}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '22px' }}>
                    #{order.id.slice(-4).toUpperCase()}
                  </div>
                  <div style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(136,192,112,.18)', color: 'var(--green)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    조리 중
                  </div>
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--ink-soft)', marginBottom: '8px' }}>
                  {order.order_items?.map(item => (
                    <div key={item.id}>
                      <strong style={{ color: 'var(--ink)' }}>{item.menus?.name}</strong> × {item.quantity}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px dashed var(--line)', fontSize: '12px', color: 'var(--ink-soft)' }}>
                  <div style={{ fontFamily: 'inherit', fontWeight: 700, color: 'var(--accent)', fontSize: '16px' }}>
                    {order.total_price?.toLocaleString()}원
                  </div>
                  <div>{getElapsed(order.created_at)}</div>
                </div>
                <button onClick={() => updateStatus(order.id, 'done')}
                  style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'var(--accent)', color: '#1a1410', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
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