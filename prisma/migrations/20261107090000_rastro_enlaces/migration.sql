-- Rastro de enlaces enviados (6-nov-2026): enlaces por prospecto, visitas y posicion de lectura de logs. Escrita a mano (ver CLAUDE.md).
CREATE TABLE `EnlaceEnviado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prospectoId` INTEGER NOT NULL,
    `etiqueta` VARCHAR(40) NOT NULL,
    `host` VARCHAR(120) NOT NULL,
    `prefijo` VARCHAR(200) NOT NULL,
    `token` VARCHAR(22) NOT NULL,
    `origen` VARCHAR(10) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `enviadoEn` DATETIME(3) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EnlaceEnviado_token_key`(`token`),
    UNIQUE INDEX `EnlaceEnviado_host_prefijo_prospectoId_key`(`host`, `prefijo`, `prospectoId`),
    INDEX `EnlaceEnviado_prospectoId_idx`(`prospectoId`),
    INDEX `EnlaceEnviado_host_activo_idx`(`host`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VisitaEnlace` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enlaceId` INTEGER NOT NULL,
    `fuente` VARCHAR(3) NOT NULL,
    `tipo` VARCHAR(8) NOT NULL,
    `visitante` VARCHAR(16) NOT NULL,
    `ip` VARCHAR(45) NOT NULL,
    `aparato` VARCHAR(60) NOT NULL DEFAULT '',
    `ua` VARCHAR(300) NOT NULL DEFAULT '',
    `pais` VARCHAR(60) NOT NULL DEFAULT '',
    `ciudad` VARCHAR(80) NOT NULL DEFAULT '',
    `red` VARCHAR(10) NOT NULL DEFAULT '',
    `geoPendiente` BOOLEAN NOT NULL DEFAULT false,
    `ruta` VARCHAR(200) NOT NULL DEFAULT '',
    `detalle` VARCHAR(40) NOT NULL DEFAULT '',
    `origen` VARCHAR(120) NOT NULL DEFAULT '',
    `segundos` INTEGER NULL,
    `scroll` INTEGER NULL,
    `propia` BOOLEAN NOT NULL DEFAULT false,
    `huella` VARCHAR(16) NULL,
    `ocurrioEn` DATETIME(3) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VisitaEnlace_huella_key`(`huella`),
    INDEX `VisitaEnlace_enlaceId_ocurrioEn_idx`(`enlaceId`, `ocurrioEn`),
    INDEX `VisitaEnlace_ip_idx`(`ip`),
    INDEX `VisitaEnlace_visitante_idx`(`visitante`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LecturaLog` (
    `archivo` VARCHAR(300) NOT NULL,
    `inode` BIGINT NOT NULL,
    `posicion` BIGINT NOT NULL,
    `leidoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`archivo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EnlaceEnviado` ADD CONSTRAINT `EnlaceEnviado_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `VisitaEnlace` ADD CONSTRAINT `VisitaEnlace_enlaceId_fkey` FOREIGN KEY (`enlaceId`) REFERENCES `EnlaceEnviado`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT IGNORE INTO Configuracion (clave, valor) VALUES ('candado_rastro', '1');
