import { useEffect, useState } from 'react'

/** Enrutado mínimo por hash (#/laboratorio, #/problemas/id...). Funciona en cualquier hosting estático. */
export function useRuta(): string[] {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const alCambiar = () => {
      setHash(window.location.hash)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

export function irA(ruta: string) {
  window.location.hash = `#/${ruta}`
}
