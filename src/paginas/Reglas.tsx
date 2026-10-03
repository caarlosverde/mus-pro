import { Carta } from '../componentes/Carta'
import { Panel, Segmentado } from '../componentes/ui'
import { NUMEROS, PALOS, crearCarta } from '../engine/cartas'
import { SENAS, type Sena } from '../engine/informacion'
import { useAjustes } from '../estado/ajustes'
import { GLOSARIO } from '../datos/glosario'
import './Reglas.css'

export function ReglasPagina() {
  const { reglas, cambiarReglas } = useAjustes()

  return (
    <>
      <div className="titulo-pagina">
        <h1>Reglas y ajustes</h1>
        <p>Elige tu variante: el laboratorio la usa en todos sus cálculos. Los problemas indican la suya.</p>
      </div>

      <Panel titulo="Tu variante">
        <div className="ajustes">
          <div className="campo">
            <span className="campo__titulo">Reyes</span>
            <Segmentado
              etiqueta="Número de reyes"
              valor={reglas.reyes}
              onChange={(v) => cambiarReglas({ reyes: v })}
              opciones={[
                { valor: 8, texto: '8 reyes' },
                { valor: 4, texto: '4 reyes' },
              ]}
            />
            <p className="texto-suave">{reglas.reyes === 8 ? 'Treses = reyes, doses = ases.' : 'Cada carta vale lo que es.'}</p>
          </div>
          <div className="campo">
            <span className="campo__titulo">Juegos a</span>
            <Segmentado
              etiqueta="Piedras por juego"
              valor={reglas.piedras}
              onChange={(v) => cambiarReglas({ piedras: v })}
              opciones={[
                { valor: 30, texto: '30 piedras' },
                { valor: 40, texto: '40 piedras' },
              ]}
            />
          </div>
          <div className="campo">
            <span className="campo__titulo">La Real</span>
            <Segmentado
              etiqueta="La Real"
              valor={reglas.laReal}
              onChange={(v) => cambiarReglas({ laReal: v })}
              opciones={[
                { valor: false, texto: 'Sin la Real' },
                { valor: true, texto: 'Con la Real' },
              ]}
            />
            <p className="texto-suave">Tres sietes y una figura (no vale el tres) ganan a cualquier juego.</p>
          </div>
        </div>
      </Panel>

      <div className="rejilla">
        <Panel titulo="Resumen de la mano">
          <ol className="pasos">
            <li><strong>Mus o no hay mus.</strong> Habla primero el mano. Con mus, todos se descartan (al menos una carta) y se repone.</li>
            <li><strong>Grandes.</strong> Gana la mano más alta, carta a carta: rey, caballo, sota, 7… as.</li>
            <li><strong>Chicas.</strong> Al revés: gana la más baja carta a carta.</li>
            <li><strong>Pares.</strong> Se declara si se tienen. Duples &gt; medias &gt; pareja. Valen 3, 2 y 1.</li>
            <li><strong>Juego.</strong> 31 o más. Orden: 31, 32, 40, 37, 36, 35, 34, 33. La 31 vale 3; el resto, 2.</li>
            <li><strong>Punto.</strong> Si nadie tiene juego, gana la suma más alta (30 es lo mejor). Vale 1.</li>
            <li><strong>Empates:</strong> siempre gana quien va antes de mano.</li>
          </ol>
        </Panel>
        <Panel titulo="Envites y recuento">
          <ul className="pasos">
            <li><strong>Paso / envido / quiero / no quiero / órdago.</strong> Envido = 2 piedras. Se puede subir ("x más").</li>
            <li><strong>"Porque no":</strong> si no se quiere un envite, el que envidó cobra en el momento lo último que estaba querido (1 si era el primero).</li>
            <li><strong>En paso:</strong> grandes y chicas dan 1 piedra a quien las gana; pares y juego sólo dan sus tantos.</li>
            <li><strong>Órdago querido:</strong> se levantan las cartas y ese lance decide el juego.</li>
            <li><strong>Recuento en orden:</strong> grandes, chicas, pares, juego (o punto). El juego se acaba en cuanto alguien llega, aunque falte por cobrar.</li>
          </ul>
        </Panel>
      </div>

      <Panel titulo="La baraja española">
        <p className="texto-suave">
          Cuarenta cartas en cuatro palos. Fíjate en el filete del marco: los cortes ("pintas") dicen el palo aunque sólo
          asome el borde. Oros no tiene cortes, copas uno, espadas dos y bastos tres.
          {reglas.reyes === 8 && ' Con 8 reyes, los treses valen como reyes y los doses como ases.'}
        </p>
        <div className="baraja">
          {PALOS.map((palo) => (
            <div key={palo} className="baraja__palo">
              <h3>{palo[0].toUpperCase() + palo.slice(1)}</h3>
              <div className="baraja__cartas">
                {NUMEROS.map((n) => (
                  <Carta key={n} carta={crearCarta(n, palo)} tamano="peque" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel titulo="Señas habituales">
        <p className="texto-suave">Varían según la zona: pactadlas antes de jugar. Pasar una seña falsa no está permitido.</p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Jugada</th>
              <th className="izq">Gesto</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SENAS) as Sena[]).map((s) => (
              <tr key={s}>
                <th scope="row">{SENAS[s].nombre}</th>
                <td className="izq">{SENAS[s].gesto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel titulo="Glosario">
        <dl className="glosario">
          {GLOSARIO.map(([t, d]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  )
}
