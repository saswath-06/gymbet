import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTeam, getTeamMembers, getUser } from '../../../src/lib/firestore';
import type { TeamDoc, TeamMemberDoc, UserDoc, WorkoutDay } from '../../../src/types';

const DAY_LABELS: Record<WorkoutDay, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [members, setMembers] = useState<TeamMemberDoc[]>([]);
  const [users, setUsers] = useState<Record<string, UserDoc>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [teamData, memberData] = await Promise.all([
        getTeam(id),
        getTeamMembers(id),
      ]);
      if (!teamData) return;
      setTeam(teamData);
      setMembers(memberData);

      const userMap: Record<string, UserDoc> = {};
      await Promise.all(
        teamData.memberIds.map(async (uid) => {
          const u = await getUser(uid);
          if (u) userMap[uid] = u;
        })
      );
      setUsers(userMap);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Team not found.</Text>
      </View>
    );
  }

  const startStr = team.startDate.toDate().toLocaleDateString();
  const endStr = team.endDate.toDate().toLocaleDateString();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.push('/(app)/teams')}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.teamName}>{team.name}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>${team.wagerAmount}</Text>
          <Text style={styles.statLabel}>Wager</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{team.memberIds.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        <View style={[styles.statCard, styles.statusCard]}>
          <Text style={styles.statValue}>{team.status}</Text>
          <Text style={styles.statLabel}>Status</Text>
        </View>
      </View>

      <Text style={styles.dates}>{startStr} → {endStr}</Text>

      <View style={styles.inviteBox}>
        <Text style={styles.inviteLabel}>Invite Code</Text>
        <Text style={styles.inviteCode}>{team.inviteCode}</Text>
        <Text style={styles.inviteHint}>Share this with friends to join</Text>
      </View>

      <TouchableOpacity
        style={styles.checkInBtn}
        onPress={() => router.push({ pathname: '/(app)/check-in', params: { teamId: team.id } })}
      >
        <Text style={styles.checkInBtnText}>📸  Check In Today</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Members</Text>
      {members.length === 0 ? (
        <Text style={styles.noMembers}>No member schedules set yet.</Text>
      ) : (
        members.map((m) => {
          const u = users[m.userId];
          return (
            <View key={m.userId} style={styles.memberCard}>
              <View style={styles.memberTop}>
                <Text style={styles.memberName}>{u?.displayName ?? m.userId}</Text>
                <Text style={styles.memberDayCount}>{m.workoutDays.length}x/week</Text>
              </View>
              <View style={styles.daysRow}>
                {(Object.keys(DAY_LABELS) as WorkoutDay[]).map((day) => (
                  <View
                    key={day}
                    style={[styles.dayPill, m.workoutDays.includes(day) && styles.dayPillActive]}
                  >
                    <Text style={[styles.dayPillText, m.workoutDays.includes(day) && styles.dayPillTextActive]}>
                      {DAY_LABELS[day]}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.memberStats}>
                <Text style={styles.memberStatMissed}>
                  {m.totalMissed} missed
                </Text>
                <Text style={styles.memberStatEarned}>
                  +${m.totalEarned.toFixed(2)} earned
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#fff', fontSize: 16 },
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60 },
  back: { marginBottom: 20 },
  backText: { color: '#666', fontSize: 14 },
  teamName: { fontSize: 30, fontWeight: '800', color: '#fff', marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#141414', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  statusCard: { backgroundColor: '#0d2e1a' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#555', fontSize: 11, marginTop: 2, textTransform: 'uppercase' },
  dates: { color: '#555', fontSize: 13, marginBottom: 24 },
  inviteBox: {
    backgroundColor: '#141414', borderRadius: 14, padding: 20,
    alignItems: 'center', marginBottom: 32, borderWidth: 1, borderColor: '#222',
  },
  inviteLabel: { color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  inviteCode: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: 10 },
  inviteHint: { color: '#444', fontSize: 12, marginTop: 8 },
  checkInBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 28 },
  checkInBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  noMembers: { color: '#444', fontSize: 14 },
  memberCard: {
    backgroundColor: '#141414', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#222',
  },
  memberTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  memberName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberDayCount: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  daysRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  dayPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  dayPillActive: { backgroundColor: '#fff' },
  dayPillText: { color: '#444', fontSize: 11, fontWeight: '600' },
  dayPillTextActive: { color: '#000' },
  memberStats: { flexDirection: 'row', justifyContent: 'space-between' },
  memberStatMissed: { color: '#ff4d4d', fontSize: 12 },
  memberStatEarned: { color: '#4ade80', fontSize: 12 },
});
