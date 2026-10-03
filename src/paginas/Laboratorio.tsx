import { useMemo, useState } from 'react'
import { SelectorMano } from '../componentes/SelectorMano'
import { pct } from '../componentes/formato'
import { Barra, Chip, Panel, Segmentado } from '../componentes/ui'
import { CATEGORIAS_JUEGO, type AnalisisSituacion } from '../engine/analisis'
import { manoDesdeNotacion, type Carta } from '../engine/cartas'
import { conclusiones } from '../engine/conclusiones'
import { evaluar, type Jugada } from '../engine/evaluacion'
import { SENAS, type InfoJugador, type Sena } from '../engine/informacion'
import { NOMBRE_POSICION, POSICIONES, companeroDe, type Posicion } from '../engine/mesa'
import type { Escenario } from '../engine/simulacion'
import { useAjustes } from '../estado/ajustes'
import { useAnalisis } from '../estado/useAnalisis'
import './Laboratorio.css'

const MUESTRAS = 20000
const LIMITE_MS = 1200

interface InfoUI {
  senas: Sena[]
  pares?: boolean
  juego?: boolean
  seQuedoCon?: number
}

const VACIO: InfoUI = { senas: [] }

export function Laboratorio() {
  const { reglas } = useAjustes()
  const [heroe, setHeroe] = useState<Posicion>(0)
  const [mano, setMano] = useState<Carta[]>(() => manoDesdeNotacion('RRCA', reglas))
  const [infos, setInfos] = useState<Record<Posicion, InfoUI>>({ 0: VACIO, 1: VACIO, 2: VACIO, 3: VACIO })

  const completa = mano.length === 4
  const jugada = useMemo(() => (completa ? evaluar(mano, reglas) : null), [mano, reglas, completa])

  const peticion = useMemo(() => {
    if (!completa) return null
    const jugadores = POSICIONES.map((p): InfoJugador => {
      if (p === heroe) return { mano }
      const i = infos[p]
      return { senas: i.senas, pares: i.pares, juego: i.juego, seQuedoCon: i.seQuedoCon }
    }) as Escenario['jugadores']
    return { escenario: { jugadores }, heroe, reglas, n: MUESTRAS, limiteMs: LIMITE_MS }
  }, [completa, mano, heroe, infos, reglas])

  const estado = useAnalisis(peticion)
  const resultado = estado.tipo === 'listo' ? estado.resultado : estado.tipo === 'calculando' ? estado.previo : null

  const actualizar = (p: Posicion, cambios: Partial<InfoUI>) => setInfos((prev) => ({ ...prev, [p]: { ...prev[p], ...cambios } }))
  const limpiar = () => setInfos({ 0: VACIO, 1: VACIO, 2: VACIO, 3: VACIO })
  const otros = POSICIONES.filter((p) => p !== heroe).sort((a, b) => (a === companeroDe(heroe) ? -1 : b === companeroDe(heroe) ? 1 : a - b))

  return (
    <>
      <div className="titulo-pagina">
        <h1>Laboratorio</h1>
        <p>
          Describe la situación tal y como la ves en la mesa. Se simulan miles de repartos compatibles con lo que sabes y se calcula
          qué te espera en cada lance.
        </p>
      </div>

      <div className="lab">
        <div className="lab__entrada">
          <Panel titulo="Tu mano">
            <SelectorMano mano={mano} onChange={setMano} reglas={reglas} />
            <div className="campo">
              <span className="campo__titulo">Tu posición</span>
              <Segmentado
                etiqueta="Tu posición"
                valor={heroe}
                onChange={(v) => setHeroe(v)}
                opciones={POSICIONES.map((p) => ({ valor: p, texto: NOMBRE_POSICION[p] }))}
              />
            </div>
            {jugada && <ResumenJugada jugada={jugada} />}
          </Panel>

          <Panel titulo="Lo que sabes de los demás" extra={<button type="button" className="boton boton--peque" onClick={limpiar}>Limpiar</button>}>
            {otros.map((p) => (
              <PanelJugador
                key={p}
                titulo={`${p === companeroDe(heroe) ? 'Compañero' : 'Rival'} · ${NOMBRE_POSICION[p]}`}
                companero={p === companeroDe(heroe)}
                info={infos[p]}
                onChange={(c) => actualizar(p, c)}
              />
            ))}
          </Panel>
        </div>

        <div className="lab__salida">
          {!completa && <Panel><p className="texto-suave">Elige tus cuatro cartas para empezar.</p></Panel>}
          {estado.tipo === 'imposible' && (
            <Panel>
              <p className="aviso aviso--mal">
                No hay ningún reparto compatible con esa información. Revisa las señas: puede que se contradigan (por ejemplo, más de
                ocho reyes entre todos).
              </p>
            </Panel>
          )}
          {estado.tipo === 'error' && <Panel><p className="aviso aviso--mal">Error en el cálculo: {estado.mensaje}</p></Panel>}
          {resultado && jugada && (
            <Resultados a={resultado} jugada={jugada} heroe={heroe} calculando={estado.tipo === 'calculando'} />
          )}
        </div>
      </div>
    </>
  )
}

