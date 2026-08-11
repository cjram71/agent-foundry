import assert from 'node:assert/strict';
import test from 'node:test';
import { PrometheusAdapter } from '../dashboard/prometheus';

test('uses only internal allowlisted Prometheus queries', async () => {
  const urls: string[] = [];
  const request = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ status: 'success', data: { result: [{ value: [1, '42'] }] } }));
  }) as typeof fetch;
  const host = await new PrometheusAdapter('http://prometheus', request).host();
  assert.equal(host.cpuPercent, 42);
  assert.equal(urls.length, 8);
  assert(urls.every(url => url.startsWith('http://prometheus/api/v1/query?query=')));
});

test('normalizes telemetry failure to unknown values', async () => {
  const request = (async () => { throw new Error('down'); }) as typeof fetch;
  const host = await new PrometheusAdapter('http://prometheus', request).host();
  assert.deepEqual(host, { cpuPercent:null, memoryUsedBytes:null, memoryTotalBytes:null, diskUsedBytes:null, diskTotalBytes:null, load1:null, load5:null, load15:null });
});
