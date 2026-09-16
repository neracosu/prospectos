-- La migracion "buscador" agrego columnas JSON NOT NULL sin DEFAULT (MySQL no
-- permite DEFAULT literal en columnas JSON via Prisma). En filas ya existentes
-- MySQL uso su relleno implicito ('' en vez de '[]'/'{}'), lo que deja JSON
-- invalido. Esta migracion corrige esas filas. Las filas nuevas ya llegan bien
-- porque Prisma Client siempre manda el literal del @default en el INSERT.
UPDATE `Nicho` SET `etiquetaOsm` = '[]' WHERE `etiquetaOsm` = '';
UPDATE `Prospecto` SET `fuentesPorCampo` = '{}' WHERE `fuentesPorCampo` = '';
