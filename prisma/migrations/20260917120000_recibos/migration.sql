-- CreateTable
CREATE TABLE `Correlativo` (
    `serie` VARCHAR(191) NOT NULL,
    `anio` INTEGER NOT NULL,
    `ultimo` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`serie`, `anio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Cobro` ADD COLUMN `notaAnulacionEn` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Cobro_reciboNumero_idx` ON `Cobro`(`reciboNumero`);
