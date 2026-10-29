-- Embudo /empezar (29-oct-2026): respuestas del embudo, calificacion y origen del enlace. Escrita a mano (ver CLAUDE.md).
ALTER TABLE `SolicitudWeb`
  ADD COLUMN `respuestas` VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN `calificacion` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `origen` VARCHAR(120) NOT NULL DEFAULT '';
