-- Panel CRM, fase 2 (30-oct-2026): leads vs directorio. Escrita a mano (ver CLAUDE.md).
ALTER TABLE `Prospecto`
  ADD COLUMN `esLead` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `fuenteLead` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `valorEstimado` DECIMAL(10, 2) NULL,
  ADD COLUMN `proximoPaso` VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN `propuestaUrl` VARCHAR(300) NOT NULL DEFAULT '';
CREATE INDEX `Prospecto_esLead_etapa_idx` ON `Prospecto`(`esLead`, `etapa`);
ALTER TABLE `SolicitudWeb` ADD COLUMN `prospectoId` INTEGER NULL;
-- Lo que ya avanzo de etapa o entro a mano es una conversacion real: nace lead
UPDATE `Prospecto` SET `esLead` = 1, `fuenteLead` = CASE WHEN `origen` = 'manual' THEN 'otro' ELSE 'directorio' END
  WHERE `etapa` <> 'por_contactar' OR `origen` = 'manual';
