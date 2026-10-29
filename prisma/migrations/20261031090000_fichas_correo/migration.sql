-- Correo por propuesta (31-oct-2026): fichas de negocio, correos bloqueados y envios. Escrita a mano (ver CLAUDE.md).
CREATE TABLE `FichaNegocio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prospectoId` INTEGER NOT NULL,
    `hallazgos` JSON NOT NULL DEFAULT '{}',
    `fuentes` JSON NOT NULL DEFAULT '[]',
    `resumen` TEXT NOT NULL,
    `gancho` VARCHAR(400) NOT NULL DEFAULT '',
    `estado` VARCHAR(20) NOT NULL DEFAULT 'sin_hallazgos',
    `alAutomatico` BOOLEAN NOT NULL DEFAULT false,
    `generadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revisadaEn` DATETIME(3) NULL,

    UNIQUE INDEX `FichaNegocio_prospectoId_key`(`prospectoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CorreoBloqueado` (
    `email` VARCHAR(120) NOT NULL,
    `motivo` VARCHAR(20) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EnvioCorreo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prospectoId` INTEGER NOT NULL,
    `token` VARCHAR(22) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `asunto` VARCHAR(200) NOT NULL,
    `para` VARCHAR(120) NOT NULL,
    `enviadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `abiertoEn` DATETIME(3) NULL,
    `aperturas` INTEGER NOT NULL DEFAULT 0,
    `clicEn` DATETIME(3) NULL,
    `clics` INTEGER NOT NULL DEFAULT 0,
    `pdfEn` DATETIME(3) NULL,
    `pdfs` INTEGER NOT NULL DEFAULT 0,
    `fallo` VARCHAR(300) NOT NULL DEFAULT '',

    UNIQUE INDEX `EnvioCorreo_token_key`(`token`),
    INDEX `EnvioCorreo_prospectoId_enviadoEn_idx`(`prospectoId`, `enviadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FichaNegocio` ADD CONSTRAINT `FichaNegocio_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `EnvioCorreo` ADD CONSTRAINT `EnvioCorreo_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
