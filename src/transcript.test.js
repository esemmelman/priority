import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTranscript } from './transcript.js';

test('replaces repeated partial hypotheses with their extension', () => {
  assert.equal(mergeTranscript('this', 'this is a test'), 'this is a test');
  assert.equal(mergeTranscript('this is', 'this is a test'), 'this is a test');
});

test('joins distinct phrases while removing overlap across recognition restarts', () => {
  assert.equal(mergeTranscript('get a wrench', 'wrench for the bike'), 'get a wrench for the bike');
  assert.equal(mergeTranscript('get a wrench', 'and some oil'), 'get a wrench and some oil');
});
