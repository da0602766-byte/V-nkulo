import { prepareModule } from '../../../../lib/mobile-modules';
import { rejectDisabledOffline } from '../../../../lib/android-offline-policy';
export async function POST(request: Request) {
  return await rejectDisabledOffline() || prepareModule(request);
}
