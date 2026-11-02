/**
 * 虚拟列表性能基准测试
 * 测试大数据列表渲染、滚动性能和内存占用
 */
import { bench, describe } from 'vitest';

// 模拟虚拟列表项目的数据结构
interface ListItem {
  id: number;
  title: string;
  description: string;
  height: number;
  imageUrl?: string;
}

// 生成测试数据
function generateItems(count: number, fixedHeight: boolean = true): ListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    title: `项目 ${i + 1}`,
    description: `这是项目 ${i + 1} 的描述文本，用于测试虚拟列表的渲染性能。`,
    height: fixedHeight ? 50 : 30 + Math.random() * 70,
    imageUrl: i % 5 === 0 ? `https://example.com/image-${i}.jpg` : undefined,
  }));
}

// 虚拟列表核心算法 - 计算可见范围
function calculateVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  totalCount: number,
  overscan: number = 3
): { start: number; end: number } {
  const startIndex = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(viewportHeight / itemHeight);
  
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(totalCount, startIndex + visibleCount + overscan);
  
  return { start, end };
}

// 变高列表的可见范围计算（二分查找）
function calculateVariableVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  itemHeights: number[],
  overscan: number = 3
): { start: number; end: number } {
  // 计算累积高度
  const cumulativeHeights: number[] = [];
  let totalHeight = 0;
  for (const height of itemHeights) {
    totalHeight += height;
    cumulativeHeights.push(totalHeight);
  }
  
  // 二分查找起始索引
  let startIndex = 0;
  let left = 0;
  let right = cumulativeHeights.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (cumulativeHeights[mid] <= scrollTop) {
      startIndex = mid + 1;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  // 查找结束索引
  const endScrollTop = scrollTop + viewportHeight;
  let endIndex = startIndex;
  for (let i = startIndex; i < cumulativeHeights.length; i++) {
    if (cumulativeHeights[i] >= endScrollTop) {
      endIndex = i;
      break;
    }
  }
  
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(itemHeights.length, endIndex + overscan + 1);
  
  return { start, end };
}

// DOM 操作模拟 - 渲染列表项
function renderItems(items: ListItem[], container: HTMLElement): void {
  const fragment = document.createDocumentFragment();
  
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.height = `${item.height}px`;
    div.dataset.id = String(item.id);
    
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = item.title;
    
    const desc = document.createElement('div');
    desc.className = 'item-desc';
    desc.textContent = item.description;
    
    div.appendChild(title);
    div.appendChild(desc);
    fragment.appendChild(div);
  });
  
  container.appendChild(fragment);
}

describe('虚拟列表 - 固定高度性能测试', () => {
  const totalItems = 10000;
  const viewportHeight = 600;
  const itemHeight = 50;
  
  bench('计算可见范围 - 开始位置', () => {
    calculateVisibleRange(0, viewportHeight, itemHeight, totalItems);
  }, {
    iterations: 10000,
    warmupIterations: 100,
  });
  
  bench('计算可见范围 - 中间位置', () => {
    calculateVisibleRange(250000, viewportHeight, itemHeight, totalItems);
  }, {
    iterations: 10000,
    warmupIterations: 100,
  });
  
  bench('计算可见范围 - 末尾位置', () => {
    calculateVisibleRange(499000, viewportHeight, itemHeight, totalItems);
  }, {
    iterations: 10000,
    warmupIterations: 100,
  });
  
  bench('计算可见范围 - 随机位置', () => {
    const randomScrollTop = Math.random() * (totalItems * itemHeight - viewportHeight);
    calculateVisibleRange(randomScrollTop, viewportHeight, itemHeight, totalItems);
  }, {
    iterations: 10000,
    warmupIterations: 100,
  });
});

