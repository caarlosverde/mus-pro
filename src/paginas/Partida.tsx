import { useEffect, useMemo, useRef, useState } from 'react'
import { RegistroJuego } from '../componentes/PiezasMesa'
import { PantallaJuego, type EtiquetaJugador } from '../componentes/PantallaJuego'
import { Etiqueta, Panel } from '../componentes/ui'
import { crearRng, semillaAleatoria, type Rng } from '../engine/azar'
import { PERSONALIDADES, PERSONALIDAD_POR_ID } from '../engine/bots'
import { decirAccion } from '../engine/envites'
import { alternativas, type Evaluacion } from '../engine/evaluador'
import type { AccionMano, EstadoMano } from '../engine/mano'
import { NOMBRE_LANCE, type Posicion } from '../engine/mesa'
import { asientoDe, posicionDe, type Asiento } from '../engine/partida'
import {
  avanzarSiProcede,
  empezar,
  hacerSena,
  jugar,
  jugarAutomatico,
  marcarListo,
  nuevaSala,
  procesarPendientes,
  proximoPendiente,
  sentar,
  turnoAutomatico,
  vistaPara,
  type Sala,
} from '../engine/sala'
import { useAjustes } from '../estado/ajustes'
import { api, hayServidor } from '../estado/api'
import { evaluarEnSegundoPlano } from '../estado/evaluador'
import { useAyudas } from '../estado/gestos'
import { anotarDecisiones } from '../estado/progreso'
import { useSesion } from '../estado/sesion'
import './Partida.css'

/** Asientos: 0 = tú (abajo), 1 = rival de la derecha, 2 = compañero (enfrente), 3 = rival de la izquierda. */
const NOMBRE_ASIENTO: Record<Asiento, string> = { 0: 'Tú', 1: 'Rival derecha', 2: 'Compañero', 3: 'Rival izquierda' }
const HEROE: Asiento = 0
const YO = { id: 'yo', nombre: 'Tú' }

interface Configuracion {
  personalidades: Record<1 | 2 | 3, string>
  pasarSenas: boolean
  /** Modo aprendizaje: señas en texto (automáticas) y ayuda con tu jugada. */
  aprendizaje: boolean
}

interface DecisionRegistrada {
  estado: EstadoMano
  accion: AccionMano
}

interface Revision {
  decision: DecisionRegistrada
  evaluacion: Evaluacion | null
}

export function Partida() {
  const [config, setConfig] = useState<Configuracion>({
    personalidades: { 1: 'equilibrado', 2: 'equilibrado', 3: 'equilibrado' },
    pasarSenas: true,
    aprendizaje: false,
  })
  const [sala, setSala] = useState<Sala | null>(null)

  if (!sala) return <Preparacion config={config} onChange={setConfig} onEmpezar={setSala} />
  return <MesaLocal inicial={sala} aprendizaje={config.aprendizaje} onSalir={() => setSala(null)} />
}

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

function Preparacion({ config, onChange, onEmpezar }: { config: Configuracion; onChange: (c: Configuracion) => void; onEmpezar: (s: Sala) => void }) {
  const { reglas } = useAjustes()
  const elegir = (asiento: 1 | 2 | 3, id: string) => onChange({ ...config, personalidades: { ...config.personalidades, [asiento]: id } })

  const empezarPartida = () => {
    const rng = crearRng(semillaAleatoria())
    let s = sentar(nuevaSala('LOCAL', reglas, false, { modoSenas: config.aprendizaje ? 'automaticas' : 'avatar' }), YO, HEROE).sala
    const asientos = s.asientos.slice()
    asientos[0] = { ...(asientos[0] as Extract<Sala['asientos'][number], { tipo: 'humano' }>), senasAuto: config.pasarSenas }
    for (const a of [1, 2, 3] as const) asientos[a] = { tipo: 'bot', personalidad: config.personalidades[a] }
    s = empezar({ ...s, asientos }, rng)
    onEmpezar(s)
  }

  return (
    <>
      <div className="titulo-pagina">
        <a href="#/jugar" className="volver">
          ← Jugar
        </a>
        <h1>Jugar contra bots</h1>
        <p>
          Una vaca completa ({reglas.juegosPorVaca} juegos a {reglas.piedras}, {reglas.reyes} reyes). Elige con quién juegas y contra quién. Al final de
          cada mano puedes revisar tus decisiones: se evalúan jugando la mano cientos de veces con cartas compatibles con lo que sabías.
        </p>
      </div>
      <div className="rejilla">
        {([1, 3, 2] as const).map((a) => (
          <Panel key={a} titulo={NOMBRE_ASIENTO[a]}>
            <div className="personalidades">
              {PERSONALIDADES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`personalidad ${config.personalidades[a] === p.id ? 'personalidad--activa' : ''}`}
                  onClick={() => elegir(a, p.id)}
                  aria-pressed={config.personalidades[a] === p.id}
                >
                  <strong>{p.nombre}</strong>
                  <span>{p.descripcion}</span>
                </button>
              ))}
            </div>
          </Panel>
        ))}
      </div>
      <Panel>
        <label className="casilla">
          <input id="aprendizaje" type="checkbox" checked={config.aprendizaje} onChange={(e) => onChange({ ...config, aprendizaje: e.target.checked })} />
          Modo aprendizaje: las señas se pasan solas y se ven escritas, y siempre ves qué jugada llevas. Sin él, las señas se hacen con la cara del avatar y hay que estar atento.
        </label>
        <label className="casilla" hidden={!config.aprendizaje}>
          <input id="pasar-senas" type="checkbox" checked={config.pasarSenas} onChange={(e) => onChange({ ...config, pasarSenas: e.target.checked })} />
          Pasar automáticamente mis señas a mi compañero (los rivales pueden pillarlas)
        </label>
        <button type="button" className="boton boton--primario" onClick={empezarPartida}>
          Empezar la partida
        </button>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------------------
