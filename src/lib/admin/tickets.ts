// Ticket statuses the operator can set, and the request shape for changing one.
// The same four the family's own /tickets page uses (api/feedback/[id]).

export const TICKET_STATUSES = ['new', 'reviewed', 'done', 'wontfix'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  reviewed: 'Looked at',
  done: 'Done',
  wontfix: "Won't do",
};

/** Still needs the operator: not finished either way. */
export const isOpenTicket = (status: string): boolean => status === 'new' || status === 'reviewed';

export function parseTicketStatusRequest(body: unknown): { id: string; status: TicketStatus } | null {
  if (!body || typeof body !== 'object') return null;
  const { id, status } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (typeof status !== 'string' || !(TICKET_STATUSES as readonly string[]).includes(status)) return null;
  return { id, status: status as TicketStatus };
}