describe('虚拟列表 - 变高项目性能测试', () => {
  const totalItems = 10000;
  const viewportHeight = 600;
  let itemHeights: number[];
  
  // 准备变高数据
  bench('准备变高数据', () => {
    itemHeights = generateItems(totalItems, false).map(item => item.height);
  }, {
    iterations: 1,
    warmupIterations: 0,
  });
  
  bench('计算变高可见范围 - 开始位置', () => {
    calculateVariableVisibleRange(0, viewportHeight, itemHeights, 3);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('计算变高可见范围 - 中间位置', () => {
    const midScrollTop = itemHeights.reduce((a, b) => a + b, 0) / 2;
    calculateVariableVisibleRange(midScrollTop, viewportHeight, itemHeights, 3);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('计算变高可见范围 - 随机位置', () => {
    const totalHeight = itemHeights.reduce((a, b) => a + b, 0);
    const randomScrollTop = Math.random() * (totalHeight - viewportHeight);
    calculateVariableVisibleRange(randomScrollTop, viewportHeight, itemHeights, 3);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
});

describe('虚拟列表 - 数据生成性能', () => {
  bench('生成 1,000 条数据', () => {
    generateItems(1000);
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
  
  bench('生成 10,000 条数据', () => {
    generateItems(10000);
  }, {
    iterations: 50,
    warmupIterations: 5,
  });
  
  bench('生成 100,000 条数据', () => {
    generateItems(100000);
  }, {
    iterations: 10,
    warmupIterations: 2,
  });
  
  bench('生成 1,000 条变高数据', () => {
    generateItems(1000, false);
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
});

describe('虚拟列表 - DOM 操作性能', () => {
  let container: HTMLElement;
  let items: ListItem[];
  
  // 准备容器和数据
  bench('准备测试环境', () => {
    container = document.createElement('div');
    container.style.height = '600px';
    container.style.overflow = 'auto';
    document.body.appendChild(container);
    items = generateItems(20);
  }, {
    iterations: 1,
    warmupIterations: 0,
  });
  
  bench('DOM 渲染 - 20 个项目', () => {
    container.innerHTML = '';
    renderItems(items, container);
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
  
  bench('DOM 渲染 - 50 个项目', () => {
    const moreItems = generateItems(50);
    container.innerHTML = '';
    renderItems(moreItems, container);
  }, {
    iterations: 50,
    warmupIterations: 5,
  });
  
  // 清理
  bench('清理', () => {
    document.body.removeChild(container);
  }, {
    iterations: 1,
    warmupIterations: 0,
  });
});

describe('虚拟列表 - 滚动性能测试', () => {
  const totalItems = 10000;
  const viewportHeight = 600;
  const itemHeight = 50;
  const itemsPerViewport = Math.ceil(viewportHeight / itemHeight);
  
  bench('快速滚动 - 连续计算 100 帧', () => {
    let scrollTop = 0;
    const scrollDelta = 300; // 每次滚动 300px
    
    for (let i = 0; i < 100; i++) {
      scrollTop += scrollDelta;
      if (scrollTop > totalItems * itemHeight - viewportHeight) {
        scrollTop = 0;
      }
      calculateVisibleRange(scrollTop, viewportHeight, itemHeight, totalItems);
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
  
  bench('慢速滚动 - 连续计算 100 帧', () => {
    let scrollTop = 0;
    const scrollDelta = 10; // 每次滚动 10px
    
    for (let i = 0; i < 100; i++) {
      scrollTop += scrollDelta;
      if (scrollTop > totalItems * itemHeight - viewportHeight) {
        scrollTop = 0;
      }
      calculateVisibleRange(scrollTop, viewportHeight, itemHeight, totalItems);
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
  
  bench('惯性滚动模拟 - 速度递减', () => {
    let scrollTop = 50000;
    let velocity = 500; // 初始速度
    const friction = 0.9; // 摩擦系数
    
    while (velocity > 1) {
      scrollTop += velocity;
      velocity *= friction;
      calculateVisibleRange(scrollTop, viewportHeight, itemHeight, totalItems);
    }
  }, {
    iterations: 50,
    warmupIterations: 5,
  });
});

describe('虚拟列表 - 大数据量性能对比', () => {
  const viewportHeight = 600;
  const itemHeight = 50;
  
  bench('1,000 项列表', () => {
    const items = generateItems(1000);
    calculateVisibleRange(5000, viewportHeight, itemHeight, items.length);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('10,000 项列表', () => {
    const items = generateItems(10000);
    calculateVisibleRange(50000, viewportHeight, itemHeight, items.length);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('100,000 项列表', () => {
    const items = generateItems(100000);
    calculateVisibleRange(500000, viewportHeight, itemHeight, items.length);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('1,000,000 项列表', () => {
    const items = generateItems(1000000);
    calculateVisibleRange(5000000, viewportHeight, itemHeight, items.length);
  }, {
    iterations: 500,
    warmupIterations: 20,
  });
});

describe('虚拟列表 - 内存使用测试', () => {
  bench('大列表数据创建与销毁', () => {
    // 创建大量数据
    const items = generateItems(100000);
    
    // 模拟处理
    const processed = items.map(item => ({
      ...item,
      processed: true,
    }));
    
    // 显式清理
    processed.length = 0;
    items.length = 0;
  }, {
    iterations: 10,
    warmupIterations: 2,
  });
  
  bench('重复滚动位置计算 - 内存稳定性', () => {
    const totalItems = 100000;
    const viewportHeight = 600;
    const itemHeight = 50;
    
    // 模拟 1000 次滚动位置计算
    for (let i = 0; i < 1000; i++) {
      const scrollTop = Math.random() * (totalItems * itemHeight - viewportHeight);
      calculateVisibleRange(scrollTop, viewportHeight, itemHeight, totalItems);
    }
  }, {
    iterations: 100,
    warmupIterations: 10,
  });
});

describe('虚拟列表 - 对比：虚拟 vs 全量渲染', () => {
  bench('虚拟渲染 - 只渲染可见项', () => {
    const totalItems = 10000;
    const viewportHeight = 600;
    const itemHeight = 50;
    
    // 计算可见范围
    const { start, end } = calculateVisibleRange(2500, viewportHeight, itemHeight, totalItems);
    
    // 只生成可见项数据
    const visibleItems = generateItems(end - start);
  }, {
    iterations: 1000,
    warmupIterations: 50,
  });
  
  bench('全量渲染 - 生成所有项', () => {
    const totalItems = 10000;
    
    // 生成所有数据
    const allItems = generateItems(totalItems);
  }, {
    iterations: 100,
    warmupIterations: 5,
  });
});

// 生成性能对比报告数据
describe('虚拟列表 - 性能报告数据', () => {
  bench('基准测试 - 典型使用场景', () => {
    // 模拟典型场景：10万条数据，中等滚动位置
    const totalItems = 100000;
    const viewportHeight = 600;
    const itemHeight = 50;
    const scrollTop = 250000; // 滚动到中间位置
    
    // 1. 计算可见范围
    const { start, end } = calculateVisibleRange(scrollTop, viewportHeight, itemHeight, totalItems);
    
    // 2. 生成可见项数据
    const visibleItems = generateItems(end - start);
    
    // 3. 计算总高度
    const totalHeight = totalItems * itemHeight;
    
    // 4. 计算偏移量
    const offsetY = start * itemHeight;
  }, {
    iterations: 500,
    warmupIterations: 20,
  });
});
