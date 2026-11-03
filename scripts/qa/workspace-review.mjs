// Local-only review runner. Uses the real compiled application and an in-memory fixture.
process.env.WORKSPACE_REVIEW = '1';
process.env.QA_PORT = '4186';
process.env.PARKING_QA_FULL = '1';
await import('./ui-density-preview.mjs');
