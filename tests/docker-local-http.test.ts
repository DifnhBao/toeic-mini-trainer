import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpRequest } from '@smithy/core/transport';
import { dockerLocalHttp, parseLocalResponse, serializeLocalRequest } from '../scripts/lib/docker-local-http.mts';

const request = (changes: Partial<HttpRequest> = {}) => new HttpRequest({ protocol: 'http:', hostname: '127.0.0.1', port: 9000,
  method: 'PUT', path: '/bucket/audio%20one.mp3', headers: { host: '127.0.0.1:9000' }, ...changes });

test('Docker HTTP serializes signed local headers, escaped queries and binary body without changing source bytes', () => {
  const source = Buffer.from([0, 255, 10, 13]);
  const wire = serializeLocalRequest(request({ body: source, query: { 'x-id': 'PutObject', label: 'âm thanh' } }));
  assert.match(wire.subarray(0, wire.indexOf('\r\n\r\n')).toString(), /label=%C3%A2m%20thanh&x-id=PutObject/);
  assert.ok(wire.includes(Buffer.from('content-length: 4\r\n')));
  assert.deepEqual(wire.subarray(wire.length - 4), source);
  assert.deepEqual(source, Buffer.from([0, 255, 10, 13]));
  wire.fill(0);
});

test('Docker HTTP rejects nonlocal routing, shell-shaped helpers, header injection and ambiguous body framing', () => {
  const cases: Partial<HttpRequest>[] = [{ hostname: 'cloud.example' }, { port: 80 }, { protocol: 'https:' }, { method: 'CONNECT' },
    { path: '/a\r\nx: y' }, { headers: { host: 'other' } }, { headers: { host: '127.0.0.1:9000', extra: 'x\r\ny' } },
    { headers: { host: '127.0.0.1:9000', 'transfer-encoding': 'chunked' } },
    { headers: { host: '127.0.0.1:9000', 'content-length': '1' } }, { body: { private: true } }];
  for (const changes of cases) {
    assert.throws(() => serializeLocalRequest(request(changes)));
  }
  assert.throws(() => dockerLocalHttp('helper; command'));
});

test('Docker HTTP parses interim continue and exact binary content length', () => {
  const raw = Buffer.concat([Buffer.from('HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 0-2/10\r\n\r\n'), Buffer.from([0, 255, 1])]);
  const response = parseLocalResponse(raw, 'GET');
  assert.equal(response.statusCode, 206); assert.equal(response.headers['content-range'], 'bytes 0-2/10');
  assert.deepEqual(response.body, Buffer.from([0, 255, 1]));
  raw.fill(0); assert.deepEqual(response.body, Buffer.from([0, 255, 1])); response.body.fill(0);
});

test('Docker HTTP decodes bounded chunks including extensions and trailers', () => {
  const parsed = parseLocalResponse(Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2;fixture=yes\r\nab\r\n1\r\nc\r\n0\r\nx-fixture: yes\r\n\r\n'), 'GET');
  assert.equal(parsed.body.toString(), 'abc');
});

test('Docker HTTP allows HEAD metadata lengths and empty 204 responses', () => {
  assert.equal(parseLocalResponse(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 9000\r\n\r\n'), 'HEAD').body.length, 0);
  assert.equal(parseLocalResponse(Buffer.from('HTTP/1.1 204 No Content\r\n\r\n'), 'DELETE').body.length, 0);
});

test('Docker HTTP combines ordinary repeated headers while preserving strict framing', () => {
  const result = parseLocalResponse(Buffer.from('HTTP/1.1 200 OK\r\nVary: Origin\r\nVary: Accept-Encoding\r\nContent-Length: 0\r\n\r\n'), 'GET');
  assert.equal(result.headers.vary, 'Origin, Accept-Encoding');
});

test('Docker HTTP refuses truncation, duplicate length, invalid chunk boundaries and trailing response bytes', () => {
  for (const text of ['HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nabc',
    'HTTP/1.1 200 OK\r\nContent-Length: 0\r\nContent-Length: 1\r\n\r\n',
    'HTTP/1.1 200 OK\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\na\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nffffffff\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nextra',
    'HTTP/1.1 101 Switching Protocols\r\n\r\n', 'HTTP/1.1 200 OK\r\nbroken\r\n\r\n']) {
    assert.throws(() => parseLocalResponse(Buffer.from(text), 'GET'));
  }
});
