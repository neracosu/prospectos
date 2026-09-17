-- AlterTable
ALTER TABLE `Usuario` ADD COLUMN `clienteId` INTEGER NULL,
    ADD COLUMN `sesionVersion` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Evento` ADD COLUMN `clienteId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Usuario_clienteId_key` ON `Usuario`(`clienteId`);

-- CreateIndex
CREATE INDEX `Evento_clienteId_creadoEn_idx` ON `Evento`(`clienteId`, `creadoEn`);

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
