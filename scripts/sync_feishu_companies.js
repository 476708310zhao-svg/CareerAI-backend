'use strict';

require('dotenv').config();

const { importFeishuCompanies } = require('../services/feishuCompanyImport');

function argValue(name) {
  const prefix = `${name}=`;
  const matched = process.argv.find(arg => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : '';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxRecords = Number(argValue('--max') || process.env.FEISHU_COMPANY_IMPORT_MAX || 0) || undefined;
  const pageSize = Number(argValue('--page-size') || 100) || undefined;

  console.log('=== Feishu company import ===');
  console.log(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  if (dryRun) console.log('Mode: dry-run');

  const result = await importFeishuCompanies({ dryRun, maxRecords, pageSize });

  console.log(`Raw records:    ${result.raw}`);
  console.log(`Valid records:  ${result.valid}`);
  console.log(`Imported count: ${result.imported}`);

  if (dryRun) {
    console.log('\nPreview:');
    (result.preview || []).forEach(company => {
      console.log(`- ${company.display_name} | ${company.industry_l1 || '-'} | ${company.official_domain || '-'}`);
    });
    return;
  }

  console.log(`Inserted:       ${result.inserted}`);
  console.log(`Updated:        ${result.updated}`);
  console.log(`Total in DB:    ${result.total}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Feishu company import failed:', err.message);
    process.exit(1);
  });
}
