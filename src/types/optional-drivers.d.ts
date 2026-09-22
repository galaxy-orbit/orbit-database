// Optional runtime drivers. These are resolved at runtime via dynamic
// import() and surfaced with a helpful error when not installed.
declare module 'postgres';
declare module '@libsql/client';
declare module 'mysql2/promise';
declare module 'mongodb';