// Mesa local contra bots
// ---------------------------------------------------------------------------

function MesaLocal({ inicial, onSalir, aprendizaje }: { inicial: Sala; onSalir: () => void; aprendizaje: boolean }) {
  const [ayudas, setAyudas] = useAyudas()
  const [panel, setPanel] = useState<string | null>(null)
  const [sala, setSala] = useState(inicial)
  const [decisiones, setDecisiones] = useState<DecisionRegistrada[]>([])
  const [revision, setRevision] = useState<Revision[] | null>(null)
  const [rapido, setRapido] = useState(false)
  const [rngInicial] = useState<Rng>(() => crearRng(semillaAleatoria()))
  const rng = useRef<Rng>(rngInicial)
  const registrada = useRef(false)
  const { usuario } = useSesion()

  const v = useMemo(() => vistaPara(sala, HEROE), [sala])
  const automatico = turnoAutomatico(sala)

  // Los bots juegan solos, con una pausa para que se pueda seguir la mano.
  useEffect(() => {
    if (automatico === null) return
    const t = setTimeout(() => setSala((s) => (turnoAutomatico(s) === automatico ? jugarAutomatico(s, automatico, rng.current) : s)), rapido ? 500 : 1500)
    return () => clearTimeout(t)
  }, [sala, automatico, rapido])

  // Gestos de los bots programados (señas con avatar).
  const proximo = proximoPendiente(sala)
  useEffect(() => {
    if (proximo === null) return
    const t = setTimeout(() => setSala((s) => procesarPendientes(s)), Math.max(0, proximo - Date.now()))
    return () => clearTimeout(t)
  }, [proximo])

  // Al terminar la vaca, se guarda en el perfil (si hay sesión).
  useEffect(() => {
    if (sala.fase !== 'terminada' || !sala.resultado || registrada.current || !usuario || !hayServidor) return
    registrada.current = true
    api('/api/partidas/bots', { metodo: 'POST', cuerpo: { juegos: sala.resultado.juegos, ganador: sala.resultado.ganador } }).catch(() => {})
  }, [sala, usuario])

  const jugarYo = (accion: AccionMano) => {
    const mano = sala.partida!.mano
    if (accion.tipo !== 'descarte') setDecisiones((d) => [...d, { estado: mano, accion }])
    setSala((s) => jugar(s, HEROE, accion, rng.current))
  }

  const siguiente = () => {
    setSala((s) => avanzarSiProcede(marcarListo(s, HEROE), rng.current))
    setDecisiones([])
    setRevision(null)
  }

  const revisar = async () => {
    const p = sala.partida!
    const personalidadesPos = ([0, 1, 2, 3] as Posicion[]).map((pos) => {
      const o = sala.asientos[asientoDe(p, pos)]
      return o?.tipo === 'bot' ? o.personalidad : 'equilibrado'
    })
    const miPos = posicionDe(p, HEROE)
    setRevision(decisiones.map((decision) => ({ decision, evaluacion: null })))
    const notas = [0, 0, 0]
    for (let i = 0; i < decisiones.length; i++) {
      const d = decisiones[i]
      const evaluacion = await evaluarEnSegundoPlano({
        estado: d.estado,
        heroe: miPos,
        opciones: alternativas(d.estado),
        personalidades: personalidadesPos,
        muestras: 300,
      }).catch(() => null)
      const nota = notaDecision(evaluacion, d.accion)
      if (nota !== null) notas[nota]++
      setRevision((r) => (r ? r.map((x, k) => (k === i ? { ...x, evaluacion } : x)) : r))
    }
    anotarDecisiones(notas[0], notas[1], notas[2])
  }

  const etiqueta = (a: Asiento): EtiquetaJugador => {
    const o = sala.asientos[a]
    return { nombre: NOMBRE_ASIENTO[a], detalle: o?.tipo === 'bot' ? PERSONALIDAD_POR_ID[o.personalidad]?.nombre : undefined }
  }

  return (
    <PantallaJuego
      v={v}
      etiqueta={etiqueta}
      onAccion={jugarYo}
      onSena={(sena) =>
        setSala((s) => {
          try {
            return hacerSena(s, HEROE, sena, rng.current)
          } catch {
            return s // seña fuera de tiempo: se ignora
          }
        })
      }
      onSalir={onSalir}
      textoSalir="Abandonar la partida"
      confirmarSalida={sala.fase !== 'terminada' ? '¿Abandonar la partida? Se perderá el marcador.' : undefined}
      ayudas={ayudas || aprendizaje}
      onAyudas={setAyudas}
      extraBarra={
        <button type="button" className={`juego__boton-barra juego__boton-texto ${rapido ? 'activo' : ''}`} aria-pressed={rapido} onClick={() => setRapido(!rapido)} title="Los bots juegan más rápido">
          ⏩
        </button>
      }
      finMano={
        <>
          <div className="acciones">
            {sala.fase === 'terminada' ? (
              <button type="button" className="boton boton--primario" onClick={onSalir}>
                Nueva partida
              </button>
            ) : (
              <button type="button" className="boton boton--primario" onClick={siguiente}>
                Siguiente mano →
              </button>
            )}
            {decisiones.length > 0 && (
              <button
                type="button"
                className="boton"
                onClick={() => {
                  if (!revision) revisar()
                  setPanel('revision')
                }}
              >
                {revision ? 'Ver la revisión' : 'Revisar mis decisiones'}
              </button>
            )}
          </div>
        </>
      }
      panel={panel}
      onPanel={setPanel}
      pestanas={[
        { id: 'registro', titulo: 'Registro', icono: '≡', contenido: <RegistroJuego v={v} nombre={(a) => NOMBRE_ASIENTO[a]} /> },
        ...(revision ? [{ id: 'revision', titulo: 'Revisión', icono: '✓', contenido: <ListaRevision revision={revision} /> }] : []),
      ]}
    />
  )
}

