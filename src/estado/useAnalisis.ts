import { useEffect, useRef, useState } from 'react'
import { analizar, type AnalisisSituacion } from '../engine/analisis'
import type { PeticionAnalisis } from '../engine/analisis.worker'

type Final =
  | { tipo: 'listo'; resultado: AnalisisSituacion }
  | { tipo: 'imposible' }
  | { tipo: 'error'; mensaje: string }

export type EstadoAnalisis = { tipo: 'vacio' } | { tipo: 'calculando'; previo: AnalisisSituacion | null } | Final

type Mensaje = { id: number; resultado: AnalisisSituacion | null; error?: string }

/**
 * Lanza el análisis en un Web Worker cada vez que cambia la petición
 * (con un pequeño retardo para no recalcular en cada clic). Si el entorno no
 * permite workers, calcula en el hilo principal. El estado "calculando" se
 * deriva: la última respuesta no corresponde a la petición actual.
 */
export function useAnalisis(peticion: Omit<PeticionAnalisis, 'id'> | null, retardo = 200): EstadoAnalisis {
  const [respuesta, setRespuesta] = useState<{ clave: string; final: Final } | null>(null)
  const worker = useRef<Worker | null>(null)
  const pendientes = useRef(new Map<number, string>())
  const contador = useRef(0)
  const recibirRef = useRef<((m: Mensaje) => void) | null>(null)
  const clave = peticion ? JSON.stringify(peticion) : null

  useEffect(() => {
    const recibir = (m: Mensaje) => {
      const c = pendientes.current.get(m.id)
      pendientes.current.delete(m.id)
      if (c === undefined) return
      const final: Final = m.error
        ? { tipo: 'error', mensaje: m.error }
        : m.resultado
          ? { tipo: 'listo', resultado: m.resultado }
          : { tipo: 'imposible' }
      setRespuesta({ clave: c, final })
    }
    let w: Worker | null = null
    try {
      w = new Worker(new URL('../engine/analisis.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<Mensaje>) => recibir(e.data)
      w.onerror = () => {
        // El worker no pudo arrancar: se recalcula lo pendiente aquí mismo.
        w?.terminate()
        worker.current = null
        for (const [id, c] of pendientes.current) calcularAqui(id, c, recibir)
      }
    } catch {
      w = null
    }
    worker.current = w
    recibirRef.current = recibir
    return () => w?.terminate()
  }, [])

  useEffect(() => {
    if (!clave) return
    const t = setTimeout(() => {
      const id = ++contador.current
      pendientes.current.set(id, clave)
      if (worker.current) worker.current.postMessage({ id, ...JSON.parse(clave) })
      else if (recibirRef.current) calcularAqui(id, clave, recibirRef.current)
    }, retardo)
    return () => clearTimeout(t)
  }, [clave, retardo])

  if (!clave) return { tipo: 'vacio' }
  if (respuesta?.clave === clave) return respuesta.final
  return { tipo: 'calculando', previo: respuesta?.final.tipo === 'listo' ? respuesta.final.resultado : null }
}

function calcularAqui(id: number, clave: string, recibir: (m: Mensaje) => void) {
  setTimeout(() => {
    try {
      const p = JSON.parse(clave) as Omit<PeticionAnalisis, 'id'>
      recibir({ id, resultado: analizar(p.escenario, p.heroe, p.reglas, p.n, undefined, p.limiteMs) })
    } catch (e) {
      recibir({ id, resultado: null, error: String(e) })
    }
  }, 30)
}
