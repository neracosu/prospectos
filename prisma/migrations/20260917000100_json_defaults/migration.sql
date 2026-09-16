-- Prisma no emite DEFAULT para columnas Json en MySQL/MariaDB. Sin default a nivel de base,
-- un cliente viejo (el proceso en produccion antes del redespliegue) no puede insertar filas.
-- MariaDB >= 10.2 permite DEFAULT en JSON (LONGTEXT). Migracion solo para MariaDB.
ALTER TABLE `Nicho` MODIFY `etiquetaOsm` JSON NOT NULL DEFAULT '[]';
ALTER TABLE `Prospecto` MODIFY `fuentesPorCampo` JSON NOT NULL DEFAULT '{}';
ALTER TABLE `Revision` MODIFY `errores` JSON NOT NULL DEFAULT '[]';
