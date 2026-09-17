-- AlterTable
ALTER TABLE `Pendiente` ADD COLUMN `avisadoEn` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Cobro` ADD COLUMN `avisadoEn` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Documento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `archivo` VARCHAR(191) NOT NULL,
    `tipoMime` VARCHAR(191) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `usuarioId` INTEGER NULL,
    `subidoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quitadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `Documento_archivo_key`(`archivo`),
    INDEX `Documento_proyectoId_subidoEn_idx`(`proyectoId`, `subidoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Documento` ADD CONSTRAINT `Documento_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Documento` ADD CONSTRAINT `Documento_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
