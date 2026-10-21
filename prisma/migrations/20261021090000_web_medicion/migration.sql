-- CreateTable
CREATE TABLE `EventoWeb` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sesion` VARCHAR(32) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `ruta` VARCHAR(191) NOT NULL,
    `detalle` VARCHAR(191) NOT NULL DEFAULT '',
    `origen` VARCHAR(120) NOT NULL DEFAULT '',
    `movil` BOOLEAN NOT NULL DEFAULT false,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventoWeb_creadoEn_idx`(`creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolicitudWeb` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(120) NOT NULL,
    `correo` VARCHAR(191) NOT NULL DEFAULT '',
    `whatsapp` VARCHAR(40) NOT NULL DEFAULT '',
    `tipo` VARCHAR(80) NOT NULL,
    `presupuesto` VARCHAR(40) NOT NULL DEFAULT '',
    `mensaje` TEXT NOT NULL,
    `pagina` VARCHAR(191) NOT NULL DEFAULT '',
    `sesion` VARCHAR(32) NOT NULL DEFAULT '',
    `creadaEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atendidaEn` DATETIME(3) NULL,

    INDEX `SolicitudWeb_creadaEn_idx`(`creadaEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

