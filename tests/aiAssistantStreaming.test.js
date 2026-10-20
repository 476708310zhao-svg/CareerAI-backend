const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pages = [
  'pages/ai-career/ai-career.js',
  'package-ai/pages/ai-assistant/ai-assistant.js'
];

function loadStreamRequest(relative, withChunks = true) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', relative), 'utf8');
  const start = source.indexOf('function decodeChunkData(');
  const end = source.indexOf('// ─── Page ───', start);
  assert.ok(start >= 0 && end > start, `${relative}: stream helpers found`);
  let requestOptions;
  let chunkListener;
  const task = { abort() {} };
  if (withChunks) task.onChunkReceived = callback => { chunkListener = callback; };
  const context = {
    API_BASE: 'https://api.example.test',
    wx: { request(options) { requestOptions = options; return task; } }
  };
  vm.runInNewContext(source.slice(start, end), context, { filename: relative });
  return {
    streamRequest: context.streamRequest,
    task,
    options: () => requestOptions,
    chunk: value => {
      assert.equal(typeof chunkListener, 'function', 'RequestTask listener registered');
      chunkListener({ data: Uint8Array.from(Buffer.from(value)).buffer });
    },
    chunkBytes: value => {
      assert.equal(typeof chunkListener, 'function', 'RequestTask listener registered');
      chunkListener({ data: Uint8Array.from(value).buffer });
    }
  };
}

for (const relative of pages) {
  test(`${relative} renders SSE chunks before request completion`, () => {
    const harness = loadStreamRequest(relative);
    const deltas = [];
    let done = 0;
    const errors = [];
    const returnedTask = harness.streamRequest(
      [{ role: 'user', content: '简历怎么改？' }], {},
      delta => deltas.push(delta), () => { done += 1; }, error => errors.push(error),
      { token: 'test-token' }
    );
    assert.equal(returnedTask, harness.task);
    assert.equal(harness.options().onChunkReceived, undefined, 'listener is not a wx.request option');
    assert.equal(harness.options().enableChunked, true);
    assert.equal(harness.options().dataType, 'text');
    assert.equal(harness.options().header.Authorization, 'Bearer test-token');

    harness.chunk('data: {"choices":[{"delta":{"content":"先优化');
    assert.deepEqual(deltas, []);
    harness.chunk('经历"}}]}\n\n');
    assert.deepEqual(deltas, ['先优化经历'], 'first answer arrives while request is still open');
    assert.equal(done, 0);
    harness.chunk('data: [DONE]\n\n');
    harness.options().success({ statusCode: 200, data: '' });
    assert.equal(done, 1);
    assert.equal(errors.length, 0);
  });

  test(`${relative} reports streamed service errors once`, () => {
    const harness = loadStreamRequest(relative);
    const errors = [];
    let done = 0;
    harness.streamRequest([{ role: 'user', content: '你好' }], {}, () => {},
      () => { done += 1; }, error => errors.push(error), { token: 'test-token' });
    harness.chunk('data: {"error":"AI响应超时，请重试"}\n\n');
    harness.options().success({ statusCode: 200, data: '' });
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /超时/);
    assert.equal(done, 0);
  });

  test(`${relative} preserves Chinese characters split across network chunks`, () => {
    const harness = loadStreamRequest(relative);
    const deltas = [];
    harness.streamRequest([{ role: 'user', content: '你好' }], {},
      delta => deltas.push(delta), () => {}, () => {}, { token: 'test-token' });
    const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"简历"}}]}\n\n');
    const split = bytes.indexOf(Buffer.from('简')) + 1;
    harness.chunkBytes(bytes.subarray(0, split));
    harness.chunkBytes(bytes.subarray(split));
    assert.deepEqual(deltas, ['简历']);
  });

  test(`${relative} still reads completed SSE when chunk events are unavailable`, () => {
    const harness = loadStreamRequest(relative, false);
    const deltas = [];
    let done = 0;
    harness.streamRequest([{ role: 'user', content: '你好' }], {},
      delta => deltas.push(delta), () => { done += 1; }, () => {}, { token: 'test-token' });
    harness.options().success({
      statusCode: 200,
      data: 'data: {"choices":[{"delta":{"content":"你好，欢迎提问"}}]}\n\ndata: [DONE]\n\n'
    });
    assert.deepEqual(deltas, ['你好，欢迎提问']);
    assert.equal(done, 1);
  });
}
