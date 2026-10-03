import { describe, expect, it } from 'vitest'
import { PROBLEMAS } from '../../datos/problemas'
import { resolverProblema } from '../problemas'

describe('problemas de final de juego', () => {
  it('los identificadores son únicos', () => {
    const ids = PROBLEMAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const p of PROBLEMAS) {
    it(`"${p.titulo}": la opción correcta es la que más gana`, () => {
      const r = resolverProblema(p, 4000, 7)
      if (process.env.VERBOSE) {
        console.log(p.id, r.map((o) => `${o.id}: ${(o.total * 100).toFixed(1)}% (gana ${(o.ganar * 100).toFixed(1)}, pierde ${(o.perder * 100).toFixed(1)}, sigue ${(o.sigue * 100).toFixed(1)})`).join(' | '))
      }
      const correcta = r.find((o) => o.id === p.correcta)!
      expect(correcta).toBeDefined()
      for (const o of r) expect(correcta.total).toBeGreaterThanOrEqual(o.total - 1e-9)
    })
  }
})
