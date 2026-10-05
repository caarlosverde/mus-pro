import { useEffect, useRef, useState } from 'react'
import type { Sena } from '../engine/informacion'
import type { Asiento } from '../engine/partida'
import { DURACION_GESTO_MS, type EventoVista, type VistaMesa } from '../engine/sala'

/**
 * Gestos que está haciendo cada avatar ahora mismo. Cada gesto nuevo (por id)
 * se muestra un instante; los que ya estaban al llegar no se repiten.
 */
export function useGestosActivos(v: VistaMesa): Partial<Record<Asiento, Sena>> {
  const vistos = useRef<Set<number> | null>(null)
  const [activos, setActivos] = useState<Partial<Record<Asiento, Sena>>>({})
  useEffect(() => {
    if (vistos.current === null) {
      // Primera vista (o reconexión): no se reproducen gestos antiguos.
      vistos.current = new Set(v.gestos.map((g) => g.id))
      return
    }
    const nuevos = v.gestos.filter((g) => !vistos.current!.has(g.id))
    nuevos.forEach((g, i) => {
      vistos.current!.add(g.id)
      // Si llegan varios a la vez del mismo jugador, se encadenan.
      const retraso = nuevos.slice(0, i).filter((x) => x.asiento === g.asiento).length * (DURACION_GESTO_MS + 250)
      setTimeout(() => setActivos((a) => ({ ...a, [g.asiento]: g.sena })), retraso)
      setTimeout(
        () => setActivos((a) => (a[g.asiento] === g.sena ? { ...a, [g.asiento]: undefined } : a)),
        retraso + (g.sena === 'ciego' ? 480 : DURACION_GESTO_MS),
      )
    })
  }, [v.gestos])
  return activos
}

/** Lo último que ha dicho un jugador en la ronda actual (para su bocadillo). */
export function ultimaAccion(eventos: EventoVista[], a: Asiento, lance: string | null): string | null {
  const ini = eventos.findLastIndex((x) => x.tipo === 'reparto')
  for (let i = eventos.length - 1; i > ini; i--) {
    const ev = eventos[i]
    if (ev.tipo === 'cierre') return null
    if ('asiento' in ev && ev.asiento === a) {
      if (ev.tipo === 'mus') return ev.corta ? '¡Corto!' : 'Mus'
      if (ev.tipo === 'envite') return ev.texto
      if (ev.tipo === 'declaracion' && lance === ev.lance) return `${ev.lance === 'pares' ? 'Pares' : 'Juego'} ${ev.tiene ? 'sí' : 'no'}`
      if (ev.tipo === 'descarte') return `Se descarta de ${ev.cartas}`
    }
  }
  return null
}

/** Último cierre de lance (para anunciarlo en el centro de la mesa). */
export function ultimoCierre(eventos: EventoVista[]): string | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    const ev = eventos[i]
    if (ev.tipo === 'cierre') return ev.texto
    if (ev.tipo === 'envite' || ev.tipo === 'reparto') return null
  }
  return null
}

const CLAVE_AYUDAS = 'mus.ayudas.v1'

/** Preferencia de ayudas visuales (ver la descripción de tu jugada). */
export function useAyudas(): [boolean, (v: boolean) => void] {
  const [ayudas, setAyudas] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_AYUDAS) === '1'
    } catch {
      return false
    }
  })
  const cambiar = (valor: boolean) => {
    setAyudas(valor)
    try {
      localStorage.setItem(CLAVE_AYUDAS, valor ? '1' : '0')
    } catch {
      // Sin almacenamiento: dura la sesión.
    }
  }
  return [ayudas, cambiar]
}
