import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import {
  getUserTeams, getTeamMembers, getWorkoutLog, getTeamMember, getUser,
} from '../../src/lib/firestore';
import type { TeamDoc, TeamMemberDoc, WorkoutDay } from '../../src/types';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as WorkoutDay[];
const todayDay = DAYS[new Date().getDay()];
const todayDate = new Date().toISOString().split('T')[0];

type CheckInState = 'verified' | 'pending' | 'failed' | 'due' | 'rest';

type TeamCard = {
  team: TeamDoc;
  checkIn: CheckInState;
  myMember: TeamMemberDoc | null;
  members: TeamMemberDoc[];
  memberNames: Record<string, string>;
};

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<TeamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!user) return;
    const teams = await getUserTeams(user.uid);
    const visible = teams.filter((t) => t.status === 'active' || t.status === 'pending');

    const results = await Promise.all(
      visible.map(async (team): Promise<TeamCard> => {
        const [myMember, log, members] = await Promise.all([
          getTeamMember(team.id, user.uid),
          getWorkoutLog(team.id, user.uid, todayDate),
          getTeamMembers(team.id),
        ]);

        const memberNames: Record<string, string> = {};
        await Promise.all(
          team.memberIds.map(async (uid) => {
            const u = await getUser(uid);
            memberNames[uid] = u?.displayName ?? uid;
          })
        );

        let checkIn: CheckInState = 'rest';
        const isWorkoutDay = myMember?.workoutDays.includes(todayDay) ?? false;
        if (log?.status === 'verified') checkIn = 'verified';
        else if (log?.status === 'pending') checkIn = 'pending';
        else if (log?.status === 'failed') checkIn = 'failed';
        else if (isWorkoutDay) checkIn = 'due';

        return { team, checkIn, myMember, members, memberNames };
      })
    );

    setCards(results);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const dueCards = cards.filter((c) => c.checkIn === 'due' || c.checkIn === 'failed');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{user?.displayName ?? user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.teamsNavBtn} onPress={() => router.push('/(app)/teams')}>
        <Text style={styles.teamsNavText}>All Teams →</Text>
      </TouchableOpacity>

      {/* Check-ins due today */}
      {dueCards.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Check in today</Text>
          {dueCards.map(({ team, checkIn }) => (
            <TouchableOpacity
              key={team.id}
              style={styles.dueCard}
              onPress={() => router.push({ pathname: '/(app)/check-in', params: { teamId: team.id } })}
            >
              <View style={styles.dueLeft}>
                <Text style={styles.dueTeamName}>{team.name}</Text>
                <Text style={styles.dueWager}>${team.wagerAmount} on the line</Text>
              </View>
              <View style={[styles.statusBadge, checkIn === 'failed' ? styles.badgeFailed : styles.badgeDue]}>
                <Text style={[styles.badgeText, checkIn === 'failed' ? styles.badgeTextRed : styles.badgeTextDark]}>
                  {checkIn === 'failed' ? '✗ Retry' : '📸 Check In'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Standings */}
      {cards.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No active teams</Text>
          <Text style={styles.emptySubtitle}>Create or join a team to get started.</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/(app)/teams')}>
            <Text style={styles.createBtnText}>Go to Teams</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { marginTop: dueCards.length > 0 ? 24 : 0 }]}>Standings</Text>
          {cards.map(({ team, checkIn, members, memberNames }) => {
            const sorted = [...members].sort(
              (a, b) => a.totalMissed - b.totalMissed || b.totalEarned - a.totalEarned
            );
            return (
              <TouchableOpacity
                key={team.id}
                style={styles.teamCard}
                onPress={() => router.push(`/(app)/teams/${team.id}`)}
              >
                <View style={styles.teamCardHeader}>
                  <Text style={styles.teamCardName}>{team.name}</Text>
                  <CheckInBadge state={checkIn} />
                </View>
                <Text style={styles.teamCardSub}>${team.wagerAmount} wager · {members.length} members</Text>

                {sorted.map((m, i) => (
                  <View key={m.userId} style={styles.standingRow}>
                    <Text style={styles.standingRank}>#{i + 1}</Text>
                    <Text style={styles.standingName} numberOfLines={1}>
                      {memberNames[m.userId] ?? m.userId}
                    </Text>
                    <Text style={styles.standingMissed}>{m.totalMissed} missed</Text>
                    <Text style={styles.standingEarned}>+${m.totalEarned.toFixed(0)}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function CheckInBadge({ state }: { state: CheckInState }) {
  const map: Record<CheckInState, { label: string; bg: object; text: object }> = {
    verified: { label: '✓ Done',     bg: styles.badgeVerified, text: styles.badgeTextGreen },
    pending:  { label: '⏳ Reviewing', bg: styles.badgePending,  text: styles.badgeTextYellow },
    failed:   { label: '✗ Retry',    bg: styles.badgeFailed,   text: styles.badgeTextRed },
    due:      { label: '📸 Due',     bg: styles.badgeDue,      text: styles.badgeTextDark },
    rest:     { label: 'Rest day',   bg: styles.badgeRest,     text: styles.badgeTextDim },
  };
  const c = map[state];
  return (
    <View style={[styles.statusBadge, c.bg]}>
      <Text style={[styles.badgeText, c.text]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 60 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting: { color: '#555', fontSize: 13 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  signOutBtn: { borderWidth: 1, borderColor: '#222', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { color: '#555', fontSize: 13 },

  teamsNavBtn: { alignSelf: 'flex-start', marginBottom: 28 },
  teamsNavText: { color: '#555', fontSize: 13 },

  sectionTitle: {
    color: '#444', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  dueCard: {
    backgroundColor: '#141414', borderRadius: 14, padding: 18, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  dueLeft: { flex: 1, marginRight: 12 },
  dueTeamName: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  dueWager: { color: '#666', fontSize: 12 },

  teamCard: {
    backgroundColor: '#141414', borderRadius: 14, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: '#1e1e1e',
  },
  teamCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  teamCardName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  teamCardSub: { color: '#555', fontSize: 12, marginBottom: 14 },

  standingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#1a1a1a',
  },
  standingRank: { color: '#444', fontSize: 12, width: 24 },
  standingName: { color: '#ccc', fontSize: 13, flex: 1 },
  standingMissed: { color: '#ff6b6b', fontSize: 12, marginRight: 12 },
  standingEarned: { color: '#4ade80', fontSize: 12, fontWeight: '700' },

  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextGreen:  { color: '#4ade80' },
  badgeTextYellow: { color: '#fbbf24' },
  badgeTextRed:    { color: '#ff6b6b' },
  badgeTextDark:   { color: '#000' },
  badgeTextDim:    { color: '#555' },
  badgeVerified: { backgroundColor: '#0d2e1a' },
  badgePending:  { backgroundColor: '#2a2008' },
  badgeFailed:   { backgroundColor: '#2e0d0d' },
  badgeDue:      { backgroundColor: '#ffffff' },
  badgeRest:     { backgroundColor: '#1a1a1a' },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#555', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  createBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  createBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
