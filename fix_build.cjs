const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to run commands
const run = (cmd) => {
    try {
        console.log(`   Running: ${cmd}`);
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.warn(`   ⚠️ Command failed: ${cmd}`);
        return false;
    }
};

async function main() {
    console.log("🔧 正在自动修复构建环境 (Advanced Fix)...");

    // 1. Install Sharp if needed (needed for SVG -> PNG conversion)
    console.log("\n📦 [1/4] 检查依赖 (Sharp)...");
    try {
        require('sharp');
        console.log("   ✅ Sharp 已安装");
    } catch (e) {
        console.log("   ⚠️ 未找到 Sharp, 正在自动安装...");
        // Install sharp explicitly
        run('npm install sharp');
    }

    // 2. Install Tauri CLI (Ensure V1 is used to match Cargo.toml)
    console.log("\n📦 [2/4] 检查 Tauri CLI...");
    run('npm install --save-dev @tauri-apps/cli@^1');

    // 3. Convert SVG to PNG manually
    // Tauri's built-in SVG parser can be flaky on macOS ("image format could not be determined").
    // We pre-convert to PNG using Sharp which is robust.
    console.log("\n🎨 [3/4] 转换图标源文件 (SVG -> PNG)...");
    
    // Require sharp after installation attempt
    let sharp;
    try {
        sharp = require('sharp');
    } catch (e) {
        console.error("   ❌ 无法加载 Sharp 库，请手动运行 'npm install sharp'");
        process.exit(1);
    }

    const svgPath = path.join(__dirname, 'vite.svg');
    const pngPath = path.join(__dirname, 'temp_icon_source.png');

    if (!fs.existsSync(svgPath)) {
        console.error("   ❌ 错误: 找不到 vite.svg (请确保根目录下有此文件)");
        process.exit(1);
    }

    try {
        await sharp(svgPath)
            .resize(1024, 1024)
            .png()
            .toFile(pngPath);
        console.log("   ✅ 临时 PNG 图标已生成: temp_icon_source.png");
    } catch (err) {
        console.error("   ❌ SVG 转换失败:", err);
        process.exit(1);
    }

    // 4. Generate Icons using the PNG
    console.log("\n🎨 [4/4] 生成应用图标...");
    // Use the PNG as source for tauri icon command
    const success = run(`npx tauri icon "${pngPath}"`);

    // Cleanup
    if (fs.existsSync(pngPath)) {
        fs.unlinkSync(pngPath);
        console.log("   🧹 清理临时文件完成");
    }

    if (success) {
        console.log("\n✅ 构建环境修复完成！");
        console.log("========================================");
        console.log("👉 现在可以运行构建命令：");
        console.log("   npm run tauri build");
        console.log("========================================");
    } else {
        console.error("\n❌ 图标生成失败，请检查上方错误日志。");
        process.exit(1);
    }
}

main().catch(err => {
    console.error("Unhandled error:", err);
    process.exit(1);
});