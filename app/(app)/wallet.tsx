import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDoc, doc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/lib/firebase';
import type { UserDoc, PaymentDoc } from '../../src/types';

export default function WalletScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<'card' | 'connect' | null>(null);
  const [error, setError] = useState('');

  const functions = getFunctions();

  async function loadData() {
    if (!user) return;

    const [userSnap, membersSnap, paymentsSnap] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDocs(query(collection(db, 'teamMembers'), where('userId', '==', user.uid))),
      getDocs(
        query(
          collection(db, 'payments'),
          where('toUserId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
      ),
    ]);

    if (userSnap.exists()) setUserData(userSnap.data() as UserDoc);

    const earned = membersSnap.docs.reduce((sum, d) => sum + (d.data().totalEarned ?? 0), 0);
    setTotalEarned(earned);

    setPayments(paymentsSnap.docs.map((d) => d.data() as PaymentDoc));
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [user]);

  async function handleAddCard() {
    setError('');
    setActionLoading('card');
    try {
      const createSetupSession = httpsCallable(functions, 'createSetupSession');
      const result = await createSetupSession({});
      const { url } = result.data as { url: string; sessionId: string };

      const browserResult = await WebBrowser.openAuthSessionAsync(url, 'gymbet://');

      if (browserResult.type === 'success') {
        const redirectUrl = browserResult.url;
        const sessionId = new URL(redirectUrl).searchParams.get('session_id');
        if (sessionId) {
          const finalizeSetupSession = httpsCallable(functions, 'finalizeSetupSession');
          await finalizeSetupSession({ sessionId });
          await loadData();
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to set up payment method.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSetUpPayouts() {
    setError('');
    setActionLoading('connect');
    try {
      const onboardStripeConnect = httpsCallable(functions, 'onboardStripeConnect');
      const result = await onboardStripeConnect({});
      const { url } = result.data as { url: string };

      await WebBrowser.openAuthSessionAsync(url, 'gymbet://');
      // Refresh after returning — account may now be onboarded
      await loadData();
    } catch (e: any) {
      setError(e.message ?? 'Failed to start payout setup.');
    } finally {
      setActionLoading(null);
    }
  }

  const cardLabel = userData?.stripePaymentMethodId
    ? `${capitalize(userData.cardBrand ?? 'Card')} ••••${userData.cardLast4 ?? '****'}`
    : null;

  const hasConnect = !!userData?.stripeAccountId;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      <TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.push('/(app)')}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Wallet</Text>

      {/* Balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Earnings</Text>
        <Text style={styles.balanceAmount}>${totalEarned.toFixed(2)}</Text>
        <Text style={styles.balanceSub}>from teammates' missed workouts</Text>
      </View>

      {/* Payment Method */}
      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.card}>
        {cardLabel ? (
          <View style={styles.cardRow}>
            <Text style={styles.cardIcon}>💳</Text>
            <View style={styles.cardInfo}>
              <Text style={styles.cardPrimary}>{cardLabel}</Text>
              <Text style={styles.cardSub}>Used for wager charges</Text>
            </View>
            <TouchableOpacity onPress={handleAddCard} disabled={actionLoading === 'card'}>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.emptyText}>No card on file</Text>
            <Text style={styles.emptySub}>Required to join or create a team</Text>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleAddCard}
              disabled={actionLoading === 'card'}
            >
              {actionLoading === 'card'
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.actionBtnText}>Add Card</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Payouts */}
      <Text style={styles.sectionTitle}>Payouts</Text>
      <View style={styles.card}>
        {hasConnect ? (
          <View style={styles.cardRow}>
            <Text style={styles.cardIcon}>✓</Text>
            <View style={styles.cardInfo}>
              <Text style={styles.cardPrimary}>Payouts enabled</Text>
              <Text style={styles.cardSub}>Winnings transfer to your bank</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.emptyText}>Payouts not set up</Text>
            <Text style={styles.emptySub}>Connect a bank account to receive winnings</Text>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleSetUpPayouts}
              disabled={actionLoading === 'connect'}
            >
              {actionLoading === 'connect'
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.actionBtnText}>Set Up Payouts</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Recent Earnings */}
      {payments.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          {payments.map((p) => (
            <View key={p.id} style={styles.paymentRow}>
              <View style={styles.paymentLeft}>
                <Text style={styles.paymentReason}>{p.reason}</Text>
              </View>
              <Text style={styles.paymentAmount}>+${p.amount.toFixed(2)}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 60 },

  back: { marginBottom: 24 },
  backText: { color: '#666', fontSize: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 24 },

  balanceCard: {
    backgroundColor: '#0d2e1a', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 32,
  },
  balanceLabel: { color: '#4ade80', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  balanceAmount: { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 8 },
  balanceSub: { color: '#4ade80', fontSize: 12, marginTop: 4 },

  sectionTitle: {
    color: '#444', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  card: {
    backgroundColor: '#141414', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: '#1e1e1e', marginBottom: 24,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { fontSize: 22, marginRight: 14 },
  cardInfo: { flex: 1 },
  cardPrimary: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardSub: { color: '#555', fontSize: 12, marginTop: 2 },
  changeText: { color: '#4ade80', fontSize: 13, fontWeight: '600' },

  emptyText: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  emptySub: { color: '#555', fontSize: 13, marginBottom: 16 },
  actionBtn: {
    backgroundColor: '#fff', borderRadius: 10, padding: 13,
    alignItems: 'center',
  },
  actionBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

  error: { color: '#ff4d4d', fontSize: 13, marginBottom: 16 },

  paymentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#141414', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#1e1e1e',
  },
  paymentLeft: { flex: 1, marginRight: 12 },
  paymentReason: { color: '#ccc', fontSize: 13 },
  paymentAmount: { color: '#4ade80', fontSize: 14, fontWeight: '700' },
});
