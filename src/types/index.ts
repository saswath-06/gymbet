import { Timestamp } from 'firebase/firestore';

export type WorkoutDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type TeamStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export type WorkoutLogStatus = 'pending' | 'verified' | 'failed';

// users/{uid}
export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  stripeAccountId?: string;   // Stripe Connect Express account (for receiving payouts)
  stripeCustomerId?: string;  // Stripe Customer (for charging)
  stripePaymentMethodId?: string; // saved card for off-session charges
  cardLast4?: string;
  cardBrand?: string;
  createdAt: Timestamp;
}

// teams/{teamId}
export interface TeamDoc {
  id: string;
  name: string;
  creatorId: string;
  wagerAmount: number;         // in dollars
  startDate: Timestamp;
  endDate: Timestamp;
  status: TeamStatus;
  memberIds: string[];
  inviteCode: string;          // 6-char uppercase code for joining
  timezone: string;            // IANA timezone, e.g. "America/New_York"
  currency: 'cad' | 'usd';    // payment currency for all Stripe charges on this team
  createdAt: Timestamp;
}

// teamMembers/{teamId}_{uid}
export interface TeamMemberDoc {
  teamId: string;
  userId: string;
  workoutDays: WorkoutDay[];   // days this member committed to
  totalMissed: number;
  totalEarned: number;         // in dollars
  escrowPaymentIntentId?: string; // PaymentIntent ID for the initial escrow charge
  joinedAt: Timestamp;
}

// workoutLogs/{logId}
export interface WorkoutLogDoc {
  id: string;
  teamId: string;
  userId: string;
  date: string;                // YYYY-MM-DD
  status: WorkoutLogStatus;
  imageUrl?: string;
  aiFeedback?: string;
  createdAt: Timestamp;
}

// payments/{paymentId}
export interface PaymentDoc {
  id: string;
  fromUserId: string;
  toUserId: string;
  teamId: string;
  amount: number;              // in dollars
  stripeTransferId?: string;
  reason: string;              // e.g. "Missed workout on 2026-03-10"
  createdAt: Timestamp;
}
