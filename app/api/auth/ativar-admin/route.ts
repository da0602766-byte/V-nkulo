import { PILOT_LIMITATION } from "../../../lib/pilot-config";

export async function POST() {
  return Response.json(
    {
      error: PILOT_LIMITATION,
      mfaRequired: true,
      pilot: true,
    },
    { status: 423 },
  );
}
