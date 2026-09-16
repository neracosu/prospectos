-- AlterTable
ALTER TABLE `Nicho` ADD COLUMN `etiquetaOsm` JSON NOT NULL;

-- AlterTable
ALTER TABLE `Prospecto` ADD COLUMN `fuentesPorCampo` JSON NOT NULL;

-- CreateTable
CREATE TABLE `BusquedaOsm` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nichoId` INTEGER NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `consultadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resultados` JSON NOT NULL,

    UNIQUE INDEX `BusquedaOsm_nichoId_area_key`(`nichoId`, `area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Revision` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lote` VARCHAR(191) NOT NULL,
    `origen` VARCHAR(191) NOT NULL,
    `fila` INTEGER NOT NULL,
    `datos` JSON NOT NULL,
    `estado` VARCHAR(191) NOT NULL,
    `errores` JSON NOT NULL,
    `existenteId` INTEGER NULL,
    `decision` VARCHAR(191) NOT NULL DEFAULT 'pendiente',
    `decididoPor` INTEGER NULL,
    `decididoEn` DATETIME(3) NULL,
    `usuarioId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Revision_lote_fila_idx`(`lote`, `fila`),
    INDEX `Revision_decision_creadoEn_idx`(`decision`, `creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BusquedaOsm` ADD CONSTRAINT `BusquedaOsm_nichoId_fkey` FOREIGN KEY (`nichoId`) REFERENCES `Nicho`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Revision` ADD CONSTRAINT `Revision_existenteId_fkey` FOREIGN KEY (`existenteId`) REFERENCES `Prospecto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Revision` ADD CONSTRAINT `Revision_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
