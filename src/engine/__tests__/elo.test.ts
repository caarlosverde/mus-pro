import { describe, expect, it } from 'vitest'
import { cambioElo, esperado, factorK, fuerzaEquipo } from '../elo'

describe('puntuación Elo', () => {
  it('entre iguales, ganar y perder valen lo mismo', () => {
    expect(cambioElo(1200, 1200, true, 24)).toBe(12)
    expect(cambioElo(1200, 1200, false, 24)).toBe(-12)
  })

  it('ganar a alguien de más nivel da más puntos', () => {
    expect(cambioElo(1200, 1400, true, 24)).toBeGreaterThan(cambioElo(1200, 1000, true, 24))
  })

  it('perder contra alguien de menos nivel quita más puntos', () => {
    expect(cambioElo(1400, 1200, false, 24)).toBeLessThan(cambioElo(1200, 1400, false, 24))
  })

  it('las primeras partidas mueven más', () => {
    expect(factorK(0)).toBeGreaterThan(factorK(50))
  })

  it('la expectativa es simétrica y la fuerza de equipo es la media', () => {
    expect(esperado(1300, 1100) + esperado(1100, 1300)).toBeCloseTo(1, 10)
    expect(fuerzaEquipo([1100, 1300])).toBe(1200)
  })

  it('siempre se mueve al menos un punto', () => {
    expect(cambioElo(2400, 800, true, 24)).toBe(1)
  })
})
