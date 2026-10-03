import type { ReactNode } from 'react'
import { SENAS, type InfoJugador } from '../engine/informacion'
import { NOMBRE_POSICION, companeroDe, type Posicion } from '../engine/mesa'
import { CartaOculta, Mano } from './Carta'
import './Mesa.css'

interface Props {
  heroe: Posicion
  jugadores: readonly InfoJugador[]
  centro?: ReactNode
}

/** Mesa vista desde el héroe: tú abajo, tu compañero enfrente y los rivales a los lados. */
export function Mesa({ heroe, jugadores, centro }: Props) {
  const derecha = ((heroe + 1) % 4) as Posicion
  const arriba = companeroDe(heroe)
  const izquierda = ((heroe + 3) % 4) as Posicion

  const asiento = (p: Posicion, lugar: string) => {
    const info = jugadores[p]
    const datos = describir(info)
    const rol = p === heroe ? 'Tú' : p === arriba ? 'Compañero' : 'Rival'
    return (
      <div className={`asiento asiento--${lugar} ${p === heroe || p === arriba ? 'asiento--nuestro' : 'asiento--suyo'}`}>
        <div className="asiento__nombre">
          <strong>{rol}</strong> · {NOMBRE_POSICION[p]}
        </div>
        {info.mano ? (
          <Mano cartas={info.mano} tamano={p === heroe ? 'normal' : 'peque'} />
        ) : (
          <span className="mano">
            {[0, 1, 2, 3].map((i) => (
              <CartaOculta key={i} tamano="peque" />
            ))}
          </span>
        )}
        {datos.length > 0 && (
          <div className="asiento__datos">
            {datos.map((d) => (
              <span key={d} className="asiento__dato">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mesa tapete">
      {asiento(arriba, 'arriba')}
      {asiento(izquierda, 'izquierda')}
      <div className="mesa__centro">{centro}</div>
      {asiento(derecha, 'derecha')}
      {asiento(heroe, 'abajo')}
    </div>
  )
}

function describir(info: InfoJugador): string[] {
  if (info.mano) return []
  const out: string[] = []
  for (const s of info.senas ?? []) out.push(`Seña: ${SENAS[s].nombre.toLowerCase()}`)
  if (info.pares !== undefined) out.push(info.pares ? 'Pares sí' : 'Pares no')
  if (info.juego !== undefined) out.push(info.juego ? 'Juego sí' : 'Juego no')
  if (info.seQuedoCon !== undefined) out.push(`Se quedó con ${info.seQuedoCon}`)
  for (const c of info.condiciones ?? []) out.push(c.descripcion)
  return out
}
