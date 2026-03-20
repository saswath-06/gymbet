import { getWorkoutLog, createWorkoutLog } from '../firestore';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockDocRef = { id: 'mock-log-id' };

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'mock-collection'),
  doc: jest.fn(() => mockDocRef),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(() => 'mock-query'),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: { fromDate: jest.fn((d: Date) => d) },
}));

jest.mock('../firebase', () => ({ db: {} }));

import { getDocs, setDoc } from 'firebase/firestore';

function makeDocs(rows: object[]) {
  (getDocs as jest.Mock).mockResolvedValue({
    empty: rows.length === 0,
    docs: rows.map((data) => ({ data: () => data })),
  });
}

beforeEach(() => jest.clearAllMocks());

// ── getWorkoutLog ──────────────────────────────────────────────────────────

describe('getWorkoutLog', () => {
  it('returns null when no matching log exists', async () => {
    makeDocs([]);
    const result = await getWorkoutLog('team1', 'user1', '2026-03-19');
    expect(result).toBeNull();
  });

  it('returns the log doc when one matches', async () => {
    const fakeLog = {
      id: 'log1',
      teamId: 'team1',
      userId: 'user1',
      date: '2026-03-19',
      status: 'pending',
    };
    makeDocs([fakeLog]);
    const result = await getWorkoutLog('team1', 'user1', '2026-03-19');
    expect(result).toEqual(fakeLog);
  });

  it('returns only the first doc when multiple exist', async () => {
    const first = { id: 'log1', status: 'pending' };
    const second = { id: 'log2', status: 'verified' };
    makeDocs([first, second]);
    const result = await getWorkoutLog('team1', 'user1', '2026-03-19');
    expect(result).toEqual(first);
  });
});

// ── createWorkoutLog ───────────────────────────────────────────────────────

describe('createWorkoutLog', () => {
  it('creates a doc with status pending and correct field values', async () => {
    (setDoc as jest.Mock).mockResolvedValue(undefined);

    const result = await createWorkoutLog('team1', 'user1', '2026-03-19');

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('pending');
    expect(result.teamId).toBe('team1');
    expect(result.userId).toBe('user1');
    expect(result.date).toBe('2026-03-19');
    expect(result.id).toBe('mock-log-id');
  });

  it('sets createdAt to serverTimestamp', async () => {
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    const result = await createWorkoutLog('team1', 'user1', '2026-03-19');
    expect(result.createdAt).toBe('SERVER_TIMESTAMP');
  });

  it('passes the full log object to setDoc', async () => {
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    await createWorkoutLog('team1', 'user1', '2026-03-19');

    const [, docArg] = (setDoc as jest.Mock).mock.calls[0];
    expect(docArg).toMatchObject({
      teamId: 'team1',
      userId: 'user1',
      date: '2026-03-19',
      status: 'pending',
    });
  });
});
