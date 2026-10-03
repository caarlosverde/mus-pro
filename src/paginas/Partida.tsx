import { useEffect, useMemo, useRef, useState } from 'react'
import { Carta, CartaOculta } from '../componentes/Carta'
import { Etiqueta, Panel } from '../componentes/ui'
import { crearRng, semillaAleatoria, type Rng } from '../engine/azar'
import { PERSONALIDADES, PERSONALIDAD_POR_ID, decidir, type Personalidad } from '../engine/bots'
import type { Carta as TCarta } from '../engine/cartas'
import { describirJugada } from '../engine/entrenadorCorte'
import { accionesLegales, decirAccion, type AccionEnvite } from '../engine/envites'
import { alternativas, type Evaluacion } from '../engine/evaluador'
import { SENAS } from '../engine/informacion'
import { aplicar, senasConocidas, type AccionMano, type EstadoMano, type EventoMano } from '../engine/mano'
import { NOMBRE_LANCE, NOMBRE_POSICION, type Pareja, type Posicion } from '../engine/mesa'
import {
  asientoDe,
  equipoDe,
  nuevaPartida,
  posicionDe,
  siguienteMano,
  type Asiento,
  type EstadoPartida,
} from '../engine/partida'
import { useAjustes } from '../estado/ajustes'
import { evaluarEnSegundoPlano } from '../estado/evaluador'
import './Partida.css'

/** Asientos: 0 = tú (abajo), 1 = rival de la derecha, 2 = compañero (enfrente), 3 = rival de la izquierda. */
const NOMBRE_ASIENTO: Record<Asiento, string> = { 0: 'Tú', 1: 'Rival derecha', 2: 'Compañero', 3: 'Rival izquierda' }
const HEROE: Asiento = 0

interface Configuracion {
  personalidades: Record<1 | 2 | 3, string>
  pasarSenas: boolean
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
  })
  const [partida, setPartida] = useState<EstadoPartida | null>(null)

  if (!partida) return <Preparacion config={config} onChange={setConfig} onEmpezar={(p) => setPartida(p)} />
  return <Mesa config={config} inicial={partida} onSalir={() => setPartida(null)} />
}

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

