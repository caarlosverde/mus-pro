import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { REGLAS_POR_DEFECTO, type Reglas } from '../engine/reglas'

const CLAVE = 'mus.reglas.v1'

function leer(): Reglas {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return REGLAS_POR_DEFECTO
    const r = { ...REGLAS_POR_DEFECTO, ...JSON.parse(crudo) } as Reglas
    if (r.reyes !== 8 && r.reyes !== 4) r.reyes = 8
    if (r.piedras !== 30 && r.piedras !== 40) r.piedras = 40
    return r
  } catch {
    return REGLAS_POR_DEFECTO
  }
}

interface ContextoAjustes {
  reglas: Reglas
  cambiarReglas: (cambios: Partial<Reglas>) => void
}

const Contexto = createContext<ContextoAjustes | null>(null)

export function ProveedorAjustes({ children }: { children: ReactNode }) {
  const [reglas, setReglas] = useState<Reglas>(leer)

  const cambiarReglas = useCallback((cambios: Partial<Reglas>) => {
    setReglas((prev) => {
      const nuevas = { ...prev, ...cambios }
      try {
        localStorage.setItem(CLAVE, JSON.stringify(nuevas))
      } catch {
        // Sin almacenamiento disponible: los ajustes duran lo que la sesión.
      }
      return nuevas
    })
  }, [])

  const valor = useMemo(() => ({ reglas, cambiarReglas }), [reglas, cambiarReglas])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAjustes(): ContextoAjustes {
  const c = useContext(Contexto)
  if (!c) throw new Error('useAjustes debe usarse dentro de <ProveedorAjustes>')
  return c
}
