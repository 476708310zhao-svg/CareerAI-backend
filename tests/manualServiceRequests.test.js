'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('manual service requests enforce explicit consent, owner scope, revocation and admin audit',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jobapp-manual-service-'));
  const resolved=path.resolve(root);
  assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved),/^jobapp-manual-service-[A-Za-z0-9_-]+$/);
  try{
    const result=spawnSync(process.execPath,['--test','--test-reporter=dot',path.join(__dirname,'helpers/manualServiceRequestsFixture.cjs')],{
      encoding:'utf8',timeout:120000,
      env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_'))),MANUAL_SERVICE_FIXTURE_ROOT:resolved}
    });
    const output=`${result.stdout||''}${result.stderr||''}${result.error||''}`;
    assert.equal(result.status,0,output);
  }finally{
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved),/^jobapp-manual-service-[A-Za-z0-9_-]+$/);
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
