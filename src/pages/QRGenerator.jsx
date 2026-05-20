import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f0eb; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
  .qr-card { animation: fadeUp 0.3s ease both; transition: transform 0.2s, box-shadow 0.2s; }
  .qr-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.10); }
`

const BASE_URL = window.location.origin

function QRCard({ tableNumber, idx }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, `${BASE_URL}/menu/${tableNumber}`, {
        width: 160,
        color: { dark: '#1c1814', light: '#ffffff' }
      })
    }
  }, [tableNumber])

  function printQR() {
    const canvas = canvasRef.current
    const dataUrl = canvas.toDataURL()
    const win = window.open('', '_blank')
    win.document.write(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;gap:16px;">
          <h2 style="font-size:24px;">Table ${tableNumber}</h2>
          <img src="${dataUrl}" width="300" />
          <p style="color:#888;font-size:14px;">${BASE_URL}/menu/${tableNumber}</p>
        </body>
      </html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div className="qr-card"
      style={{ background: 'white', borderRadius: '20px', padding: '28px', textAlign: 'center', animationDelay: `${idx * 0.06}s` }}>
      <div style={{ fontSize: '13px', color: '#a08060', marginBottom: '16px', fontWeight: 600, letterSpacing: '0.05em' }}>
        TABLE {tableNumber}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <canvas ref={canvasRef} />
      </div>
      <div style={{ fontSize: '11px', color: '#bbb', marginBottom: '16px', wordBreak: 'break-all' }}>
        {BASE_URL}/menu/{tableNumber}
      </div>
      <button onClick={printQR}
        style={{ width: '100%', padding: '10px', background: '#1c1814', color: '#d4b896', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans' }}>
        🖨️ 인쇄
      </button>
    </div>
  )
}

export default function QRGenerator() {
  const tables = [1, 2, 3, 4, 5]

  return (
    <>
      <style>{styles}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb' }}>
        <header style={{ background: '#1c1814', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
          <span style={{ fontFamily: 'Cormorant Garamond', color: '#d4b896', fontSize: '24px', fontWeight: 600 }}>
            QR 코드 관리
          </span>
          <span style={{ color: '#a08060', fontSize: '13px' }}>테이블별 QR 코드</span>
        </header>
        <main style={{ padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {tables.map((num, idx) => (
              <QRCard key={num} tableNumber={num} idx={idx} />
            ))}
          </div>
        </main>
      </div>
    </>
  )
}