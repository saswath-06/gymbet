import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserDoc, TeamDoc, TeamMemberDoc, WorkoutLogDoc, WorkoutDay } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function createTeam(
  creatorId: string,
  name: string,
  wagerAmount: number,
  startDate: Date,
  endDate: Date,
  timezone: string,
  currency: 'cad' | 'usd',
): Promise<TeamDoc> {
  const ref = doc(collection(db, 'teams'));
  const team: TeamDoc = {
    id: ref.id,
    name,
    creatorId,
    wagerAmount,
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    status: 'pending',
    memberIds: [creatorId],
    inviteCode: generateInviteCode(),
    timezone,
    currency,
    createdAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, team);
  return team;
}

export async function getTeam(teamId: string): Promise<TeamDoc | null> {
  const snap = await getDoc(doc(db, 'teams', teamId));
  return snap.exists() ? (snap.data() as TeamDoc) : null;
}

export async function getTeamByInviteCode(code: string): Promise<TeamDoc | null> {
  const q = query(collection(db, 'teams'), where('inviteCode', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as TeamDoc;
}

export async function getUserTeams(uid: string): Promise<TeamDoc[]> {
  const q = query(collection(db, 'teams'), where('memberIds', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as TeamDoc);
}

export async function joinTeam(teamId: string, userId: string): Promise<void> {
  const ref = doc(db, 'teams', teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Team not found');
  const team = snap.data() as TeamDoc;
  if (team.memberIds.includes(userId)) throw new Error('Already a member');
  await updateDoc(ref, { memberIds: [...team.memberIds, userId] });
}

export async function deleteTeam(teamId: string, requestingUid: string): Promise<void> {
  const ref = doc(db, 'teams', teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Team not found');
  const team = snap.data() as TeamDoc;
  if (team.creatorId !== requestingUid) throw new Error('Only the creator can delete this team.');

  // Delete all teamMember docs
  const membersSnap = await getDocs(query(collection(db, 'teamMembers'), where('teamId', '==', teamId)));
  await Promise.all(membersSnap.docs.map((d: { ref: Parameters<typeof deleteDoc>[0] }) => deleteDoc(d.ref)));

  // Delete the team itself
  await deleteDoc(ref);
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export async function setTeamMember(
  teamId: string,
  userId: string,
  workoutDays: WorkoutDay[],
): Promise<void> {
  const id = `${teamId}_${userId}`;
  await setDoc(doc(db, 'teamMembers', id), {
    teamId,
    userId,
    workoutDays,
    totalMissed: 0,
    totalEarned: 0,
    joinedAt: serverTimestamp(),
  } satisfies Omit<TeamMemberDoc, 'joinedAt'> & { joinedAt: unknown });
}

export async function getTeamMember(teamId: string, userId: string): Promise<TeamMemberDoc | null> {
  const snap = await getDoc(doc(db, 'teamMembers', `${teamId}_${userId}`));
  return snap.exists() ? (snap.data() as TeamMemberDoc) : null;
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberDoc[]> {
  const q = query(collection(db, 'teamMembers'), where('teamId', '==', teamId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as TeamMemberDoc);
}

// ─── Workout Logs ─────────────────────────────────────────────────────────────

export async function getWorkoutLog(
  teamId: string,
  userId: string,
  date: string,
): Promise<WorkoutLogDoc | null> {
  const q = query(
    collection(db, 'workoutLogs'),
    where('teamId', '==', teamId),
    where('userId', '==', userId),
    where('date', '==', date),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as WorkoutLogDoc;
}

export async function activateTeam(teamId: string, requestingUid: string): Promise<void> {
  const ref = doc(db, 'teams', teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Team not found');
  const team = snap.data() as TeamDoc;
  if (team.creatorId !== requestingUid) throw new Error('Only the creator can activate this team.');
  await updateDoc(ref, { status: 'active' });
}

export async function createWorkoutLog(
  teamId: string,
  userId: string,
  date: string,
): Promise<WorkoutLogDoc> {
  const ref = doc(collection(db, 'workoutLogs'));
  const log: WorkoutLogDoc = {
    id: ref.id,
    teamId,
    userId,
    date,
    status: 'pending',
    createdAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, log);
  return log;
}
