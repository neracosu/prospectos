-- CreateTable
CREATE TABLE `LugarOverture` (
    `id` VARCHAR(64) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `categoriaBase` VARCHAR(80) NOT NULL,
    `categoriaFina` VARCHAR(80) NOT NULL DEFAULT '',
    `lat` DOUBLE NOT NULL,
    `lon` DOUBLE NOT NULL,
    `direccion` VARCHAR(191) NOT NULL DEFAULT '',
    `telefonos` TEXT NOT NULL,
    `correos` TEXT NOT NULL,
    `webs` TEXT NOT NULL,
    `redes` TEXT NOT NULL,
    `confianza` DOUBLE NOT NULL,
    `publicacion` VARCHAR(20) NOT NULL,

    INDEX `LugarOverture_categoriaBase_idx`(`categoriaBase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
