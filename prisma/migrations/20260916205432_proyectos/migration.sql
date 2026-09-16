-- DropForeignKey
ALTER TABLE `Evento` DROP FOREIGN KEY `Evento_prospectoId_fkey`;

-- AlterTable
ALTER TABLE `Evento` ADD COLUMN `cobroId` INTEGER NULL,
    ADD COLUMN `proyectoId` INTEGER NULL,
    MODIFY `prospectoId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `contactoNombre` VARCHAR(191) NOT NULL DEFAULT '',
    `whatsapp` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `rif` VARCHAR(191) NOT NULL DEFAULT '',
    `instagram` VARCHAR(191) NOT NULL DEFAULT '',
    `facebook` VARCHAR(191) NOT NULL DEFAULT '',
    `tiktok` VARCHAR(191) NOT NULL DEFAULT '',
    `prospectoId` INTEGER NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Cliente_prospectoId_key`(`prospectoId`),
    UNIQUE INDEX `Cliente_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Proyecto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clienteId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `nichoId` INTEGER NOT NULL,
    `pagoUnico` DECIMAL(10, 2) NOT NULL,
    `mensualidad` DECIMAL(10, 2) NOT NULL,
    `horasCotizadas` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `fechaInicio` VARCHAR(191) NOT NULL,
    `fechaEntregaEstimada` VARCHAR(191) NULL,
    `fechaEntregaReal` VARCHAR(191) NULL,
    `estado` VARCHAR(191) NOT NULL DEFAULT 'en_construccion',
    `diaCobroMensual` INTEGER NOT NULL DEFAULT 1,
    `propuestaCodigo` VARCHAR(191) NOT NULL DEFAULT '',
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Proyecto_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cobro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `concepto` VARCHAR(191) NOT NULL,
    `detalle` VARCHAR(191) NOT NULL DEFAULT '',
    `monto` DECIMAL(10, 2) NOT NULL,
    `moneda` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `vence` VARCHAR(191) NOT NULL,
    `pagadoEn` DATETIME(3) NULL,
    `canal` VARCHAR(191) NOT NULL DEFAULT '',
    `referencia` VARCHAR(191) NOT NULL DEFAULT '',
    `nota` TEXT NOT NULL DEFAULT '',
    `anuladoEn` DATETIME(3) NULL,
    `anuladoMotivo` VARCHAR(191) NOT NULL DEFAULT '',
    `mes` VARCHAR(191) NULL,
    `reciboNumero` VARCHAR(191) NOT NULL DEFAULT '',
    `reciboGeneradoEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Cobro_proyectoId_vence_idx`(`proyectoId`, `vence`),
    INDEX `Cobro_vence_pagadoEn_idx`(`vence`, `pagadoEn`),
    UNIQUE INDEX `Cobro_proyectoId_mes_key`(`proyectoId`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pendiente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `texto` VARCHAR(191) NOT NULL,
    `hecho` BOOLEAN NOT NULL DEFAULT false,
    `hechoEn` DATETIME(3) NULL,
    `visibleCliente` BOOLEAN NOT NULL DEFAULT false,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `fechaEstimada` VARCHAR(191) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Pendiente_proyectoId_orden_idx`(`proyectoId`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Horas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `fecha` VARCHAR(191) NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL DEFAULT '',
    `usuarioId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Horas_proyectoId_fecha_idx`(`proyectoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Version` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `fecha` VARCHAR(191) NOT NULL,
    `avisadoEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Version_proyectoId_version_key`(`proyectoId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cambio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `versionId` INTEGER NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `texto` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Evento_proyectoId_creadoEn_idx` ON `Evento`(`proyectoId`, `creadoEn`);

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_cobroId_fkey` FOREIGN KEY (`cobroId`) REFERENCES `Cobro`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_prospectoId_fkey` FOREIGN KEY (`prospectoId`) REFERENCES `Prospecto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proyecto` ADD CONSTRAINT `Proyecto_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proyecto` ADD CONSTRAINT `Proyecto_nichoId_fkey` FOREIGN KEY (`nichoId`) REFERENCES `Nicho`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cobro` ADD CONSTRAINT `Cobro_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pendiente` ADD CONSTRAINT `Pendiente_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Horas` ADD CONSTRAINT `Horas_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Horas` ADD CONSTRAINT `Horas_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Version` ADD CONSTRAINT `Version_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cambio` ADD CONSTRAINT `Cambio_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `Version`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
