-- Puntuación individual (Elo) de cada usuario.
ALTER TABLE usuarios ADD COLUMN elo INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE usuarios ADD COLUMN partidas_elo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN ganadas_elo INTEGER NOT NULL DEFAULT 0;
CREATE INDEX usuarios_elo ON usuarios(elo DESC);

-- Puntuación de cada pareja (dos usuarios concretos jugando juntos).
CREATE TABLE parejas (
  id TEXT PRIMARY KEY, -- "idMenor:idMayor"
  usuario_a TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  usuario_b TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL DEFAULT 1200,
  partidas INTEGER NOT NULL DEFAULT 0,
  ganadas INTEGER NOT NULL DEFAULT 0,
  actualizado INTEGER NOT NULL
);
CREATE INDEX parejas_elo ON parejas(elo DESC);
CREATE INDEX parejas_a ON parejas(usuario_a);
CREATE INDEX parejas_b ON parejas(usuario_b);

-- Tipo de partida online: amistosa (no puntúa), individual o parejas.
ALTER TABLE partidas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'amistosa';
-- Puntos ganados o perdidos por cada jugador (individual) o por su pareja.
ALTER TABLE partida_jugadores ADD COLUMN elo_cambio INTEGER;
