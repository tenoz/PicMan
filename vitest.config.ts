import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Vitest 性能测试配置
 * 与 Vite 集成，用于运行性能基准测试
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // 测试环境配置
    environment: 'jsdom',
    // 性能测试全局设置
    globals: true,
    // 测试文件匹配模式
    include: [
      'src/tests/performance/**/*.test.ts', 
      'src/utils/__tests__/**/*.test.ts',
      'src/hooks/__tests__/**/*.test.{ts,tsx}',
      'src/components/__tests__/**/*.test.{ts,tsx}',
      'src/services/__tests__/**/*.test.{ts,tsx}'
    ],
    // 排除模式
    exclude: ['node_modules', 'dist', 'src-tauri'],
    // 超时设置（性能测试可能需要更长时间）
    testTimeout: 30000,
    hookTimeout: 30000,
    // 覆盖率配置（可选）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        'src/**/*.d.ts',
      ],
    },
    // 基准测试配置
    benchmark: {
      // 基准测试输出格式
      outputFile: './benchmark-results.json',
      // 基准测试默认配置
      include: ['src/tests/performance/benchmarks/**/*.bench.ts'],
    },
  },
});
