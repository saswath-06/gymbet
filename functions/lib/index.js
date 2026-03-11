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
exports.processDailyMissed = exports.verifyGymPhoto = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const openai_1 = __importDefault(require("openai"));
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
// ─── verifyGymPhoto ────────────────────────────────────────────────────────────
// HTTPS callable: client passes { logId, storagePath }
// Downloads the image, sends to OpenAI GPT-4o Vision, writes result to Firestore
exports.verifyGymPhoto = (0, https_1.onCall)({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 60 }, async (request) => {
    var _a, _b, _c;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const { logId, storagePath } = request.data;
    if (!logId || !storagePath) {
        throw new https_1.HttpsError('invalid-argument', 'logId and storagePath are required.');
    }
    // Verify the log belongs to the calling user
    const logRef = db.collection('workoutLogs').doc(logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Workout log not found.');
    }
    const logData = logSnap.data();
    if (logData.userId !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'Not your workout log.');
    }
    // Download image from Storage and convert to base64
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    const base64Image = buffer.toString('base64');
    // Call OpenAI GPT-4o Vision
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
// ─── processDailyMissed ────────────────────────────────────────────────────────
// Scheduled cron: runs every day at midnight UTC
// Finds all active team members whose workout day was yesterday but have no
// verified check-in, marks them as missed, and updates their totalMissed count.
// (Stripe penalty transfers added in the stripe-integration phase.)
exports.processDailyMissed = (0, scheduler_1.onSchedule)({ schedule: '0 0 * * *', timeZone: 'UTC', timeoutSeconds: 540 }, async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // e.g. "2025-03-10"
    // Day-of-week name matching our WorkoutDay type
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const yesterdayDayName = dayNames[yesterday.getUTCDay()];
    // Fetch all active teams
    const teamsSnap = await db
        .collection('teams')
        .where('status', '==', 'active')
        .get();
    if (teamsSnap.empty)
        return;
    const batch = db.batch();
    let batchCount = 0;
    for (const teamDoc of teamsSnap.docs) {
        const team = teamDoc.data();
        // Only process teams whose period includes yesterday
        const start = team.startDate;
        const end = team.endDate;
        if (yesterday < start.toDate() ||
            yesterday > end.toDate())
            continue;
        // Get all members for this team
        const membersSnap = await db
            .collection('teamMembers')
            .where('teamId', '==', teamDoc.id)
            .get();
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            // Skip if yesterday wasn't one of their workout days
            if (!member.workoutDays.includes(yesterdayDayName))
                continue;
            // Check if they have a verified check-in for yesterday
            const logSnap = await db
                .collection('workoutLogs')
                .where('teamId', '==', teamDoc.id)
                .where('userId', '==', member.userId)
                .where('date', '==', dateStr)
                .where('status', '==', 'verified')
                .get();
            if (!logSnap.empty)
                continue; // They checked in — no penalty
            // Create a missed log entry
            const missedRef = db.collection('workoutLogs').doc();
            batch.set(missedRef, {
                id: missedRef.id,
                teamId: teamDoc.id,
                userId: member.userId,
                date: dateStr,
                status: 'missed',
                aiFeedback: 'No verified check-in found for this workout day.',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Increment totalMissed on teamMember doc
            batch.update(memberDoc.ref, {
                totalMissed: admin.firestore.FieldValue.increment(1),
            });
            batchCount++;
            // Firestore batch limit is 500 ops; flush early if needed
            if (batchCount >= 240) {
                await batch.commit();
                batchCount = 0;
            }
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
});
//# sourceMappingURL=index.js.map