function Preparacion({ config, onChange, onEmpezar }: { config: Configuracion; onChange: (c: Configuracion) => void; onEmpezar: (p: EstadoPartida) => void }) {
  const { reglas } = useAjustes()
  const elegir = (asiento: 1 | 2 | 3, id: string) => onChange({ ...config, personalidades: { ...config.personalidades, [asiento]: id } })

  const empezar = () => {
    const rng = crearRng(Date.now())
    const senas = [config.pasarSenas ? 1 : 0, ...([1, 2, 3] as const).map((a) => PERSONALIDAD_POR_ID[config.personalidades[a]].senas)] as [number, number, number, number]
    onEmpezar(nuevaPartida(reglas, { probSenas: senas, probPillar: 0.2 }, rng, Math.floor(rng() * 4) as Asiento))
  }

  return (
    <>
      <div className="titulo-pagina">
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
          <input type="checkbox" checked={config.pasarSenas} onChange={(e) => onChange({ ...config, pasarSenas: e.target.checked })} />
          Pasar automáticamente mis señas a mi compañero (los rivales pueden pillarlas)
        </label>
        <button type="button" className="boton boton--primario" onClick={empezar}>
          Empezar la partida
        </button>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------------------
// Mesa de juego
// ---------------------------------------------------------------------------

function Mesa({ config, inicial, onSalir }: { config: Configuracion; inicial: EstadoPartida; onSalir: () => void }) {
  const [partida, setPartida] = useState(inicial)
  const [decisiones, setDecisiones] = useState<DecisionRegistrada[]>([])
  const [revision, setRevision] = useState<Revision[] | null>(null)
  const [rapido, setRapido] = useState(false)
  const [rngInicial] = useState<Rng>(() => crearRng(semillaAleatoria()))
  const rng = useRef<Rng>(rngInicial)

  const per = useMemo(() => {
    const porAsiento: Record<Asiento, Personalidad> = {
      0: PERSONALIDAD_POR_ID.equilibrado,
      1: PERSONALIDAD_POR_ID[config.personalidades[1]],
      2: PERSONALIDAD_POR_ID[config.personalidades[2]],
      3: PERSONALIDAD_POR_ID[config.personalidades[3]],
    }
    return porAsiento
  }, [config])

  const e = partida.mano
  const turnoAsiento = e.turno === null ? null : asientoDe(partida, e.turno)
  const miPos = posicionDe(partida, HEROE)

  // Los bots juegan solos, con una pausa para que se pueda seguir la mano.
  useEffect(() => {
    if (e.fase === 'fin' || turnoAsiento === null || turnoAsiento === HEROE) return
    const t = setTimeout(
      () => {
        setPartida((p) => {
          const pos = p.mano.turno
          if (pos === null) return p
          const a = asientoDe(p, pos)
          if (a === HEROE) return p
          const accion = decidir(p.mano, pos, per[a], rng.current)
          return { ...p, mano: aplicar(p.mano, accion, rng.current) }
        })
      },
      rapido ? 120 : 650,
    )
    return () => clearTimeout(t)
  }, [e, turnoAsiento, per, rapido])

  const jugar = (accion: AccionMano) => {
    setDecisiones((d) => (accion.tipo === 'descarte' ? d : [...d, { estado: partida.mano, accion }]))
    setPartida((p) => ({ ...p, mano: aplicar(p.mano, accion, rng.current) }))
  }

  const siguiente = () => {
    setPartida((p) => siguienteMano(p, rng.current))
    setDecisiones([])
    setRevision(null)
  }

  const revisar = async () => {
    const personalidadesPos = [0, 1, 2, 3].map((pos) => per[asientoDe(partida, pos as Posicion)].id)
    const iniciales: Revision[] = decisiones.map((decision) => ({ decision, evaluacion: null }))
    setRevision(iniciales)
    for (let i = 0; i < decisiones.length; i++) {
      const d = decisiones[i]
      const evaluacion = await evaluarEnSegundoPlano({
        estado: d.estado,
        heroe: miPos,
        opciones: alternativas(d.estado),
        personalidades: personalidadesPos,
        muestras: 300,
      }).catch(() => null)
      setRevision((r) => (r ? r.map((x, k) => (k === i ? { ...x, evaluacion } : x)) : r))
    }
  }

  const nombre = (pos: Posicion) => NOMBRE_ASIENTO[asientoDe(partida, pos)]
  const nuestraPareja: Pareja = equipoDe(partida.asientoMano) === 0 ? 'mano' : 'postre'
  const tantosNos = e.marcador[nuestraPareja] + e.cobrado[nuestraPareja]
  const tantosEllos = e.marcador[nuestraPareja === 'mano' ? 'postre' : 'mano'] + e.cobrado[nuestraPareja === 'mano' ? 'postre' : 'mano']

  return (
    <>
      <div className="partida__cabecera">
        <div className="marcador-partida">
          <div>
            <span>Nosotros</span>
            <strong>{e.fase === 'fin' ? e.resultado!.marcador[nuestraPareja] : tantosNos}</strong>
            <small>{partida.juegos[0]} juegos</small>
          </div>
          <div className="marcador-partida__sep">a {partida.reglas.piedras}</div>
          <div>
            <span>Ellos</span>
            <strong>{e.fase === 'fin' ? e.resultado!.marcador[nuestraPareja === 'mano' ? 'postre' : 'mano'] : tantosEllos}</strong>
            <small>{partida.juegos[1]} juegos</small>
          </div>
        </div>
        <div className="partida__controles">
          <label className="casilla">
            <input type="checkbox" checked={rapido} onChange={(ev) => setRapido(ev.target.checked)} /> Rápido
          </label>
          <button type="button" className="boton boton--peque" onClick={onSalir}>
            Abandonar
          </button>
        </div>
      </div>

      <MesaVisual partida={partida} per={per} />

      <div className="partida__inferior">
        <Panel titulo={tituloFase(e)}>
          {e.fase !== 'fin' && turnoAsiento === HEROE && <Controles e={e} pos={miPos} onJugar={jugar} />}
          {e.fase !== 'fin' && turnoAsiento !== HEROE && turnoAsiento !== null && (
            <p className="texto-suave">Habla {NOMBRE_ASIENTO[turnoAsiento].toLowerCase()}…</p>
          )}
          {e.fase === 'fin' && (
            <FinDeMano
              partida={partida}
              nuestra={nuestraPareja}
              revision={revision}
              hayDecisiones={decisiones.length > 0}
              onRevisar={revisar}
              onSiguiente={siguiente}
              onSalir={onSalir}
            />
          )}
        </Panel>
        <Panel titulo="Lo que ha pasado">
          <Registro e={e} nombre={nombre} />
        </Panel>
      </div>
    </>
  )
}

function tituloFase(e: EstadoMano): string {
  if (e.fase === 'mus') return e.ronda === 0 ? '¿Mus?' : `¿Mus? (tras ${e.ronda} descarte${e.ronda > 1 ? 's' : ''})`
  if (e.fase === 'descarte') return 'Descarte'
  if (e.fase === 'envites' && e.lance) return NOMBRE_LANCE[e.lance]
  return 'Fin de la mano'
}

// ---------------------------------------------------------------------------
// Mesa visual
// ---------------------------------------------------------------------------

function MesaVisual({ partida, per }: { partida: EstadoPartida; per: Record<Asiento, Personalidad> }) {
  const e = partida.mano
  const miPos = posicionDe(partida, HEROE)
  const fin = e.fase === 'fin'
  const senas = senasConocidas(e, miPos)
  const misSenas = e.senas.filter((s) => s.de === miPos)

  const asiento = (a: Asiento, lugar: string) => {
    const pos = posicionDe(partida, a)
    const turno = e.turno === pos
    const ultima = ultimaAccion(e, pos)
    const sus = senas.filter((s) => s.de === pos)
    const visible = a === HEROE || fin
    const senasTexto = (lista: typeof senas) => lista.map((s) => SENAS[s.sena].nombre.toLowerCase()).join(', ')
    return (
      <div className={`plaza plaza--${lugar} ${turno ? 'plaza--turno' : ''} ${a % 2 === 0 ? 'plaza--nuestra' : 'plaza--suya'}`}>
        <div className="plaza__nombre">
          <strong>{NOMBRE_ASIENTO[a]}</strong>
          <span>
            {NOMBRE_POSICION[pos]}
            {a !== HEROE && ` · ${per[a].nombre}`}
          </span>
        </div>
        {/* Lo último que ha dicho, como un bocadillo encima de sus cartas. */}
        <div className="plaza__dice" aria-live="polite">
          {ultima && <span className="bocadillo">{ultima}</span>}
        </div>
        <div className="mano">
          {e.manos[pos].map((c, i) => (visible ? <Carta key={c} carta={c} tamano={a === HEROE ? 'normal' : 'peque'} /> : <CartaOculta key={i} tamano="peque" />))}
        </div>
        {(a === HEROE || fin) && (
          <div className={`plaza__jugada ${a === HEROE ? 'plaza__jugada--mia' : ''}`}>
            {a === HEROE && <span className="plaza__etiqueta">Tu jugada</span>}
            {describirJugada(e.jugadas[pos])}
          </div>
        )}
        {a === HEROE && misSenas.length > 0 && !fin && (
          <div className="nota-sena">
            <span className="plaza__etiqueta">Seña a tu compañero</span>
            {senasTexto(misSenas)}
          </div>
        )}
        {a !== HEROE && sus.length > 0 && (
          <div className="nota-sena">
            <span className="plaza__etiqueta">{a === 2 ? 'Te pasa' : 'Le pillas'}</span>
            {senasTexto(sus)}
          </div>
        )}
      </div>
    )
  }

  const env = e.envite
  return (
    <div className="mesa-partida tapete">
      {asiento(2, 'arriba')}
      {asiento(3, 'izquierda')}
      <div className="mesa-partida__centro">
        {e.fase === 'envites' && e.lance && <div className="lance-actual">{NOMBRE_LANCE[e.lance]}</div>}
        {env && env.apostado > 0 && (
          <div className="bote">{env.ordago ? '¡Órdago!' : `Envite: ${env.apostado}${env.fase === 'respuesta' ? ` (no quiero: ${env.porqueNo})` : ''}`}</div>
        )}
        {e.fase === 'mus' && <div className="lance-actual">{e.ronda === 0 ? 'Primeras dadas' : `Descartes: ${e.ronda}`}</div>}
      </div>
      {asiento(1, 'derecha')}
      {asiento(0, 'abajo')}
    </div>
  )
}

/** Lo último que ha dicho un jugador en la ronda actual. */
function ultimaAccion(e: EstadoMano, pos: Posicion): string | null {
  const ini = e.eventos.findLastIndex((x) => x.tipo === 'reparto')
  for (let i = e.eventos.length - 1; i > ini; i--) {
    const ev = e.eventos[i]
    if (ev.tipo === 'cierre') return null
    if ('pos' in ev && ev.pos === pos) {
      if (ev.tipo === 'mus') return ev.corta ? '¡Corto!' : 'Mus'
      if (ev.tipo === 'envite') return ev.texto
      if (ev.tipo === 'declaracion' && e.lance === ev.lance) return `${ev.lance === 'pares' ? 'Pares' : 'Juego'} ${ev.tiene ? 'sí' : 'no'}`
      if (ev.tipo === 'descarte') return `Se descarta de ${ev.cartas}`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Controles del jugador
// ---------------------------------------------------------------------------

function Controles({ e, pos, onJugar }: { e: EstadoMano; pos: Posicion; onJugar: (a: AccionMano) => void }) {
  const [seleccion, setSeleccion] = useState<TCarta[]>([])
  const [cantidad, setCantidad] = useState(3)

  if (e.fase === 'mus') {
    return (
      <div className="acciones">
        <button type="button" className="boton" onClick={() => onJugar({ tipo: 'mus' })}>
          Mus
        </button>
        <button type="button" className="boton boton--primario" onClick={() => onJugar({ tipo: 'corto' })}>
          Corto
        </button>
      </div>
    )
  }

  if (e.fase === 'descarte') {
    const alternar = (c: TCarta) => setSeleccion((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
    return (
      <div className="descarte">
        <p className="texto-suave">Toca las cartas que quieres soltar (al menos una).</p>
        <div className="mano">
          {e.manos[pos].map((c) => (
            <span key={c} className={`seleccionable ${seleccion.includes(c) ? 'seleccionable--activa' : ''}`}>
              <Carta carta={c} onClick={() => alternar(c)} etiqueta={seleccion.includes(c) ? 'Conservar' : 'Descartar'} />
            </span>
          ))}
        </div>
        <button
          type="button"
          className="boton boton--primario"
          disabled={seleccion.length === 0}
          onClick={() => {
            onJugar({ tipo: 'descarte', cartas: seleccion })
            setSeleccion([])
          }}
        >
          Descartar {seleccion.length || ''}
        </button>
      </div>
    )
  }

  if (e.fase === 'envites' && e.envite) {
    const env = e.envite
    const legales = accionesLegales(env)
    const jugar = (accion: AccionEnvite) => onJugar({ tipo: 'envite', accion })
    const respuesta = env.fase === 'respuesta'
    return (
      <div className="acciones">
        {legales.includes('paso') && (
          <button type="button" className="boton" onClick={() => jugar({ tipo: 'paso' })}>
            {respuesta ? 'No quiero' : 'Paso'}
          </button>
        )}
        {legales.includes('quiero') && (
          <button type="button" className="boton boton--primario" onClick={() => jugar({ tipo: 'quiero' })}>
            Quiero
          </button>
        )}
        {legales.includes('envido') && (
          <>
            <button type="button" className="boton" onClick={() => jugar({ tipo: 'envido', piedras: 2 })}>
              {respuesta ? '2 más' : 'Envido'}
            </button>
            <span className="envite-libre">
              <button type="button" className="boton boton--peque" onClick={() => setCantidad((c) => Math.max(3, c - 1))} aria-label="Menos">
                −
              </button>
              <button type="button" className="boton" onClick={() => jugar({ tipo: 'envido', piedras: cantidad })}>
                {respuesta ? `${cantidad} más` : `Envido ${cantidad}`}
              </button>
              <button type="button" className="boton boton--peque" onClick={() => setCantidad((c) => Math.min(30, c + 1))} aria-label="Más">
                +
              </button>
            </span>
          </>
        )}
        {legales.includes('ordago') && (
          <button type="button" className="boton boton--ordago" onClick={() => jugar({ tipo: 'ordago' })}>
            Órdago
          </button>
        )}
      </div>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Fin de mano y revisión
// ---------------------------------------------------------------------------

function FinDeMano({
  partida,
  nuestra,
  revision,
  hayDecisiones,
  onRevisar,
  onSiguiente,
  onSalir,
}: {
  partida: EstadoPartida
  nuestra: Pareja
  revision: Revision[] | null
  hayDecisiones: boolean
  onRevisar: () => void
  onSiguiente: () => void
  onSalir: () => void
}) {
  const r = partida.mano.resultado!
  const quien = (p: Pareja) => (p === nuestra ? 'Vosotros' : 'Ellos')
  const ganaJuego = r.ganadorJuego
  // Se adelanta el resultado de la vaca: siguienteMano aplicará este juego.
  const juegos: [number, number] = [...partida.juegos]
  if (ganaJuego) juegos[ganaJuego === nuestra ? 0 : 1]++
  const finVaca = Math.max(...juegos) >= partida.reglas.juegosPorVaca

  return (
    <div className="fin-mano">
      {ganaJuego && (
        <p className={`aviso ${ganaJuego === nuestra ? 'aviso--ok' : 'aviso--mal'}`}>
          {ganaJuego === nuestra ? '¡Juego para vosotros!' : 'Juego para ellos.'} {finVaca && (juegos[0] > juegos[1] ? '¡Y la vaca! 🏆' : 'Se llevan la vaca.')}
        </p>
      )}
      <ul className="lista-limpia recuento">
        {r.eventos.map((ev, i) => (
          <li key={i} className={ev.pareja === nuestra ? 'recuento--nos' : 'recuento--ellos'}>
            <span>{ev.motivo}</span>
            <strong>
              {quien(ev.pareja)} +{ev.piedras}
            </strong>
          </li>
        ))}
      </ul>
      <div className="acciones">
        {finVaca ? (
          <button type="button" className="boton boton--primario" onClick={onSalir}>
            Nueva partida
          </button>
        ) : (
          <button type="button" className="boton boton--primario" onClick={onSiguiente}>
            Siguiente mano →
          </button>
        )}
        {hayDecisiones && !revision && (
          <button type="button" className="boton" onClick={onRevisar}>
            Revisar mis decisiones
          </button>
        )}
      </div>
      {revision && <ListaRevision revision={revision} />}
    </div>
  )
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
        const mejor = alts[0]
        const mia = evaluacion.alternativas.find((x) => JSON.stringify(x.accion) === JSON.stringify(accion))
        const perdida = mia ? mejor.pJuego - mia.pJuego : 0
        const nota = !mia ? 'neutro' : perdida < 0.015 ? 'ok' : perdida < 0.04 ? 'oro' : 'mal'
        return (
          <div key={i} className="decision">
            <div className="decision__cabecera">
              <strong>{momento(estado)}</strong>
              <Etiqueta tono={nota === 'neutro' ? 'neutro' : nota}>
                {nota === 'ok' ? 'Bien' : nota === 'oro' ? 'Mejorable' : nota === 'mal' ? 'Error' : 'Sin comparar'}
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

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

function Registro({ e, nombre }: { e: EstadoMano; nombre: (p: Posicion) => string }) {
  const lineas = e.eventos.map((ev) => textoEvento(ev, nombre)).filter((x): x is string => x !== null)
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lineas.length])
  return (
    <ol className="registro" ref={ref}>
      {lineas.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ol>
  )
}

function textoEvento(ev: EventoMano, nombre: (p: Posicion) => string): string | null {
  switch (ev.tipo) {
    case 'reparto':
      return ev.ronda === 0 ? 'Se reparten las cartas.' : `Se reparten los descartes (ronda ${ev.ronda}).`
    case 'mus':
      return `${nombre(ev.pos)}: ${ev.corta ? '¡corto!' : 'mus'}`
    case 'descarte':
      return `${nombre(ev.pos)} se descarta de ${ev.cartas}.`
    case 'declaracion':
      return `${nombre(ev.pos)}: ${ev.lance} ${ev.tiene ? 'sí' : 'no'}`
    case 'envite':
      return `${NOMBRE_LANCE[ev.lance]} · ${nombre(ev.pos)}: ${ev.texto}`
    case 'cierre':
      return `→ ${ev.texto}`
  }
}

