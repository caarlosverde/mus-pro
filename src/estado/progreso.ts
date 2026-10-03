import { useEffect, useState } from 'react'
import { api, hayServidor, leerToken } from './api'

/**
 * Progreso del entrenamiento. Se guarda siempre en el dispositivo y, con la
 * sesión iniciada, también en el servidor. Al sincronizar gana la versión más
 * reciente de cada módulo.
 */

export interface ProgresoCorte {
  intentos: number
  aciertos: number
  racha: number
  mejorRacha: number
  /** Por día (AAAA-MM-DD): [intentos, aciertos]. */
  dias: Record<string, [number, number]>
}

export type ProgresoProblemas = Record<string, 'acierto' | 'fallo'>

export interface ProgresoDecisiones {
  /** Por día: [bien, mejorable, error]. */
  dias: Record<string, [number, number, number]>
}

export interface Progresos {
  corte: ProgresoCorte
  problemas: ProgresoProblemas
  decisiones: ProgresoDecisiones
}

export type ClaveProgreso = keyof Progresos

const VACIO: Progresos = {
  corte: { intentos: 0, aciertos: 0, racha: 0, mejorRacha: 0, dias: {} },
  problemas: {},
  decisiones: { dias: {} },
}

/** Claves antiguas de localStorage (antes de las cuentas), para no perder progreso. */
const ANTIGUAS: Partial<Record<ClaveProgreso, string>> = { corte: 'mus.corte.v1', problemas: 'mus.problemas.v1' }

interface Guardado<T> {
  valor: T
  actualizado: number
}

const clave = (c: ClaveProgreso) => `mus.progreso.${c}`
const oyentes = new Set<() => void>()

function avisar() {
  for (const f of oyentes) f()
}

export function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function leerGuardado<K extends ClaveProgreso>(c: K): Guardado<Progresos[K]> {
  try {
    const crudo = localStorage.getItem(clave(c))
    if (crudo) {
      const g = JSON.parse(crudo) as Guardado<Progresos[K]>
      return { valor: { ...VACIO[c], ...g.valor }, actualizado: g.actualizado ?? 0 }
    }
    const antigua = ANTIGUAS[c] && localStorage.getItem(ANTIGUAS[c]!)
    if (antigua) return { valor: { ...VACIO[c], ...JSON.parse(antigua) }, actualizado: 1 }
  } catch {
    // Datos corruptos o sin almacenamiento: se empieza de cero.
  }
  return { valor: structuredClone(VACIO[c]), actualizado: 0 }
}

function escribirLocal<K extends ClaveProgreso>(c: K, g: Guardado<Progresos[K]>) {
  try {
    localStorage.setItem(clave(c), JSON.stringify(g))
  } catch {
    // Sin almacenamiento: el progreso dura lo que la sesión.
  }
}

export function leerProgreso<K extends ClaveProgreso>(c: K): Progresos[K] {
  return leerGuardado(c).valor
}

const pendientes = new Map<ClaveProgreso, ReturnType<typeof setTimeout>>()

/** Actualiza un módulo de progreso (local inmediato, servidor con un pequeño retardo). */
export function actualizarProgreso<K extends ClaveProgreso>(c: K, cambio: (actual: Progresos[K]) => Progresos[K]) {
  const g = { valor: cambio(leerProgreso(c)), actualizado: Date.now() }
  escribirLocal(c, g)
  avisar()
  if (!hayServidor || !leerToken()) return
  clearTimeout(pendientes.get(c))
  pendientes.set(
    c,
    setTimeout(() => {
      pendientes.delete(c)
      api(`/api/progreso/${c}`, { metodo: 'PUT', cuerpo: { valor: leerProgreso(c) } }).catch(() => {
        // Se reintentará en la próxima sincronización.
      })
    }, 800),
  )
}

/** Sincroniza todos los módulos con el servidor tras iniciar sesión. */
export async function sincronizarProgreso() {
  if (!hayServidor || !leerToken()) return
  const { progreso } = await api<{ progreso: Record<string, Guardado<unknown>> }>('/api/progreso')
  for (const c of Object.keys(VACIO) as ClaveProgreso[]) {
    const local = leerGuardado(c)
    const remoto = progreso[c]
    if (remoto && remoto.actualizado >= local.actualizado) {
      escribirLocal(c, { valor: { ...VACIO[c], ...(remoto.valor as object) }, actualizado: remoto.actualizado } as Guardado<Progresos[typeof c]>)
    } else if (local.actualizado > 0) {
      await api(`/api/progreso/${c}`, { metodo: 'PUT', cuerpo: { valor: local.valor } })
    }
  }
  avisar()
}

/** Hook que devuelve un módulo de progreso y se actualiza cuando cambia. */
export function useProgreso<K extends ClaveProgreso>(c: K): Progresos[K] {
  const [valor, setValor] = useState(() => leerProgreso(c))
  useEffect(() => {
    const f = () => setValor(leerProgreso(c))
    oyentes.add(f)
    return () => {
      oyentes.delete(f)
    }
  }, [c])
  return valor
}

/** Registra la nota de una revisión de decisiones. */
export function anotarDecisiones(bien: number, mejorable: number, error: number) {
  if (bien + mejorable + error === 0) return
  actualizarProgreso('decisiones', (p) => {
    const d = hoy()
    const [b, m, e] = p.dias[d] ?? [0, 0, 0]
    return { dias: { ...p.dias, [d]: [b + bien, m + mejorable, e + error] } }
  })
}
