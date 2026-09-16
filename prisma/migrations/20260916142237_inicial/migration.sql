-- CreateTable
CREATE TABLE `Usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `rol` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `pinHash` VARCHAR(191) NOT NULL,
    `metaDiaria` INTEGER NOT NULL DEFAULT 10,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Nicho` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `mensajeInicial` TEXT NOT NULL,
    `mensajeSeguimiento` TEXT NOT NULL,
    `plantillaPropuesta` VARCHAR(191) NOT NULL DEFAULT '',
    `diasSeguimiento` INTEGER NOT NULL DEFAULT 3,

    UNIQUE INDEX `Nicho_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prospecto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nichoId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `ciudad` VARCHAR(191) NOT NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT '',
    `region` VARCHAR(191) NOT NULL DEFAULT '',
    `tipo` VARCHAR(191) NOT NULL DEFAULT '',
    `tamano` VARCHAR(191) NOT NULL DEFAULT '',
    `telefono` VARCHAR(191) NOT NULL DEFAULT '',
    `whatsapp` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `web` VARCHAR(191) NOT NULL DEFAULT '',
    `instagram` VARCHAR(191) NOT NULL DEFAULT '',
    `facebook` VARCHAR(191) NOT NULL DEFAULT '',
    `tiktok` VARCHAR(191) NOT NULL DEFAULT '',
    `nota` TEXT NOT NULL DEFAULT '',
    `fuentes` JSON NOT NULL,
    `origen` VARCHAR(191) NOT NULL DEFAULT 'importado',
    `etapa` VARCHAR(191) NOT NULL DEFAULT 'por_contactar',
    `proximoSeguimiento` VARCHAR(191) NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `ordenCola` INTEGER NOT NULL DEFAULT 0,
    `clave` VARCHAR(191) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Prospecto_codigo_key`(`codigo`),
    INDEX `Prospecto_etapa_ordenCola_idx`(`etapa`, `ordenCola`),
    INDEX `Prospecto_etapa_proximoSeguimiento_idx`(`etapa`, `proximoSeguimiento`),
    UNIQUE INDEX `Prospecto_nichoId_clave_key`(`nichoId`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Evento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prospectoId` INTEGER NOT NULL,
    `usuarioId` INTEGER NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `de` VARCHAR(191) NOT NULL DEFAULT '',
    `a` VARCHAR(191) NOT NULL DEFAULT '',
    `canal` VARCHAR(191) NOT NULL DEFAULT '',
    `texto` TEXT NOT NULL DEFAULT '',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Evento_prospectoId_creadoEn_idx`(`prospectoId`, `creadoEn`),
    INDEX `Evento_tipo_creadoEn_idx`(`tipo`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Configuracion` (
    `clave` VARCHAR(191) NOT NULL,
    `valor` TEXT NOT NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Prospecto` ADD CONSTRAINT `Prospecto_nichoId_fkey` FOREIGN KEY (`nichoId`) REFERENCES `Nicho`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
