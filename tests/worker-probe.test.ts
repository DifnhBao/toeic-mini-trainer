import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeWorker } from '../scripts/lib/worker-probe.mjs';

const url = 'https://toeic-mini-trainer.vercel.app/api/internal/ingestions/drain';
const secret = 'fixture-only-secret-never-used-on-cloud';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('manual readiness stops after one GET, authenticates and returns only safe receipt fields', async () => {
  const calls: string[] = [];
  const receipt = await probeWorker({ url, secret, fetcher: async (endpoint, init) => {
    assert.ok(endpoint instanceof URL); assert.ok(init);
    calls.push(`${init.method} ${endpoint.pathname}`);
    assert.equal(init.redirect, 'error'); assert.equal((init.headers as Record<string,string>).Authorization, `Bearer ${secret}`);
    return json({ ready: true, privateData: secret });
  } });
  assert.deepEqual(calls, ['GET /api/internal/ready']);
  assert.equal(receipt.workerCalled, false); assert.equal(receipt.canonicalTarget, true);
  assert.equal(JSON.stringify(receipt).includes(secret), false); assert.equal(JSON.stringify(receipt).includes(url), false);
});

test('unsafe target, unknown mode and malformed key are rejected before network', async () => {
  let calls = 0; const fetcher = async () => { calls++; return json({ ready: true }); };
  for (const patch of [{ url: 'https://attacker.invalid/api/internal/ingestions/drain' }, { url: url+'?token=private' },
    { url: 'http://toeic-mini-trainer.vercel.app/api/internal/ingestions/drain' }, { url: url.replace('/drain','/delete') },
    { mode: 'guessed' }, { secret: 'short' }, { secret: secret+'\n' }])
    await assert.rejects(probeWorker({ url, secret, fetcher, ...patch }));
  assert.equal(calls,0);
});

test('HTTP success alone cannot trigger a worker when readiness body is false or invalid', async () => {
  for (const response of [json({ ready: false }), new Response('private '+secret), json({ error: 'secret' }, 401), new Response('x'.repeat(65537))]) {
    let calls=0;
    await assert.rejects(probeWorker({ url, secret, mode:'drain', fetcher:async()=>{calls++;return response;} }));
    assert.equal(calls,1);
  }
});

test('explicit drain parses queued/paused and does not log the rest of the worker response', async () => {
  for (const worker of [{ queued:true }, { queued:false }, { queued:false, paused:true }]) {
    const calls:string[]=[];
    const receipt=await probeWorker({url,secret,mode:'drain',fetcher:async (_endpoint,init)=>{
      assert.ok(init);
      calls.push(init.method!); return json(calls.length===1?{ready:true}:{...worker,privateJobId:secret},calls.length===1?200:202);
    }});
    assert.deepEqual(calls,['GET','POST']);assert.equal(receipt.workerCalled,true);assert.ok('queued' in receipt);assert.equal(receipt.queued,worker.queued);
    assert.equal(JSON.stringify(receipt).includes(secret),false);
  }
});

test('raw transport/parser information never reaches error messages and drain does not retry', async () => {
  await assert.rejects(probeWorker({url,secret,fetcher:async()=>{throw new Error(secret+url);}}),(error:Error)=>error.message==='TRANSPORT_FAILED'&&!error.message.includes(secret));
  let calls=0;
  await assert.rejects(probeWorker({url,secret,mode:'drain',fetcher:async()=>{calls++;return calls===1?json({ready:true}):json({error:secret},503);}}),(error:Error)=>error.message==='WORKER_HTTP_FAILED');
  assert.equal(calls,2);
});
