// Polyfills a real (in-memory) IndexedDB implementation so tests that
// exercise getDb()/AppDB — completionMessages.test.ts, homeGreetings.test.ts —
// can run actual Dexie queries instead of mocking Dexie's chained query
// builder API by hand. Loaded for every test file; the cost of importing
// this for files that never touch the db is negligible.
import "fake-indexeddb/auto";
