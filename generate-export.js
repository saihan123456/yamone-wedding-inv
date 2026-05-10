const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
    const baseDir = __dirname;
    const indexPath = path.join(baseDir, 'index.html');
    const fileUrl = 'file://' + indexPath;

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });

    // High-resolution context: 3x device scale factor
    const context = await browser.newContext({
        viewport: { width: 1200, height: 1600 },
        deviceScaleFactor: 3,
    });

    const page = await context.newPage();

    console.log('Loading page...');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    // Wait for web fonts to fully load
    await page.waitForFunction(() => document.fonts.ready);
    // Extra pause for layout stabilization
    await page.waitForTimeout(1500);

    const card = page.locator('.invitation-card');
    await card.waitFor({ state: 'visible' });

    const box = await card.boundingBox();
    console.log(`Card dimensions (CSS px): ${Math.round(box.width)} x ${Math.round(box.height)}`);

    // 1) Capture raw high-resolution PNG of the card element
    const rawPng = path.join(baseDir, '.invitation-card-raw.png');
    console.log('Capturing high-resolution PNG...');
    await card.screenshot({
        path: rawPng,
        type: 'png',
    });

    // Get actual screenshot pixel dimensions
    const identifyOutput = execSync(`identify -format "%w %h" "${rawPng}"`).toString().trim();
    const [imgW, imgH] = identifyOutput.split(' ').map(Number);
    console.log(`Screenshot pixels: ${imgW} x ${imgH}`);

    // Calculate 4:5 canvas dimensions (pad, never crop)
    const targetRatio = 4 / 5; // 0.8
    const currentRatio = imgW / imgH;
    let targetW, targetH;

    if (currentRatio > targetRatio) {
        // Card is wider than 4:5 → increase height
        targetW = imgW;
        targetH = Math.round(imgW / targetRatio);
    } else {
        // Card is taller than 4:5 → increase width
        targetH = imgH;
        targetW = Math.round(imgH * targetRatio);
    }

    console.log(`4:5 canvas: ${targetW} x ${targetH}`);

    // 2) Pad to 4:5 ratio with the card's background colour
    const pngPath = path.join(baseDir, 'invitation-card-hd.png');
    console.log('Padding image to 4:5 ratio...');
    execSync(
        `convert "${rawPng}" -gravity center -background "#fff8f5" -extent ${targetW}x${targetH} "${pngPath}"`
    );
    fs.unlinkSync(rawPng);
    console.log(`Saved: ${pngPath}`);

    // 3) Generate PDF from the padded 4:5 image
    const pdfPath = path.join(baseDir, 'invitation-card.pdf');
    console.log('Generating PDF...');
    execSync(`convert "${pngPath}" -compress zip "${pdfPath}"`);
    console.log(`Saved: ${pdfPath}`);

    await browser.close();
    console.log('Done.');
})();
