import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ProveedorAjustes } from './estado/ajustes.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorAjustes>
      <App />
    </ProveedorAjustes>
  </StrictMode>,
)

// Service worker para uso sin conexión (sólo en producción).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Si falla, la app sigue funcionando online.
    })
  })
}
