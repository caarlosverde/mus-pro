import { manoDesdeNotacion } from '../engine/cartas'
import type { Problema } from '../engine/problemas'
import { TODO_EN_PASO } from '../engine/recuento'
import { REGLAS_POR_DEFECTO } from '../engine/reglas'

/**
 * Problemas de final de juego. Cada uno se resuelve con el motor: el test
 * `problemas.test.ts` verifica que la opción marcada como correcta es la que
 * más probabilidad de ganar el juego da.
 *
 * Convención: "nosotros" es siempre la pareja del héroe.
 */

const mano = (txt: string) => manoDesdeNotacion(txt, REGLAS_POR_DEFECTO)

export const PROBLEMAS: Problema[] = [
  {
    id: 'a-falta-de-una',
    titulo: 'A falta de una, todo es un órdago',
    tema: 'Piedras que faltan',
    nivel: 1,
    heroe: 3,
    marcador: { mano: 39, postre: 38 },
    escenario: { jugadores: [{}, {}, {}, { mano: mano('RC75') }] },
    historia: ['El mano corta de primeras dadas.', 'Grandes: el mano envida 2. Tu compañero pasa.'],
    supuestos: ['No sabes nada de las demás manos.', 'El resto de lances se quedan en paso.'],
    pregunta: 'Ellos están a 39 y vosotros a 38. ¿Qué respondes al envite a grandes?',
    opciones: [
      {
        id: 'no',
        texto: 'No quiero',
        apuestas: { ...TODO_EN_PASO, grandes: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 } },
      },
      { id: 'quiero', texto: 'Quiero', apuestas: { ...TODO_EN_PASO, grandes: { tipo: 'querido', piedras: 2 } } },
      { id: 'ordago', texto: 'Órdago', apuestas: { ...TODO_EN_PASO, grandes: { tipo: 'ordago' } } },
    ],
    correcta: 'quiero',
    explicacion: [
      'El "porque no" se cobra en el momento. Si no lo quieres, se ponen a 40 y el juego se acaba ahí: pierdes seguro.',
      'Si lo quieres, las grandes son lo primero que se cobra en el recuento. Quien gane las grandes suma 2 y llega a 40 antes que nadie: es exactamente lo mismo que un órdago.',
      'Quiero y órdago dan la misma probabilidad. Lo único prohibido es rajarse.',
    ],
    leccion: 'Antes de responder, cuenta las piedras que faltan. Con el rival a una, cualquier envite es un órdago.',
  },
  {
    id: 'chicas-no-se-va-nadie',
    titulo: 'Con las chicas no se va nadie',
    tema: 'Órdagos',
    nivel: 2,
    heroe: 3,
    marcador: { mano: 35, postre: 38 },
    escenario: {
      jugadores: [{ senas: ['dosPitos'] }, { senas: ['dosReyes'] }, {}, { mano: mano('AA4R') }],
    },
    historia: [
      'Has visto al mano hacer la seña de dos pitos.',
      'Tu compañero (el contramano) te ha pasado dos reyes.',
      'Grandes: todos pasan.',
      'Chicas: el mano echa órdago.',
    ],
    supuestos: ['Si no lo quieres, el resto de lances se quedan en paso.'],
    pregunta: 'Vais 38 a 35. Tienes pito, pito, cuatro y rey. ¿Ves el órdago a chicas?',
    opciones: [
      {
        id: 'no',
        texto: 'No quiero',
        apuestas: { ...TODO_EN_PASO, chicas: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 } },
      },
      { id: 'quiero', texto: 'Lo quiero', apuestas: { ...TODO_EN_PASO, chicas: { tipo: 'ordago' } } },
    ],
    correcta: 'no',
    explicacion: [
      'Si no lo quieres, se apuntan 1 y se quedan a 36: aún les faltan 4. A vosotros os faltan 2.',
      'Con las grandes en paso (tu compañero lleva dos reyes) y los pares de los dos (su pareja de reyes y tu pareja de pitos), es muy probable que lleguéis vosotros antes.',
      'Si lo quieres, ganarás la chica muchas veces, pero no todas: el mano también lleva dos pitos y gana los empates. Y si la pierdes, se acabó el juego.',
    ],
    leccion: 'No te juegues el juego en un lance que no les da la victoria. Una piedra de chicas no los saca; tu ventaja sí puede sacarte a ti.',
  },
  {
    id: 'la-31-no-basta',
    titulo: 'La 31 no basta',
    tema: 'Orden de cobro',
    nivel: 3,
    heroe: 0,
    marcador: { mano: 37, postre: 35 },
    escenario: {
      jugadores: [{ mano: mano('RRCA') }, { pares: false }, { pares: false, juego: false }, { pares: true }],
    },
    historia: [
      'Tu compañero te ha hecho la seña de ciego: ni pares ni juego.',
      'Grandes: el postre echa órdago y no lo quisiste (ellos +1).',
      'Chicas: todos pasan.',
      'Pares: sólo tú y el postre tenéis. El postre echa órdago.',
    ],
    supuestos: ['El juego se quedará en paso.'],
    pregunta: 'Vais 37 a 36 y llevas la 31 con pareja de reyes, de mano. ¿Quieres el órdago a pares?',
    opciones: [
      {
        id: 'quiero',
        texto: 'Lo quiero',
        apuestas: {
          ...TODO_EN_PASO,
          grandes: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 },
          pares: { tipo: 'ordago' },
        },
      },
      {
        id: 'no',
        texto: 'No quiero',
        apuestas: {
          ...TODO_EN_PASO,
          grandes: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 },
          pares: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 },
        },
      },
    ],
    correcta: 'no',
    explicacion: [
      'Si lo quieres, ganas sólo si el postre lleva una simple pareja (la de reyes te la ganas por ir de mano). Pierdes contra cualquier medias o duples.',
      'Si no lo quieres, se ponen a 37. En el recuento cobran las chicas (si las ganan), luego sus pares y, por último, tu 31 vale 3: llegas a 40 si ellos no han llegado antes.',
      'Ellos sólo llegan antes con duples (3) o con medias más las chicas (1+2). Con medias sin chicas se quedan a 39 y tu 31 os saca.',
      'No quererlo pierde en menos casos que quererlo: domina siempre.',
    ],
    leccion: 'Haz la cuenta del recuento entero antes de responder. A veces rajarse en pares es la forma de ganar con el juego.',
  },
  {
    id: 'rrc-de-primeras',
    titulo: 'Dos reyes y caballo de primeras',
    tema: 'Órdagos',
    nivel: 2,
    heroe: 1,
    marcador: { mano: 35, postre: 35 },
    escenario: { jugadores: [{}, { mano: mano('RRC6') }, {}, {}] },
    historia: ['Las dos parejas estáis dentro: 35 a 35.', 'El mano corta de primeras dadas.', 'Grandes: el mano echa órdago.'],
    supuestos: [
      'No tienes información de las demás manos (nadie ha visto señas).',
      'Si no lo quieres, el resto de lances se quedan en paso.',
    ],
    pregunta: 'Eres contramano con rey, rey, caballo y seis. ¿Ves el órdago a grandes?',
    opciones: [
      {
        id: 'no',
        texto: 'No quiero',
        apuestas: { ...TODO_EN_PASO, grandes: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 } },
      },
      { id: 'quiero', texto: 'Lo quiero', apuestas: { ...TODO_EN_PASO, grandes: { tipo: 'ordago' } } },
    ],
    correcta: 'quiero',
    explicacion: [
      'De primeras dadas, dos reyes y caballo es una grande muy buena. Para ganarte, un rival necesita tres reyes o dos reyes con mejor acompañamiento, y además tu compañero también juega.',
      'Rajarte deja a la pareja mano con una piedra de ventaja y en la mano, y con el marcador al límite eso pesa mucho.',
    ],
    leccion: 'Cuidadoso no significa cobarde. Con los dos dentro, las grandes buenas de primeras se defienden.',
  },
  {
    id: 'muerte-dulce',
    titulo: 'La muerte dulce',
    tema: 'Cuánto envidar',
    nivel: 2,
    heroe: 0,
    marcador: { mano: 29, postre: 29 },
    escenario: {
      jugadores: [
        { mano: mano('RCSA') },
        { pares: false },
        { pares: false, senas: ['juego'] },
        { pares: false, senas: ['la31'] },
      ],
    },
    historia: [
      'Tu compañero te ha pasado seña de juego (no la 31).',
      'Has pillado al postre haciendo la seña de la 31, y él no lo sabe.',
      'Grandes y chicas: en paso.',
      'Pares: nadie tiene.',
      'Juego: hablas tú, de mano, con la 31.',
    ],
    supuestos: [
      'El postre, con su 31, querrá cualquier envite de hasta 6 piedras, pero no verá un órdago.',
    ],
    pregunta: '29 a 29. Tu 31 de mano le gana a la suya. ¿Cuánto envidas?',
    opciones: [
      { id: 'dos', texto: 'Envido (2)', apuestas: { ...TODO_EN_PASO, juego: { tipo: 'querido', piedras: 2 } } },
      { id: 'seis', texto: 'Seis', apuestas: { ...TODO_EN_PASO, juego: { tipo: 'querido', piedras: 6 } } },
      {
        id: 'ordago',
        texto: 'Órdago',
        apuestas: { ...TODO_EN_PASO, juego: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 } },
      },
    ],
    correcta: 'seis',
    explicacion: [
      'Te faltan 11 piedras. En el juego cobráis el envite, más 3 de tu 31 y 2 del juego de tu compañero: 5 fijas.',
      'Un envite de 6 más esas 5 son 11: llegáis justo a 40, y en un lance que tienes ganado por ir de mano.',
      'Con un envite de 2 te quedas cerca pero sin salir, y el órdago no te lo ven: sólo cobras un "porque no".',
    ],
    leccion: 'Cuando el lance es tuyo, envida lo justo para salir y que te lo quieran. Más miedo es menos ganancia.',
  },
  {
    id: 'quieto-que-nos-vamos',
    titulo: 'Quieto, que nos hemos ido',
    tema: 'Orden de cobro',
    nivel: 3,
    heroe: 3,
    marcador: { mano: 36, postre: 36 },
    escenario: {
      jugadores: [
        { pares: true, juego: false },
        { senas: ['tresPitos', 'medias'], juego: false },
        { juego: true },
        { mano: mano('RCS5') },
      ],
    },
    historia: [
      '36 a 36. Tu compañero (contramano) te ha pasado media de pitos.',
      'Grandes: el mano echa órdago y no lo quisisteis (ellos 37).',
      'Chicas: todos pasan.',
      'Pares: tu compañero echa órdago y no lo quieren (vosotros 37).',
      'Juego: sólo tú y el pie de mano tenéis. El pie de mano echa órdago.',
    ],
    supuestos: [],
    pregunta: 'Tienes 35 de juego. ¿Ves el órdago a juego?',
    opciones: [
      {
        id: 'quiero',
        texto: 'Lo quiero',
        apuestas: {
          grandes: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 },
          chicas: { tipo: 'paso' },
          pares: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 },
          juego: { tipo: 'ordago' },
        },
      },
      {
        id: 'no',
        texto: 'No quiero',
        apuestas: {
          grandes: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 },
          chicas: { tipo: 'paso' },
          pares: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 },
          juego: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 },
        },
      },
    ],
    correcta: 'no',
    explicacion: [
      'Si no lo quieres, ellos se ponen a 38 y vosotros seguís a 37. Pero el recuento empieza por las chicas: tu compañero, con tres pitos, las gana casi siempre (38).',
      'Después vienen los pares, que ganasteis por el "porque no": sus medias valen 2. Llegáis a 40 antes de que se cobre el juego.',
      'Si lo quieres, te juegas todo con un 35, que pierde contra muchos juegos.',
    ],
    leccion: 'Al final de un juego, las chicas en paso y los pares se cobran antes que el juego. Sumad antes de querer.',
  },
]
