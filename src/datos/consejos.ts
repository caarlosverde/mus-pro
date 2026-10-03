export interface Consejo {
  texto: string
  porque?: string
}

/** Máximas de estrategia, redactadas para la app. */
export const CONSEJOS: Consejo[] = [
  {
    texto: 'Los cuatro lances no son independientes: lo que envidas a grandes y a chicas cuenta lo que llevas a pares y juego.',
    porque: 'Usa los primeros lances para esconder tu jugada fuerte, no para pregonarla.',
  },
  {
    texto: 'De pareja postre, corta de primeras en cuanto tengas pares y juego defendibles.',
    porque: 'Cada descarte que concedes es una oportunidad para que la pareja mano se cargue.',
  },
  {
    texto: 'De mano no tienes prisa: si cortan ellos, tu posición te da el revoque.',
    porque: 'Un corte del mano asusta; a veces sacas más dejando que se carguen y que te quieran.',
  },
  {
    texto: 'Un envite de 2 lo quiere cualquiera. Si vas de farol, envida 4 o más; si vas con ley, envida poco.',
    porque: 'La cantidad cuenta tanto como el lance. Varíala para no ser previsible.',
  },
  {
    texto: 'Con las chicas no se va nadie.',
    porque: 'Una piedra de chicas en paso rara vez decide un juego: no te juegues el juego entero a la pequeña.',
  },
  {
    texto: 'Cuando las dos parejas estáis dentro, mandan las grandes y los pares: el juego llega tarde al recuento.',
    porque: 'El recuento va en orden: grandes, chicas, pares, juego. Muchas veces se sale antes de llegar al juego.',
  },
  {
    texto: 'Antes de querer o rajarte al final, haz el recuento entero en la cabeza.',
    porque: 'El "porque no" se cobra en el momento; lo demás, en orden. Ahí se ganan y se pierden juegos.',
  },
  {
    texto: 'La 31 de postre es la jugada con la que más piedras se regalan.',
    porque: 'Hay dos juegos por delante que te ganan los empates. Si el mano revoca fuerte, piénsalo dos veces.',
  },
  {
    texto: 'Mira con cuántas cartas se queda cada rival en cada descarte.',
    porque: 'Quien guarda tres cartas suele llevar reyes: grandes, pares y probablemente juego.',
  },
  {
    texto: 'No ordenes tus cartas al recibirlas.',
    porque: 'Dónde colocas la carta que te entra dice al rival si es un rey o no.',
  },
  {
    texto: 'Si tu compañero te pasa una seña, a veces es mejor que envides tú con sus cartas.',
    porque: 'Confunde a los rivales: no saben quién lleva qué.',
  },
  {
    texto: 'El mus negro (pedir mus con un cañón) sólo funciona si es muy probable que corten ellos.',
    porque: 'Si nadie corta, has tirado una gran jugada. Úsalo contra rivales que cortan con cualquier cosa.',
  },
  {
    texto: 'El pie de mano no debe cortar con jugadas medias si el mano ha pedido mus.',
    porque: 'Se le llama "autoquitamano": renuncias a la ventaja de ir de mano por pocas piedras.',
  },
  {
    texto: 'Duples con 30 al punto de primeras dadas es un corte de lujo para la pareja postre.',
    porque: 'Ganas pares y, si nadie liga juego, también el punto.',
  },
  {
    texto: 'Si alguien que envidó a chicas sale fuerte a pares, piensa en duples con pitos o media de pitos.',
    porque: 'Las apuestas de un mismo jugador se explican entre sí: búscales la coherencia.',
  },
  {
    texto: 'Cuando la otra pareja tiene que cortar por el marcador y pide mus, es que no lleva nada.',
    porque: 'Aprovéchalo: corta tú con pares o juego modestos y apúntate esos lances.',
  },
  {
    texto: 'Al final del juego, envida la cantidad justa para salir.',
    porque: 'Si te pasas, se asustan y no te lo quieren; si te quedas corto, te quedas a las puertas.',
  },
  {
    texto: 'Ir por detrás pide órdagos; ir por delante pide paciencia.',
    porque: 'La pareja que va ganando no puede permitirse ver órdagos dudosos; la que pierde no tiene nada que perder.',
  },
  {
    texto: 'Contra un conservador, farolea más; contra un bravo, espera con la caña puesta.',
    porque: 'Adapta tu estilo al rival: un jugador previsible es un jugador batible.',
  },
  {
    texto: 'Que tu cara no hable: mira las cartas una sola vez y rápido.',
    porque: 'Así tienes los ojos libres para vigilar señas y caras.',
  },
]
