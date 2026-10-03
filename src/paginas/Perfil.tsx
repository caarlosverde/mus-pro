import { useEffect, useState } from 'react'
import { Panel } from '../componentes/ui'
import { PROBLEMAS } from '../datos/problemas'
import { api, hayServidor } from '../estado/api'
import { useProgreso, type ProgresoCorte, type ProgresoDecisiones, type ProgresoProblemas } from '../estado/progreso'
import { useSesion } from '../estado/sesion'
import './Perfil.css'

interface PerfilServidor {
  nombre: string
  creado: number
  partidas: Partial<Record<'online' | 'bots', { jugadas: number; ganadas: number }>>
  recientes: { id: string; modo: 'online' | 'bots'; creada: number; gano: boolean; juegos: [number, number]; companeros: string[]; rivales: string[] }[]
  progreso: { corte?: ProgresoCorte; problemas?: ProgresoProblemas; decisiones?: ProgresoDecisiones }
}

export function Perfil({ nombre }: { nombre?: string }) {
  const { usuario, cargando } = useSesion()
  const propio = !nombre || (usuario !== null && nombre.toLowerCase() === usuario.nombre.toLowerCase())
  const quien = nombre ?? usuario?.nombre ?? null
  const [datos, setDatos] = useState<PerfilServidor | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Progreso local (sincronizado si hay sesión): siempre el más reciente para el propio perfil.
  const corteLocal = useProgreso('corte')
  const problemasLocal = useProgreso('problemas')
  const decisionesLocal = useProgreso('decisiones')

  useEffect(() => {
    if (!hayServidor || !quien) return
    let vigente = true
    api<PerfilServidor>(`/api/perfil/${encodeURIComponent(quien)}`, { token: null })
      .then((d) => vigente && setDatos(d))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : 'No se pudo cargar el perfil'))
    return () => {
      vigente = false
    }
  }, [quien])

  if (cargando) return <p className="texto-suave">Comprobando tu sesión…</p>
  if (!propio && error) return <Panel><p className="aviso aviso--mal">{error}</p></Panel>

  const corte = propio ? corteLocal : (datos?.progreso.corte ?? null)
  const problemas = propio ? problemasLocal : (datos?.progreso.problemas ?? {})
  const decisiones = propio ? decisionesLocal : (datos?.progreso.decisiones ?? null)

  return (
    <div className="perfil">
      <div className="titulo-pagina">
        <h1>{quien ?? 'Tu progreso'}</h1>
        <p>
          {datos ? `Jugando desde ${new Date(datos.creado).toLocaleDateString('es', { month: 'long', year: 'numeric' })}.` : ''}{' '}
          {propio && !usuario && hayServidor && (
            <>
              Tu progreso se guarda sólo en este dispositivo. <a href="#/cuenta">Crea una cuenta</a> para conservarlo y verlo en el móvil y en el ordenador.
            </>
          )}
        </p>
      </div>

      <Resumen datos={datos} corte={corte} problemas={problemas} decisiones={decisiones} />

      <div className="rejilla">
        <Panel titulo="Acierto en el entrenador de corte">
          <GraficaSemanas
            serie={semanas(corte?.dias ?? {}, ([n, a]) => ({ valor: n ? a / n : null, n }))}
            unidad="manos"
            vacio={corte?.intentos ? 'Tus próximas respuestas se irán viendo aquí, semana a semana.' : 'Todavía no has entrenado el corte. Cada respuesta suma aquí.'}
          />
        </Panel>
        <Panel titulo="Decisiones bien tomadas en partida">
          <GraficaSemanas
            serie={semanas(decisiones?.dias ?? {}, ([b, m, e]) => {
              const n = b + m + e
              return { valor: n ? b / n : null, n }
            })}
            unidad="decisiones"
            vacio='Juega contra los bots y pulsa "Revisar mis decisiones" al acabar las manos.'
          />
        </Panel>
      </div>

      {datos && datos.recientes.length > 0 && (
        <Panel titulo="Últimas partidas">
          <ul className="lista-limpia recientes">
            {datos.recientes.map((r) => (
              <li key={r.id} className={r.gano ? 'reciente--gana' : 'reciente--pierde'}>
                <span className="reciente__resultado">{r.gano ? 'Victoria' : 'Derrota'}</span>
                <span className="reciente__marcador">
                  {r.juegos[0]}–{r.juegos[1]}
                </span>
                <span className="reciente__detalle">
                  {r.modo === 'bots'
                    ? 'Contra bots'
                    : [r.companeros.length ? `con ${r.companeros.join(', ')}` : 'con un bot', r.rivales.length ? `contra ${r.rivales.join(', ')}` : 'contra bots'].join(' ')}
                </span>
                <span className="texto-suave">{new Date(r.creada).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function Resumen({
  datos,
  corte,
  problemas,
  decisiones,
}: {
  datos: PerfilServidor | null
  corte: ProgresoCorte | null
  problemas: ProgresoProblemas
  decisiones: ProgresoDecisiones | null
}) {
  const pct = (a: number, n: number) => (n ? `${Math.round((a / n) * 100)}%` : '—')
  const online = datos?.partidas.online
  const bots = datos?.partidas.bots
  const resueltos = Object.values(problemas).filter((v) => v === 'acierto').length
  const totDec = Object.values(decisiones?.dias ?? {}).reduce((acc, [b, m, e]) => [acc[0] + b, acc[1] + b + m + e], [0, 0])
  const fichas = [
    { titulo: 'Vacas online', valor: online ? `${online.ganadas}/${online.jugadas}` : '—', detalle: online ? `${pct(online.ganadas, online.jugadas)} ganadas` : 'Sin partidas todavía' },
    { titulo: 'Vacas contra bots', valor: bots ? `${bots.ganadas}/${bots.jugadas}` : '—', detalle: bots ? `${pct(bots.ganadas, bots.jugadas)} ganadas` : 'Sin partidas todavía' },
    { titulo: 'Entrenador de corte', valor: corte ? pct(corte.aciertos, corte.intentos) : '—', detalle: corte?.intentos ? `${corte.intentos} manos · mejor racha ${corte.mejorRacha}` : 'Sin entrenar todavía' },
    { titulo: 'Problemas de final', valor: `${resueltos}/${PROBLEMAS.length}`, detalle: 'acertados al primer intento' },
    { titulo: 'Decisiones en partida', valor: pct(totDec[0], totDec[1]), detalle: totDec[1] ? `bien tomadas de ${totDec[1]} revisadas` : 'Sin revisiones todavía' },
  ]
  return (
    <div className="fichas">
      {fichas.map((f) => (
        <div key={f.titulo} className="ficha">
          <span className="ficha__titulo">{f.titulo}</span>
          <strong className="ficha__valor">{f.valor}</strong>
          <span className="ficha__detalle">{f.detalle}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gráfica por semanas
// ---------------------------------------------------------------------------

interface PuntoSemana {
  etiqueta: string
  largo: string
  valor: number | null
  n: number
}

const SEMANAS = 8

/** Agrupa datos diarios (AAAA-MM-DD) en las últimas 8 semanas (de lunes a domingo). */
function semanas<T>(dias: Record<string, T>, resumir: (acumulado: T) => { valor: number | null; n: number }): PuntoSemana[] {
  const lunes = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
    return x
  }
  const actual = lunes(new Date())
  const out: PuntoSemana[] = []
  for (let i = SEMANAS - 1; i >= 0; i--) {
    const ini = new Date(actual)
    ini.setDate(ini.getDate() - 7 * i)
    const fin = new Date(ini)
    fin.setDate(fin.getDate() + 7)
    let acum: T | null = null
    for (const [dia, v] of Object.entries(dias)) {
      const [a, m, d] = dia.split('-').map(Number)
      const fecha = new Date(a, m - 1, d)
      if (fecha < ini || fecha >= fin) continue
      acum = acum === null ? v : (sumar(acum, v) as T)
    }
    const r = acum === null ? { valor: null, n: 0 } : resumir(acum)
    out.push({
      etiqueta: ini.toLocaleDateString('es', { day: 'numeric', month: 'numeric' }),
      largo: `Semana del ${ini.toLocaleDateString('es', { day: 'numeric', month: 'long' })}`,
      ...r,
    })
  }
  return out
}

function sumar(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => (x as number) + ((b[i] as number) ?? 0))
  return a
}

function GraficaSemanas({ serie, unidad, vacio }: { serie: PuntoSemana[]; unidad: string; vacio: string }) {
  const [activo, setActivo] = useState<number | null>(null)
  if (serie.every((p) => p.valor === null)) return <p className="texto-suave">{vacio}</p>

  const ancho = 320
  const alto = 150
  const izq = 30
  const arriba = 10
  const abajo = 22
  const altoPlot = alto - arriba - abajo
  const columna = (ancho - izq) / serie.length
  const barra = Math.min(22, columna - 8)
  const y = (v: number) => arriba + altoPlot * (1 - v)
  const sel = activo !== null ? serie[activo] : null
  const ultimo = [...serie].reverse().find((p) => p.valor !== null)!

  return (
    <div className="grafica">
      <p className="grafica__lectura" aria-live="polite">
        {sel
          ? sel.valor === null
            ? `${sel.largo}: sin datos`
            : `${sel.largo}: ${Math.round(sel.valor * 100)}% (${sel.n} ${unidad})`
          : `Última semana con datos: ${Math.round(ultimo.valor! * 100)}%`}
      </p>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="grafica__svg" role="img" aria-label={`Porcentaje por semana en las últimas ${SEMANAS} semanas`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={izq} x2={ancho} y1={y(t)} y2={y(t)} className={t === 0 ? 'grafica__base' : 'grafica__rejilla'} />
            <text x={izq - 6} y={y(t) + 3.5} className="grafica__eje" textAnchor="end">
              {t * 100}%
            </text>
          </g>
        ))}
        {serie.map((p, i) => {
          const cx = izq + columna * i + columna / 2
          const x = cx - barra / 2
          const h = p.valor === null ? 0 : Math.max(2, altoPlot * p.valor)
          const r = Math.min(4, h / 2, barra / 2)
          const top = y(0) - h
          // Barra con las esquinas superiores redondeadas y apoyada en la base.
          const d = `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${y(0)} Z`
          return (
            <g key={i}>
              {p.valor !== null && <path d={d} className={`grafica__barra ${activo === i ? 'grafica__barra--activa' : ''}`} />}
              <text x={cx} y={alto - 6} className="grafica__eje" textAnchor="middle">
                {p.etiqueta}
              </text>
              {/* Zona de puntería más grande que la barra. */}
              <rect
                x={izq + columna * i}
                y={arriba}
                width={columna}
                height={altoPlot + abajo}
                fill="transparent"
                onPointerEnter={() => setActivo(i)}
                onPointerLeave={() => setActivo(null)}
                onClick={() => setActivo(activo === i ? null : i)}
              />
            </g>
          )
        })}
      </svg>
      <details className="grafica__tabla">
        <summary>Ver como tabla</summary>
        <table className="tabla">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Acierto</th>
              <th>{unidad[0].toUpperCase() + unidad.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.largo}>
                <th scope="row">{p.largo}</th>
                <td>{p.valor === null ? '—' : `${Math.round(p.valor * 100)}%`}</td>
                <td>{p.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
