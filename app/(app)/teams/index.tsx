import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { getUserTeams } from '../../../src/lib/firestore';
import type { TeamDoc } from '../../../src/types';

export default function TeamsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserTeams(user.uid).then((t) => {
      setTeams(t);
      setLoading(false);
    });
  }, [user]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Teams</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(app)/teams/join')}>
            <Text style={styles.actionBtnText}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => router.push('/(app)/teams/create')}>
            <Text style={styles.actionBtnPrimaryText}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
      ) : teams.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No teams yet</Text>
          <Text style={styles.emptySubtitle}>Create one or join with an invite code.</Text>
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(app)/teams/${item.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardName}>{item.name}</Text>
                <View style={[styles.statusBadge,
                  item.status === 'active' && styles.statusActive,
                  item.status === 'completed' && styles.statusDone,
                ]}>
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.cardWager}>${item.wagerAmount} wager</Text>
              <Text style={styles.cardMembers}>{item.memberIds.length} member{item.memberIds.length !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  actionBtnPrimary: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnPrimaryText: { color: '#000', fontSize: 13, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: '#555', fontSize: 14, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: '#141414', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  statusBadge: { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusActive: { backgroundColor: '#0d2e1a' },
  statusDone: { backgroundColor: '#1a1a2e' },
  statusText: { color: '#aaa', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  cardWager: { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  cardMembers: { color: '#555', fontSize: 13, marginTop: 2 },
});
