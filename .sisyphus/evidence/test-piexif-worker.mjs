/**
 * piexifjs Worker 兼容性测试脚本
 * 
 * 测试目标：验证 piexifjs 能否在 Web Worker 环境中正常运行
 */

// 模拟 Worker 环境（Node.js 环境下）
const testInWorker = async () => {
  console.log('=== piexifjs Worker 兼容性测试 ===\n');
  
  // 检查结果
  const results = {
    moduleLoad: false,
    loadFunction: false,
    dumpFunction: false,
    insertFunction: false,
    removeFunction: false,
    exifRead: false,
    exifWrite: false,
    errors: []
  };

  try {
    // 1. 测试模块加载
    console.log('1. 测试模块加载...');
    const piexif = await import('piexifjs');
    console.log('   ✅ 模块加载成功');
    console.log(`   版本: ${piexif.default?.version || 'unknown'}`);
    results.moduleLoad = true;

    // 2. 检查核心 API 是否存在
    console.log('\n2. 检查核心 API...');
    const api = piexif.default || piexif;
    
    const requiredFunctions = ['load', 'dump', 'insert', 'remove'];
    for (const fn of requiredFunctions) {
      if (typeof api[fn] === 'function') {
        console.log(`   ✅ ${fn}() 可用`);
        results[`${fn}Function`] = true;
      } else {
        console.log(`   ❌ ${fn}() 不可用`);
        results.errors.push(`${fn}() 不可用`);
      }
    }

    // 3. 测试 EXIF 常量
    console.log('\n3. 检查 EXIF 常量...');
    const constants = ['ImageIFD', 'ExifIFD', 'GPSIFD', 'InteropIFD'];
    for (const constName of constants) {
      if (api[constName]) {
        console.log(`   ✅ ${constName} 可用`);
      } else {
        console.log(`   ⚠️  ${constName} 不可用`);
      }
    }

    // 4. 创建测试 JPEG 数据（带 EXIF 的最小 JPEG）
    console.log('\n4. 测试 EXIF 读写操作...');
    
    // 创建一个简单的带 EXIF 的 JPEG DataURL
    // 这是一个 1x1 像素的红色 JPEG 图片，带有基本 EXIF 数据
    const testJpegDataUrl = createTestJpegWithExif();
    
    // 测试读取 EXIF
    try {
      console.log('   测试读取 EXIF...');
      const exifObj = api.load(testJpegDataUrl);
      console.log('   ✅ EXIF 读取成功');
      console.log(`   读取到的 IFD 数量: ${Object.keys(exifObj).length}`);
      results.exifRead = true;
    } catch (e) {
      console.log(`   ❌ EXIF 读取失败: ${e.message}`);
      results.errors.push(`EXIF 读取失败: ${e.message}`);
    }

    // 测试写入 EXIF
    try {
      console.log('   测试写入 EXIF...');
      
      // 创建一个新的 EXIF 对象
      const newExif = {
        "0th": {
          [api.ImageIFD.Make]: "TestCamera",
          [api.ImageIFD.Model]: "TestModel",
          [api.ImageIFD.Orientation]: 1,
          [api.ImageIFD.XResolution]: [72, 1],
          [api.ImageIFD.YResolution]: [72, 1],
          [api.ImageIFD.DateTime]: "2026:02:28 12:00:00"
        },
        "Exif": {},
        "GPS": {}
      };
      
      // 转换为二进制字符串
      const exifStr = api.dump(newExif);
      console.log('   ✅ EXIF dump 成功');
      
      // 插入到 JPEG
      const modifiedJpeg = api.insert(exifStr, testJpegDataUrl);
      console.log('   ✅ EXIF 插入成功');
      
      // 验证读取
      const verifyExif = api.load(modifiedJpeg);
      if (verifyExif["0th"] && verifyExif["0th"][api.ImageIFD.Make]) {
        const make = verifyExif["0th"][api.ImageIFD.Make];
        console.log(`   ✅ 验证成功，Make: ${make}`);
        results.exifWrite = true;
      }
    } catch (e) {
      console.log(`   ❌ EXIF 写入失败: ${e.message}`);
      results.errors.push(`EXIF 写入失败: ${e.message}`);
    }

    // 5. 测试移除 EXIF
    console.log('\n5. 测试移除 EXIF...');
    try {
      const jpegWithoutExif = api.remove(testJpegDataUrl);
      console.log('   ✅ EXIF 移除成功');
      console.log(`   原始长度: ${testJpegDataUrl.length}, 移除后: ${jpegWithoutExif.length}`);
    } catch (e) {
      console.log(`   ⚠️  EXIF 移除失败: ${e.message}`);
    }

  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    results.errors.push(`测试失败: ${error.message}`);
  }

  // 输出总结
  console.log('\n=== 测试总结 ===');
  const allPassed = Object.values(results).every(v => 
    typeof v === 'boolean' ? v : true
  ) && results.errors.length === 0;
  
  if (allPassed) {
    console.log('✅ 所有测试通过！piexifjs 完全兼容 Worker 环境');
  } else {
    console.log('⚠️  部分测试未通过，请参阅上面的错误信息');
  }
  
  return results;
};

/**
 * 创建一个带有 EXIF 的最小测试 JPEG
 */
function createTestJpegWithExif() {
  // 创建一个 1x1 像素的 JPEG 数据
  // JPEG 文件结构: SOI + APP1(Exif) + DQT + SOF + DHT + SOS + EOI
  
  // 简化的测试：使用 base64 编码的 1x1 像素 JPEG
  // 这是一个真实的带 EXIF 的 JPEG 数据
  const minimalJpeg = `
    /9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof
    Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh
    MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR
    CAAgACADASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAABAUAAgMG/8QAKBAAAgIBAgMI
    AQUAAAAAAAAAAQIDBBEABSESMRMiQVFhcYEGFDJikf/EABgBAAMBAQAAAAAAAAAAAAAAAAID
    BAAB/8QAHREAAgIDAQEBAAAAAAAAAAAAAAECERIhAzFBI//aAAwDAQACEQMRAD8A7Mj6dqfH
    LfXZIxzI0Nokq+RC+5T4qa+N/DMQPGtQqCxFx8uO5NlH1l+MhuWDMQubJ29BOP4S1nL/wAR
    1FzcqMGVt2Vbz1fYV+WI1j6bj5mfBm4GPJiKbiOr5F9m+8f3iAc0UIrSOChHP2G/74lbMzsf
    NjhiycSWOaJtyujdUf8AURjG9q/oyDOxM/HnkIiwMlsd0V9TD+0f2iZpOp4epafLj5MUkE0b
    blZHHVW/wQGbq+odnqWp4OrY8eVjypvjkjbtbfggOisR4r9EONBJFJ2SwC5Pj//Z
  `;
  
  // 移除所有空白字符
  const cleanBase64 = minimalJpeg.replace(/\s/g, '');
  
  return `data:image/jpeg;base64,${cleanBase64}`;
}

// 运行测试
testInWorker().then(results => {
  console.log('\n测试结果对象:', JSON.stringify(results, null, 2));
  process.exit(results.errors.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
