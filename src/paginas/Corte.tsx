import { useCallback, useEffect, useState } from 'react'
import { Mesa } from '../componentes/Mesa'
import { Barra, Etiqueta, Panel } from '../componentes/ui'
import { crearRng } from '../engine/azar'
import { clavesCorte, generarSituacionCorte, type SituacionCorte } from '../engine/entrenadorCorte'
import type { Evaluacion } from '../engine/evaluador'
import { SENAS } from '../engine/informacion'
import { senasConocidas } from '../engine/mano'
import { NOMBRE_POSICION, POSICIONES, companeroDe, parejaDe, rival, type Posicion } from '../engine/mesa'
import { useAjustes } from '../estado/ajustes'
import { evaluarEnSegundoPlano } from '../estado/evaluador'
import './Problemas.css'

const CLAVE = 'mus.corte.v1'
const MUESTRAS = 600
/** Diferencia mínima (en probabilidad de ganar el juego) para considerar una opción mejor. */
const EMPATE = 0.01

interface Marcas {
  intentos: number
  aciertos: number
  racha: number
  mejorRacha: number
}

function leer(): Marcas {
  try {
    return { intentos: 0, aciertos: 0, racha: 0, mejorRacha: 0, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') }
  } catch {
    return { intentos: 0, aciertos: 0, racha: 0, mejorRacha: 0 }
  }
}

type Decision = 'mus' | 'corto'

export function Corte() {
  const { reglas } = useAjustes()
  const [situacion, setSituacion] = useState<SituacionCorte | null>(null)
  const [elegida, setElegida] = useState<Decision | null>(null)
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null | 'error'>(null)
  const [marcas, setMarcas] = useState<Marcas>(leer)

  const nueva = useCallback(() => {
    setSituacion(generarSituacionCorte(reglas, crearRng(Date.now())))
    setElegida(null)
    setEvaluacion(null)
  }, [reglas])

  useEffect(() => {
    // Primera situación al entrar (y al cambiar de reglas).
    const t = setTimeout(nueva, 0)
    return () => clearTimeout(t)
  }, [nueva])

  const responder = (d: Decision) => {
    if (!situacion || elegida) return
    setElegida(d)
    evaluarEnSegundoPlano({
      estado: situacion.estado,
      heroe: situacion.heroe,
      opciones: [{ tipo: 'mus' }, { tipo: 'corto' }],
      personalidades: ['equilibrado', 'equilibrado', 'equilibrado', 'equilibrado'],
      muestras: MUESTRAS,
    })
      .then((ev) => {
        setEvaluacion(ev ?? 'error')
        if (!ev) return
        const [mus, corto] = ev.alternativas
        const diferencia = corto.pJuego - mus.pJuego
        const acierto = Math.abs(diferencia) < EMPATE || (diferencia > 0) === (d === 'corto')
        setMarcas((m) => {
          const racha = acierto ? m.racha + 1 : 0
          const nuevas = {
            intentos: m.intentos + 1,
            aciertos: m.aciertos + (acierto ? 1 : 0),
            racha,
            mejorRacha: Math.max(m.mejorRacha, racha),
          }
          try {
            localStorage.setItem(CLAVE, JSON.stringify(nuevas))
          } catch {
            // Sin almacenamiento: las marcas duran la sesión.
          }
          return nuevas
        })
      })
      .catch(() => setEvaluacion('error'))
  }

  return (
    <>
      <div className="titulo-pagina">
        <h1>Entrenador de corte</h1>
        <p>
          ¿Mus o no hay mus? Te toca hablar después de que los anteriores hayan pedido mus. Decide y verás qué opción da más
          probabilidad de ganar el juego, calculada jugando cientos de veces la mano con cartas compatibles con lo que sabes.
        </p>
      </div>

      <div className="marcas-corte">
        <Etiqueta>{marcas.intentos} manos</Etiqueta>
        <Etiqueta tono="ok">{marcas.intentos ? Math.round((marcas.aciertos / marcas.intentos) * 100) : 0}% de acierto</Etiqueta>
        <Etiqueta tono="oro">Racha: {marcas.racha} (mejor {marcas.mejorRacha})</Etiqueta>
      </div>

      {situacion && <VistaSituacion s={situacion} elegida={elegida} evaluacion={evaluacion} onResponder={responder} onSiguiente={nueva} />}
    </>
  )
}

function VistaSituacion({
  s,
  elegida,
  evaluacion,
  onResponder,
  onSiguiente,
}: {
  s: SituacionCorte
  elegida: Decision | null
  evaluacion: Evaluacion | null | 'error'
  onResponder: (d: Decision) => void
  onSiguiente: () => void
}) {
  const { estado: e, heroe } = s
  const nos = parejaDe(heroe)
  const notas: Partial<Record<Posicion, string[]>> = {}
  for (const p of POSICIONES) if (p < heroe) notas[p] = ['Mus']
  for (const sena of senasConocidas(e, heroe)) {
    const quien = sena.de === companeroDe(heroe) ? 'Te pasa' : 'Le pillas'
    notas[sena.de] = [...(notas[sena.de] ?? []), `${quien}: ${SENAS[sena.sena].nombre.toLowerCase()}`]
  }
  const jugadores = POSICIONES.map((p) => (p === heroe ? { mano: e.manos[p] } : {}))

  return (
    <>
      <Mesa
        heroe={heroe}
        jugadores={jugadores}
        notas={notas}
        centro={
          <div className="marcador">
            <div className="marcador__lado marcador__lado--nosotros">
              <span>Vosotros</span>
              <strong>{e.marcador[nos]}</strong>
            </div>
            <div className="marcador__sep">a {e.reglas.piedras}</div>
            <div className="marcador__lado marcador__lado--ellos">
              <span>Ellos</span>
              <strong>{e.marcador[rival(nos)]}</strong>
            </div>
          </div>
        }
      />

      <div className="rejilla">
        <Panel titulo="Tu decisión">
          <p className="pregunta">
            Eres {NOMBRE_POSICION[heroe].toLowerCase()}. {heroe === 0 ? 'Hablas el primero.' : 'Los anteriores han pedido mus.'} ¿Qué dices?
          </p>
          <div className="opciones">
            {(['mus', 'corto'] as const).map((d) => {
              let clase = ''
              if (elegida && evaluacion && evaluacion !== 'error') {
                const [mus, corto] = evaluacion.alternativas
                const mejor = Math.abs(corto.pJuego - mus.pJuego) < EMPATE ? null : corto.pJuego > mus.pJuego ? 'corto' : 'mus'
                clase = mejor === null || mejor === d ? 'opcion--correcta' : d === elegida ? 'opcion--fallida' : 'opcion--apagada'
              } else if (elegida) clase = d === elegida ? '' : 'opcion--apagada'
              return (
                <button key={d} type="button" className={`opcion ${clase}`} disabled={!!elegida} onClick={() => onResponder(d)}>
                  {d === 'mus' ? 'Mus' : 'Corto (no hay mus)'}
                </button>
              )
            })}
          </div>
          {elegida && !evaluacion && <p className="texto-suave">Jugando la mano {MUESTRAS} veces con cada opción…</p>}
          {evaluacion === 'error' && <p className="aviso aviso--mal">No se pudo evaluar esta situación.</p>}
          {elegida && evaluacion && evaluacion !== 'error' && <Veredicto ev={evaluacion} elegida={elegida} />}
        </Panel>

        {elegida && evaluacion && evaluacion !== 'error' && (
          <Panel titulo="Claves de la situación">
            <ul className="claves">
              {clavesCorte(s).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <button type="button" className="boton boton--primario" onClick={onSiguiente}>
              Siguiente situación →
            </button>
          </Panel>
        )}
      </div>
    </>
  )
}

function Veredicto({ ev, elegida }: { ev: Evaluacion; elegida: Decision }) {
  const [mus, corto] = ev.alternativas
  const diferencia = corto.pJuego - mus.pJuego
  const igual = Math.abs(diferencia) < EMPATE
  const mejor: Decision = diferencia > 0 ? 'corto' : 'mus'
  const acierto = igual || mejor === elegida
  return (
    <>
      <p className={`aviso ${acierto ? 'aviso--ok' : 'aviso--mal'}`} role="status">
        {igual
          ? 'Las dos opciones son prácticamente iguales: cualquiera es defendible.'
          : acierto
            ? `¡Bien! ${mejor === 'corto' ? 'Cortar' : 'Pedir mus'} es lo mejor aquí.`
            : `Mejor ${mejor === 'corto' ? 'cortar' : 'pedir mus'}: ${Math.abs(diferencia * 100).toFixed(1)} puntos más de probabilidad de ganar el juego.`}
      </p>
      <Barra etiqueta="Mus: probabilidad de ganar el juego" valor={mus.pJuego} tono={mejor === 'mus' || igual ? 'nosotros' : 'ellos'} detalle={`Piedras netas medias en esta mano: ${mus.piedras >= 0 ? '+' : ''}${mus.piedras.toFixed(1)}`} />
      <Barra etiqueta="Corto: probabilidad de ganar el juego" valor={corto.pJuego} tono={mejor === 'corto' || igual ? 'nosotros' : 'ellos'} detalle={`Piedras netas medias en esta mano: ${corto.piedras >= 0 ? '+' : ''}${corto.piedras.toFixed(1)}`} />
      <p className="texto-suave">
        Tras tu decisión, todos (tú incluido) siguen jugando con bots de estilo equilibrado. Muestra efectiva: {Math.round(ev.muestrasEfectivas)} repartos.
      </p>
    </>
  )
}