// ---------------------------------------------------------------------------
// Revisión de decisiones
// ---------------------------------------------------------------------------

/** 0 = bien, 1 = mejorable, 2 = error; null si no se pudo comparar. */
function notaDecision(ev: Evaluacion | null, accion: AccionMano): 0 | 1 | 2 | null {
  if (!ev) return null
  const mejor = Math.max(...ev.alternativas.map((a) => a.pJuego))
  const mia = ev.alternativas.find((x) => JSON.stringify(x.accion) === JSON.stringify(accion))
  if (!mia) return null
  // Lo que no supera el margen de error de la simulación no cuenta como pérdida.
  const perdida = Math.max(0, mejor - mia.pJuego - mia.margen)
  return perdida < 0.015 ? 0 : perdida < 0.04 ? 1 : 2
}

function textoAccion(a: AccionMano, e: EstadoMano): string {
  if (a.tipo === 'mus') return 'Mus'
  if (a.tipo === 'corto') return 'Corto'
  if (a.tipo === 'envite') return decirAccion(a.accion, e.envite?.fase ?? 'apertura')
  return 'Descarte'
}

function momento(e: EstadoMano): string {
  if (e.fase === 'mus') return e.ronda === 0 ? 'Mus de primeras' : `Mus tras ${e.ronda} descarte${e.ronda > 1 ? 's' : ''}`
  if (e.fase === 'envites' && e.lance && e.envite) {
    const env = e.envite
    if (env.fase === 'apertura') return `${NOMBRE_LANCE[e.lance]}: abrir`
    return `${NOMBRE_LANCE[e.lance]}: ante ${env.ordago ? 'órdago' : `envite de ${env.apostado}`}`
  }
  return ''
}

function ListaRevision({ revision }: { revision: Revision[] }) {
  return (
    <div className="revision">
      <h3>Revisión de tus decisiones</h3>
      <p className="texto-suave">
        Probabilidad de ganar el juego con cada opción, estimada jugando la mano cientos de veces con cartas compatibles con lo que
        sabías en ese momento (y con lo que hicieron los rivales).
      </p>
      {revision.map(({ decision, evaluacion }, i) => {
        const { estado, accion } = decision
        if (!evaluacion)
          return (
            <div key={i} className="decision">
              <strong>{momento(estado)}</strong>
              <span className="texto-suave">Evaluando…</span>
            </div>
          )
        const alts = [...evaluacion.alternativas].sort((a, b) => b.pJuego - a.pJuego)
        const nota = notaDecision(evaluacion, accion)
        return (
          <div key={i} className="decision">
            <div className="decision__cabecera">
              <strong>{momento(estado)}</strong>
              <Etiqueta tono={nota === 0 ? 'ok' : nota === 1 ? 'oro' : nota === 2 ? 'mal' : 'neutro'}>
                {nota === 0 ? 'Bien' : nota === 1 ? 'Mejorable' : nota === 2 ? 'Error' : 'Sin comparar'}
              </Etiqueta>
            </div>
            <div className="decision__opciones">
              {alts.map((a) => (
                <div key={JSON.stringify(a.accion)} className={`opcion-evaluada ${JSON.stringify(a.accion) === JSON.stringify(accion) ? 'opcion-evaluada--mia' : ''}`}>
                  <span>{textoAccion(a.accion, estado)}</span>
                  <span>{(a.pJuego * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

