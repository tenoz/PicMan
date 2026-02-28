/**
 * OffscreenCanvas 可用性测试脚本
 * 用于验证 Tauri WebView (WKWebView) 中 OffscreenCanvas 的支持情况
 */

// ============================================
// 测试 1: 主线程 OffscreenCanvas 基础检测
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

/**
 * 测试 OffscreenCanvas 构造函数是否可用
 */
function testConstructor(): TestResult {
  const result: TestResult = {
    name: 'OffscreenCanvas 构造函数检测',
    passed: false,
    message: '',
  };

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      result.message = 'OffscreenCanvas 未定义 - 浏览器不支持';
      return result;
    }

    // 尝试创建实例
    const canvas = new OffscreenCanvas(100, 100);
    result.passed = true;
    result.message = `OffscreenCanvas 可用，实例创建成功`;
    result.details = {
      width: canvas.width,
      height: canvas.height,
      constructorName: canvas.constructor.name,
    };
  } catch (error) {
    result.message = '创建 OffscreenCanvas 实例失败';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * 测试基本的 2D 上下文操作
 */
function test2DContext(): TestResult {
  const result: TestResult = {
    name: '2D 上下文基础操作',
    passed: false,
    message: '',
  };

  try {
    if (typeof OffscreenCanvas === 'undefined') {
      result.message = '跳过测试 - OffscreenCanvas 不可用';
      return result;
    }

    const canvas = new OffscreenCanvas(200, 200);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      result.message = '无法获取 2D 上下文';
      return result;
    }

    // 执行基本绘制操作
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(10, 10, 50, 50);

    ctx.fillStyle = '#00FF00';
    ctx.beginPath();
    ctx.arc(100, 100, 30, 0, Math.PI * 2);
    ctx.fill();

    // 测试 toDataURL 等导出方法
    const hasConvertToBlob = typeof canvas.convertToBlob === 'function';

    result.passed = true;
    result.message = '2D 上下文操作成功';
    result.details = {
      contextType: '2d',
      hasConvertToBlob,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  } catch (error) {
    result.message = '2D 上下文操作失败';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * 测试 transferControlToOffscreen 方法
 */
function testTransferControl(): TestResult {
  const result: TestResult = {
    name: 'transferControlToOffscreen 方法检测',
    passed: false,
    message: '',
  };

  try {
    // 创建普通 canvas 元素
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 150;

    // 检查方法是否存在
    if (typeof canvas.transferControlToOffscreen !== 'function') {
      result.message = 'HTMLCanvasElement.transferControlToOffscreen 方法不存在';
      result.details = {
        canvasType: canvas.constructor.name,
        availableMethods: Object.getOwnPropertyNames(canvas).filter(m => 
          typeof (canvas as Record<string, unknown>)[m] === 'function'
        ),
      };
      return result;
    }

    // 尝试调用方法
    const offscreen = canvas.transferControlToOffscreen();

    result.passed = true;
    result.message = 'transferControlToOffscreen 方法可用';
    result.details = {
      returnedType: offscreen.constructor.name,
      isOffscreenCanvas: offscreen instanceof OffscreenCanvas,
      width: offscreen.width,
      height: offscreen.height,
    };
  } catch (error) {
    result.message = 'transferControlToOffscreen 调用失败';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

// ============================================
// 测试 2: Web Worker 中的 OffscreenCanvas
// ============================================

/**
 * Worker 测试代码（作为字符串内联）
 */
const workerScript = `
// Worker 中的 OffscreenCanvas 测试
self.onmessage = function(e) {
  const { canvas, testType } = e.data;
  const result = {
    testType,
    passed: false,
    message: '',
    error: null,
    details: {}
  };

  try {
    if (testType === 'receive-offscreen') {
      // 测试接收 transferred OffscreenCanvas
      if (!canvas) {
        result.message = '未接收到 OffscreenCanvas 对象';
      } else if (!(canvas instanceof OffscreenCanvas)) {
        result.message = '接收到的对象不是 OffscreenCanvas';
        result.details = { receivedType: typeof canvas, constructor: canvas?.constructor?.name };
      } else {
        // 尝试在 Worker 中操作
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0000FF';
        ctx.fillRect(0, 0, 50, 50);
        
        result.passed = true;
        result.message = 'Worker 中成功接收并操作 OffscreenCanvas';
        result.details = {
          width: canvas.width,
          height: canvas.height,
          has2DContext: !!ctx
        };
      }
    }
    
    else if (testType === 'create-in-worker') {
      // 测试在 Worker 中直接创建 OffscreenCanvas
      if (typeof OffscreenCanvas === 'undefined') {
        result.message = 'Worker 中 OffscreenCanvas 未定义';
      } else {
        const newCanvas = new OffscreenCanvas(100, 100);
        const ctx = newCanvas.getContext('2d');
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(0, 0, 100, 100);
        
        result.passed = true;
        result.message = 'Worker 中成功创建 OffscreenCanvas';
        result.details = {
          width: newCanvas.width,
          height: newCanvas.height,
          has2DContext: !!ctx
        };
      }
    }
  } catch (error) {
    result.message = 'Worker 测试执行出错';
    result.error = error.message;
  }

  self.postMessage(result);
};
`;

/**
 * 测试在 Worker 中使用 OffscreenCanvas
 */
async function testInWorker(): Promise<TestResult> {
  const result: TestResult = {
    name: 'Web Worker 中 OffscreenCanvas 测试',
    passed: false,
    message: '',
  };

  try {
    // 检查 Worker 支持
    if (typeof Worker === 'undefined') {
      result.message = '浏览器不支持 Web Worker';
      return result;
    }

    // 创建内联 Worker
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    // 测试 1: 在 Worker 中创建 OffscreenCanvas
    const test1Promise = new Promise<TestResult>((resolve) => {
      worker.onmessage = (e) => {
        const data = e.data;
        resolve({
          name: 'Worker 内创建 OffscreenCanvas',
          passed: data.passed,
          message: data.message,
          details: data.details,
          error: data.error,
        });
      };
      worker.postMessage({ testType: 'create-in-worker' });
    });

    const test1Result = await Promise.race([
      test1Promise,
      new Promise<TestResult>((_, reject) => 
        setTimeout(() => reject(new Error('Worker 测试超时')), 5000)
      ),
    ]);

    // 测试 2: Transfer OffscreenCanvas 到 Worker（如果主线程支持）
    let test2Result: TestResult | null = null;
    
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(150, 150);
      
      const test2Promise = new Promise<TestResult>((resolve) => {
        worker.onmessage = (e) => {
          const data = e.data;
          resolve({
            name: 'Transfer OffscreenCanvas 到 Worker',
            passed: data.passed,
            message: data.message,
            details: data.details,
            error: data.error,
          });
        };
        worker.postMessage({ testType: 'receive-offscreen', canvas }, [canvas]);
      });

      try {
        test2Result = await Promise.race([
          test2Promise,
          new Promise<TestResult>((_, reject) => 
            setTimeout(() => reject(new Error('Transfer 测试超时')), 5000)
          ),
        ]);
      } catch (error) {
        test2Result = {
          name: 'Transfer OffscreenCanvas 到 Worker',
          passed: false,
          message: 'Transfer 测试失败',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // 清理
    worker.terminate();
    URL.revokeObjectURL(workerUrl);

    // 合并结果
    result.passed = test1Result.passed || (test2Result?.passed ?? false);
    result.message = `Worker 创建: ${test1Result.passed ? '通过' : '失败'}; Transfer: ${test2Result?.passed ?? 'N/A'}`;
    result.details = {
      createInWorker: test1Result,
      transferToWorker: test2Result,
    };
  } catch (error) {
    result.message = 'Worker 测试执行失败';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

// ============================================
// 测试 3: 浏览器环境检测
// ============================================

function detectEnvironment(): TestResult {
  const result: TestResult = {
    name: '浏览器环境检测',
    passed: true,
    message: '环境信息收集完成',
    details: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      // 检测是否是 Tauri 环境
      isTauri: typeof (window as Record<string, unknown>).__TAURI__ !== 'undefined',
      // 检测 WebKit 版本
      webkitVersion: navigator.userAgent.match(/AppleWebKit\/([\d.]+)/)?.[1] || 'unknown',
      // 检测基本功能支持
      features: {
        worker: typeof Worker !== 'undefined',
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        canvas: typeof HTMLCanvasElement !== 'undefined',
        imageBitmap: typeof ImageBitmap !== 'undefined',
        createImageBitmap: typeof createImageBitmap === 'function',
      },
    },
  };

  return result;
}

// ============================================
// 主测试流程
// ============================================

/**
 * 运行所有测试
 */
export async function runAllTests(): Promise<TestResult[]> {
  console.log('🧪 OffscreenCanvas 可用性测试开始...\n');

  const allResults: TestResult[] = [];

  // 1. 环境检测
  console.log('📋 检测浏览器环境...');
  const envResult = detectEnvironment();
  allResults.push(envResult);
  console.log(`  ✅ ${envResult.message}`);

  // 2. 构造函数测试
  console.log('\n🔍 测试 OffscreenCanvas 构造函数...');
  const constructorResult = testConstructor();
  allResults.push(constructorResult);
  console.log(`  ${constructorResult.passed ? '✅' : '❌'} ${constructorResult.message}`);

  // 3. 2D 上下文测试
  console.log('\n🎨 测试 2D 上下文操作...');
  const contextResult = test2DContext();
  allResults.push(contextResult);
  console.log(`  ${contextResult.passed ? '✅' : '❌'} ${contextResult.message}`);

  // 4. transferControlToOffscreen 测试
  console.log('\n🔄 测试 transferControlToOffscreen...');
  const transferResult = testTransferControl();
  allResults.push(transferResult);
  console.log(`  ${transferResult.passed ? '✅' : '❌'} ${transferResult.message}`);

  // 5. Worker 测试
  console.log('\n👷 测试 Web Worker 支持...');
  const workerResult = await testInWorker();
  allResults.push(workerResult);
  console.log(`  ${workerResult.passed ? '✅' : '❌'} ${workerResult.message}`);

  // 输出总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果总结');
  console.log('='.repeat(50));
  
  const passedCount = allResults.filter(r => r.passed).length;
  console.log(`通过: ${passedCount}/${allResults.length}`);
  
  allResults.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
  });

  return allResults;
}

/**
 * 生成测试报告文本
 */
export function generateReport(results: TestResult[]): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(60));
  lines.push('OffscreenCanvas 可用性测试报告');
  lines.push('生成时间: ' + new Date().toISOString());
  lines.push('='.repeat(60));
  lines.push('');

  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.name}`);
    lines.push(`   状态: ${result.passed ? '✅ 通过' : '❌ 失败'}`);
    lines.push(`   信息: ${result.message}`);
    
    if (result.error) {
      lines.push(`   错误: ${result.error}`);
    }
    
    if (result.details) {
      lines.push(`   详情:`);
      Object.entries(result.details).forEach(([key, value]) => {
        const valueStr = typeof value === 'object' 
          ? JSON.stringify(value, null, 2).split('\n').join('\n        ')
          : String(value);
        lines.push(`     ${key}: ${valueStr}`);
      });
    }
    
    lines.push('');
  });

  // 结论
  const passedCount = results.filter(r => r.passed).length;
  lines.push('='.repeat(60));
  lines.push('结论');
  lines.push('='.repeat(60));
  
  if (passedCount === results.length) {
    lines.push('✅ 所有测试通过！OffscreenCanvas 完全可用。');
    lines.push('');
    lines.push('建议:');
    lines.push('- 可以使用 Web Worker 进行图片处理');
    lines.push('- 使用 OffscreenCanvas 在 Worker 中渲染');
    lines.push('- 通过 Transferable Objects 传递 Canvas 控制权');
  } else if (results.some(r => r.name.includes('Worker') && r.passed)) {
    lines.push('⚠️ 部分测试失败，但 Worker 支持可用。');
    lines.push('');
    lines.push('建议:');
    lines.push('- 可以有限度地使用 Web Worker');
    lines.push('- 需要增加降级方案检测');
    lines.push('- 在主线程准备备用处理逻辑');
  } else {
    lines.push('❌ OffscreenCanvas 不可用或支持有限。');
    lines.push('');
    lines.push('建议 (降级方案):');
    lines.push('1. 在主线程使用普通 HTMLCanvasElement');
    lines.push('2. 使用 requestIdleCallback 分片处理避免阻塞');
    lines.push('3. 考虑使用 WebAssembly 加速图片处理');
    lines.push('4. 对大量图片采用批量处理+进度反馈策略');
  }

  return lines.join('\n');
}

// 如果在浏览器环境中直接运行，自动执行测试
if (typeof window !== 'undefined') {
  runAllTests().then(results => {
    const report = generateReport(results);
    console.log('\n' + report);
    
    // 将结果附加到 window 供外部访问
    (window as Record<string, unknown>).__OFFSCREEN_CANVAS_TEST__ = {
      results,
      report,
      timestamp: new Date().toISOString(),
    };
  });
}
