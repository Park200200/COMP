import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  
  await page.goto('https://localhost:5173/');
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    return {
      blueprints: JSON.parse(localStorage.getItem('COMP_v3_blueprints') || '[]'),
      domains: JSON.parse(localStorage.getItem('COMP_v3_domains') || '[]'),
      atomCount: (JSON.parse(localStorage.getItem('COMP_v3_atoms') || '[]')).length,
      sampleAtoms: (JSON.parse(localStorage.getItem('COMP_v3_atoms') || '[]')).filter((a: any) => 
        a.type?.includes('사이즈') || a.type?.includes('아미지') || a.type?.includes('이미지')
      ),
    };
  });

  console.log('=== BLUEPRINTS ===');
  data.blueprints.forEach((b: any) => {
    if (b.name?.includes('사이즈') || b.name?.includes('아미지') || b.name?.includes('이미지') || b.name?.includes('사료')) {
      console.log(JSON.stringify(b));
    }
  });

  console.log('=== DOMAINS ===');
  data.domains.forEach((d: any) => {
    console.log(JSON.stringify({ id: d.id, name: d.name, fields: d.fields, gridFields: d.gridFields, anchor: d.anchor }));
  });

  console.log('=== SAMPLE ATOMS ===');
  console.log(JSON.stringify(data.sampleAtoms, null, 2));

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
