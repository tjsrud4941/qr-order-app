import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f0eb; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
  .menu-row { animation: fadeUp 0.3s ease both; transition: box-shadow 0.2s; }
  .menu-row:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.07); }
  .toggle-btn { transition: all 0.2s; }
  .toggle-btn:hover { opacity: 0.85; transform: scale(1.03); }
  input[type=number]::-webkit-inner-spin-button { opacity: 1; }
`

export default function AdminPanel() {
  const [menus, setMenus] = useState([])
  const [activeCategory, setActiveCategory] = useState('전체')
  const [saving, setSaving] = useState(null)

  useEffect(() => { fetchMenus() }, [])

  async function fetchMenus() {
    const { data } = await supabase.from('menus').select('*').order('created_at')
    setMenus(data || [])
  }

  async function toggleAvailable(menu) {
    setSaving(menu.id)
    await supabase.from('menus').update({ is_available: !menu.is_available }).eq('id', menu.id)
    await fetchMenus()
    setSaving(null)
  }

  async function updateStock(menu, value) {
    const stock = parseInt(value)
    if (isNaN(stock)) return
    setSaving(menu.id)
    await supabase.from('menus').update({ stock, is_available: stock > 0 }).eq('id', menu.id)
    await fetchMenus()
    setSaving(null)
  }

  async function updateCookTime(menu, value) {
    const cook_time = parseInt(value)
    if (isNaN(cook_time)) return
    await supabase.from('menus').update({ cook_time }).eq('id', menu.id)
    await fetchMenus()
  }

  const categories = ['전체', ...new Set(menus.map(m => m.category).filter(Boolean))]
  const filtered = activeCategory === '전체' ? menus : menus.filter(m => m.category === activeCategory)
  const soldOutCount = menus.filter(m => !m.is_available).length

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb' }}>

        {/* 헤더 */}
        <header style={{ background: '#1c1814', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontFamily: 'Cormorant Garamond', color: '#d4b896', fontSize: '24px', fontWeight: 600 }}>
              메뉴 관리
            </span>
            {soldOutCount > 0 && (
              <span style={{ background: '#fdecea', color: '#c0392b', padding: '4px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
                품절 {soldOutCount}개
              </span>
            )}
          </div>
          <span style={{ color: '#a08060', fontSize: '13px' }}>
            총 {menus.length}개 메뉴
          </span>
        </header>

        {/* 카테고리 탭 */}
        <div style={{ background: 'white', borderBottom: '1px solid #e8ddd4', padding: '0 32px', display: 'flex', gap: '4px' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeCategory === cat ? '2px solid #1c1814' : '2px solid transparent',
              color: activeCategory === cat ? '#1c1814' : '#999',
              fontSize: '14px', fontWeight: activeCategory === cat ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans',
              transition: 'all 0.15s'
            }}>{cat}</button>
          ))}
        </div>

        {/* 테이블 헤더 */}
        <div style={{ padding: '20px 32px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px 100px', gap: '16px', padding: '0 20px', color: '#aaa', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>
            <span>메뉴명</span>
            <span style={{ textAlign: 'center' }}>가격</span>
            <span style={{ textAlign: 'center' }}>재고</span>
            <span style={{ textAlign: 'center' }}>조리시간(분)</span>
            <span style={{ textAlign: 'center' }}>상태</span>
          </div>
        </div>

        {/* 메뉴 목록 */}
        <div style={{ padding: '0 32px 40px' }}>
          {filtered.map((menu, idx) => (
            <div key={menu.id} className="menu-row"
              style={{
                background: 'white', borderRadius: '14px', padding: '16px 20px',
                marginBottom: '8px', display: 'grid',
                gridTemplateColumns: '1fr 100px 120px 120px 100px',
                gap: '16px', alignItems: 'center',
                opacity: menu.is_available ? 1 : 0.6,
                animationDelay: `${idx * 0.04}s`,
                borderLeft: menu.is_available ? '3px solid #4CAF50' : '3px solid #e0e0e0'
              }}>

              {/* 메뉴명 */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#1c1814' }}>{menu.name}</div>
                <div style={{ fontSize: '12px', color: '#a08060', marginTop: '2px' }}>{menu.category}</div>
              </div>

              {/* 가격 */}
              <div style={{ textAlign: 'center', fontWeight: 600, color: '#1c1814', fontSize: '15px' }}>
                {menu.price.toLocaleString()}원
              </div>

              {/* 재고 */}
              <div style={{ textAlign: 'center' }}>
                <input
                  type="number"
                  defaultValue={menu.stock}
                  key={menu.stock}
                  onBlur={e => updateStock(menu, e.target.value)}
                  style={{
                    width: '80px', padding: '7px 10px', border: '1.5px solid #e8ddd4',
                    borderRadius: '8px', fontSize: '14px', textAlign: 'center',
                    fontFamily: 'DM Sans', color: '#1c1814', background: '#faf8f5',
                    outline: 'none'
                  }}
                />
              </div>

              {/* 조리시간 */}
              <div style={{ textAlign: 'center' }}>
                <input
                  type="number"
                  defaultValue={menu.cook_time}
                  key={menu.cook_time}
                  onBlur={e => updateCookTime(menu, e.target.value)}
                  style={{
                    width: '80px', padding: '7px 10px', border: '1.5px solid #e8ddd4',
                    borderRadius: '8px', fontSize: '14px', textAlign: 'center',
                    fontFamily: 'DM Sans', color: '#1c1814', background: '#faf8f5',
                    outline: 'none'
                  }}
                />
              </div>

              {/* 상태 토글 */}
              <div style={{ textAlign: 'center' }}>
                <button
                  className="toggle-btn"
                  onClick={() => toggleAvailable(menu)}
                  disabled={saving === menu.id}
                  style={{
                    padding: '7px 16px', borderRadius: '20px', border: 'none',
                    background: menu.is_available ? '#e8f5e9' : '#fdecea',
                    color: menu.is_available ? '#2e7d32' : '#c0392b',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'DM Sans', minWidth: '72px'
                  }}>
                  {saving === menu.id ? '...' : menu.is_available ? '판매중' : '품절'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}