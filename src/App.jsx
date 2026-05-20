import { BrowserRouter, Routes, Route } from 'react-router-dom'
import CustomerMenu from './pages/CustomerMenu'
import KitchenDisplay from './pages/KitchenDisplay'
import AdminPanel from './pages/AdminPanel'
import QRGenerator from './pages/QRGenerator'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/qr" element={<QRGenerator />} />
        <Route path="/menu/:tableId" element={<CustomerMenu />} />
        <Route path="/kitchen" element={<KitchenDisplay />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App