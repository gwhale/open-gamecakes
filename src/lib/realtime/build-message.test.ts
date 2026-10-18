import { describe, expect, it } from 'vitest';
import { BUILDS_CHANGED_EVENT, SERVER_SENDER, buildsChangedMessage, buildsTopic } from './build-message';

describe('buildsChangedMessage', () => {
  it('targets the same public channel the browser joins', () => {
    const msg = buildsChangedMessage('abc123');
    expect(msg.topic).toBe(buildsTopic('abc123'));
    expect(msg.topic).toBe('builds:abc123');
    // REST takes the bare topic; realtime-js strips this prefix itself.
    expect(msg.topic.startsWith('realtime:')).toBe(false);
    expect(msg.private).toBe(false);
  });

  it('carries only the event and a sender id, no build data', () => {
    const msg = buildsChangedMessage('t');
    expect(msg.event).toBe(BUILDS_CHANGED_EVENT);
    expect(msg.payload).toEqual({ s: SERVER_SENDER });
  });
});
