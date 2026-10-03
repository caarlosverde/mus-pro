import { useEffect, useState } from 'react'
import { Mesa } from '../componentes/Mesa'
import { Barra, Etiqueta, Panel } from '../componentes/ui'
import { parejaDe, rival } from '../engine/mesa'
import { reglasDe, resolverProblema, type Problema, type ResultadoOpcion } from '../engine/problemas'
import { PROBLEMAS } from '../datos/problemas'
import { irA } from '../estado/ruta'
import './Problemas.css'

const CLAVE = 'mus.problemas.v1'
type Progreso = Record<string, 'acierto' | 'fallo'>

function leerProgreso(): Progreso {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Progreso
  } catch {
    return {}
  }
}

function guardarProgreso(p: Progreso) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p))
  } catch {
    // Sin almacenamiento: el progreso no se recuerda.
  }
}

export function Problemas({ id }: { id?: string }) {
  const [progreso, setProgreso] = useState<Progreso>(leerProgreso)
  const problema = id ? PROBLEMAS.find((p) => p.id === id) : undefined

  const registrar = (pid: string, acierto: boolean) => {
    setProgreso((prev) => {
      if (prev[pid]) return prev // cuenta el primer intento
      const nuevo: Progreso = { ...prev, [pid]: acierto ? 'acierto' : 'fallo' }
      guardarProgreso(nuevo)
      return nuevo
    })
  }

  if (problema) return <DetalleProblema key={problema.id} p={problema} onResponder={registrar} />

  const aciertos = Object.values(progreso).filter((v) => v === 'acierto').length
  const hechos = Object.keys(progreso).length

  return (
    <>
      <div className="titulo-pagina">
        <h1>Problemas de final de juego</h1>
        <p>
          Situaciones con el marcador al límite. Decide como lo harías en la mesa: después verás la solución, la probabilidad de ganar el
          juego con cada opción (calculada por simulación) y la lección que deja.
        </p>
      </div>
      <Panel
        titulo="Tu progreso"
        extra={
          hechos > 0 && (
            <button
              type="button"
              className="boton boton--peque"
              onClick={() => {
                guardarProgreso({})
                setProgreso({})
              }}
            >
              Reiniciar
            </button>
          )
        }
      >
        <Barra etiqueta={`${aciertos} aciertos de ${PROBLEMAS.length} problemas`} valor={aciertos / PROBLEMAS.length} detalle={hechos > 0 ? `Has intentado ${hechos}. Cuenta el primer intento de cada uno.` : undefined} />
      </Panel>
      <div className="rejilla">
        {PROBLEMAS.map((p, i) => (
          <a key={p.id} href={`#/problemas/${p.id}`} className="panel tarjeta-problema">
            <div className="tarjeta-problema__cabecera">
              <span className="texto-suave">#{i + 1}</span>
              <span className="nivel" aria-label={`Nivel ${p.nivel} de 3`}>
                {'●'.repeat(p.nivel)}
                <span className="nivel__vacio">{'●'.repeat(3 - p.nivel)}</span>
              </span>
            </div>
            <h2>{p.titulo}</h2>
            <div className="tarjeta-problema__pie">
              <Etiqueta>{p.tema}</Etiqueta>
              {progreso[p.id] === 'acierto' && <Etiqueta tono="ok">Acertado</Etiqueta>}
              {progreso[p.id] === 'fallo' && <Etiqueta tono="mal">Fallado</Etiqueta>}
            </div>
          </a>
        ))}
      </div>
    </>
  )
}

