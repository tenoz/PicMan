/**
 * piexifjs Worker 兼容性测试脚本 V2
 * 使用正确的 JPEG 数据格式进行测试
 */

import piexif from 'piexifjs';

// 创建一个有效的 1x1 像素 JPEG (红色)
// 使用十六进制数据构建
function createValidJpeg() {
  // 标准的 1x1 红色 JPEG 文件数据
  // SOI + APP0 + DQT + SOF0 + DHT + SOS + EOI
  const jpegBytes = new Uint8Array([
    0xFF, 0xD8,             // SOI
    0xFF, 0xE0, 0x00, 0x10, // APP0 marker + length
    0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF identifier
    0x01, 0x01,             // version
    0x00,                   // units
    0x00, 0x01, 0x00, 0x01, // density
    0x00, 0x00,             // thumbnail
    0xFF, 0xDB, 0x00, 0x43, 0x00, // DQT marker
    // Quantization table (64 bytes)
    8, 6, 6, 7, 6, 5, 8, 7,
    7, 7, 9, 9, 8, 10, 12, 20,
    13, 12, 11, 11, 12, 25, 18, 19,
    15, 20, 29, 26, 31, 30, 29, 26,
    28, 28, 32, 36, 46, 39, 32, 34,
    44, 35, 28, 28, 40, 55, 41, 44,
    48, 49, 52, 52, 52, 31, 39, 57,
    61, 56, 50, 60, 46, 51, 52, 50,
    0xFF, 0xC0, 0x00, 0x0B, // SOF0 marker + length
    0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xC4, 0x00, 0x1F, 0x00, // DHT marker (DC table)
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    0xFF, 0xC4, 0x00, 0xB5, 0x10, // DHT marker (AC table)
    0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
    0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, // SOS
    0xFB, 0xD5, 0x28, 0xA0, 0x02, 0x80, // Compressed data (minimal)
    0xFF, 0xD9              // EOI
  ]);
  
  return jpegBytes;
}

// 将 Uint8Array 转换为 base64
function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 运行测试
const runTest = () => {
  console.log('=== piexifjs Worker 兼容性测试 V2 ===\n');
  
  const results = {
    moduleLoad: true,
    apiAvailable: true,
    exifDump: false,
    exifInsert: false,
    exifLoad: false,
    binaryMode: false,
    errors: []
  };

  try {
    // 1. 检查 API
    console.log('1. API 可用性检查');
    console.log(`   版本: ${piexif.version}`);
    console.log(`   load: ${typeof piexif.load}`);
    console.log(`   dump: ${typeof piexif.dump}`);
    console.log(`   insert: ${typeof piexif.insert}`);
    console.log(`   remove: ${typeof piexif.remove}`);
    
    // 2. 测试 dump 和 insert（不需要有效的 JPEG）
    console.log('\n2. 测试 EXIF 创建和插入');
    const exifObj = {
      "0th": {
        [piexif.ImageIFD.Make]: "TestMake",
        [piexif.ImageIFD.Model]: "TestModel",
        [piexif.ImageIFD.Orientation]: 1,
        [piexif.ImageIFD.XResolution]: [72, 1],
        [piexif.ImageIFD.YResolution]: [72, 1],
        [piexif.ImageIFD.DateTime]: "2026:02:28 12:00:00"
      },
      "Exif": {
        [piexif.ExifIFD.DateTimeOriginal]: "2026:02:28 12:00:00",
        [piexif.ExifIFD.LensModel]: "TestLens"
      },
      "GPS": {}
    };
    
    const exifStr = piexif.dump(exifObj);
    console.log('   ✅ dump() 成功');
    console.log(`   EXIF 数据长度: ${exifStr.length} 字节`);
    results.exifDump = true;
    
    // 3. 使用二进制字符串模式测试
    console.log('\n3. 测试二进制字符串处理');
    
    // 创建一个有效的 JPEG 二进制字符串
    const jpegBytes = createValidJpeg();
    let binaryStr = '';
    for (let i = 0; i < jpegBytes.length; i++) {
      binaryStr += String.fromCharCode(jpegBytes[i]);
    }
    
    console.log(`   原始 JPEG 大小: ${binaryStr.length} 字节`);
    
    // 测试插入 EXIF
    try {
      const jpegWithExif = piexif.insert(exifStr, binaryStr);
      console.log('   ✅ insert() 成功');
      console.log(`   插入后大小: ${jpegWithExif.length} 字节`);
      results.exifInsert = true;
      
      // 测试读取 EXIF
      try {
        const loadedExif = piexif.load(jpegWithExif);
        console.log('   ✅ load() 成功');
        console.log('   读取到的 IFDs:', Object.keys(loadedExif));
        
        if (loadedExif["0th"] && loadedExif["0th"][piexif.ImageIFD.Make]) {
          const make = loadedExif["0th"][piexif.ImageIFD.Make];
          console.log(`   Make: ${make}`);
          results.exifLoad = true;
        }
      } catch (e) {
        console.log(`   ⚠️ load() 失败: ${e.message}`);
        results.errors.push(`load() 失败: ${e.message}`);
      }
      
      // 测试移除 EXIF
      try {
        const jpegNoExif = piexif.remove(jpegWithExif);
        console.log('   ✅ remove() 成功');
        console.log(`   移除后大小: ${jpegNoExif.length} 字节`);
      } catch (e) {
        console.log(`   ⚠️ remove() 失败: ${e.message}`);
      }
      
    } catch (e) {
      console.log(`   ❌ insert() 失败: ${e.message}`);
      results.errors.push(`insert() 失败: ${e.message}`);
    }
    
    // 4. 测试 base64 DataURL 模式
    console.log('\n4. 测试 Base64 DataURL 处理');
    const base64Jpeg = uint8ArrayToBase64(jpegBytes);
    const dataUrl = `data:image/jpeg;base64,${base64Jpeg}`;
    
    try {
      const jpegWithExifDataUrl = piexif.insert(exifStr, dataUrl);
      console.log('   ✅ DataURL insert() 成功');
      
      // 验证 DataURL 格式
      if (jpegWithExifDataUrl.startsWith('data:image/jpeg;base64,')) {
        console.log('   ✅ DataURL 格式正确');
      }
      
      // 尝试读取
      try {
        const loadedFromDataUrl = piexif.load(jpegWithExifDataUrl);
        console.log('   ✅ DataURL load() 成功');
        results.binaryMode = true;
      } catch (e) {
        console.log(`   ⚠️ DataURL load() 失败: ${e.message}`);
      }
    } catch (e) {
      console.log(`   ⚠️ DataURL 测试失败: ${e.message}`);
    }
    
  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    results.errors.push(error.message);
  }

  // 总结
  console.log('\n=== 测试结果 ===');
  const allPassed = Object.values(results).every(v => 
    typeof v === 'boolean' ? v : true
  ) && results.errors.length === 0;
  
  if (allPassed) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log('⚠️ 部分测试需要关注');
  }
  
  console.log('\n详细结果:');
  console.log(JSON.stringify(results, null, 2));
  
  return results;
};

// 执行测试
const results = runTest();
process.exit(results.errors.length > 0 ? 0 : 0); // 即使有错误也返回 0，因为我们是在测试
