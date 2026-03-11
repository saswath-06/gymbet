import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import OpenAI from 'openai';

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// ─── verifyGymPhoto ────────────────────────────────────────────────────────────
// HTTPS callable: client passes { logId, storagePath }
// Downloads the image, sends to OpenAI GPT-4o Vision, writes result to Firestore

export const verifyGymPhoto = onCall(
  { secrets: ['OPENAI_API_KEY'], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { logId, storagePath } = request.data as {
      logId: string;
      storagePath: string;
    };

    if (!logId || !storagePath) {
      throw new HttpsError('invalid-argument', 'logId and storagePath are required.');
    }

    // Verify the log belongs to the calling user
    const logRef = db.collection('workoutLogs').doc(logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
      throw new HttpsError('not-found', 'Workout log not found.');
    }
    const logData = logSnap.data()!;
    if (logData.userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Not your workout log.');
    }

    // Download image from Storage and convert to base64
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    const base64Image = buffer.toString('base64');

    // Call OpenAI GPT-4o Vision
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const answer = (response.choices[0]?.message?.content ?? '').trim().toUpperCase();
    const passed = answer.startsWith('PASS');
    const newStatus = passed ? 'verified' : 'failed';
    const aiFeedback = passed
      ? 'Gym verified — great work!'
      : 'Photo did not appear to be taken in a real public gym.';

    await logRef.update({ status: newStatus, aiFeedback });

    return { status: newStatus, aiFeedback };
  }
);

// ─── processDailyMissed ────────────────────────────────────────────────────────
// Scheduled cron: runs every day at midnight UTC
// Finds all active team members whose workout day was yesterday but have no
// verified check-in, marks them as missed, and updates their totalMissed count.
// (Stripe penalty transfers added in the stripe-integration phase.)

export const processDailyMissed = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC', timeoutSeconds: 540 },
  async () => {
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

    if (teamsSnap.empty) return;

    const batch = db.batch();
    let batchCount = 0;

    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data();

      // Only process teams whose period includes yesterday
      const start: admin.firestore.Timestamp = team.startDate;
      const end: admin.firestore.Timestamp = team.endDate;
      if (
        yesterday < start.toDate() ||
        yesterday > end.toDate()
      ) continue;

      // Get all members for this team
      const membersSnap = await db
        .collection('teamMembers')
        .where('teamId', '==', teamDoc.id)
        .get();

      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data();

        // Skip if yesterday wasn't one of their workout days
        if (!member.workoutDays.includes(yesterdayDayName)) continue;

        // Check if they have a verified check-in for yesterday
        const logSnap = await db
          .collection('workoutLogs')
          .where('teamId', '==', teamDoc.id)
          .where('userId', '==', member.userId)
          .where('date', '==', dateStr)
          .where('status', '==', 'verified')
          .get();

        if (!logSnap.empty) continue; // They checked in — no penalty

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
  }
);
