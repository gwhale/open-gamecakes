import { describe, expect, it } from 'vitest';
import { isOpenTicket, parseTicketStatusRequest } from './tickets';

const id = '3f2b6c1e-8d4a-4b7e-9c1d-2a5e6f7a8b9c';

describe('parseTicketStatusRequest', () => {
  it('accepts the four statuses', () => {
    for (const status of ['new', 'reviewed', 'done', 'wontfix']) {
      expect(parseTicketStatusRequest({ id, status })).toEqual({ id, status });
    }
  });

  it('rejects anything else', () => {
    expect(parseTicketStatusRequest(null)).toBeNull();
    expect(parseTicketStatusRequest({ id, status: 'deleted' })).toBeNull();
    expect(parseTicketStatusRequest({ id: 'not-an-id', status: 'done' })).toBeNull();
    expect(parseTicketStatusRequest({ status: 'done' })).toBeNull();
  });
});

describe('isOpenTicket', () => {
  it('counts new and looked-at as open, done and won’t-do as closed', () => {
    expect(['new', 'reviewed', 'done', 'wontfix'].map(isOpenTicket)).toEqual([true, true, false, false]);
  });
});
