import './App.css'
import { IconoPalo } from './componentes/Carta'
import { useRuta } from './estado/ruta'
import { Corte } from './paginas/Corte'
import { Entrenar } from './paginas/Entrenar'
import { Inicio } from './paginas/Inicio'
import { Laboratorio } from './paginas/Laboratorio'
import { Partida } from './paginas/Partida'
import { Problemas } from './paginas/Problemas'
import { ReglasPagina } from './paginas/Reglas'

const SECCIONES = [
  { ruta: '', texto: 'Inicio', palo: 'oros', incluye: [] as string[] },
  { ruta: 'jugar', texto: 'Jugar', palo: 'copas', incluye: [] },
  { ruta: 'entrenar', texto: 'Entrenar', palo: 'espadas', incluye: ['corte', 'problemas'] },
  { ruta: 'laboratorio', texto: 'Laboratorio', palo: 'bastos', incluye: [] },
  { ruta: 'reglas', texto: 'Reglas', palo: null, incluye: [] },
] as const

function IconoLibro({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  )
}

export default function App() {
  const [seccion = '', ...resto] = useRuta()

  let pagina
  switch (seccion) {
    case 'jugar':
      pagina = <Partida />
      break
    case 'entrenar':
      pagina = <Entrenar />
      break
    case 'corte':
      pagina = <Corte />
      break
    case 'laboratorio':
      pagina = <Laboratorio />
      break
    case 'problemas':
      pagina = <Problemas id={resto[0]} />
      break
    case 'reglas':
      pagina = <ReglasPagina />
      break
    default:
      pagina = <Inicio />
  }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera__dentro">
          <a className="marca" href="#/">
            <span className="marca__logo">
              <IconoPalo palo="oros" size={22} />
            </span>
            <span>
              Mus Pro
              <small>Entrenador de mus</small>
            </span>
          </a>
          <nav className="nav" aria-label="Secciones">
            {SECCIONES.map((s) => {
              const activa = seccion === s.ruta || (s.incluye as readonly string[]).includes(seccion)
              return (
                <a key={s.ruta} href={`#/${s.ruta}`} className={activa ? 'activo' : ''} aria-current={activa ? 'page' : undefined}>
                  {s.palo ? <IconoPalo palo={s.palo} size={18} /> : <IconoLibro />}
                  {s.texto}
                </a>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="contenido">{pagina}</main>
      <footer className="pie">Las probabilidades se calculan por simulación sobre miles de repartos compatibles con lo que sabes.</footer>
    </div>
  )
}
