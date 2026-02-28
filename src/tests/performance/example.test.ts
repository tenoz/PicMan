import { describe, it, expect } from 'vitest';

/**
 * 性能测试框架示例测试
 * 用于验证性能测试框架是否正确配置
 */
describe('性能测试框架', () => {
  it('应该正确运行基本测试', () => {
    expect(1 + 1).toBe(2);
  });

  it('应该支持异步测试', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('应该能够测试数组操作性能', () => {
    const data = Array.from({ length: 1000 }, (_, i) => i);
    const start = performance.now();
    
    // 模拟一些数组操作
    const result = data
      .map(x => x * 2)
      .filter(x => x % 3 === 0)
      .reduce((sum, x) => sum + x, 0);
    
    const end = performance.now();
    const duration = end - start;
    
    // 验证结果正确性
    expect(result).toBeGreaterThan(0);
    // 验证执行时间在合理范围内（< 100ms）
    expect(duration).toBeLessThan(100);
  });

  it('应该能够测试对象操作性能', () => {
    const start = performance.now();
    
    const obj: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      obj[`key_${i}`] = i;
    }
    
    const keys = Object.keys(obj);
    const values = Object.values(obj);
    const sum = values.reduce((a, b) => a + b, 0);
    
    const end = performance.now();
    const duration = end - start;
    
    expect(keys.length).toBe(1000);
    expect(sum).toBe(499500); // 0 + 1 + 2 + ... + 999 = 499500
    expect(duration).toBeLessThan(50);
  });
});

describe('图像处理性能基线测试', () => {
  it('应该能够模拟 Canvas 操作', () => {
    // 创建虚拟 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    
    const ctx = canvas.getContext('2d');
    expect(ctx).not.toBeNull();
    
    const start = performance.now();
    
    // 模拟绘制操作
    if (ctx) {
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = 'blue';
      for (let i = 0; i < 100; i++) {
        ctx.fillRect(i * 10, i * 5, 50, 50);
      }
    }
    
    const end = performance.now();
    const duration = end - start;
    
    expect(duration).toBeLessThan(100);
  });
});
