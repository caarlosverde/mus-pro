import { useEffect, useState } from 'react'
import { Panel, Segmentado } from '../componentes/ui'
import { api, hayServidor } from '../estado/api'
import { useSesion } from '../estado/sesion'
import './Ranking.css'

interface FilaIndividual {
  posicion: number
  nombre: string
  elo: number
  partidas: number
  ganadas: number
}

interface FilaParejas {
  posicion: number
  jugador1: string
  jugador2: string
  elo: number
  partidas: number
  ganadas: number
}

type Tipo = 'individual' | 'parejas'

export function Ranking() {
  const { usuario } = useSesion()
  const [tipo, setTipo] = useState<Tipo>('individual')
  const [filas, setFilas] = useState<{ tipo: Tipo; datos: (FilaIndividual | FilaParejas)[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hayServidor) return
    let vigente = true
    api<{ ranking: (FilaIndividual | FilaParejas)[] }>(`/api/ranking/${tipo}`, { token: null })
      .then((r) => vigente && setFilas({ tipo, datos: r.ranking }))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : 'No se pudo cargar el ranking'))
    return () => {
      vigente = false
    }
  }, [tipo])

  if (!hayServidor) return <Panel><p className="texto-suave">El ranking estará disponible con el juego online.</p></Panel>

  const cargando = filas?.tipo !== tipo
  const yo = usuario?.nombre.toLowerCase()
  const esMia = (f: FilaIndividual | FilaParejas) =>
    'nombre' in f ? f.nombre.toLowerCase() === yo : [f.jugador1, f.jugador2].some((n) => n.toLowerCase() === yo)

  return (
    <div className="ranking">
      <div className="titulo-pagina">
        <a href="#/online" className="volver">
          ← Online
        </a>
        <h1>Ranking</h1>
        <p>
          Puntos por partidas puntuables. Todos empiezan con 1200; ganar a rivales de más nivel da más puntos y perder contra rivales de menos
          nivel quita más. Los bots cuentan como 1200.
        </p>
      </div>
      <Panel>
        <Segmentado
          etiqueta="Tipo de ranking"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: 'individual', texto: 'Individual' },
            { valor: 'parejas', texto: 'Parejas' },
          ]}
        />
        {error && <p className="aviso aviso--mal">{error}</p>}
        {cargando && !error && <p className="texto-suave">Cargando…</p>}
        {!cargando && filas!.datos.length === 0 && (
          <p className="texto-suave">
            Todavía no hay nadie en este ranking. {tipo === 'individual' ? 'Juega una partida puntuable solo' : 'Juega una partida puntuable con tu compañero'} y
            serás el primero.
          </p>
        )}
        {!cargando && filas!.datos.length > 0 && (
          <div className="ranking__tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="col-pos">#</th>
                  <th className="izq">{tipo === 'individual' ? 'Jugador' : 'Pareja'}</th>
                  <th>Puntos</th>
                  <th>Partidas</th>
                  <th>Victorias</th>
                </tr>
              </thead>
              <tbody>
                {filas!.datos.map((f) => (
                  <tr key={f.posicion} className={esMia(f) ? 'fila--mia' : ''}>
                    <td className="col-pos">{f.posicion <= 3 ? ['🥇', '🥈', '🥉'][f.posicion - 1] : f.posicion}</td>
                    <th scope="row" className="izq">
                      {'nombre' in f ? (
                        <a href={`#/perfil/${encodeURIComponent(f.nombre)}`}>{f.nombre}</a>
                      ) : (
                        <>
                          <a href={`#/perfil/${encodeURIComponent(f.jugador1)}`}>{f.jugador1}</a> y{' '}
                          <a href={`#/perfil/${encodeURIComponent(f.jugador2)}`}>{f.jugador2}</a>
                        </>
                      )}
                    </th>
                    <td>
                      <strong>{f.elo}</strong>
                    </td>
                    <td>{f.partidas}</td>
                    <td>{f.partidas ? `${Math.round((f.ganadas / f.partidas) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
