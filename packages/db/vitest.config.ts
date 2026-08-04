import { defineConfig } from "vitest/config";

// DATABASE_URL/BETTER_AUTH_* se cargan vía `dotenv -e ../../.env --` en el
// script "test" de package.json, no aquí.
export default defineConfig({
  test: {
    // Los tests de auth.test.ts hacen varios round-trips reales a Neon
    // (signup/signin implica hashing + red); el default de 5s no alcanza.
    testTimeout: 20000,
  },
});
