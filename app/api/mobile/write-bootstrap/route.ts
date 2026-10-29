import { prepareMobileWrite } from '../../../lib/mobile-write';
import { rejectDisabledOffline } from '../../../lib/android-offline-policy';
export async function POST(request: Request) {
  return await rejectDisabledOffline() || prepareMobileWrite(request);
}
