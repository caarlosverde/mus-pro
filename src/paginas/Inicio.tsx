import { useMemo } from 'react'
import { Carta } from '../componentes/Carta'
import { Etiqueta, Panel } from '../componentes/ui'
import { manoDesdeNotacion } from '../engine/cartas'
import { REGLAS_POR_DEFECTO } from '../engine/reglas'
import { useAjustes } from '../estado/ajustes'
import { CONSEJOS } from '../datos/consejos'
import './Inicio.css'

const MODULOS = [
  {
    ruta: 'jugar/bots',
    titulo: 'Contra bots',
    etiqueta: 'Sin conexión',
    texto: 'Vaca completa contra el bravo, el conservador, el farolero… y al acabar cada mano, la revisión de tus decisiones.',
  },
  {
    ruta: 'online',
    titulo: 'Online',
    etiqueta: 'Con gente',
    texto: 'Partidas con amigos o con desconocidos, puntuables o amistosas, con señas hechas con la cara del avatar.',
  },
  {
    ruta: 'corte',
    titulo: 'Entrenador de corte',
    etiqueta: 'Ilimitado',
    texto: '¿Mus o no hay mus? Situaciones sin fin según posición, marcador y señas, evaluadas jugando la mano cientos de veces.',
  },
  {
    ruta: 'problemas',
    titulo: 'Problemas de final',
    etiqueta: 'Calculados',
    texto: 'Situaciones de "estar dentro": órdagos, orden de cobro, el envite justo. Cada solución está calculada, no opinada.',
  },
  {
    ruta: 'laboratorio',
    titulo: 'Laboratorio',
    etiqueta: '20.000 repartos',
    texto: 'Tu mano, tu posición y lo que has visto: probabilidades de cada lance y qué llevan los demás.',
  },
  {
    ruta: 'ranking',
    titulo: 'Ranking',
    etiqueta: 'Individual y parejas',
    texto: 'Los mejores jugadores y parejas por puntos. Ganar a rivales de más nivel da más.',
  },
]

/** Un consejo distinto cada día (se fija al cargar la app). */
const CONSEJO_DEL_DIA = CONSEJOS[Math.floor(Date.now() / 86_400_000) % CONSEJOS.length]

export function Inicio() {
  const { reglas } = useAjustes()
  const muestra = useMemo(() => manoDesdeNotacion('RRCA', REGLAS_POR_DEFECTO), [])

  return (
    <>
      <section className="portada tapete">
        <div className="portada__texto">
          <h1>Mejora tu mus de verdad</h1>
          <p>
            Ni reglas básicas ni contar tantos: aquí se entrena lo que gana partidas. Cuándo cortar, cuánto envidar, cuándo ver un
            órdago y qué lleva el de enfrente.
          </p>
          <div className="portada__acciones">
            <a className="boton boton--primario" href="#/jugar">
              Jugar una partida
            </a>
            <a className="boton boton--claro" href="#/corte">
              Entrenar el corte
            </a>
          </div>
        </div>
        <div className="portada__cartas" aria-hidden>
          {muestra.map((c, i) => (
            <span key={c} style={{ transform: `rotate(${(i - 1.5) * 8}deg) translateY(${Math.abs(i - 1.5) * 6}px)` }}>
              <Carta carta={c} />
            </span>
          ))}
        </div>
      </section>

      <div className="rejilla">
        {MODULOS.map((m) => (
          <a key={m.titulo} className="modulo panel modulo--activo" href={`#/${m.ruta}`}>
            <div className="modulo__cabecera">
              <h2>{m.titulo}</h2>
              <Etiqueta tono="ok">{m.etiqueta}</Etiqueta>
            </div>
            <p className="texto-suave">{m.texto}</p>
          </a>
        ))}
      </div>

      <div className="rejilla">
        <Panel titulo="Consejo del día">
          <blockquote className="consejo">
            <p>{CONSEJO_DEL_DIA.texto}</p>
            {CONSEJO_DEL_DIA.porque && <footer className="texto-suave">{CONSEJO_DEL_DIA.porque}</footer>}
          </blockquote>
        </Panel>
        <Panel titulo="Tus reglas" extra={<a href="#/reglas">Cambiar</a>}>
          <ul className="lista-limpia resumen-reglas">
            <li>
              <strong>{reglas.reyes} reyes</strong>
              <span className="texto-suave">{reglas.reyes === 8 ? 'Los treses son reyes y los doses, ases' : 'Treses y doses son cartas propias'}</span>
            </li>
            <li>
              <strong>Juegos a {reglas.piedras}</strong>
              <span className="texto-suave">Dentro a partir de {reglas.piedras - 5}</span>
            </li>
            <li>
              <strong>{reglas.laReal ? 'Con la Real' : 'Sin la Real'}</strong>
              <span className="texto-suave">Tres sietes y figura {reglas.laReal ? 'gana a todo' : 'es una 31 normal'}</span>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
