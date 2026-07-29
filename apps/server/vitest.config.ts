import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
  },
  plugins: [
    tsconfigPaths(),
    // NestJS relies on emitDecoratorMetadata for its DI container to read
    // constructor parameter types at runtime. Vitest's default esbuild
    // transform doesn't emit that metadata, so tests run through swc instead.
    swc.vite({
      jsc: {
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
