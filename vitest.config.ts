import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Redirige DATABASE_URL a la base de tests cuando PROSPECTOS_TEST_DB=1.
    // Tiene que correr antes que cualquier import de @/lib/db.
    setupFiles: ["tests/preparar-entorno.ts"],
    // De a uno: todos pegan contra la misma base MySQL (leccion de Hotel Marte:
    // en paralelo daba deadlocks al azar).
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
