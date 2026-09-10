import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');

async function optimizeLogo(inputFile, outputFile, maxWidth) {
  try {
    const info = await sharp(inputFile)
      .resize(maxWidth, null, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: 85 })
      .toFile(outputFile);
    
    console.log(`✓ Created ${outputFile}: ${Math.round(info.size / 1024)}KB (${info.width}x${info.height})`);
    return info;
  } catch (err) {
    console.error(`✗ Failed to optimize ${inputFile}:`, err.message);
    throw err;
  }
}

async function createOptimizedPng(inputFile, outputFile, maxWidth) {
  try {
    const info = await sharp(inputFile)
      .resize(maxWidth, null, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .png({ 
        compressionLevel: 9,
        quality: 85
      })
      .toFile(outputFile);
    
    console.log(`✓ Created ${outputFile}: ${Math.round(info.size / 1024)}KB (${info.width}x${info.height})`);
    return info;
  } catch (err) {
    console.error(`✗ Failed to create ${inputFile}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('Optimizing logo images...\n');
  
  const logo1Input = path.join(publicDir, 'logo.png');
  const logo2Input = path.join(publicDir, 'logo2.png');
  
  const logo1Backup = path.join(publicDir, 'logo-original.png');
  const logo2Backup = path.join(publicDir, 'logo2-original.png');
  
  if (!fs.existsSync(logo1Backup)) {
    fs.copyFileSync(logo1Input, logo1Backup);
    console.log('✓ Backed up original logo.png');
  }
  if (!fs.existsSync(logo2Backup)) {
    fs.copyFileSync(logo2Input, logo2Backup);
    console.log('✓ Backed up original logo2.png');
  }
  
  console.log('\nCreating WebP versions (recommended for modern browsers)...');
  await optimizeLogo(logo1Input, path.join(publicDir, 'logo.webp'), 800);
  await optimizeLogo(logo2Input, path.join(publicDir, 'logo2.webp'), 800);
  
  console.log('\nCreating optimized PNG versions (fallback)...');
  await createOptimizedPng(logo1Backup, logo1Input, 800);
  await createOptimizedPng(logo2Backup, logo2Input, 800);
  
  console.log('\n✓ Logo optimization complete!');
  console.log('  Original files backed up as logo-original.png and logo2-original.png');
  console.log('  Use .webp versions in HTML with <picture> tag for best performance');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
