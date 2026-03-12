"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDailyMissed = exports.chargeTeamEscrow = exports.onboardStripeConnect = exports.finalizeSetupSession = exports.createSetupSession = exports.verifyGymPhoto = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const openai_1 = __importDefault(require("openai"));
const stripe_1 = __importDefault(require("stripe"));
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
function getStripe() {
    return new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
}
// ─── verifyGymPhoto ────────────────────────────────────────────────────────────
exports.verifyGymPhoto = (0, https_1.onCall)({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 60 }, async (request) => {
    var _a, _b, _c;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const { logId, storagePath } = request.data;
    if (!logId || !storagePath) {
        throw new https_1.HttpsError('invalid-argument', 'logId and storagePath are required.');
    }
    const logRef = db.collection('workoutLogs').doc(logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Workout log not found.');
    }
    const logData = logSnap.data();
    if (logData.userId !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'Not your workout log.');
    }
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    const base64Image = buffer.toString('base64');
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 10,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Is this photo taken inside a real, public gym with gym equipment visible? Answer with exactly one word: PASS or FAIL. FAIL if: the photo shows a home gym setup, a bedroom, a photo of a gym (phone held in front of a screen/poster), or anything not clearly a real public gym.',
                    },
                    {
                        type: 'image_url',
                        image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'low' },
                    },
                ],
            },
        ],
    });
    const answer = ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : '').trim().toUpperCase();
    const passed = answer.startsWith('PASS');
    const newStatus = passed ? 'verified' : 'failed';
    const aiFeedback = passed
        ? 'Gym verified — great work!'
        : 'Photo did not appear to be taken in a real public gym.';
    await logRef.update({ status: newStatus, aiFeedback });
    return { status: newStatus, aiFeedback };
});
// ─── createSetupSession ────────────────────────────────────────────────────────
// Creates a Stripe Checkout setup session so the user can save a card.
// Returns the hosted checkout URL to open in a WebBrowser.
exports.createSetupSession = (0, https_1.onCall)({ secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const stripe = getStripe();
    const uid = request.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
        throw new https_1.HttpsError('not-found', 'User not found.');
    const userData = userSnap.data();
    // Get or create a Stripe Customer
    let customerId = userData.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: userData.email,
            name: userData.displayName,
            metadata: { firebaseUid: uid },
        });
        customerId = customer.id;
        await userRef.update({ stripeCustomerId: customerId });
    }
    const session = await stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customerId,
        payment_method_types: ['card'],
        // Deep links back into the app
        success_url: `gymbet://wallet?setup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `gymbet://wallet?setup=cancel`,
    });
    return { url: session.url, sessionId: session.id };
});
// ─── finalizeSetupSession ──────────────────────────────────────────────────────
// After the Stripe Checkout setup completes, retrieve the saved PaymentMethod
// and store it on the user's Firestore doc for future off-session charges.
exports.finalizeSetupSession = (0, https_1.onCall)({ secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const { sessionId } = request.data;
    if (!sessionId)
        throw new https_1.HttpsError('invalid-argument', 'sessionId is required.');
    const stripe = getStripe();
    const uid = request.auth.uid;
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['setup_intent.payment_method'],
    });
    if (session.status !== 'complete') {
        throw new https_1.HttpsError('failed-precondition', 'Setup session is not complete.');
    }
    const setupIntent = session.setup_intent;
    const pm = setupIntent.payment_method;
    // Set as the customer's default payment method for future charges
    await stripe.customers.update(session.customer, {
        invoice_settings: { default_payment_method: pm.id },
    });
    await db.collection('users').doc(uid).update({
        stripePaymentMethodId: pm.id,
        stripeCustomerId: session.customer,
        cardLast4: (_b = (_a = pm.card) === null || _a === void 0 ? void 0 : _a.last4) !== null && _b !== void 0 ? _b : '',
        cardBrand: (_d = (_c = pm.card) === null || _c === void 0 ? void 0 : _c.brand) !== null && _d !== void 0 ? _d : '',
    });
    return { last4: (_f = (_e = pm.card) === null || _e === void 0 ? void 0 : _e.last4) !== null && _f !== void 0 ? _f : '', brand: (_h = (_g = pm.card) === null || _g === void 0 ? void 0 : _g.brand) !== null && _h !== void 0 ? _h : '' };
});
// ─── onboardStripeConnect ──────────────────────────────────────────────────────
// Creates (or retrieves) a Stripe Express Connect account for the user and
// returns the onboarding URL so they can complete KYC and link a bank account.
exports.onboardStripeConnect = (0, https_1.onCall)({ secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const stripe = getStripe();
    const uid = request.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
        throw new https_1.HttpsError('not-found', 'User not found.');
    const userData = userSnap.data();
    let accountId = userData.stripeAccountId;
    if (!accountId) {
        const account = await stripe.accounts.create({
            type: 'express',
            metadata: { firebaseUid: uid },
        });
        accountId = account.id;
        await userRef.update({ stripeAccountId: accountId });
    }
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `https://gymbet-701eb.web.app/connect-refresh.html`,
        return_url: `https://gymbet-701eb.web.app/connect-return.html`,
        type: 'account_onboarding',
    });
    return { url: accountLink.url };
});
// ─── chargeTeamEscrow ──────────────────────────────────────────────────────────
// Charges the user's saved card for the team wager amount when joining or
// creating a team. Stores the PaymentIntent ID on the teamMember doc.
exports.chargeTeamEscrow = (0, https_1.onCall)({ secrets: ['STRIPE_SECRET_KEY'] }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    const { teamId } = request.data;
    if (!teamId)
        throw new https_1.HttpsError('invalid-argument', 'teamId is required.');
    const stripe = getStripe();
    const uid = request.auth.uid;
    const [teamSnap, userSnap] = await Promise.all([
        db.collection('teams').doc(teamId).get(),
        db.collection('users').doc(uid).get(),
    ]);
    if (!teamSnap.exists)
        throw new https_1.HttpsError('not-found', 'Team not found.');
    if (!userSnap.exists)
        throw new https_1.HttpsError('not-found', 'User not found.');
    const team = teamSnap.data();
    const user = userSnap.data();
    if (!user.stripeCustomerId || !user.stripePaymentMethodId) {
        throw new https_1.HttpsError('failed-precondition', 'No payment method on file. Please add a card in your wallet first.');
    }
    const amountCents = Math.round(team.wagerAmount * 100);
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: (_a = team.currency) !== null && _a !== void 0 ? _a : 'cad',
        customer: user.stripeCustomerId,
        payment_method: user.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        description: `GymBet wager escrow — ${team.name}`,
        metadata: { teamId, userId: uid },
    });
    // Store PaymentIntent ID on teamMember for potential future refund
    await db.collection('teamMembers').doc(`${teamId}_${uid}`).update({
        escrowPaymentIntentId: paymentIntent.id,
    });
    return { success: true };
});
// ─── Helpers ───────────────────────────────────────────────────────────────────
function getYesterdayInTz(timezone) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(yesterday);
    const dayName = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, weekday: 'long',
    }).format(yesterday).toLowerCase();
    return { dateStr, dayName };
}
// ─── processDailyMissed ────────────────────────────────────────────────────────
// Scheduled cron: runs every day at 09:00 UTC (4 AM EST).
// — Identifies members whose workout day was yesterday with no verified check-in
// — Distributes wager penalty evenly to all other team members via Stripe
// — Re-charges the missed user to replenish their escrow
// — Updates Firestore (totalMissed, totalEarned, payment records)
exports.processDailyMissed = (0, scheduler_1.onSchedule)({ schedule: '0 9 * * *', timeZone: 'UTC', timeoutSeconds: 540, secrets: ['STRIPE_SECRET_KEY'] }, async () => {
    var _a, _b, _c;
    const stripe = getStripe();
    const teamsSnap = await db.collection('teams').where('status', '==', 'active').get();
    if (teamsSnap.empty)
        return;
    const allMissed = [];
    for (const teamDoc of teamsSnap.docs) {
        const team = teamDoc.data();
        const { dateStr, dayName: yesterdayDay } = getYesterdayInTz((_a = team.timezone) !== null && _a !== void 0 ? _a : 'UTC');
        const yesterday = new Date(dateStr);
        const start = team.startDate;
        const end = team.endDate;
        if (yesterday < start.toDate() || yesterday > end.toDate())
            continue;
        const membersSnap = await db
            .collection('teamMembers')
            .where('teamId', '==', teamDoc.id)
            .get();
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            if (!member.workoutDays.includes(yesterdayDay))
                continue;
            const logSnap = await db
                .collection('workoutLogs')
                .where('teamId', '==', teamDoc.id)
                .where('userId', '==', member.userId)
                .where('date', '==', dateStr)
                .where('status', '==', 'verified')
                .get();
            if (!logSnap.empty)
                continue;
            allMissed.push({
                teamId: teamDoc.id,
                teamName: team.name,
                wagerAmountCents: Math.round(team.wagerAmount * 100),
                currency: (_b = team.currency) !== null && _b !== void 0 ? _b : 'cad',
                missedUserId: member.userId,
                missedMemberRef: memberDoc.ref,
            });
        }
    }
    if (allMissed.length === 0)
        return;
    // Process each missed member
    const batch = db.batch();
    let batchCount = 0;
    for (const entry of allMissed) {
        const { teamId, teamName, wagerAmountCents, currency, missedUserId, missedMemberRef } = entry;
        // Create missed log entry
        const missedLogRef = db.collection('workoutLogs').doc();
        const { dateStr } = getYesterdayInTz((_c = (await db.collection('teams').doc(teamId).get()).data().timezone) !== null && _c !== void 0 ? _c : 'UTC');
        batch.set(missedLogRef, {
            id: missedLogRef.id,
            teamId,
            userId: missedUserId,
            date: dateStr,
            status: 'missed',
            aiFeedback: 'No verified check-in found for this workout day.',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.update(missedMemberRef, {
            totalMissed: admin.firestore.FieldValue.increment(1),
        });
        batchCount += 2;
        // Get all other active members of this team
        const otherMembersSnap = await db
            .collection('teamMembers')
            .where('teamId', '==', teamId)
            .get();
        const otherMembers = otherMembersSnap.docs.filter((d) => d.data().userId !== missedUserId);
        if (otherMembers.length > 0) {
            const perPersonCents = Math.floor(wagerAmountCents / otherMembers.length);
            const perPersonDollars = perPersonCents / 100;
            // Fetch user docs for Stripe account IDs
            const otherUserDocs = await Promise.all(otherMembers.map((m) => db.collection('users').doc(m.data().userId).get()));
            for (let i = 0; i < otherMembers.length; i++) {
                const otherMemberDoc = otherMembers[i];
                const otherUserData = otherUserDocs[i].data();
                // Stripe transfer to this teammate (best-effort)
                if ((otherUserData === null || otherUserData === void 0 ? void 0 : otherUserData.stripeAccountId) && perPersonCents > 0) {
                    try {
                        await stripe.transfers.create({
                            amount: perPersonCents,
                            currency,
                            destination: otherUserData.stripeAccountId,
                            metadata: {
                                teamId,
                                teamName,
                                fromUserId: missedUserId,
                                toUserId: otherUserData.uid,
                                date: dateStr,
                            },
                        });
                    }
                    catch (err) {
                        console.error(`Transfer failed for ${otherUserData.uid}:`, err);
                    }
                }
                // Always update totalEarned in Firestore regardless of Stripe result
                batch.update(otherMemberDoc.ref, {
                    totalEarned: admin.firestore.FieldValue.increment(perPersonDollars),
                });
                // Create payment record
                const paymentRef = db.collection('payments').doc();
                batch.set(paymentRef, {
                    id: paymentRef.id,
                    fromUserId: missedUserId,
                    toUserId: otherMemberDoc.data().userId,
                    teamId,
                    amount: perPersonDollars,
                    reason: `Missed workout on ${dateStr}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                batchCount += 2;
            }
        }
        // Re-charge the missed user to replenish their escrow (best-effort)
        const missedUserSnap = await db.collection('users').doc(missedUserId).get();
        const missedUser = missedUserSnap.data();
        if ((missedUser === null || missedUser === void 0 ? void 0 : missedUser.stripeCustomerId) && (missedUser === null || missedUser === void 0 ? void 0 : missedUser.stripePaymentMethodId)) {
            try {
                await stripe.paymentIntents.create({
                    amount: wagerAmountCents,
                    currency,
                    customer: missedUser.stripeCustomerId,
                    payment_method: missedUser.stripePaymentMethodId,
                    confirm: true,
                    off_session: true,
                    description: `GymBet penalty replenishment — ${teamName} (${dateStr})`,
                    metadata: { teamId, userId: missedUserId, reason: 'missed_replenishment' },
                });
            }
            catch (err) {
                console.error(`Replenishment charge failed for ${missedUserId}:`, err);
            }
        }
        // Flush batch early if approaching limit
        if (batchCount >= 240) {
            await batch.commit();
            batchCount = 0;
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
});
//# sourceMappingURL=index.js.map