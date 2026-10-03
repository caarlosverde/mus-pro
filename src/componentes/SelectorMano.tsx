import { NUMEROS, PALOS, crearCarta, numeroDe, rangoEfectivo, type Carta as TCarta, type Numero } from '../engine/cartas'
import type { Reglas } from '../engine/reglas'
import { Carta, CartaOculta } from './Carta'
import './SelectorMano.css'

const ETIQUETA: Record<Numero, string> = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'S', 11: 'C', 12: 'R' }
const NOMBRE: Record<Numero, string> = {
  1: 'As', 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 10: 'Sota', 11: 'Caballo', 12: 'Rey',
}

interface Props {
  mano: TCarta[]
  onChange: (mano: TCarta[]) => void
  reglas: Reglas
  /** Cartas no disponibles (en otras manos). */
  ocupadas?: ReadonlySet<TCarta>
}

/** Selector de mano por número: los palos se asignan solos porque en el mus no importan. */
export function SelectorMano({ mano, onChange, reglas, ocupadas = new Set() }: Props) {
  const usadas = new Set([...mano, ...ocupadas])

  const anadir = (n: Numero) => {
    if (mano.length >= 4) return
    const libre = PALOS.map((_, i) => crearCarta(n, PALOS[(i + mano.length) % 4])).find((c) => !usadas.has(c))
    if (libre !== undefined) onChange(ordenar([...mano, libre], reglas))
  }

  const quitar = (c: TCarta) => onChange(mano.filter((x) => x !== c))

  const aleatoria = () => {
    const libres = Array.from({ length: 40 }, (_, i) => i).filter((c) => !ocupadas.has(c))
    for (let i = libres.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[libres[i], libres[j]] = [libres[j], libres[i]]
    }
    onChange(ordenar(libres.slice(0, 4), reglas))
  }

  return (
    <div className="selector">
      <div className="selector__mano">
        {[0, 1, 2, 3].map((i) =>
          mano[i] !== undefined ? (
            <Carta key={mano[i]} carta={mano[i]} onClick={() => quitar(mano[i])} etiqueta="Quitar carta" />
          ) : (
            <CartaOculta key={`v${i}`} />
          ),
        )}
      </div>
      <div className="selector__teclado" role="group" aria-label="Añadir carta">
        {NUMEROS.map((n) => {
          const quedan = PALOS.filter((p) => !usadas.has(crearCarta(n, p))).length
          const equivale = reglas.reyes === 8 && (n === 3 || n === 2) ? (n === 3 ? '= rey' : '= as') : null
          return (
            <button
              key={n}
              type="button"
              className="tecla"
              disabled={quedan === 0 || mano.length >= 4}
              onClick={() => anadir(n)}
              title={`${NOMBRE[n]}${equivale ? ` (${equivale})` : ''}`}
            >
              <span className="tecla__simbolo">{ETIQUETA[n]}</span>
              <span className="tecla__info">{equivale ?? `${quedan}`}</span>
            </button>
          )
        })}
      </div>
      <div className="selector__acciones">
        <button type="button" className="boton boton--peque" onClick={aleatoria}>
          Mano aleatoria
        </button>
        <button type="button" className="boton boton--peque" onClick={() => onChange([])} disabled={mano.length === 0}>
          Vaciar
        </button>
      </div>
    </div>
  )
}

function ordenar(mano: TCarta[], reglas: Reglas): TCarta[] {
  return [...mano].sort((a, b) => rangoEfectivo(b, reglas) - rangoEfectivo(a, reglas) || numeroDe(b) - numeroDe(a))
}
