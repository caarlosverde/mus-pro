import { useEffect, useRef, useState } from 'react'
import type { AnalisisSituacion } from '../engine/analisis'
import type { PeticionAnalisis } from '../engine/analisis.worker'

type Final =
  | { tipo: 'listo'; resultado: AnalisisSituacion }
  | { tipo: 'imposible' }
  | { tipo: 'error'; mensaje: string }

export type EstadoAnalisis = { tipo: 'vacio' } | { tipo: 'calculando'; previo: AnalisisSituacion | null } | Final

/**
 * Lanza el análisis en un Web Worker cada vez que cambia la petición
 * (con un pequeño retardo para no recalcular en cada clic). El estado
 * "calculando" se deriva: la última respuesta no corresponde a la petición actual.
 */
export function useAnalisis(peticion: Omit<PeticionAnalisis, 'id'> | null, retardo = 200): EstadoAnalisis {
  const [respuesta, setRespuesta] = useState<{ clave: string; final: Final } | null>(null)
  const worker = useRef<Worker | null>(null)
  const pendientes = useRef(new Map<number, string>())
  const contador = useRef(0)
  const clave = peticion ? JSON.stringify(peticion) : null

  useEffect(() => {
    const w = new Worker(new URL('../engine/analisis.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; resultado: AnalisisSituacion | null; error?: string }>) => {
      const c = pendientes.current.get(e.data.id)
      pendientes.current.delete(e.data.id)
      if (c === undefined) return
      const final: Final = e.data.error
        ? { tipo: 'error', mensaje: e.data.error }
        : e.data.resultado
          ? { tipo: 'listo', resultado: e.data.resultado }
          : { tipo: 'imposible' }
      setRespuesta({ clave: c, final })
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    if (!clave) return
    const t = setTimeout(() => {
      const id = ++contador.current
      pendientes.current.set(id, clave)
      worker.current?.postMessage({ id, ...JSON.parse(clave) })
    }, retardo)
    return () => clearTimeout(t)
  }, [clave, retardo])

  if (!clave) return { tipo: 'vacio' }
  if (respuesta?.clave === clave) return respuesta.final
  return { tipo: 'calculando', previo: respuesta?.final.tipo === 'listo' ? respuesta.final.resultado : null }
}
