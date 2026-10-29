-- Semillas del correo de propuestas (ola final, 31-oct-2026): el automatico nace apagado (Neri lo enciende desde
-- Ajustes tras revisar la muestra) y la fila del candado de envios existe desde el despliegue.
-- INSERT IGNORE: si Neri ya guardo el interruptor, no se pisa.
INSERT IGNORE INTO `Configuracion` (`clave`, `valor`) VALUES ('correos_automatico', 'off'), ('candado_correos', '1');
