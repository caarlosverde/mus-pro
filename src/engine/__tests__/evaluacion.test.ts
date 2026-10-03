import { describe, expect, it } from 'vitest'
import { BARAJA, crearCarta, manoDesdeNotacion, notacion } from '../cartas'
import { evaluar } from '../evaluacion'
import { ganadorLance } from '../mesa'
import { REGLAS_POR_DEFECTO, type Reglas } from '../reglas'

const R8: Reglas = REGLAS_POR_DEFECTO
const R4: Reglas = { ...REGLAS_POR_DEFECTO, reyes: 4 }
const CON_REAL: Reglas = { ...REGLAS_POR_DEFECTO, laReal: true }

const ev = (txt: string, reglas = R8) => evaluar(manoDesdeNotacion(txt, reglas), reglas)

/** Reparte cuatro manos sin repetir cartas y las evalúa (posición 0 = mano). */
function mesa(manos: string[], reglas = R8) {
  const usadas = new Set<number>()
  return manos.map((t) => {
    const m = manoDesdeNotacion(t, reglas, usadas)
    m.forEach((c) => usadas.add(c))
    return evaluar(m, reglas)
  })
}

describe('cartas y variantes', () => {
  it('en 8 reyes el 3 es rey y el 2 es as', () => {
    const mano = [crearCarta(3, 'oros'), crearCarta(12, 'copas'), crearCarta(2, 'oros'), crearCarta(1, 'bastos')]
    expect(notacion(mano, R8)).toBe('RRAA')
    expect(evaluar(mano, R8).pares.tipo).toBe('duples')
    expect(evaluar(mano, R8).juego.puntos).toBe(22)
  })

  it('en 4 reyes el 3 y el 2 son cartas propias', () => {
    const mano = [crearCarta(3, 'oros'), crearCarta(12, 'copas'), crearCarta(2, 'oros'), crearCarta(1, 'bastos')]
    expect(notacion(mano, R4)).toBe('R32A')
    expect(evaluar(mano, R4).pares.tipo).toBe('ninguno')
    expect(evaluar(mano, R4).juego.puntos).toBe(16)
  })
})

describe('grandes y chicas', () => {
  it('a igualdad de reyes decide el acompañamiento', () => {
    expect(ev('RRRC').claveGrandes).toBeGreaterThan(ev('RRRS').claveGrandes)
    expect(ev('RCSA').claveGrandes).toBeGreaterThan(ev('RC7A').claveGrandes)
  })

  it('en chicas gana quien tiene más pitos y luego la carta más baja', () => {
    expect(ev('AAA4').claveChicas).toBeGreaterThan(ev('AAA5').claveChicas)
    expect(ev('AA4R').claveChicas).toBeGreaterThan(ev('A44R').claveChicas)
  })

  it('a igualdad absoluta gana el que va de mano', () => {
    const j = mesa(['RRC4', '7654', 'RRC4', '6SSA'])
    expect(ganadorLance(j, 'grandes')).toBe(0)
  })
})

describe('pares', () => {
  it('duples > medias > pareja', () => {
    expect(ev('44AA').clavePares).toBeGreaterThan(ev('RRRC').clavePares)
    expect(ev('5557').clavePares).toBeGreaterThan(ev('RRCS').clavePares)
  })

  it('duples: decide la pareja más alta y luego la otra', () => {
    expect(ev('RR44').clavePares).toBeGreaterThan(ev('RRAA').clavePares)
    expect(ev('RRRR').pares).toEqual({ tipo: 'duples', alto: 12, bajo: 12 })
  })

  it('en medias y parejas las cartas sueltas no cuentan', () => {
    expect(ev('AAAR').clavePares).toBe(ev('AAAS').clavePares)
    expect(ev('77RS').clavePares).toBe(ev('775A').clavePares)
  })
})

describe('juego y punto', () => {
  it('orden 31 > 32 > 40 > 37 > 36 > 35 > 34 > 33', () => {
    const manos = ['RCSA', 'RC75', 'RRRR', 'RRS7', 'RRS6', 'RRS5', 'RRS4', 'RR76']
    const puntos = manos.map((t) => ev(t).juego.puntos)
    expect(puntos).toEqual([31, 32, 40, 37, 36, 35, 34, 33])
    const claves = manos.map((t) => ev(t).claveJuego)
    for (let i = 1; i < claves.length; i++) expect(claves[i - 1]).toBeGreaterThan(claves[i])
  })

  it('con 30 o menos no hay juego y se juega al punto', () => {
    expect(ev('RRAA').juego.tiene).toBe(false)
    expect(ev('RR55').clavePunto).toBe(30)
  })

  it('la Real sólo cuenta si la variante la admite y no vale con un tres', () => {
    expect(ev('777S', CON_REAL).claveJuego).toBeGreaterThan(ev('RCSA', CON_REAL).claveJuego)
    expect(ev('777S', R8).claveJuego).toBe(ev('RCSA', R8).claveJuego)
    const conTres = [crearCarta(7, 'oros'), crearCarta(7, 'copas'), crearCarta(7, 'espadas'), crearCarta(3, 'oros')]
    expect(evaluar(conTres, CON_REAL).juego.real).toBe(false)
  })
})

describe('combinatoria (8 reyes)', () => {
  it('hay 330 jugadas distintas y sus frecuencias coinciden con la tabla clásica', () => {
    const frecuencia = new Map<string, number>()
    let total = 0
    for (let a = 0; a < 40; a++)
      for (let b = a + 1; b < 40; b++)
        for (let c = b + 1; c < 40; c++)
          for (let d = c + 1; d < 40; d++) {
            const k = notacion([BARAJA[a], BARAJA[b], BARAJA[c], BARAJA[d]], R8)
            frecuencia.set(k, (frecuencia.get(k) ?? 0) + 1)
            total++
          }
    expect(total).toBe(91390)
    // 331 en la tabla del libro porque separa la Real de 777+3.
    expect(frecuencia.size).toBe(330)
    expect(frecuencia.get('AAAA')).toBe(70)
    expect(frecuencia.get('RRRR')).toBe(70)
    expect(frecuencia.get('RC4A')).toBe(1024)
    expect(frecuencia.get('RRAA')).toBe(784)
    expect(frecuencia.get('5555')).toBe(1)
  })
})
