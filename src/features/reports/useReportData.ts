import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { ReportData } from '../../domain/reports';

export function useReportData(): ReportData | undefined {
  return useLiveQuery(async () => ({
    weights: await db.weights.toArray(),
    foodLogs: await db.foodLogs.toArray(),
    targets: await db.targets.toArray(),
    workouts: await db.workouts.toArray(),
    plans: await db.workoutPlans.toArray(),
    sets: await db.exerciseSets.toArray(),
    recovery: await db.recovery.toArray(),
    measurements: await db.measurements.toArray(),
    milestones: await db.milestones.toArray(),
    photos: await db.photos.toArray(),
  }), []);
}