function DetalleProblema({ p, onResponder }: { p: Problema; onResponder: (id: string, acierto: boolean) => void }) {
  const [elegida, setElegida] = useState<string | null>(null)
  const [resultados, setResultados] = useState<ResultadoOpcion[] | null>(null)
  const reglas = reglasDe(p)
  const nuestra = parejaDe(p.heroe)
  const indice = PROBLEMAS.indexOf(p)
  const siguiente = PROBLEMAS[indice + 1]

  useEffect(() => {
    if (!elegida || resultados) return
    // Se calcula fuera del render para no bloquear el clic.
    const t = setTimeout(() => setResultados(resolverProblema(p, 5000)), 30)
    return () => clearTimeout(t)
  }, [elegida, resultados, p])

  const responder = (id: string) => {
    if (elegida) return
    setElegida(id)
    onResponder(p.id, id === p.correcta)
  }

  const acierto = elegida === p.correcta
  const mejor = resultados ? Math.max(...resultados.map((r) => r.total)) : 0

  return (
    <>
      <div className="titulo-pagina">
        <a href="#/problemas" className="volver">
          ← Todos los problemas
        </a>
        <h1>{p.titulo}</h1>
        <div className="chips">
          <Etiqueta>{p.tema}</Etiqueta>
          <Etiqueta>
            {reglas.reyes} reyes · a {reglas.piedras}
          </Etiqueta>
        </div>
      </div>

      <Mesa
        heroe={p.heroe}
        jugadores={p.escenario.jugadores}
        centro={
          <div className="marcador" aria-label="Marcador al empezar la mano">
            <div className="marcador__lado marcador__lado--nosotros">
              <span>Vosotros</span>
              <strong>{p.marcador[nuestra]}</strong>
            </div>
            <div className="marcador__sep">a {reglas.piedras}</div>
            <div className="marcador__lado marcador__lado--ellos">
              <span>Ellos</span>
              <strong>{p.marcador[rival(nuestra)]}</strong>
            </div>
          </div>
        }
      />

      <div className="rejilla">
        <Panel titulo="Cómo va la mano">
          <ol className="historia">
            {p.historia.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
          {p.supuestos.length > 0 && (
            <div className="aviso">
              <strong>Supuestos: </strong>
              {p.supuestos.join(' ')}
            </div>
          )}
        </Panel>

        <Panel titulo="Tu decisión">
          <p className="pregunta">{p.pregunta}</p>
          <div className="opciones">
            {p.opciones.map((o) => {
              const estado = !elegida ? '' : o.id === p.correcta ? 'opcion--correcta' : o.id === elegida ? 'opcion--fallida' : 'opcion--apagada'
              return (
                <button key={o.id} type="button" className={`opcion ${estado}`} onClick={() => responder(o.id)} disabled={!!elegida}>
                  {o.texto}
                </button>
              )
            })}
          </div>
          {elegida && (
            <p className={`aviso ${acierto ? 'aviso--ok' : 'aviso--mal'}`} role="status">
              {acierto ? '¡Correcto!' : `No es la mejor opción. Lo mejor era: ${p.opciones.find((o) => o.id === p.correcta)?.texto}.`}
            </p>
          )}
        </Panel>
      </div>

      {elegida && (
        <div className="rejilla">
          <Panel titulo="Por qué">
            <div className="explicacion">
              {p.explicacion.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
            <div className="leccion">
              <span>Lección</span>
              <p>{p.leccion}</p>
            </div>
          </Panel>
          <Panel titulo="Probabilidad de ganar el juego">
            {!resultados && <p className="texto-suave">Simulando repartos…</p>}
            {resultados &&
              resultados.map((r) => {
                const o = p.opciones.find((x) => x.id === r.id)!
                return (
                  <Barra
                    key={r.id}
                    etiqueta={
                      <>
                        {o.texto} {r.total === mejor && <Etiqueta tono="ok">mejor</Etiqueta>}
                      </>
                    }
                    valor={r.total}
                    tono={r.total === mejor ? 'nosotros' : 'ellos'}
                    detalle={
                      r.sigue > 0.005
                        ? `Ganáis en esta mano ${(r.ganar * 100).toFixed(0)}% · la ganan ellos ${(r.perder * 100).toFixed(0)}% · sigue el juego ${(r.sigue * 100).toFixed(0)}% (estimado por marcador)`
                        : `Ganáis ${(r.ganar * 100).toFixed(0)}% · ganan ellos ${(r.perder * 100).toFixed(0)}%`
                    }
                  />
                )
              })}
            <p className="texto-suave">Calculado sobre 5.000 repartos compatibles con la información del problema.</p>
          </Panel>
        </div>
      )}

      {elegida && (
        <div className="navegacion-problemas">
          <button type="button" className="boton" onClick={() => irA('problemas')}>
            Ver todos
          </button>
          {siguiente && (
            <button type="button" className="boton boton--primario" onClick={() => irA(`problemas/${siguiente.id}`)}>
              Siguiente problema →
            </button>
          )}
        </div>
      )}
    </>
  )
}