function ResumenJugada({ jugada }: { jugada: Jugada }) {
  const pares = jugada.pares.tipo === 'ninguno' ? 'Sin pares' : { pareja: 'Pareja', medias: 'Medias', duples: 'Duples' }[jugada.pares.tipo]
  const juego = jugada.juego.real ? 'La Real' : jugada.juego.tiene ? `Juego: ${jugada.juego.puntos}` : `Punto: ${jugada.juego.puntos}`
  return (
    <div className="resumen-jugada">
      <span className="etiqueta">{pares}</span>
      <span className="etiqueta">{juego}</span>
    </div>
  )
}

const SENAS_ORDEN: Sena[] = ['dosReyes', 'tresReyes', 'dosPitos', 'tresPitos', 'pares', 'medias', 'duples', 'la31', 'juego', 'treinta', 'ciego']

function PanelJugador({ titulo, companero, info, onChange }: { titulo: string; companero: boolean; info: InfoUI; onChange: (c: Partial<InfoUI>) => void }) {
  const alternar = (s: Sena) => onChange({ senas: info.senas.includes(s) ? info.senas.filter((x) => x !== s) : [...info.senas, s] })
  return (
    <div className={`jugador ${companero ? 'jugador--companero' : 'jugador--rival'}`}>
      <h3>{titulo}</h3>
      <div className="campo">
        <span className="campo__titulo">Señas vistas</span>
        <div className="chips">
          {SENAS_ORDEN.map((s) => (
            <Chip key={s} activo={info.senas.includes(s)} onClick={() => alternar(s)} title={SENAS[s].gesto}>
              {SENAS[s].nombre}
            </Chip>
          ))}
        </div>
      </div>
      <div className="jugador__fila">
        <div className="campo">
          <span className="campo__titulo">Pares</span>
          <Segmentado peque etiqueta="Pares" valor={info.pares} onChange={(v) => onChange({ pares: v })} opciones={[{ valor: undefined, texto: '?' }, { valor: true, texto: 'Sí' }, { valor: false, texto: 'No' }]} />
        </div>
        <div className="campo">
          <span className="campo__titulo">Juego</span>
          <Segmentado peque etiqueta="Juego" valor={info.juego} onChange={(v) => onChange({ juego: v })} opciones={[{ valor: undefined, texto: '?' }, { valor: true, texto: 'Sí' }, { valor: false, texto: 'No' }]} />
        </div>
        <div className="campo">
          <span className="campo__titulo" title="Cartas que conservó en el último descarte">Se quedó con</span>
          <Segmentado
            peque
            etiqueta="Cartas que conservó en el último descarte"
            valor={info.seQuedoCon}
            onChange={(v) => onChange({ seQuedoCon: v })}
            opciones={[{ valor: undefined, texto: '?' }, { valor: 0, texto: '0' }, { valor: 1, texto: '1' }, { valor: 2, texto: '2' }, { valor: 3, texto: '3' }]}
          />
        </div>
      </div>
    </div>
  )
}

