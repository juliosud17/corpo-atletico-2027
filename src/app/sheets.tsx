import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { BodyMeasurement, FoodLog, ISODate, RecoveryEntry, WeightEntry, WorkoutSession } from '../domain/types';
import { WeightSheet } from '../features/progress/WeightSheet';
import { FoodSheet } from '../features/nutrition/FoodSheet';
import { WaterSheet } from '../features/nutrition/WaterSheet';
import { PlateSheet } from '../features/nutrition/PlateSheet';
import { MeasurementSheet } from '../features/progress/MeasurementSheet';
import { RecoverySheet } from '../features/recovery/RecoverySheet';

import { WorkoutLogSheet } from '../features/workouts/WorkoutLogSheet';

export type SheetRequest =
  | { kind: 'weight'; entry?: WeightEntry }
  | { kind: 'food'; date?: ISODate; meal?: string; log?: FoodLog }
  | { kind: 'water'; date?: ISODate }
  | { kind: 'plate'; date?: ISODate; meal?: string }
  | { kind: 'measure'; entry?: BodyMeasurement }
  | { kind: 'recovery'; date?: ISODate; entry?: RecoveryEntry }
  | { kind: 'workout'; date?: ISODate; planId?: string; session?: WorkoutSession };

const Ctx = createContext<{ open: (r: SheetRequest) => void }>({ open: () => {} });
export const useSheets = () => useContext(Ctx);

export function SheetsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<SheetRequest | null>(null);
  const close = useCallback(() => setReq(null), []);
  const open = useCallback((r: SheetRequest) => setReq(r), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {req?.kind === 'weight' && <WeightSheet entry={req.entry} onClose={close} />}
      {req?.kind === 'food' && <FoodSheet date={req.date} meal={req.meal} log={req.log} onClose={close} />}
      {req?.kind === 'water' && <WaterSheet date={req.date} onClose={close} />}
      {req?.kind === 'plate' && <PlateSheet date={req.date} meal={req.meal} onClose={close} />}
      {req?.kind === 'measure' && <MeasurementSheet entry={req.entry} onClose={close} />}
      {req?.kind === 'recovery' && <RecoverySheet date={req.date} entry={req.entry} onClose={close} />}
      {req?.kind === 'workout' && <WorkoutLogSheet date={req.date} planId={req.planId} session={req.session} onClose={close} />}
    </Ctx.Provider>
  );
}
