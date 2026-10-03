import { describe, expect, it } from 'vitest'
import { crearRng } from '../azar'
import { PERSONALIDADES, PERSONALIDAD_POR_ID, politica } from '../bots'
import { nuevaMano, type ConfigMano } from '../mano'
import { agenteBot, equipoDe, jugarHastaFin, nuevaPartida, siguienteMano, type Agente } from '../partida'
import { REGLAS_POR_DEFECTO } from '../reglas'

const R = REGLAS_POR_DEFECTO
const CONFIG: ConfigMano = { probSenas: [0.9, 0.9, 0.9, 0.9], probPillar: 0.2 }

describe('bots', () => {
  it('las políticas son distribuciones válidas', () => {
    const rng = crearRng(1)
    for (let i = 0; i < 200; i++) {
      let e = nuevaMano(R, { mano: 0, postre: 0 }, rng, CONFIG)
      const agentes = PERSONALIDADES.slice(0, 4).map(agenteBot)
      let pasos = 0
      while (e.fase !== 'fin' && pasos++ < 400) {
        const pos = e.turno!
        const pol = politica(e, pos, PERSONALIDADES[pos])
        const suma = pol.probs.reduce((a, b) => a + b, 0)
        expect(suma).toBeCloseTo(1, 6)
        expect(pol.probs.every((p) => p >= 0 && Number.isFinite(p))).toBe(true)
        e = jugarHastaFin(e, agentes, rng)
      }
      expect(e.fase).toBe('fin')
    }
  })

  it('las manos se juegan enteras y el reparto de piedras es razonable', () => {
    const rng = crearRng(2)
    const agentes = Array.from({ length: 4 }, () => agenteBot(PERSONALIDAD_POR_ID.equilibrado))
    let piedras = 0
    let cortesPrimeras = 0
    let ordagos = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const fin = jugarHastaFin(nuevaMano(R, { mano: 0, postre: 0 }, rng, CONFIG), agentes, rng)
      const m = fin.resultado!.marcador
      piedras += m.mano + m.postre
      if (fin.ronda === 0) cortesPrimeras++
      if (fin.resultado!.eventos.some((ev) => ev.motivo.includes('órdago'))) ordagos++
      // Ninguna carta repetida entre manos.
      const todas = fin.manos.flat()
      expect(new Set(todas).size).toBe(16)
    }
    const media = piedras / N
    expect(media).toBeGreaterThan(5)
    expect(media).toBeLessThan(18)
    // Con un marcador a cero, los órdagos deberían ser raros.
    expect(ordagos / N).toBeLessThan(0.05)
    // Se corta de primeras en una parte apreciable de las manos, pero no siempre.
    expect(cortesPrimeras / N).toBeGreaterThan(0.25)
    expect(cortesPrimeras / N).toBeLessThan(0.95)
  })

  it('una partida completa termina con un ganador de la vaca', () => {
    const rng = crearRng(3)
    const agentes: Agente[] = Array.from({ length: 4 }, () => agenteBot(PERSONALIDAD_POR_ID.equilibrado))
    let p = nuevaPartida(R, CONFIG, rng)
    let manos = 0
    while (p.ganadorVaca === null && manos < 500) {
      p = { ...p, mano: jugarHastaFin(p.mano, agentes, rng) }
      p = siguienteMano(p, rng)
      manos++
    }
    expect(p.ganadorVaca).not.toBeNull()
    expect(Math.max(...p.juegos)).toBe(R.juegosPorVaca)
    expect(equipoDe(0)).toBe(0)
  })
})