function Resultados({ a, jugada, heroe, calculando }: { a: AnalisisSituacion; jugada: Jugada; heroe: Posicion; calculando: boolean }) {
  const lecturas = conclusiones(a, jugada, heroe)
  const { pareja } = a
  return (
    <div className={`resultados ${calculando ? 'resultados--calculando' : ''}`} aria-busy={calculando}>
      <Panel titulo="Lectura rápida" extra={<span className="texto-suave">{a.muestras.toLocaleString('es')} repartos</span>}>
        <ul className="lista-limpia lecturas">
          {lecturas.map((c, i) => (
            <li key={i} className={`lectura lectura--${c.tono}`}>
              {c.texto}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel titulo="Vuestra pareja gana…">
        <Barra etiqueta="Grandes" valor={pareja.grandes} />
        <Barra etiqueta="Chicas" valor={pareja.chicas} />
        <Barra
          etiqueta="Pares"
          valor={pareja.pares.ganamos}
          detalle={`Pares los dos: ${pct(pareja.pares.ambas)} · sólo vosotros: ${pct(pareja.pares.nosotros)} · sólo ellos: ${pct(pareja.pares.ellos)} · nadie: ${pct(pareja.pares.ninguna)}`}
        />
        <Barra
          etiqueta="Juego"
          valor={pareja.juego.ganamos}
          detalle={`Juego los dos: ${pct(pareja.juego.ambas)} · sólo vosotros: ${pct(pareja.juego.nosotros)} · sólo ellos: ${pct(pareja.juego.ellos)} · nadie (punto): ${pct(pareja.juego.ninguna)}`}
        />
        <Barra etiqueta="Punto (si nadie tiene juego)" valor={pareja.punto} />
      </Panel>

      <Panel titulo="Tu mano es la mejor de la mesa…">
        <Barra etiqueta="A grandes" valor={a.individual.grandes} tono="neutro" />
        <Barra etiqueta="A chicas" valor={a.individual.chicas} tono="neutro" />
        {jugada.pares.tipo !== 'ninguno' && <Barra etiqueta="A pares" valor={a.individual.pares} tono="neutro" />}
        {jugada.juego.tiene && <Barra etiqueta="A juego" valor={a.individual.juego} tono="neutro" />}
      </Panel>

      <Panel titulo="Qué llevan los demás">
        <table className="tabla">
          <thead>
            <tr>
              <th />
              <th>Algún rival</th>
              <th>Compañero</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Pares', 'pares'],
                ['Medias o duples', 'mediasOMas'],
                ['Duples', 'duples'],
                ['Juego', 'juego'],
                ['La 31', 'la31'],
              ] as const
            ).map(([t, k]) => (
              <tr key={k}>
                <th scope="row">{t}</th>
                <td>{pct(a.rivales[k])}</td>
                <td>{pct(a.companero[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel titulo="Mejor juego de los rivales">
        {CATEGORIAS_JUEGO.map((c) => (
          <Barra key={c} etiqueta={c === 'sin juego' ? 'Ninguno tiene juego' : `La ${c}`} valor={a.mejorJuegoRival[c]} tono="ellos" />
        ))}
      </Panel>

      <Panel titulo="Valor de las cartas (todo en paso)">
        <p className="texto-suave">Piedras medias que cobraría cada pareja si nadie envidara.</p>
        <table className="tabla">
          <thead>
            <tr>
              <th />
              <th>Vosotros</th>
              <th>Ellos</th>
            </tr>
          </thead>
          <tbody>
            {(['grandes', 'chicas', 'pares', 'juego', 'punto'] as const).map((l) => (
              <tr key={l}>
                <th scope="row">{l[0].toUpperCase() + l.slice(1)}</th>
                <td>{a.enPaso.porLance[l].nosotros.toFixed(2)}</td>
                <td>{a.enPaso.porLance[l].ellos.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="tabla__total">
              <th scope="row">Total</th>
              <td>{a.enPaso.nosotros.toFixed(2)}</td>
              <td>{a.enPaso.ellos.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
